const base = 'http://localhost:5000';
const jar = new Map();

function store(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    const pair = raw.split(';')[0];
    const index = pair.indexOf('=');
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1));
  }
}

function headers(extra = {}) {
  return {
    cookie: [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; '),
    'x-client-date': '2026-11-07',
    ...extra,
  };
}

async function call(path, options = {}) {
  const res = await fetch(base + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers(options.headers),
    },
  });
  store(res);
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = text;
  }
  return { status: res.status, data, type: res.headers.get('content-type') || '' };
}

async function main() {
  const csrf = await call('/api/auth/csrf');
  const token = csrf.data.csrfToken;
  const email = `qa+${Date.now()}@dimestack.test`;
  const reg = await call('/api/auth/register', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: JSON.stringify({ name: 'QA Ledger', email, password: 'ledgerpass1', utm: { source: 'smoke', medium: 'test', campaign: 'local', landingPath: '/' } }),
  });
  if (reg.status !== 201) throw new Error(`register ${reg.status} ${JSON.stringify(reg.data)}`);
  const link = String(reg.data.preview || '').match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`missing preview ${JSON.stringify(reg.data).slice(0, 400)}`);
  const verifyToken = new URL(link).searchParams.get('token');
  const verified = await call('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: JSON.stringify({ token: verifyToken }),
  });
  if (verified.status !== 200) throw new Error(`verify ${JSON.stringify(verified.data)}`);
  const ledgers = await call('/api/ledgers');
  const accounts = await call('/api/accounts');
  const categories = await call('/api/categories');
  const ledger = ledgers.data.ledgers[0];
  const account = accounts.data.accounts.find((item) => item.kind === 'asset');
  const category = categories.data.categories.find((item) => item.type === 'expense' && !item.parentId);
  const tx = await call('/api/transactions', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: JSON.stringify({
      amount: 250.5,
      description: 'Market groceries',
      type: 'expense',
      date: '2026-11-07',
      ledgerId: ledger.id,
      accountId: account.id,
      categoryId: category.id,
    }),
  });
  if (tx.status !== 201) throw new Error(`tx ${JSON.stringify(tx.data)}`);
  const overview = await call(`/api/reports/overview?from=2026-11-01&to=2026-11-07&ledgerId=${ledger.id}`);
  if (overview.data.expense !== 250.5) throw new Error(`overview ${JSON.stringify(overview.data)}`);
  const pdf = await call('/api/reports/pdf', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: JSON.stringify({ from: '2026-11-01', to: '2026-11-07', ledgerId: ledger.id }),
  });
  if (!pdf.type.includes('pdf') || !String(pdf.data).startsWith('%PDF')) throw new Error(`pdf ${pdf.type}`);
  const forgot = await call('/api/auth/forgot', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: JSON.stringify({ email }),
  });
  if (forgot.status !== 200 || !forgot.data.preview) throw new Error(`forgot ${JSON.stringify(forgot.data)}`);
  const sessions = await call('/api/auth/sessions');
  if (!sessions.data.sessions?.length) throw new Error('no sessions');
  console.log(JSON.stringify({
    email,
    expense: overview.data.expense,
    description: tx.data.transaction.description,
    pdf: pdf.type,
    sessions: sessions.data.sessions.length,
    resetPreview: true,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
