// api.js
// One fetch wrapper for the REST API: JSON in, JSON out, the session token
// attached, and a failed response turned into an Error that carries the
// server's message, status and code.

export async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code || null;
    err.data = data;
    throw err;
  }
  return data;
}

export function formatDuration(ms, t) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return t('time.hm', { h, m });
  if (m > 0) return t('time.ms', { m, s });
  return t('time.s', { s });
}

export function formatDate(ts, language, withTime = true) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}
