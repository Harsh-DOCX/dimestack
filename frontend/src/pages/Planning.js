import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { currentMonth, formatMoney, todayInput } from '../lib/format';
import { useCatalog } from '../lib/useCatalog';
import { useAuth } from '../context/AuthContext';
import { BusyButton, ConfirmModal, FormNote, LoadingBar, SkeletonRows } from '../components/Ui';

export function Budgets() {
  const { user } = useAuth();
  const { ledgers, categories, loading } = useCatalog();
  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState('');
  const [ledgerId, setLedgerId] = useState('');
  const [amount, setAmount] = useState('');
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const money = (value) => formatMoney(value, user?.currency || 'INR');
  const expenseParents = categories.filter((category) => category.type === 'expense' && !category.parentId);

  async function load(nextMonth = month) {
    setListLoading(true);
    try {
      const data = await api.get(`/api/budgets?month=${nextMonth}`);
      setRows(data.budgets);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.post('/api/budgets', { categoryId, month, amount: Number(amount), ledgerId });
      setSuccess(data.updated ? 'Budget updated for that category.' : 'Budget saved.');
      setAmount('');
      await load(month);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/budgets/${pending.id}`);
      setPending(null);
      setSuccess('Budget removed.');
      await load(month);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Monthly budgets</h1>
      <p>Set what you plan to spend on a top-level expense category. Subcategory spending counts toward the parent.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <div className="form-grid">
          <label className="field">Month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} required />
          </label>
          <label className="field">Category
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
              <option value="">Select a category</option>
              {expenseParents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="field">Ledger
            <select value={ledgerId} onChange={(event) => setLedgerId(event.target.value)}>
              <option value="">All ledgers</option>
              {ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
            </select>
          </label>
          <label className="field">Amount
            <input inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
        </div>
        <BusyButton busy={busy} type="submit">Save budget</BusyButton>
      </form>
      {loading || listLoading ? <><LoadingBar /><SkeletonRows /></> : null}
      <div className="table-wrap">
        <table className="data">
          <caption>Budgets for {month}</caption>
          <thead>
            <tr><th>Category</th><th>Budget</th><th>Spent</th><th>Remaining</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => {
              const ratio = row.amount ? Math.min(100, Math.round((row.spent / row.amount) * 100)) : 0;
              return (
                <tr key={row.id}>
                  <td data-label="Category">{row.category?.name}</td>
                  <td data-label="Budget">{money(row.amount)}</td>
                  <td data-label="Spent">
                    {money(row.spent)}
                    <span className="progress" aria-hidden="true"><span style={{ width: `${ratio}%` }} /></span>
                  </td>
                  <td data-label="Remaining">{money(row.amount - row.spent)}</td>
                  <td data-label="Actions"><button type="button" className="btn danger" onClick={() => setPending(row)}>Delete</button></td>
                </tr>
              );
            }) : <tr><td colSpan="5">No budgets for this month.</td></tr>}
          </tbody>
        </table>
      </div>
      <ConfirmModal open={Boolean(pending)} title="Delete budget" body={pending ? `Remove the ${pending.category?.name} budget for ${month}.` : ''} confirmLabel="Delete" danger busy={busy} onCancel={() => setPending(null)} onConfirm={remove} />
    </article>
  );
}

export function Recurring() {
  const { user } = useAuth();
  const catalog = useCatalog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    amount: '', description: '', type: 'expense', nextDate: todayInput(), frequency: 'monthly', ledgerId: '', accountId: '', categoryId: '', subcategoryId: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const money = (value) => formatMoney(value, user?.currency || 'INR');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/recurring');
      setRows(data.recurring);
      if (data.recorded) setSuccess(`Recorded ${data.recorded} due transaction${data.recorded === 1 ? '' : 's'}.`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!catalog.ledgers.length || form.ledgerId) return;
    const ledgerId = catalog.ledgers[0].id;
    const account = catalog.accounts.find((item) => item.ledgerId === ledgerId);
    setForm((current) => ({ ...current, ledgerId, accountId: account?.id || '' }));
  }, [catalog.ledgers, catalog.accounts, form.ledgerId]);

  const accounts = catalog.accounts.filter((account) => account.ledgerId === form.ledgerId);
  const parents = catalog.categories.filter((category) => category.type === form.type && !category.parentId);
  const subs = form.categoryId ? catalog.categories.filter((category) => category.parentId === form.categoryId) : [];

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/recurring', { ...form, amount: Number(form.amount) });
      setSuccess('Recurring transaction saved.');
      setForm((current) => ({ ...current, amount: '', description: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item) {
    try {
      await api.patch(`/api/recurring/${item.id}`, { active: !item.active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/recurring/${pending.id}`);
      setPending(null);
      setSuccess('Schedule deleted. Transactions already recorded stay in the ledger.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Recurring transactions</h1>
      <p>Schedules repeat weekly, every two weeks, monthly, or yearly. Due items are written into the ledger when you open this page.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <div className="form-grid">
          <label className="field">Amount
            <input inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
          </label>
          <label className="field">Description
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </label>
          <label className="field">Type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value, categoryId: '', subcategoryId: '' })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="field">Frequency
            <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label className="field">Next date
            <input type="date" value={form.nextDate} onChange={(event) => setForm({ ...form, nextDate: event.target.value })} required />
          </label>
          <label className="field">Ledger
            <select value={form.ledgerId} onChange={(event) => {
              const account = catalog.accounts.find((item) => item.ledgerId === event.target.value);
              setForm({ ...form, ledgerId: event.target.value, accountId: account?.id || '' });
            }} required>
              <option value="">Select a ledger</option>
              {catalog.ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
            </select>
          </label>
          <label className="field">Account
            <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} required>
              <option value="">Select an account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="field">Category
            <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value, subcategoryId: '' })} required>
              <option value="">Select a category</option>
              {parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="field">Subcategory
            <select value={form.subcategoryId} onChange={(event) => setForm({ ...form, subcategoryId: event.target.value })}>
              <option value="">None</option>
              {subs.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        </div>
        <BusyButton busy={busy} type="submit">Save schedule</BusyButton>
      </form>
      {loading ? <><LoadingBar /><SkeletonRows /></> : null}
      <div className="table-wrap">
        <table className="data">
          <caption>Recurring schedules</caption>
          <thead>
            <tr><th>Description</th><th>Type</th><th>Amount</th><th>Every</th><th>Next</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Description">{row.description}</td>
                <td data-label="Type">{row.type}</td>
                <td data-label="Amount">{money(row.amount)}</td>
                <td data-label="Every">{row.frequency}</td>
                <td data-label="Next">{row.nextDate}</td>
                <td data-label="Status">{row.active ? 'Active' : 'Paused'}</td>
                <td data-label="Actions" className="actions">
                  <button type="button" className="btn ghost" onClick={() => toggle(row)}>{row.active ? 'Pause' : 'Resume'}</button>
                  <button type="button" className="btn danger" onClick={() => setPending(row)}>Delete</button>
                </td>
              </tr>
            )) : <tr><td colSpan="7">No recurring transactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <ConfirmModal open={Boolean(pending)} title="Delete schedule" body={pending ? `Stop “${pending.description}” from repeating. Past entries stay in the ledger.` : ''} confirmLabel="Delete" danger busy={busy} onCancel={() => setPending(null)} onConfirm={remove} />
    </article>
  );
}

export function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', targetAmount: '', savedAmount: '', deadline: '', note: '' });
  const [contribution, setContribution] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const money = (value) => formatMoney(value, user?.currency || 'INR');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/goals');
      setGoals(data.goals);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/goals', {
        name: form.name,
        targetAmount: Number(form.targetAmount),
        savedAmount: form.savedAmount ? Number(form.savedAmount) : 0,
        deadline: form.deadline,
        note: form.note,
      });
      setSuccess('Goal saved.');
      setForm({ name: '', targetAmount: '', savedAmount: '', deadline: '', note: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function contribute(goal) {
    const amount = Number(contribution[goal.id]);
    if (!amount) {
      setError('Enter an amount to add toward the goal.');
      return;
    }
    setError('');
    try {
      await api.post(`/api/goals/${goal.id}/contribute`, { amount });
      setSuccess(`Added ${money(amount)} to ${goal.name}.`);
      setContribution((current) => ({ ...current, [goal.id]: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/goals/${pending.id}`);
      setPending(null);
      setSuccess('Goal deleted.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Financial goals</h1>
      <p>Name a savings target and record money as you set it aside. Progress is saved amount divided by the target.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <div className="form-grid">
          <label className="field">Goal
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="field">Target
            <input inputMode="decimal" min="0.01" step="0.01" value={form.targetAmount} onChange={(event) => setForm({ ...form, targetAmount: event.target.value })} required />
          </label>
          <label className="field">Already saved
            <input inputMode="decimal" min="0" step="0.01" value={form.savedAmount} onChange={(event) => setForm({ ...form, savedAmount: event.target.value })} />
          </label>
          <label className="field">Deadline
            <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
          </label>
          <label className="field">Note
            <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={240} />
          </label>
        </div>
        <BusyButton busy={busy} type="submit">Save goal</BusyButton>
      </form>
      {loading ? <><LoadingBar /><SkeletonRows /></> : null}
      <div className="grid">
        {goals.map((goal) => (
          <article className="card" key={goal.id}>
            <h2>{goal.name}</h2>
            <p>{money(goal.savedAmount)} of {money(goal.targetAmount)}</p>
            {goal.deadline ? <p className="fine">Deadline {goal.deadline}</p> : null}
            {goal.note ? <p>{goal.note}</p> : null}
            <span className="progress" aria-label={`${goal.progress}% saved`}><span style={{ width: `${Math.min(goal.progress, 100)}%` }} /></span>
            <div className="row">
              <input inputMode="decimal" aria-label={`Amount to add to ${goal.name}`} value={contribution[goal.id] || ''} onChange={(event) => setContribution((current) => ({ ...current, [goal.id]: event.target.value }))} />
              <button type="button" className="btn" onClick={() => contribute(goal)}>Add progress</button>
              <button type="button" className="btn danger" onClick={() => setPending(goal)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      {!loading && !goals.length ? <p className="empty">No goals yet.</p> : null}
      <ConfirmModal open={Boolean(pending)} title="Delete goal" body={pending ? `Remove “${pending.name}” and its saved progress.` : ''} confirmLabel="Delete" danger busy={busy} onCancel={() => setPending(null)} onConfirm={remove} />
    </article>
  );
}

export function Categories() {
  const catalog = useCatalog();
  const [form, setForm] = useState({ name: '', type: 'expense', parentId: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const parents = catalog.categories.filter((category) => !category.parentId && category.type === form.type);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/categories', form);
      setSuccess(form.parentId ? 'Subcategory added.' : 'Category added.');
      setForm((current) => ({ ...current, name: '' }));
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
      await api.del(`/api/categories/${pending.id}`);
      setPending(null);
      setSuccess('Category deleted.');
      await catalog.reload();
    } catch (err) {
      setError(err.message);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function column(type) {
    const tops = catalog.categories.filter((category) => category.type === type && !category.parentId);
    return (
      <section>
        <h2>{type === 'income' ? 'Income' : 'Expenses'}</h2>
        {tops.map((parent) => (
          <div key={parent.id} className="card">
            <div className="row spread">
              <strong>{parent.name}</strong>
              <button type="button" className="btn danger" onClick={() => setPending(parent)}>Delete</button>
            </div>
            <ul className="plain">
              {catalog.categories.filter((category) => category.parentId === parent.id).map((child) => (
                <li key={child.id} className="row spread">
                  <span>{child.name}</span>
                  <button type="button" className="btn ghost" onClick={() => setPending(child)}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    );
  }

  return (
    <article className="stack">
      <h1>Categories</h1>
      <p>Use a top-level category for charts and budgets. Add a subcategory when you want a finer split.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <div className="form-grid">
          <label className="field">Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="field">Type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value, parentId: '' })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="field">Parent
            <select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
              <option value="">Top-level category</option>
              {parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        </div>
        <BusyButton busy={busy} type="submit">{form.parentId ? 'Add subcategory' : 'Add category'}</BusyButton>
      </form>
      {catalog.loading ? <><LoadingBar /><SkeletonRows /></> : null}
      <div className="split">{column('expense')}{column('income')}</div>
      <ConfirmModal open={Boolean(pending)} title="Delete category" body={pending ? `Delete “${pending.name}”. This is blocked if transactions or budgets still use it.` : ''} confirmLabel="Delete" danger busy={busy} onCancel={() => setPending(null)} onConfirm={remove} />
    </article>
  );
}
