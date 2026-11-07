const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { renderDocument } = require('./lib/renderDocument');

module.exports = function setup(app) {
  app.use(
    createProxyMiddleware('/api', {
      target: 'http://localhost:5000',
      changeOrigin: true,
    })
  );

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const pathname = req.path || '/';
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith('/static') ||
      pathname.startsWith('/sockjs-node') ||
      pathname.startsWith('/ws') ||
      pathname.startsWith('/__')
    ) {
      return next();
    }
    if (path.extname(pathname)) return next();
    const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const rendered = renderDocument(template, pathname, { dev: true });
    res.status(rendered.status).type('html').send(rendered.html);
  });
};
