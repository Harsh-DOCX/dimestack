const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { User, Session } = require('../models');
const { sendMail } = require('../mailer');
const { seedUserFinance } = require('../seed');
const {
  hashToken,
  randomToken,
  randomOtp,
  dummyHash,
  publicUser,
} = require('../util');
const {
  setAuthCookies,
  clearAuthCookies,
  issueCsrf,
  signAccess,
  requireAuth,
  clientIp,
} = require('../middleware');
const { z, passwordSchema, parse, bad } = require('../validate');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const utmSchema = z
  .object({
    source: z.string().max(120).optional(),
    medium: z.string().max(120).optional(),
    campaign: z.string().max(120).optional(),
    term: z.string().max(120).optional(),
    content: z.string().max(120).optional(),
    landingPath: z.string().max(160).optional(),
  })
  .optional();

function previewPayload(result) {
  if (!result || result.delivered || !result.preview) return undefined;
  return result.preview;
}

async function startSession(user, req, res) {
  const refresh = randomToken();
  const session = await Session.create({
    user: user._id,
    refreshHash: hashToken(refresh),
    userAgent: (req.get('user-agent') || '').slice(0, 180),
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastActiveAt: new Date(),
  });
  setAuthCookies(res, signAccess(user._id, session._id), refresh);
  return session;
}

async function sendVerification(user) {
  const token = randomToken();
  user.verifyTokenHash = hashToken(token);
  user.verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  const url = `${config.clientOrigin}/verify-email?token=${token}`;
  const text = `Confirm your email for DimeStack.\n\nOpen this link within 24 hours:\n${url}\n\nIf you did not create an account, you can ignore this message.`;
  const result = await sendMail({ to: user.email, subject: 'Verify your DimeStack email', text });
  return { result, url };
}

router.get('/csrf', (req, res) => {
  const csrfToken = issueCsrf(res);
  res.json({ csrfToken });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.', code: 'AUTH_REQUIRED' });
  res.json({ user: publicUser(req.user), sessionId: req.sessionId });
});

router.post('/register', wrap(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Enter your name.').max(80),
      email: z.string().trim().email('Enter a valid email.').max(160),
      password: passwordSchema,
      utm: utmSchema,
    }),
    req.body
  );
  const existing = await User.findOne({ email: data.email.toLowerCase() });
  if (existing) throw bad('An account with that email already exists.', 409);
  const user = await User.create({
    name: data.name.trim(),
    email: data.email.toLowerCase(),
    passwordHash: await bcrypt.hash(data.password, 12),
    emailVerified: false,
    utm: {
      source: data.utm?.source || '',
      medium: data.utm?.medium || '',
      campaign: data.utm?.campaign || '',
      term: data.utm?.term || '',
      content: data.utm?.content || '',
      landingPath: data.utm?.landingPath || '',
    },
  });
  await seedUserFinance(user);
  const verification = await sendVerification(user);
  await startSession(user, req, res);
  res.status(201).json({
    user: publicUser(user),
    message: verification.result.delivered
      ? 'Account created. Check your email to verify it.'
      : 'Account created. Email delivery is not configured, so the verification message is shown here.',
    preview: previewPayload(verification.result),
  });
}));

router.post('/login', wrap(async (req, res) => {
  const data = parse(
    z.object({
      email: z.string().trim().email('Enter a valid email.'),
      password: z.string().min(1, 'Enter your password.'),
    }),
    req.body
  );
  const user = await User.findOne({ email: data.email.toLowerCase() });
  const hash = user?.passwordHash || (await dummyHash());
  const match = await bcrypt.compare(data.password, hash);
  if (!user || !user.passwordHash || !match) {
    throw bad('Email or password is incorrect.', 401);
  }
  await startSession(user, req, res);
  res.json({ user: publicUser(user) });
}));

router.post('/refresh', wrap(async (req, res) => {
  const raw = req.cookies?.ds_refresh;
  if (!raw) throw bad('Sign in to continue.', 401);
  const session = await Session.findOne({
    refreshHash: hashToken(raw),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw bad('Sign in to continue.', 401);
  const user = await User.findById(session.user);
  if (!user) throw bad('Sign in to continue.', 401);
  const refresh = randomToken();
  session.refreshHash = hashToken(refresh);
  session.lastActiveAt = new Date();
  session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await session.save();
  setAuthCookies(res, signAccess(user._id, session._id), refresh);
  res.json({ ok: true });
}));

router.post('/logout', wrap(async (req, res) => {
  if (req.sessionId) await Session.updateOne({ _id: req.sessionId }, { revokedAt: new Date() });
  clearAuthCookies(res);
  res.json({ ok: true });
}));

router.post('/logout-all', requireAuth, wrap(async (req, res) => {
  await Session.updateMany({ user: req.user._id, revokedAt: null }, { revokedAt: new Date() });
  clearAuthCookies(res);
  res.json({ ok: true });
}));

router.post('/verify-email', wrap(async (req, res) => {
  const data = parse(z.object({ token: z.string().min(20).max(200) }), req.body);
  const user = await User.findOne({
    verifyTokenHash: hashToken(data.token),
    verifyExpires: { $gt: new Date() },
  });
  if (!user) throw bad('This verification link is invalid or has expired.');
  user.emailVerified = true;
  user.verifyTokenHash = '';
  user.verifyExpires = undefined;
  await user.save();
  res.json({ ok: true, message: 'Email verified.' });
}));

router.post('/resend-verification', requireAuth, wrap(async (req, res) => {
  if (req.user.emailVerified) return res.json({ ok: true, message: 'Your email is already verified.' });
  const verification = await sendVerification(req.user);
  res.json({
    ok: true,
    message: verification.result.delivered
      ? 'Verification email sent.'
      : 'Email delivery is not configured, so the verification message is shown here.',
    preview: previewPayload(verification.result),
  });
}));

router.post('/forgot', wrap(async (req, res) => {
  const data = parse(z.object({ email: z.string().trim().email('Enter a valid email.') }), req.body);
  const user = await User.findOne({ email: data.email.toLowerCase() });
  let preview;
  if (user && user.passwordHash) {
    const token = randomToken();
    const otp = randomOtp();
    user.resetTokenHash = hashToken(token);
    user.resetOtpHash = hashToken(otp);
    user.resetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    const url = `${config.clientOrigin}/reset-password?token=${token}`;
    const text = `Reset your DimeStack password.\n\nCode: ${otp}\nThis code expires in 15 minutes.\n\nOr open this secure link:\n${url}\n\nIf you did not ask for this, ignore the message and your password will stay the same.`;
    const result = await sendMail({ to: user.email, subject: 'Reset your DimeStack password', text });
    preview = previewPayload(result);
  } else if (user && !user.passwordHash) {
    const text = 'This DimeStack account signs in with Google. Use Continue with Google, or set a password from your profile after you sign in.';
    const result = await sendMail({ to: user.email, subject: 'DimeStack sign-in help', text });
    preview = previewPayload(result);
  }
  res.json({
    message: 'If an account exists for that email, a reset message is on its way.',
    preview,
  });
}));

router.post('/reset', wrap(async (req, res) => {
  const data = parse(
    z
      .object({
        token: z.string().min(20).max(200).optional().or(z.literal('')),
        email: z.string().trim().email().optional().or(z.literal('')),
        otp: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
        password: passwordSchema,
      })
      .refine((value) => value.token || (value.email && value.otp), {
        message: 'Enter the 6-digit code or open the reset link from your email.',
      }),
    req.body
  );
  let user = null;
  if (data.token) {
    user = await User.findOne({ resetTokenHash: hashToken(data.token), resetExpires: { $gt: new Date() } });
  } else {
    user = await User.findOne({
      email: data.email.toLowerCase(),
      resetOtpHash: hashToken(data.otp),
      resetExpires: { $gt: new Date() },
    });
  }
  if (!user) throw bad('That reset code is invalid or has expired.');
  user.passwordHash = await bcrypt.hash(data.password, 12);
  user.resetTokenHash = '';
  user.resetOtpHash = '';
  user.resetExpires = undefined;
  user.emailVerified = true;
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await startSession(user, req, res);
  res.json({ user: publicUser(user), message: 'Password updated. You are signed in.' });
}));

router.get('/google', (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.redirect(`${config.clientOrigin}/login?error=google_config`);
  }
  const state = randomToken(16);
  res.cookie('ds_oauth_state', state, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.google.clientId);
  url.searchParams.set('redirect_uri', config.google.redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return res.redirect(url.toString());
});

router.get('/google/callback', wrap(async (req, res) => {
  const redirectError = (code) => res.redirect(`${config.clientOrigin}/login?error=${code}`);
  const state = req.query.state;
  if (!state || state !== req.cookies?.ds_oauth_state || !req.query.code) return redirectError('google_state');
  res.clearCookie('ds_oauth_state', { path: '/', sameSite: 'lax', secure: config.cookieSecure, httpOnly: true });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code),
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirect,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return redirectError('google');
  const tokens = await tokenRes.json();
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return redirectError('google');
  const profile = await infoRes.json();
  if (!profile.email || profile.email_verified !== true) return redirectError('google_email');
  const email = String(profile.email).toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });
  if (!user) {
    user = await User.create({
      name: (profile.name || email.split('@')[0]).slice(0, 80),
      email,
      googleId: profile.sub,
      emailVerified: true,
    });
    await seedUserFinance(user);
  } else {
    if (!user.googleId) user.googleId = profile.sub;
    user.emailVerified = true;
    await user.save();
  }
  await startSession(user, req, res);
  return res.redirect(`${config.clientOrigin}/app`);
}));

router.patch('/profile', requireAuth, wrap(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Enter your name.').max(80),
      phone: z.string().max(24).regex(/^[0-9+\-()\s]*$/, 'Enter a valid phone number.'),
      currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD']),
      timezone: z.enum([
        'Asia/Kolkata',
        'Asia/Dubai',
        'Asia/Singapore',
        'Europe/London',
        'Europe/Berlin',
        'America/New_York',
        'America/Los_Angeles',
        'Australia/Sydney',
        'UTC',
      ]),
      bio: z.string().max(400, 'Keep the bio under 400 characters.'),
    }),
    req.body
  );
  req.user.name = data.name;
  req.user.phone = data.phone;
  req.user.currency = data.currency;
  req.user.timezone = data.timezone;
  req.user.bio = data.bio;
  await req.user.save();
  res.json({ user: publicUser(req.user), message: 'Profile updated.' });
}));

router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const data = parse(
    z.object({
      currentPassword: z.string().optional().or(z.literal('')),
      password: passwordSchema,
    }),
    req.body
  );
  if (req.user.passwordHash) {
    if (!data.currentPassword) throw bad('Enter your current password.');
    const match = await bcrypt.compare(data.currentPassword, req.user.passwordHash);
    if (!match) throw bad('Current password is incorrect.');
  }
  req.user.passwordHash = await bcrypt.hash(data.password, 12);
  await req.user.save();
  await Session.updateMany(
    { user: req.user._id, _id: { $ne: req.sessionId }, revokedAt: null },
    { revokedAt: new Date() }
  );
  res.json({ message: 'Password updated. Other sessions were signed out.' });
}));

router.get('/sessions', requireAuth, wrap(async (req, res) => {
  const sessions = await Session.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastActiveAt: -1 })
    .lean();
  res.json({
    sessions: sessions.map((session) => ({
      id: String(session._id),
      userAgent: session.userAgent || 'Unknown device',
      ip: session.ip || 'Unknown',
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      current: String(session._id) === req.sessionId,
    })),
  });
}));

router.delete('/sessions/:id', requireAuth, wrap(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw bad('Session not found.', 404);
  const session = await Session.findOne({ _id: req.params.id, user: req.user._id, revokedAt: null });
  if (!session) throw bad('Session not found.', 404);
  session.revokedAt = new Date();
  await session.save();
  if (String(session._id) === req.sessionId) clearAuthCookies(res);
  res.json({ ok: true, current: String(session._id) === req.sessionId });
}));

module.exports = router;
