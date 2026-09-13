// sessionToken.js
// Minimal stateless auth tokens: sign(accountId) -> opaque token string,
// verify(token) -> accountId or null. HMAC-signed payload.

const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

function sign(accountId) {
  const payload = { accountId, issuedAt: Date.now() };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest();
  const signatureB64 = base64url(signature);
  return `${payloadB64}.${signatureB64}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, signatureB64] = token.split('.');
  if (!payloadB64 || !signatureB64) return null;

  const expectedSignature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest();
  let actualSignature;
  try {
    actualSignature = base64urlDecode(signatureB64);
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length) return null;
  if (!crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.accountId || !payload.issuedAt) return null;
  if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return null;

  return payload.accountId;
}

module.exports = { sign, verify };
