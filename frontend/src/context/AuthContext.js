import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.get('/api/auth/me');
    setUser(data.user);
    setSessionId(data.sessionId || '');
    return data.user;
  }, []);

  useEffect(() => {
    let cancel = false;
    refresh()
      .catch(() => {
        if (!cancel) {
          setUser(null);
          setSessionId('');
        }
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      sessionId,
      ready,
      setUser,
      refresh,
      logout: async () => {
        await api.post('/api/auth/logout');
        setUser(null);
        setSessionId('');
      },
    }),
    [user, sessionId, ready, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
