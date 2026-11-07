const catalog = require('./pages.json');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalize(pathname) {
  if (!pathname) return '/';
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return path;
}

function getPage(pathname) {
  const path = normalize(pathname);
  if (catalog.pages[path]) return { ...catalog.pages[path], path, status: 200 };
  return { ...catalog.pages['/404'], path: '/404', status: 404 };
}

function resolveMeta(pathname, search = '') {
  const page = getPage(pathname);
  if (normalize(pathname) === '/search') {
    const query = new URLSearchParams(search).get('q');
    if (query) {
      const safe = query.slice(0, 80);
      return {
        ...page,
        title: `Search “${safe}” — DimeStack`,
        description: `Search results for ${safe} across DimeStack pages and your records.`,
      };
    }
  }
  return page;
}

function crumbHtml(page) {
  const items = page.crumb
    .map((item, index) => {
      const last = index === page.crumb.length - 1 || !item.href;
      if (last) return `<li><span aria-current="page">${esc(item.label)}</span></li>`;
      return `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`;
    })
    .join('');
  return `<ol>${items}</ol>`;
}

function buildJsonLd(page, pathname) {
  const path = normalize(pathname);
  const url = `${catalog.siteUrl}${path === '/' ? '/' : path}`;
  const graph = [
    {
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url,
      isPartOf: { '@type': 'WebSite', name: 'DimeStack', url: catalog.siteUrl },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: page.crumb.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
        item: `${catalog.siteUrl}${item.href || path}`,
      })),
    },
  ];
  if (path === '/') {
    graph.push(catalog.software);
    graph.push(catalog.website);
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

function between(html, key, value) {
  const pattern = new RegExp(`<!--ds:${key}-->[\\s\\S]*?<!--/ds:${key}-->`);
  return html.replace(pattern, `<!--ds:${key}-->${value}<!--/ds:${key}-->`);
}

function renderDocument(template, pathname, options = {}) {
  const page = getPage(pathname);
  const canonical = `${catalog.siteUrl}${page.status === 404 ? '/404' : page.path === '/' ? '/' : page.path}`;
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(page.description)}$2`);
  html = html.replace(/(<meta name="robots" content=")[^"]*(")/, `$1${esc(page.robots)}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(canonical)}$2`);
  html = between(html, 'h1', esc(page.h1));
  html = between(html, 'intro', esc(page.intro));
  html = between(html, 'crumb', crumbHtml(page));
  const json = JSON.stringify(buildJsonLd(page, page.status === 404 ? '/404' : page.path)).replace(/</g, '\\u003c');
  html = between(html, 'jsonld', json);
  if (options.dev && !html.includes('/static/js/bundle.js')) {
    html = html.replace('</body>', '<script defer src="/static/js/bundle.js"></script></body>');
  }
  return { status: page.status, html, page };
}

module.exports = { catalog, esc, getPage, resolveMeta, buildJsonLd, renderDocument };
