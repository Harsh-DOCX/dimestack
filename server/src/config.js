require('dotenv').config();

const clientOrigin = (process.env.CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');

module.exports = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || '',
  clientOrigin,
  siteUrl: (process.env.SITE_URL || 'https://dimestack.app').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-dimestack-change-this-secret-before-production',
  jwtSecretIsDefault: !process.env.JWT_SECRET,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect: process.env.GOOGLE_CALLBACK_URL || `${clientOrigin}/api/auth/google/callback`,
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'DimeStack <noreply@dimestack.app>',
  },
};
