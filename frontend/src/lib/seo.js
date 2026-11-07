import { useEffect } from 'react';
import { resolveMeta, buildJsonLd, catalog, getPage } from './renderDocument';

export const SITE_URL = catalog.siteUrl;

export function useSeo(pathname, search = '') {
  const meta = resolveMeta(pathname, search);
  useEffect(() => {
    const current = resolveMeta(pathname, search);
    const path = current.status === 404 ? '/404' : current.path;
    document.title = current.title;
    setMeta('description', current.description);
    setMeta('robots', current.robots);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE_URL}${path === '/' ? '/' : path}`;
    let script = document.getElementById('ds-jsonld');
    if (!script) {
      script = document.createElement('script');
      script.id = 'ds-jsonld';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(buildJsonLd(current, path));
  }, [pathname, search]);
  return meta;
}

function setMeta(name, content) {
  let node = document.querySelector(`meta[name="${name}"]`);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('name', name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

export function pageCatalog() {
  return Object.entries(catalog.pages)
    .filter(([path]) => path !== '/404')
    .map(([path, page]) => ({ path, ...page }));
}

export { getPage };
