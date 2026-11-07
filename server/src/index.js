const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { connect } = require('./db');
const { sanitizeRequest, csrfProtection, loadUser } = require('./middleware');
const authRoutes = require('./routes/auth');
const financeRoutes = require('./routes/finance');
const { backupAll } = require('./backup');
const { ensureRecurring } = require('./finance');
const { User } = require('./models');

const app = express();
app.disable('x-powered-by');
app.use('/api', helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(sanitizeRequest);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Wait a few minutes and try again.' },
});

app.use('/api', csrfProtection);
app.use('/api', loadUser);
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'DimeStack' }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify-email', authLimiter);
app.use('/api/auth/forgot', resetLimiter);
app.use('/api/auth/reset', resetLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/auth/google', (req, res, next) => {
  if (req.path === '/' || req.path === '') return authLimiter(req, res, next);
  return next();
});
app.use('/api/auth', authRoutes);
app.use('/api', financeRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (err.code === 11000) return res.status(409).json({ error: 'That record already exists.' });
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Try again.' : err.message,
    details: err.details,
    code: err.code,
  });
});

if (process.env.NODE_ENV === 'production') {
  const buildDir = path.join(__dirname, '..', '..', 'frontend', 'build');
  const templatePath = path.join(buildDir, 'index.html');
  if (fs.existsSync(templatePath)) {
    const { renderDocument } = require('../../frontend/src/lib/renderDocument');
    app.use(express.static(buildDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || path.extname(req.path)) return next();
      const rendered = renderDocument(fs.readFileSync(templatePath, 'utf8'), req.path, { dev: false });
      res.status(rendered.status).type('html').send(rendered.html);
    });
  }
}

async function tickRecurring() {
  const today = new Date().toISOString().slice(0, 10);
  const users = await User.find().select('_id');
  for (const user of users) {
    await ensureRecurring(user._id, today);
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    if (config.jwtSecretIsDefault) throw new Error('Set JWT_SECRET to a unique secret before starting in production.');
    if (!config.mongoUri) throw new Error('Set MONGO_URI to a persistent MongoDB database before starting in production.');
    if (!config.cookieSecure) throw new Error('Set COOKIE_SECURE=true when running in production.');
    if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) {
      throw new Error('COOKIE_SAME_SITE must be "lax", "strict", or "none".');
    }
    if (config.cookieSameSite === 'none' && !config.cookieSecure) {
      throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.');
    }
  }
  const db = await connect();
  if (config.jwtSecretIsDefault) {
    console.log('JWT_SECRET is not set. Using the development secret. Set JWT_SECRET before a public deploy.');
  }
  console.log(`Database: ${db.mode}${db.restored ? ' (restored from the latest backup)' : ''}`);
  if (db.mode === 'embedded') {
    console.log('No MongoDB was running. Using an embedded database persisted by automatic JSON backups in server/backups.');
  }
  const server = app.listen(config.port, () => {
    console.log(`DimeStack API  http://localhost:${config.port}`);
    console.log(`Web app        ${config.clientOrigin}`);
  });
  setTimeout(() => backupAll().catch((err) => console.error('Backup failed:', err.message)), 4000);
  setInterval(() => backupAll().catch((err) => console.error('Backup failed:', err.message)), 6 * 60 * 60 * 1000);
  setInterval(() => tickRecurring().catch((err) => console.error('Recurring run failed:', err.message)), 60 * 1000);

  const shutdown = async () => {
    server.close();
    try {
      await backupAll();
    } catch (err) {
      console.error('Backup failed:', err.message);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('DimeStack failed to start.');
  console.error(err);
  process.exit(1);
});
