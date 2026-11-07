import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSeo } from '../lib/seo';
import { api } from '../lib/api';
import { Breadcrumbs, FormNote, LoadingBar, MailPreview, SearchForm, SkeletonRows } from './Ui';

const PUBLIC_LINKS = [
  ['/', 'Home'],
  ['/about', 'About'],
  ['/privacy', 'Privacy'],
  ['/security', 'Security'],
  ['/search', 'Search'],
];

const APP_LINKS = [
  ['/app', 'Dashboard'],
  ['/app/ledgers', 'Ledgers'],
  ['/app/transactions', 'Transactions'],
  ['/app/budgets', 'Budgets'],
  ['/app/recurring', 'Recurring'],
  ['/app/goals', 'Goals'],
  ['/app/net-worth', 'Net worth'],
  ['/app/reports', 'Reports'],
  ['/app/categories', 'Categories'],
  ['/app/profile', 'Profile'],
  ['/app/sessions', 'Sessions'],
];

function MenuButton({ open, onClick, controls }) {
  return (
    <button type="button" className="menu-toggle" aria-expanded={open} aria-controls={controls} onClick={onClick}>
      <span className="sr">{open ? 'Close menu' : 'Open menu'}</span>
      <span />
      <span />
      <span />
    </button>
  );
}

export function PublicLayout() {
  const location = useLocation();
  const meta = useSeo(location.pathname, location.search);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <div className="public-shell">
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <Link className="brand" to="/">DimeStack</Link>
        <MenuButton open={open} onClick={() => setOpen((value) => !value)} controls="public-nav" />
        <nav id="public-nav" className={open ? 'desk-nav open' : 'desk-nav'} aria-label="Primary">
          {PUBLIC_LINKS.map(([href, label]) => (
            <NavLink key={href} to={href} end={href === '/'}>{label}</NavLink>
          ))}
          {user ? <NavLink to="/app">Dashboard</NavLink> : <NavLink to="/login">Log in</NavLink>}
          {user ? null : <NavLink className="nav-strong" to="/register">Create account</NavLink>}
        </nav>
        <SearchForm />
      </header>
      <main id="content" className="page">
        <Breadcrumbs items={meta.crumb} />
        <Outlet />
      </main>
      <footer className="site-footer">
        <div>
          <strong>DimeStack</strong>
          <p>A personal finance tracker for ledgers, budgets, and net worth.</p>
        </div>
        <nav aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/security">Security</Link>
          <Link to="/search">Search</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </footer>
    </div>
  );
}

export function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="page narrow">
        <LoadingBar />
        <SkeletonRows count={6} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function AppLayout() {
  const location = useLocation();
  const meta = useSeo(location.pathname, location.search);
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setOpen(false), [location.pathname]);

  async function resend() {
    setError('');
    setNotice('');
    try {
      const data = await api.post('/api/auth/resend-verification');
      setNotice(data.message);
      setPreview(data.preview || '');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className={open ? 'app-shell menu-open' : 'app-shell'}>
      <a className="skip" href="#content">Skip to content</a>
      <aside className="app-side" id="app-nav">
        <Link className="brand" to="/">DimeStack</Link>
        <nav aria-label="Ledger">
          {APP_LINKS.map(([href, label]) => (
            <NavLink key={href} to={href} end={href === '/app'}>{label}</NavLink>
          ))}
        </nav>
        <button type="button" className="btn ghost" onClick={logout}>Log out</button>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <MenuButton open={open} onClick={() => setOpen((value) => !value)} controls="app-nav" />
          <SearchForm />
          <Link className="who" to="/app/profile">{user?.name}</Link>
        </header>
        <main id="content" className="page">
          <Breadcrumbs items={meta.crumb} />
          {user && !user.emailVerified ? (
            <div className="banner">
              <p>Verify your email before you add or edit financial records.</p>
              <button type="button" className="btn" onClick={resend}>Resend verification email</button>
              <FormNote error={error} success={notice} />
              <MailPreview text={preview} />
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
