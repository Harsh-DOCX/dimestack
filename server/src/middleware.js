const jwt = require('jsonwebtoken');
const config = require('./config');
const { User, Session } = require('./models');
const { timingEqual, resolveToday } = require('./util');

const SECRET_FIELDS = new Set(['password', 'currentPassword', 'newPassword', 'confirmPassword']);

function sanitize(value, key = '', seen = new Set()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === 'string') value[index] = item.replace(/[<>]/g, '');
      else if (item && typeof item === 'object') sanitize(item, key, seen);
    });
    return value;
  }
  for (const field of Object.keys(value)) {
    if (field.startsWith('$') || field.includes('.') || field === '__proto__' || field === 'constructor') {
      delete value[field];
      continue;
    }
    const current = value[field];
    if (typeof current === 'string') {
      value[field] = SECRET_FIELDS.has(field) ? current : current.replace(/[<>]/g, '').trim();
    } else if (current && typeof current === 'object') sanitize(current, field, seen);
  }
  return value;
}

function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') sanitize(req.body);
  if (req.params && typeof req.params === 'object') sanitize(req.params);
  if (req.query && typeof req.query === 'object') {
    try {
      sanitize(req.query);
    } catch (err) {
      req.query = sanitize({ ...req.query });
    }
  }
  next();
}

function cookieOptions(maxAge, httpOnly = true) {
  return {
    httpOnly,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge,
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('ds_access', accessToken, cookieOptions(15 * 60 * 1000));
  res.cookie('ds_refresh', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
}

function clearAuthCookies(res) {
  const base = { path: '/', sameSite: config.cookieSameSite, secure: config.cookieSecure };
  res.clearCookie('ds_access', { ...base, httpOnly: true });
  res.clearCookie('ds_refresh', { ...base, httpOnly: true });
}

function issueCsrf(res) {
  const token = require('crypto').randomBytes(32).toString('hex');
  res.cookie('ds_csrf', token, cookieOptions(7 * 24 * 60 * 60 * 1000, false));
  return token;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const header = req.get('x-csrf-token') || '';
  const cookie = req.cookies?.ds_csrf || '';
  if (!header || !cookie || !timingEqual(header, cookie)) {
    return res.status(403).json({ error: 'Invalid CSRF token. Refresh the page and try again.' });
  }
  return next();
}

function signAccess(userId, sessionId) {
  return jwt.sign({ sub: String(userId), sid: String(sessionId), typ: 'access' }, config.jwtSecret, {
    expiresIn: '15m',
  });
}

async function loadUser(req, res, next) {
  const token = req.cookies?.ds_access;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.typ !== 'access') return next();
    const [user, session] = await Promise.all([
      User.findById(payload.sub),
      Session.findOne({ _id: payload.sid, user: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }),
    ]);
    if (!user || !session) return next();
    if (Date.now() - new Date(session.lastActiveAt).getTime() > 5 * 60 * 1000) {
      session.lastActiveAt = new Date();
      await session.save();
    }
    req.user = user;
    req.sessionId = String(session._id);
    req.today = resolveToday(req.get('x-client-date'));
    return next();
  } catch (err) {
    return next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.', code: 'AUTH_REQUIRED' });
  return next();
}

function requireVerified(req, res, next) {
  if (!req.user.emailVerified) {
    return res.status(403).json({
      error: 'Verify your email before changing financial records.',
      code: 'EMAIL_UNVERIFIED',
    });
  }
  return next();
}

function clientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 64);
  return (req.ip || '').slice(0, 64);
}

module.exports = {
  sanitizeRequest,
  setAuthCookies,
  clearAuthCookies,
  issueCsrf,
  csrfProtection,
  signAccess,
  loadUser,
  requireAuth,
  requireVerified,
  clientIp,
};
