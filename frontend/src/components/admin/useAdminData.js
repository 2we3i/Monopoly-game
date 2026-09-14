// useAdminData.js
// Loads one admin API resource and, optionally, keeps it fresh.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function useAdminData(path, token, refreshMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const next = await apiFetch(path, { token });
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [path, token]);

  useEffect(() => {
    load();
    if (!refreshMs) return undefined;
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return {
    data, error, loading, reload: load, updatedAt,
  };
}

export function adminAction(path, token, body = {}, method = 'POST') {
  return apiFetch(path, { method, token, body });
}
