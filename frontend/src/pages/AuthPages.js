import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, readUtm } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BusyButton, FormNote, MailPreview, PasswordField } from '../components/Ui';

const GOOGLE_ERRORS = {
  google_config: 'Google sign-in needs a client id and secret in the server environment.',
  google_state: 'Google sign-in could not be confirmed. Start it again from this page.',
  google: 'Google sign-in failed. Try again.',
  google_email: 'Google did not return a verified email address.',
};

export function Login() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('error');
    if (code && GOOGLE_ERRORS[code]) setError(GOOGLE_ERRORS[code]);
  }, [location.search]);
  if (user) return <Navigate to={location.state?.from || '/app'} replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/api/auth/login', { email, password });
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card">
      <h1>Log in</h1>
      <p>Use your email and password, or continue with Google.</p>
      <form className={error ? 'stack has-error' : 'stack'} onSubmit={onSubmit}>
        <FormNote error={error} />
        <label className="field">Email
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <PasswordField label="Password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={1} />
        <BusyButton busy={busy} type="submit">Log in</BusyButton>
      </form>
      <a className="btn ghost full" href="/api/auth/google">Continue with Google</a>
      <p className="fine"><Link to="/forgot-password">Forgot password</Link> · <Link to="/register">Create an account</Link></p>
    </article>
  );
}

export function Register() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (user && !success) return <Navigate to="/app" replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post('/api/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        utm: readUtm(),
      });
      setUser(data.user);
      setSuccess(data.message);
      setPreview(data.preview || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card">
      <h1>Create your account</h1>
      <p>A personal ledger, cash and bank accounts, and starter categories are added for you.</p>
      <form className={error ? 'stack has-error' : success ? 'stack has-success' : 'stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <MailPreview text={preview} />
        <label className="field">Name
          <input value={form.name} onChange={update('name')} autoComplete="name" required minLength={2} />
        </label>
        <label className="field">Email
          <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
        </label>
        <PasswordField label="Password" name="new-password" value={form.password} onChange={update('password')} autoComplete="new-password" />
        <PasswordField label="Confirm password" name="confirm-password" value={form.confirm} onChange={update('confirm')} autoComplete="new-password" />
        <BusyButton busy={busy} type="submit">Create account</BusyButton>
      </form>
      {success ? <Link className="btn" to="/app">Go to the dashboard</Link> : null}
      <a className="btn ghost full" href="/api/auth/google">Continue with Google</a>
      <p className="fine">Already registered? <Link to="/login">Log in</Link></p>
    </article>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.post('/api/auth/forgot', { email });
      setSuccess(data.message);
      setPreview(data.preview || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card">
      <h1>Forgot your password</h1>
      <p>If the email matches an account, we send a 6-digit code and a secure link.</p>
      <form className={error ? 'stack has-error' : success ? 'stack has-success' : 'stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        <MailPreview text={preview} />
        <label className="field">Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <BusyButton busy={busy} type="submit">Send reset message</BusyButton>
      </form>
      <p className="fine"><Link to="/reset-password">I already have a code</Link> · <Link to="/login">Back to log in</Link></p>
    </article>
  );
}

export function Reset() {
  const location = useLocation();
  const { setUser } = useAuth();
  const token = new URLSearchParams(location.search).get('token') || '';
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post('/api/auth/reset', { token, email, otp, password });
      setUser(data.user);
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card">
      <h1>Choose a new password</h1>
      <p>{token ? 'This page has a reset token from your link. Choose a new password.' : 'Enter the email on the account and the 6-digit code.'}</p>
      <form className={error ? 'stack has-error' : success ? 'stack has-success' : 'stack'} onSubmit={onSubmit}>
        <FormNote error={error} success={success} />
        {token ? null : (
          <>
            <label className="field">Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label className="field">Reset code
              <input inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={(event) => setOtp(event.target.value)} required />
            </label>
          </>
        )}
        <PasswordField label="New password" name="new-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        <PasswordField label="Confirm password" name="confirm-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        <BusyButton busy={busy} type="submit">Update password</BusyButton>
      </form>
      {success ? <Link className="btn" to="/app">Continue to the dashboard</Link> : null}
    </article>
  );
}

export function Verify() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      setError('This verification link is missing a token.');
      return undefined;
    }
    let cancel = false;
    api.post('/api/auth/verify-email', { token })
      .then(async () => {
        if (cancel) return;
        setSuccess('Your email is verified. You can record transactions.');
        try {
          await refresh();
        } catch (err) {
          navigate('/login');
        }
      })
      .catch((err) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [location.search, navigate, refresh]);

  return (
    <article className="auth-card">
      <h1>Verify your email</h1>
      {!error && !success ? <p>Checking the verification link…</p> : null}
      <form className={error ? 'stack has-error' : success ? 'stack has-success' : 'stack'}>
        <FormNote error={error} success={success} />
      </form>
      {success ? <Link className="btn" to="/app">Go to the dashboard</Link> : <Link to="/login">Back to log in</Link>}
    </article>
  );
}
