import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useCatalog() {
  const [ledgers, setLedgers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, accountRes, categoryRes] = await Promise.all([
        api.get('/api/ledgers'),
        api.get('/api/accounts'),
        api.get('/api/categories'),
      ]);
      setLedgers(ledgerRes.ledgers);
      setAccounts(accountRes.accounts);
      setCategories(categoryRes.categories);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ledgers, accounts, categories, loading, error, reload };
}
