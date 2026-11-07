import { useEffect, useState } from 'react';
import { api, download } from '../lib/api';
import { formatMoney, startOfMonth, todayInput } from '../lib/format';
import { useCatalog } from '../lib/useCatalog';
import { useAuth } from '../context/AuthContext';
import { BusyButton, ConfirmModal, DateRange, FormNote, LoadingBar, SkeletonRows } from '../components/Ui';

const blank = () => ({
  amount: '',
  description: '',
  type: 'expense',
  date: todayInput(),
  ledgerId: '',
  accountId: '',
  categoryId: '',
  subcategoryId: '',
});

export function Transactions() {
  const { user } = useAuth();
  const catalog = useCatalog();
  const [filters, setFilters] = useState({
    q: '', type: '', ledgerId: '', accountId: '', categoryId: '', min: '', max: '', from: startOfMonth(), to: todayInput(),
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [editingKind, setEditingKind] = useState('transaction');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [tick, setTick] = useState(0);
  const money = (value) => formatMoney(value, user?.currency || 'INR');

  useEffect(() => {
    if (!catalog.ledgers.length || form.ledgerId) return;
    const ledgerId = catalog.ledgers[0].id;
    const account = catalog.accounts.find((item) => item.ledgerId === ledgerId);
    setForm((current) => ({ ...current, ledgerId, accountId: account?.id || '' }));
  }, [catalog.ledgers, catalog.accounts, form.ledgerId]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    api.get(`/api/transactions?${params.toString()}`)
      .then((data) => {
        if (!cancel) {
          setResult(data);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancel) setError(err.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [filters, page, tick]);

  const accounts = catalog.accounts.filter((account) => account.ledgerId === form.ledgerId);
  const parents = catalog.categories.filter((category) => category.type === form.type && !category.parentId);
  const subs = form.categoryId ? catalog.categories.filter((category) => category.parentId === form.categoryId) : [];
  const filterAccounts = catalog.accounts.filter((account) => !filters.ledgerId || account.ledgerId === filters.ledgerId);

  function setField(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'type') {
        next.categoryId = '';
        next.subcategoryId = '';
      }
      if (key === 'ledgerId') {
        const account = catalog.accounts.find((item) => item.ledgerId === value);
        next.accountId = account?.id || '';
      }
      if (key === 'categoryId') next.subcategoryId = '';
      return next;
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (editingKind === 'transfer' && editingId) {
        await api.patch(`/api/transfers/${editingId}`, {
          amount: Number(form.amount),
          description: form.description,
          date: form.date,
        });
        setSuccess('Transfer updated.');
        setTick((value) => value + 1);
      } else {
        const body = {
          amount: Number(form.amount),
          description: form.description,
          type: form.type,
          date: form.date,
          ledgerId: form.ledgerId,
          accountId: form.accountId,
          categoryId: form.categoryId,
          subcategoryId: form.subcategoryId || '',
        };
        if (editingId) {
          await api.patch(`/api/transactions/${editingId}`, body);
          setSuccess('Transaction updated.');
        } else {
          await api.post('/api/transactions', body);
          setSuccess('Transaction saved.');
        }
        setTick((value) => value + 1);
      }
      setEditingId('');
      setEditingKind('transaction');
      setForm((current) => ({ ...blank(), ledgerId: current.ledgerId, accountId: current.accountId, type: current.type, categoryId: current.categoryId }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(item) {
    setError('');
    setSuccess('');
    setEditingId(item.id);
    setEditingKind(item.kind);
    if (item.kind === 'transfer') {
      setForm((current) => ({ ...current, amount: String(item.amount), description: item.description, date: item.date }));
      return;
    }
    setForm({
      amount: String(item.amount),
      description: item.description,
      type: item.type,
      date: item.date,
      ledgerId: item.ledger?.id || '',
      accountId: item.account?.id || '',
      categoryId: item.category?.id || '',
      subcategoryId: item.subcategory?.id || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove() {
    if (!pending) return;
    setBusy(true);
    try {
      const path = pending.kind === 'transfer' ? `/api/transfers/${pending.id}` : `/api/transactions/${pending.id}`;
      await api.del(path);
      setSuccess(pending.kind === 'transfer' ? 'Transfer deleted.' : 'Transaction deleted.');
      setTick((value) => value + 1);
      setPending(null);
    } catch (err) {
      setError(err.message);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    try {
      const csv = await file.text();
      const data = await api.post('/api/transactions/import', { csv });
      setSuccess(`Imported ${data.imported} rows.`);
      setTick((value) => value + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onExport() {
    setError('');
    try {
      await download('/api/transactions/export', {
        from: filters.from,
        to: filters.to,
        ledgerId: filters.ledgerId,
      }, 'dimestack-transactions.csv');
      setSuccess('CSV download started.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <article className="stack">
      <h1>Transactions</h1>
      <p>Enter an amount, a description, and mark it as income or an expense. Filter the table by date, ledger, account, or category.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={onSubmit}>
        <h2>{editingId ? (editingKind === 'transfer' ? 'Edit transfer' : 'Edit transaction') : 'New transaction'}</h2>
        <FormNote error={error} success={success} />
        <div className="form-grid">
          <label className="field">Amount
            <input inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(event) => setField('amount', event.target.value)} required />
          </label>
          <label className="field">Description
            <input value={form.description} onChange={(event) => setField('description', event.target.value)} maxLength={240} required />
          </label>
          <label className="field">Date
            <input type="date" value={form.date} onChange={(event) => setField('date', event.target.value)} required />
          </label>
          {editingKind === 'transfer' ? null : (
            <>
              <label className="field">Type
                <select value={form.type} onChange={(event) => setField('type', event.target.value)}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label className="field">Ledger
                <select value={form.ledgerId} onChange={(event) => setField('ledgerId', event.target.value)} required>
                  <option value="">Select a ledger</option>
                  {catalog.ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
                </select>
              </label>
              <label className="field">Account
                <select value={form.accountId} onChange={(event) => setField('accountId', event.target.value)} required>
                  <option value="">Select an account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="field">Category
                <select value={form.categoryId} onChange={(event) => setField('categoryId', event.target.value)} required>
                  <option value="">Select a category</option>
                  {parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="field">Subcategory
                <select value={form.subcategoryId} onChange={(event) => setField('subcategoryId', event.target.value)}>
                  <option value="">None</option>
                  {subs.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
        <div className="row">
          <BusyButton busy={busy} type="submit">{editingId ? 'Save changes' : 'Add transaction'}</BusyButton>
          {editingId ? (
            <button type="button" className="btn ghost" onClick={() => { setEditingId(''); setEditingKind('transaction'); setForm(blank()); }}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="filters">
        <DateRange from={filters.from} to={filters.to} onChange={(next) => { setPage(1); setFilters((current) => ({ ...current, ...next })); }} />
        <label className="field">Search descriptions
          <input value={filters.q} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, q: event.target.value })); }} />
        </label>
        <label className="field">Type
          <select value={filters.type} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, type: event.target.value })); }}>
            <option value="">All</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </label>
        <label className="field">Ledger
          <select value={filters.ledgerId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, ledgerId: event.target.value, accountId: '' })); }}>
            <option value="">All ledgers</option>
            {catalog.ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
          </select>
        </label>
        <label className="field">Account
          <select value={filters.accountId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, accountId: event.target.value })); }}>
            <option value="">All accounts</option>
            {filterAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="field">Category
          <select value={filters.categoryId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, categoryId: event.target.value })); }}>
            <option value="">All categories</option>
            {catalog.categories.filter((category) => !category.parentId).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="field">Min amount
          <input inputMode="decimal" value={filters.min} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, min: event.target.value })); }} />
        </label>
        <label className="field">Max amount
          <input inputMode="decimal" value={filters.max} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, max: event.target.value })); }} />
        </label>
      </div>

      <div className="row">
        <button type="button" className="btn ghost" onClick={onExport}>Export CSV</button>
        <label className="btn ghost file">
          Import CSV
          <input type="file" accept=".csv,text/csv" onChange={onImport} />
        </label>
      </div>
      <p className="fine">CSV columns: date, type, amount, description, ledger, account, toAccount, category, subcategory.</p>

      {loading ? <><LoadingBar /><SkeletonRows count={6} /></> : null}
      {!loading && result ? (
        <>
          <div className="table-wrap">
            <table className="data">
              <caption>Transactions from {filters.from} to {filters.to}</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.length ? result.items.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td data-label="Date">{item.date}</td>
                    <td data-label="Description">{item.description}</td>
                    <td data-label="Type">{item.type}</td>
                    <td data-label="Category">{item.subcategory ? `${item.category?.name} / ${item.subcategory.name}` : (item.category?.name || '—')}</td>
                    <td data-label="Account">{item.counterAccount ? `${item.account?.name} → ${item.counterAccount.name}` : (item.account?.name || '—')}</td>
                    <td data-label="Amount">{money(item.amount)}</td>
                    <td data-label="Actions" className="actions">
                      <button type="button" className="btn ghost" onClick={() => beginEdit(item)}>Edit</button>
                      <button type="button" className="btn danger" onClick={() => setPending(item)}>Delete</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7">No transactions in this date range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {result.page} of {result.pages}</span>
            <button type="button" className="btn ghost" disabled={page >= result.pages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </>
      ) : null}
      <ConfirmModal
        open={Boolean(pending)}
        title={pending?.kind === 'transfer' ? 'Delete transfer' : 'Delete transaction'}
        body={pending ? `Remove “${pending.description}” from the ledger. This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={remove}
      />
    </article>
  );
}
