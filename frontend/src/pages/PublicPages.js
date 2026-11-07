import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { pageCatalog } from '../lib/seo';
import { useAuth } from '../context/AuthContext';

export function Home() {
  return (
    <article className="stack">
      <h1>Track every dollar in one quiet place</h1>
      <p className="lede">
        DimeStack keeps income, expenses, transfers, budgets, and goals in ledgers you can filter, chart, and export.
      </p>
      <div className="row">
        <Link className="btn" to="/register">Create an account</Link>
        <Link className="btn ghost" to="/about">About DimeStack</Link>
      </div>
      <section className="grid features">
        <Link className="card" to="/register">
          <h2>Multiple ledgers</h2>
          <p>Separate household spending from freelance income without mixing the totals.</p>
        </Link>
        <Link className="card" to="/security">
          <h2>Signed-in records</h2>
          <p>Email verification, hashed passwords, and sessions you can close from any device.</p>
        </Link>
        <Link className="card" to="/search">
          <h2>Search</h2>
          <p>Find a page on the site or, after you sign in, a transaction by its description.</p>
        </Link>
      </section>
      <section>
        <h2>What you can record</h2>
        <ul className="plain">
          <li>Amount, description, and whether it is income or an expense</li>
          <li>Categories, subcategories, monthly budgets, and recurring schedules</li>
          <li>Transfers between asset and liability accounts</li>
          <li>Savings goals and net worth over time</li>
          <li>A CSV of your transactions and a PDF summary</li>
        </ul>
      </section>
      <p><Link to="/privacy">Privacy policy</Link> · <Link to="/security">Security</Link></p>
    </article>
  );
}

export function About() {
  return (
    <article className="stack narrow-copy">
      <h1>About DimeStack</h1>
      <p>
        DimeStack is a finance tracker for households and freelancers who want a ledger they can scan in a minute.
        The product stays black, white, and aqua on purpose: the numbers should be the loudest thing on the page.
      </p>
      <p>
        You can keep more than one ledger, split categories into subcategories, budget a month, schedule repeating transactions,
        move money between accounts, and watch assets minus liabilities.
      </p>
      <p><Link to="/register">Create an account</Link> or read how we <Link to="/security">protect sign-in</Link>.</p>
    </article>
  );
}

export function Privacy() {
  return (
    <article className="stack narrow-copy">
      <h1>Privacy policy</h1>
      <p>This policy covers the DimeStack site and the ledgers stored for your account.</p>
      <h2>Account and finance records</h2>
      <p>
        When you register we store your name, email, password hash, and any campaign parameters attached to that visit.
        Ledgers, accounts, transactions, budgets, goals, and transfers are stored so you can open them the next time you sign in.
      </p>
      <h2>Cookies</h2>
      <p>
        The banner stores a preference cookie named ds_consent. After sign-in, ds_access and ds_refresh are HTTP-only session cookies.
        A readable ds_csrf cookie pairs with a request header so another site cannot submit forms as you.
      </p>
      <h2>Sessions and email</h2>
      <p>
        Each sign-in stores a hashed refresh token, the IP address, and the browser user agent so you can review active sessions.
        Verification and password-reset messages go to your email address. If email delivery is not configured on the server, the message is shown in the app instead of being sent.
      </p>
      <h2>Backups</h2>
      <p>The server writes automatic JSON backups of the database onto its own disk and keeps the latest fourteen copies.</p>
      <p>Related: <Link to="/security">Security</Link>.</p>
    </article>
  );
}

export function Security() {
  return (
    <article className="stack narrow-copy">
      <h1>How DimeStack protects your account</h1>
      <ul className="plain">
        <li>Passwords are hashed with bcrypt and are never stored in plain text.</li>
        <li>New accounts verify email before they can add or edit financial records.</li>
        <li>Forgot-password sends a 15-minute code and a secure link. You can also change a password from your profile.</li>
        <li>Google sign-in uses the authorization-code flow and checks a state cookie before linking the account.</li>
        <li>Session cookies are HTTP-only with SameSite=Lax, and are marked Secure when the server is configured for HTTPS.</li>
        <li>Sign-in, registration, and password reset are rate limited.</li>
        <li>Requests are validated with Zod, and keys that look like database operators are stripped.</li>
        <li>Every ledger query is limited to the signed-in user. You can end one session or log out of every device.</li>
      </ul>
      <p><Link to="/register">Create an account</Link> · <Link to="/privacy">Privacy policy</Link></p>
    </article>
  );
}

export function SearchPage() {
  const location = useLocation();
  const { user } = useAuth();
  const query = (new URLSearchParams(location.search).get('q') || '').trim();
  const [remote, setRemote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pages = pageCatalog().filter((page) => {
    if (!query) return true;
    const haystack = `${page.title} ${page.description} ${page.keywords} ${page.h1}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  useEffect(() => {
    if (!user || query.length < 2) {
      setRemote(null);
      return undefined;
    }
    let cancel = false;
    setLoading(true);
    api.get(`/api/search?q=${encodeURIComponent(query)}`)
      .then((data) => {
        if (!cancel) setRemote(data);
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
  }, [query, user]);

  return (
    <article className="stack">
      <h1>Search</h1>
      <p>{query ? `Results for “${query}”.` : 'Type a word in the search box to look through DimeStack.'}</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <h2>Pages</h2>
      {pages.length ? (
        <ul className="results">
          {pages.map((page) => (
            <li key={page.path}><Link to={page.path}>{page.h1}</Link><span>{page.description}</span></li>
          ))}
        </ul>
      ) : <p className="empty">No pages matched that search.</p>}
      {user ? (
        <>
          <h2>Your records</h2>
          {loading ? <p>Looking through your records…</p> : null}
          {remote?.transactions?.length ? (
            <ul className="results">
              {remote.transactions.map((item) => (
                <li key={item.id}><Link to="/app/transactions">{item.description}</Link><span>{item.date} · {item.type} · {item.amount}</span></li>
              ))}
            </ul>
          ) : null}
          {remote?.ledgers?.map((ledger) => <p key={ledger.id}><Link to="/app/ledgers">{ledger.name}</Link></p>)}
          {remote?.goals?.map((goal) => <p key={goal.id}><Link to="/app/goals">{goal.name}</Link></p>)}
          {remote && !remote.transactions.length && !remote.ledgers.length && !remote.goals.length && query.length >= 2 ? (
            <p className="empty">No transactions, ledgers, or goals matched.</p>
          ) : null}
        </>
      ) : <p><Link to="/login">Log in</Link> to search your transactions too.</p>}
    </article>
  );
}

export function NotFound() {
  return (
    <article className="stack narrow-copy">
      <h1>This page is not on DimeStack</h1>
      <p>That address does not match a page. Try the search, or return to a page that does.</p>
      <div className="row">
        <Link className="btn" to="/">Home</Link>
        <Link className="btn ghost" to="/search">Search</Link>
        <Link className="btn ghost" to="/about">About</Link>
      </div>
    </article>
  );
}
