import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BusyButton, ConfirmModal, FormNote, LoadingBar, PasswordField, SkeletonRows } from '../components/Ui';

const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

export function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(null);
  const [password, setPassword] = useState({ currentPassword: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({ name: user.name, phone: user.phone || '', currency: user.currency, timezone: user.timezone, bio: user.bio || '' });
  }, [user]);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.patch('/api/auth/profile', form);
      setUser(data.user);
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPassError('');
    setPassSuccess('');
    if (password.password !== password.confirm) {
      setPassError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post('/api/auth/change-password', {
        currentPassword: password.currentPassword,
        password: password.password,
      });
      setPassSuccess(data.message);
      setPassword({ currentPassword: '', password: '', confirm: '' });
      setUser({ ...user, hasPassword: true });
    } catch (err) {
      setPassError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!form) return <SkeletonRows />;

  return (
    <article className="stack">
      <h1>Profile</h1>
      <p>Update the name on your reports and the currency used across DimeStack.</p>
      <form className={error ? 'card stack has-error' : success ? 'card stack has-success' : 'card stack'} onSubmit={saveProfile}>
        <h2>Details</h2>
        <FormNote error={error} success={success} />
        <label className="field">Name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label className="field">Phone
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" />
        </label>
        <label className="field">Currency
          <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
            {['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        <label className="field">Time zone
          <select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
            {ZONES.map((zone) => <option key={zone}>{zone}</option>)}
          </select>
        </label>
        <label className="field">Bio
          <textarea value={form.bio} maxLength={400} rows={4} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        </label>
        <BusyButton busy={busy} type="submit">Save profile</BusyButton>
      </form>
      <form className={passError ? 'card stack has-error' : passSuccess ? 'card stack has-success' : 'card stack'} onSubmit={savePassword}>
        <h2>{user.hasPassword ? 'Change password' : 'Set a password'}</h2>
        <p className="fine">{user.hasPassword ? 'Other devices will be signed out.' : 'Use this if you also want to sign in with email.'}</p>
        <FormNote error={passError} success={passSuccess} />
        {user.hasPassword ? (
          <PasswordField label="Current password" name="current-password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} autoComplete="current-password" minLength={1} />
        ) : null}
        <PasswordField label="New password" name="new-password" value={password.password} onChange={(event) => setPassword({ ...password, password: event.target.value })} autoComplete="new-password" />
        <PasswordField label="Confirm password" name="confirm-password" value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} autoComplete="new-password" />
        <BusyButton busy={busy} type="submit">Update password</BusyButton>
      </form>
    </article>
  );
}

export function Sessions() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/auth/sessions');
      setSessions(data.sessions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function removeOne() {
    setBusy(true);
    try {
      const data = await api.del(`/api/auth/sessions/${pending.id}`);
      if (data.current) {
        setUser(null);
        navigate('/login');
        return;
      }
      setPending(null);
      setSuccess('Session closed.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll() {
    setBusy(true);
    try {
      await api.post('/api/auth/logout-all');
      setUser(null);
      navigate('/login');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <article className="stack">
      <h1>Active sessions</h1>
      <p>These devices still have a valid refresh session. Close one, or log out of all of them.</p>
      <FormNote error={error} success={success} />
      <button type="button" className="btn danger" onClick={() => setAll(true)}>Log out of all devices</button>
      {loading ? <><LoadingBar /><SkeletonRows /></> : null}
      <div className="table-wrap">
        <table className="data">
          <caption>Signed-in sessions</caption>
          <thead>
            <tr><th>Device</th><th>IP</th><th>Last active</th><th></th></tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td data-label="Device">{session.userAgent}{session.current ? ' · This device' : ''}</td>
                <td data-label="IP">{session.ip}</td>
                <td data-label="Last active">{new Date(session.lastActiveAt).toLocaleString()}</td>
                <td data-label="Actions"><button type="button" className="btn ghost" onClick={() => setPending(session)}>Log out</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmModal open={Boolean(pending)} title="Log out this session" body="That device will need to sign in again." confirmLabel="Log out" danger busy={busy} onCancel={() => setPending(null)} onConfirm={removeOne} />
      <ConfirmModal open={all} title="Log out of all devices" body="Every session, including this browser, will be closed." confirmLabel="Log out everywhere" danger busy={busy} onCancel={() => setAll(false)} onConfirm={logoutAll} />
    </article>
  );
}
