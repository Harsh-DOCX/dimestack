import { useCallback, useEffect, useState } from 'react';
import { api, download } from '../lib/api';
import { daysAgo, formatMoney, todayInput } from '../lib/format';
import { useCatalog } from '../lib/useCatalog';
import { useAuth } from '../context/AuthContext';
import { BusyButton, ConfirmModal, DateRange, FormNote, LoadingBar, SkeletonRows } from '../components/Ui';
import { CompareBars, NetLine, SplitPie } from '../components/Charts';

export function Ledgers() {
  const catalog = useCatalog();
  const [form, setForm] = useState({ name: '', description: '', currency: 'INR' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (editing) {
        await api.patch(`/api/ledgers/${editing}`, form);
        setSuccess('Ledger updated.');
        setEditing(null);
      } else {
        await api.post('/api/ledgers', form);
        setSuccess('Ledger created with a cash account.');
      }
      setForm({ name: '', description: '', currency: form.currency });
      await catalog.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/ledgers/${pending.id}?force=true`);
      setPending(null);
      setSuccess('Ledger deleted.');
      await catalog.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Ledgers</h1>
      <p>Keep a ledger for each pot of money you want to report on its own. A new ledger starts with a cash account.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <div className="form-grid">
          <label className="field">Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="field">Description
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="field">Currency
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              {['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((code) => <option key={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <BusyButton busy={busy} type="submit">{editing ? 'Save ledger' : 'Create ledger'}</BusyButton>
          {editing ? <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm({ name: '', description: '', currency: 'INR' }); }}>Cancel edit</button> : null}
        </div>
      </form>
      {catalog.loading ? <><LoadingBar /><SkeletonRows /></> : null}
      <div className="grid">
        {catalog.ledgers.map((ledger) => (
          <article className="card" key={ledger.id}>
            <h2>{ledger.name}</h2>
            <p>{ledger.description || 'No description yet.'}</p>
            <p className="fine">{ledger.currency}</p>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => { setEditing(ledger.id); setForm({ name: ledger.name, description: ledger.description, currency: ledger.currency }); }}>Edit</button>
              <button type="button" className="btn danger" onClick={() => setPending(ledger)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      <ConfirmModal open={Boolean(pending)} title="Delete ledger" body={pending ? `Delete “${pending.name}” along with its accounts, transactions, transfers, and schedules.` : ''} confirmLabel="Delete ledger" danger busy={busy} onCancel={() => setPending(null)} onConfirm={remove} />
    </article>
  );
}

export function NetWorth() {
  const { user } = useAuth();
  const catalog = useCatalog();
  const [range, setRange] = useState({ from: daysAgo(90), to: todayInput() });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountForm, setAccountForm] = useState({ name: '', kind: 'asset', ledgerId: '', openingBalance: '0' });
  const [transfer, setTransfer] = useState({ ledgerId: '', fromAccountId: '', toAccountId: '', amount: '', description: '', date: todayInput() });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const money = (value) => formatMoney(value, user?.currency || 'INR');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/reports/networth?from=${range.from}&to=${range.to}`);
      setReport(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!catalog.ledgers.length || accountForm.ledgerId) return;
    setAccountForm((current) => ({ ...current, ledgerId: catalog.ledgers[0].id }));
    setTransfer((current) => ({ ...current, ledgerId: catalog.ledgers[0].id }));
  }, [catalog.ledgers, accountForm.ledgerId]);

  async function addAccount(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/accounts', { ...accountForm, openingBalance: Number(accountForm.openingBalance || 0) });
      setSuccess('Account added.');
      setAccountForm((current) => ({ ...current, name: '', openingBalance: '0' }));
      await catalog.reload();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addTransfer(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/transfers', { ...transfer, amount: Number(transfer.amount) });
      setSuccess('Transfer recorded.');
      setTransfer((current) => ({ ...current, amount: '', description: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/accounts/${pending.id}`);
      setPending(null);
      setSuccess('Account deleted.');
      await catalog.reload();
      await load();
    } catch (err) {
      setError(err.message);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Net worth</h1>
      <p>Assets minus liabilities. A transfer between your accounts changes balances without counting as income or an expense.</p>
      <DateRange from={range.from} to={range.to} onChange={setRange} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="form-success" role="status">{success}</p> : null}
      {loading ? <><LoadingBar /><SkeletonRows /></> : null}
      {report && !loading ? (
        <>
          <section className="stats">
            <article><h2>Assets</h2><p>{money(report.assets)}</p></article>
            <article><h2>Liabilities</h2><p>{money(report.liabilities)}</p></article>
            <article><h2>Net worth</h2><p>{money(report.net)}</p></article>
          </section>
          <h2>Net worth over time</h2>
          <NetLine points={report.series} />
          <div className="table-wrap">
            <table className="data">
              <caption>Account balances through {range.to}</caption>
              <thead>
                <tr><th>Account</th><th>Kind</th><th>Opening</th><th>Balance</th><th></th></tr>
              </thead>
              <tbody>
                {report.accounts.map((account) => (
                  <tr key={account.id}>
                    <td data-label="Account">{account.name}</td>
                    <td data-label="Kind">{account.kind}</td>
                    <td data-label="Opening">{money(account.openingBalance)}</td>
                    <td data-label="Balance">{money(account.balance)}</td>
                    <td data-label="Actions"><button type="button" className="btn danger" onClick={() => setPending(account)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="split">
        <form className="card stack" onSubmit={addAccount}>
          <h2>Add account</h2>
          <label className="field">Name
            <input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} required />
          </label>
          <label className="field">Kind
            <select value={accountForm.kind} onChange={(event) => setAccountForm({ ...accountForm, kind: event.target.value })}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
          </label>
          <label className="field">Ledger
            <select value={accountForm.ledgerId} onChange={(event) => setAccountForm({ ...accountForm, ledgerId: event.target.value })} required>
              <option value="">Select a ledger</option>
              {catalog.ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
            </select>
          </label>
          <label className="field">Opening balance
            <input inputMode="decimal" step="0.01" value={accountForm.openingBalance} onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })} />
          </label>
          <BusyButton busy={busy} type="submit">Add account</BusyButton>
        </form>
        <form className="card stack" onSubmit={addTransfer}>
          <h2>Transfer</h2>
          <label className="field">Ledger
            <select value={transfer.ledgerId} onChange={(event) => setTransfer({ ...transfer, ledgerId: event.target.value })} required>
              <option value="">Select a ledger</option>
              {catalog.ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
            </select>
          </label>
          <label className="field">From
            <select value={transfer.fromAccountId} onChange={(event) => setTransfer({ ...transfer, fromAccountId: event.target.value })} required>
              <option value="">Select an account</option>
              {catalog.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="field">To
            <select value={transfer.toAccountId} onChange={(event) => setTransfer({ ...transfer, toAccountId: event.target.value })} required>
              <option value="">Select an account</option>
              {catalog.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="field">Amount
            <input inputMode="decimal" min="0.01" step="0.01" value={transfer.amount} onChange={(event) => setTransfer({ ...transfer, amount: event.target.value })} required />
          </label>
          <label className="field">Description
            <input value={transfer.description} onChange={(event) => setTransfer({ ...transfer, description: event.target.value })} required />
          </label>
          <label className="field">Date
            <input type="date" value={transfer.date} onChange={(event) => setTransfer({ ...transfer, date: event.target.value })} required />
          </label>
          <BusyButton busy={busy} type="submit">Record transfer</BusyButton>
        </form>
      </div>
      <ConfirmModal open={Boolean(pending)} title="Delete account" body={pending ? `Delete ${pending.name}. Accounts with transactions or transfers cannot be removed.` : ''} confirmLabel="Delete" danger busy={busy} onCancel={() => setPending(null)} onConfirm={remove} />
    </article>
  );
}

export function Reports() {
  const { user } = useAuth();
  const { ledgers } = useCatalog();
  const [range, setRange] = useState({ from: daysAgo(182), to: todayInput() });
  const [ledgerId, setLedgerId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const money = (value) => formatMoney(value, user?.currency || 'INR');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (ledgerId) params.set('ledgerId', ledgerId);
    api.get(`/api/reports/overview?${params.toString()}`)
      .then((data) => { if (!cancel) setReport(data); })
      .catch((err) => { if (!cancel) setError(err.message); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [range, ledgerId]);

  async function pdf() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await download('/api/reports/pdf', { from: range.from, to: range.to, ledgerId }, 'dimestack-report.pdf');
      setSuccess('PDF download started.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Reports</h1>
      <p>Compare income, expenses, and savings across the months in a date range, then download the summary.</p>
      <div className="filters">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <label className="field">Ledger
          <select value={ledgerId} onChange={(event) => setLedgerId(event.target.value)}>
            <option value="">All ledgers</option>
            {ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <BusyButton busy={busy} type="button" onClick={pdf}>Download PDF</BusyButton>
      </div>
      <FormNote error={error} success={success} />
      {loading ? <><LoadingBar /><SkeletonRows /></> : null}
      {report && !loading ? (
        <>
          <section className="stats">
            <article><h2>Income</h2><p>{money(report.income)}</p></article>
            <article><h2>Expenses</h2><p>{money(report.expense)}</p></article>
            <article><h2>Savings</h2><p>{money(report.net)}</p></article>
          </section>
          <h2>Monthly comparison</h2>
          <CompareBars rows={report.monthly} />
          <div className="legend">
            <span><i className="swatch income" /> Income</span>
            <span><i className="swatch expense" /> Expenses</span>
            <span><i className="swatch balance" /> Savings</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <caption>Income, expenses, and savings by month</caption>
              <thead>
                <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Savings</th></tr>
              </thead>
              <tbody>
                {report.monthly.map((month) => (
                  <tr key={month.month}>
                    <td data-label="Month">{month.month}</td>
                    <td data-label="Income">{money(month.income)}</td>
                    <td data-label="Expenses">{money(month.expense)}</td>
                    <td data-label="Savings">{money(month.savings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Where expenses went</h2>
          <SplitPie slices={report.distribution} currencyLabel={user?.currency || 'INR'} />
        </>
      ) : null}
    </article>
  );
}
