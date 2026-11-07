import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatMoney, startOfMonth, todayInput } from '../lib/format';
import { useCatalog } from '../lib/useCatalog';
import { useAuth } from '../context/AuthContext';
import { DateRange, LoadingBar, SkeletonRows } from '../components/Ui';
import { SplitPie, TrendChart } from '../components/Charts';

export function Dashboard() {
  const { user } = useAuth();
  const { ledgers, loading: catalogLoading } = useCatalog();
  const [range, setRange] = useState({ from: startOfMonth(), to: todayInput() });
  const [ledgerId, setLedgerId] = useState('');
  const [report, setReport] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const money = (value) => formatMoney(value, user?.currency || 'INR');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (ledgerId) params.set('ledgerId', ledgerId);
    Promise.all([
      api.get(`/api/reports/overview?${params.toString()}`),
      api.get(`/api/transactions?from=${range.from}&to=${range.to}&page=1${ledgerId ? `&ledgerId=${ledgerId}` : ''}`),
    ])
      .then(([overview, list]) => {
        if (cancel) return;
        setReport(overview);
        setRecent(list.items.slice(0, 6));
        setError('');
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
  }, [range, ledgerId]);

  return (
    <article className="stack">
      <h1>Dashboard</h1>
      <p>Income, expenses, and the running balance for the dates and ledger you pick.</p>
      <div className="filters">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <label className="field">Ledger
          <select value={ledgerId} onChange={(event) => setLedgerId(event.target.value)}>
            <option value="">All ledgers</option>
            {ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
          </select>
        </label>
      </div>
      {loading || catalogLoading ? <><LoadingBar /><SkeletonRows count={5} /></> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {report && !loading ? (
        <>
          <section className="stats">
            <article><h2>Income</h2><p>{money(report.income)}</p></article>
            <article><h2>Expenses</h2><p>{money(report.expense)}</p></article>
            <article><h2>Net</h2><p>{money(report.net)}</p></article>
            <article><h2>Savings rate</h2><p>{report.savingsRate}%</p></article>
          </section>
          <section className="split">
            <div>
              <h2>Balance over time</h2>
              <TrendChart points={report.balanceSeries} currencyLabel={user?.currency || 'INR'} />
            </div>
            <div>
              <h2>Expense distribution</h2>
              <SplitPie slices={report.distribution} currencyLabel={user?.currency || 'INR'} />
            </div>
          </section>
          <section>
            <h2>Income and expense split</h2>
            <SplitPie slices={report.typeSplit} currencyLabel={user?.currency || 'INR'} />
          </section>
          <section>
            <h2>Latest transactions</h2>
            {recent.length ? (
              <ul className="results">
                {recent.map((item) => (
                  <li key={item.id}>
                    <Link to="/app/transactions">{item.description}</Link>
                    <span>{item.date} · {item.type} · {money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="empty">No transactions in this date range. <Link to="/app/transactions">Add one</Link>.</p>}
          </section>
        </>
      ) : null}
    </article>
  );
}
