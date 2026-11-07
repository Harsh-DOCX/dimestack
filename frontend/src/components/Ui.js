import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { daysAgo, startOfMonth, startOfYear, todayInput } from '../lib/format';

export function Breadcrumbs({ items }) {
  if (!items?.length || items.length < 2) return null;
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1 || !item.href;
          return (
            <li key={`${item.label}-${index}`}>
              {last ? <span aria-current="page">{item.label}</span> : <Link to={item.href}>{item.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function FormNote({ error, success }) {
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (success) return <p className="form-success" role="status">{success}</p>;
  return null;
}

export function MailPreview({ text }) {
  if (!text) return null;
  return (
    <pre className="mail-preview" tabIndex={0}>
      {text}
    </pre>
  );
}

export function PasswordField({ label, name, value, onChange, autoComplete, minLength = 10 }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="pw">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          required
        />
        <button type="button" className="pw-toggle" aria-pressed={visible} onClick={() => setVisible((show) => !show)}>
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}

export function ConfirmModal({ open, title, body, confirmLabel, danger, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="row">
          <button type="button" className="btn ghost" onClick={onCancel} ref={cancelRef}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn danger' : 'btn'} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spin" aria-hidden="true" /> : null}
            {busy ? 'Working' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SkeletonRows({ count = 4 }) {
  return (
    <div className="sk-stack" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton sk-row" key={index} />
      ))}
    </div>
  );
}

export function LoadingBar() {
  return <div className="loading-bar" role="progressbar" aria-label="Loading" />;
}

export function DateRange({ from, to, onChange }) {
  return (
    <fieldset className="date-range">
      <legend>Date range</legend>
      <label>
        From
        <input type="date" value={from} max={to || undefined} onChange={(event) => onChange({ from: event.target.value, to })} required />
      </label>
      <label>
        To
        <input type="date" value={to} min={from || undefined} onChange={(event) => onChange({ from, to: event.target.value })} required />
      </label>
      <div className="presets">
        <button type="button" onClick={() => onChange({ from: startOfMonth(), to: todayInput() })}>This month</button>
        <button type="button" onClick={() => onChange({ from: daysAgo(30), to: todayInput() })}>Last 30 days</button>
        <button type="button" onClick={() => onChange({ from: daysAgo(182), to: todayInput() })}>Last 6 months</button>
        <button type="button" onClick={() => onChange({ from: startOfYear(), to: todayInput() })}>This year</button>
      </div>
    </fieldset>
  );
}

export function SearchForm() {
  const id = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get('q') || '';
  const [query, setQuery] = useState(initial);
  useEffect(() => setQuery(initial), [initial]);
  return (
    <form
      className="site-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const term = query.trim();
        navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
      }}
    >
      <label className="sr" htmlFor={id}>Search DimeStack</label>
      <input id={id} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and transactions" />
      <button className="btn" type="submit">Search</button>
    </form>
  );
}

export function CookieBanner() {
  const [choice, setChoice] = useState(() => localStorage.getItem('ds_consent') || '');
  if (choice) return null;
  function save(value) {
    localStorage.setItem('ds_consent', value);
    document.cookie = `ds_consent=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
    setChoice(value);
  }
  return (
    <div className="cookie" role="dialog" aria-label="Cookie notice">
      <p>
        DimeStack stores a preference cookie for this choice. After you sign in, a secure session cookie keeps you logged in.
        Campaign parameters on a link are saved with a new account. Read the <Link to="/privacy">privacy policy</Link>.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => save('accepted')}>Accept</button>
        <button type="button" className="btn ghost" onClick={() => save('declined')}>Decline</button>
      </div>
    </div>
  );
}

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      Back to top
    </button>
  );
}

export function UtmCapture() {
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const found = {};
    keys.forEach((key) => {
      const value = params.get(key);
      if (value) found[key.replace('utm_', '')] = value.slice(0, 120);
    });
    if (!Object.keys(found).length) return;
    const current = {
      source: '',
      medium: '',
      campaign: '',
      term: '',
      content: '',
      landingPath: location.pathname,
      ...found,
    };
    sessionStorage.setItem('ds_utm', JSON.stringify(current));
  }, [location.pathname, location.search]);
  return null;
}

export function BusyButton({ busy, children, className = 'btn', ...props }) {
  return (
    <button className={className} disabled={busy || props.disabled} {...props}>
      {busy ? <span className="spin" aria-hidden="true" /> : null}
      {busy ? 'Working' : children}
    </button>
  );
}
