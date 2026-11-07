import { todayInput } from './format';

let csrf = '';
let csrfPromise = null;

export function apiUrl(path) {
  return path;
}

const noRefresh = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot',
  '/api/auth/reset',
  '/api/auth/verify-email',
  '/api/auth/csrf',
];

export function readUtm() {
  try {
    const raw = sessionStorage.getItem('ds_utm');
    return raw ? JSON.parse(raw) : undefined;
  } catch (err) {
    return undefined;
  }
}

async function ensureCsrf(force = false) {
  if (csrf && !force) return csrf;
  if (!csrfPromise) {
    csrfPromise = fetch(apiUrl('/api/auth/csrf'), {
      credentials: 'include',
      headers: { 'x-client-date': todayInput() },
    })
      .then((res) => res.json())
      .then((data) => {
        csrf = data.csrfToken || '';
        return csrf;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function request(path, options = {}, allowRefresh = true) {
  await ensureCsrf();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    'x-csrf-token': csrf,
    'x-client-date': todayInput(),
    ...(options.headers || {}),
  };
  const res = await fetch(apiUrl(path), { credentials: 'include', ...options, headers });
  if (res.status === 401 && allowRefresh && !noRefresh.some((item) => path.startsWith(item))) {
    const refreshed = await fetch(apiUrl('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf, 'x-client-date': todayInput() },
    });
    if (refreshed.ok) return request(path, options, false);
  }
  if (res.status === 403 && allowRefresh) {
    const data = await res.clone().json().catch(() => ({}));
    if (String(data.error || '').toLowerCase().includes('csrf')) {
      csrf = '';
      await ensureCsrf(true);
      return request(path, options, false);
    }
  }
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = { error: text.slice(0, 180) };
    }
  }
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = res.status;
    error.code = data.code;
    error.details = data.details;
    throw error;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export async function download(path, body, filename) {
  await ensureCsrf();
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf,
      'x-client-date': todayInput(),
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
