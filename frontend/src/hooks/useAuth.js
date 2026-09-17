// useAuth.js
// Manages the player's account session: register/login/logout, profile
// updates, persisting the session token across page reloads, and reacting
// when the server says the account has been blocked.
//
// `isAdmin` only decides what the client SHOWS. Every admin request is
// checked again on the server, so a tampered client gains nothing.

import { useCallback, useEffect, useState } from 'react';

const TOKEN_KEY = 'landmark_auth_token';
const ACCOUNT_KEY = 'landmark_auth_account';

function loadStoredSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const accountJson = localStorage.getItem(ACCOUNT_KEY);
    if (!token || !accountJson) return { token: null, account: null };
    return { token, account: JSON.parse(accountJson) };
  } catch {
    return { token: null, account: null };
  }
}

function storeSession(token, account) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

async function apiRequest(path, { method = 'GET', body, token, isFormData = false } = {}) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/auth${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code || null;
    err.reason = data.reason || null;
    throw err;
  }
  return data;
}

export function useAuth() {
  const [{ token, account }, setSession] = useState(loadStoredSession);
  const [checking, setChecking] = useState(!!loadStoredSession().token);
  // { reason } once the server has told us this account is blocked.
  const [blocked, setBlocked] = useState(null);

  const endSession = useCallback(() => {
    clearStoredSession();
    setSession({ token: null, account: null });
  }, []);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    apiRequest('/me', { token })
      .then((data) => {
        setSession({ token, account: data.account });
        storeSession(token, data.account);
      })
      .catch((err) => {
        if (err.code === 'BLOCKED') setBlocked({ reason: err.reason });
        endSession();
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A socket can learn about a block at any moment mid-session.
  useEffect(() => {
    const onBlocked = (e) => {
      setBlocked({ reason: e.detail?.reason || null });
      endSession();
    };
    window.addEventListener('landmark:blocked', onBlocked);
    return () => window.removeEventListener('landmark:blocked', onBlocked);
  }, [endSession]);

  const register = useCallback(async (nickname, password) => {
    const data = await apiRequest('/register', { method: 'POST', body: { nickname, password } });
    setBlocked(null);
    setSession({ token: data.token, account: data.account });
    storeSession(data.token, data.account);
    return data.account;
  }, []);

  const login = useCallback(async (nickname, password) => {
    try {
      const data = await apiRequest('/login', { method: 'POST', body: { nickname, password } });
      setBlocked(null);
      setSession({ token: data.token, account: data.account });
      storeSession(data.token, data.account);
      return data.account;
    } catch (err) {
      if (err.code === 'BLOCKED') setBlocked({ reason: err.reason });
      throw err;
    }
  }, []);

  const logout = endSession;

  const updateNickname = useCallback(async (newNickname) => {
    const data = await apiRequest('/me/nickname', { method: 'PUT', body: { nickname: newNickname }, token });
    setSession((s) => ({ ...s, account: data.account }));
    storeSession(token, data.account);
    return data.account;
  }, [token]);

  const updatePassword = useCallback(async (currentPassword, newPassword) => {
    await apiRequest('/me/password', { method: 'PUT', body: { currentPassword, newPassword }, token });
  }, [token]);

  const uploadAvatar = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const data = await apiRequest('/me/avatar', { method: 'POST', body: formData, token, isFormData: true });
    setSession((s) => ({ ...s, account: data.account }));
    storeSession(token, data.account);
    return data.account;
  }, [token]);

  return {
    account,
    token,
    isLoggedIn: !!account,
    // The Creator is an administrator too; the panel shows each role what
    // the server allows it (GET /api/admin/me returns the permissions).
    isAdmin: account?.role === 'admin' || account?.role === 'creator',
    isCreator: account?.role === 'creator',
    checking,
    blocked,
    clearBlocked: () => setBlocked(null),
    register,
    login,
    logout,
    updateNickname,
    updatePassword,
    uploadAvatar,
  };
}
