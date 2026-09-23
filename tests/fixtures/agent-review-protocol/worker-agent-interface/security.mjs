// Staged protocol primitives. No credentials are created, logged or persisted.
import '../worker-portal/identity.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UID = /^[A-Za-z0-9_.:-]{1,128}$/;
const encoder = new TextEncoder();
export class InterfaceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new InterfaceError(status, code, message); }
export function invalid(message) { fail(422, 'invalid_request', message); }
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object.');
  if (allowed && Object.keys(value).some(key => !allowed.includes(key))) invalid('Unsupported field.');
  return value;
}
export function text(value, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid('A required text value is invalid.');
  return value;
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  invalid('Use JSON values only.');
}
export async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical(value)))), b => b.toString(16).padStart(2, '0')).join('');
}
function b64(bytes) { let out = ''; for (const byte of bytes) out += String.fromCharCode(byte); return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0));
}
function identity(label) { return label.trim().replace(/\s+/g, ' ').toLowerCase(); }

export function configuration(env) {
  try {
    if (env.AGENT_INTERFACE_ENABLED !== 'true' || env.FIREBASE_PROJECT_ID !== 'ion-mining') throw Error();
    const profile = env.AGENT_INTERFACE_PROFILE === undefined ? 'full' : env.AGENT_INTERFACE_PROFILE;
    if (!['full','lead_only'].includes(profile)) throw Error();
    const pathPrefix = env.AGENT_INTERFACE_PATH_PREFIX === undefined ? '' : env.AGENT_INTERFACE_PATH_PREFIX;
    if (typeof pathPrefix !== 'string' || pathPrefix.length > 256 || pathPrefix !== pathPrefix.trim() || (pathPrefix !== '' &&
        (!/^(?:\/[A-Za-z0-9._~-]+)+$/.test(pathPrefix) || pathPrefix.split('/').some(part => part === '.' || part === '..')))) throw Error();
    const principals = JSON.parse(env.AGENT_PRINCIPALS || 'null');
    const keys = JSON.parse(env.AGENT_SIGNING_KEYS || 'null');
    if (!Array.isArray(principals) || principals.length < (profile === 'lead_only' ? 1 : 2) || principals.length > 20 || !Array.isArray(keys) || !keys.length || keys.length > 4) throw Error();
    const seen = new Set(), labels = new Set();
    for (const p of principals) {
      if (!p || typeof p !== 'object' || Object.keys(p).some(k => !['uid', 'ownerUid', 'role', 'label'].includes(k)) ||
          typeof p.uid !== 'string' || typeof p.ownerUid !== 'string' || !UID.test(p.uid) || !UID.test(p.ownerUid) || ['.', '..'].includes(p.uid) || ['.', '..'].includes(p.ownerUid) ||
          typeof p.label !== 'string' || !p.label.trim() || p.label.length > 180 || seen.has(p.uid) || labels.has(identity(p.label)) ||
          !['revenue', 'quality'].includes(p.role) || (p.role === 'revenue' ? p.uid !== p.ownerUid : p.uid === p.ownerUid)) throw Error();
      seen.add(p.uid); labels.add(identity(p.label));
    }
    if (principals.some(p => !principals.some(r => r.role === 'revenue' && r.uid === p.ownerUid))) throw Error();
    if (profile === 'lead_only' && (principals.length !== 1 || principals[0].role !== 'revenue')) throw Error();
    const keyIds = new Set();
    for (const key of keys) {
      if (!key || typeof key.kid !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(key.kid) || keyIds.has(key.kid) || typeof key.secret !== 'string' || key.secret.length < 43 || key.secret.length > 200 || unb64(key.secret).length < 32) throw Error();
      keyIds.add(key.kid);
    }
    if (!keyIds.has(env.AGENT_ACTIVE_KEY_ID) || typeof env.AGENT_POLICY_ID !== 'string' || !env.AGENT_POLICY_ID.trim() || env.AGENT_POLICY_ID.length > 200) throw Error();
    const origins = String(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    for (const origin of origins) { const u = new URL(origin); if (u.origin !== origin || u.protocol !== 'https:' || u.username || u.password) throw Error(); }
    return { profile, pathPrefix, principals, keys, activeKey: env.AGENT_ACTIVE_KEY_ID, policyId: env.AGENT_POLICY_ID, origins };
  } catch { fail(503, 'disabled', 'The agent interface is staged and unavailable.'); }
}

export async function authenticate(request, cfg, now, fetchImpl) {
  try {
    const token = (request.headers.get('Authorization') || '').match(/^Bearer (\S+)$/)?.[1];
    if (!token || token.length > 12000) throw Error();
    const parts = token.split('.'); if (parts.length !== 3) throw Error();
    const header = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(now / 1000) ||
        !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > Math.floor(now / 1000) + 300 ||
        typeof claims.sub !== 'string' || !UID.test(claims.sub)) throw Error();
    const verified = await globalThis.PortalIdentity.verifyIdToken(token, 'ion-mining', now, fetchImpl);
    const principal = cfg.principals.find(p => p.uid === verified.sub);
    if (!principal) throw Error();
    return { ...principal, token };
  } catch { fail(401, 'unauthorized', 'An approved Firebase identity is required.'); }
}

export async function sign(cfg, kind, data) {
  const key = cfg.keys.find(k => k.kid === cfg.activeKey);
  const part = b64(encoder.encode(canonical({ kid: key.kid, kind, data })));
  const imported = await crypto.subtle.importKey('raw', unb64(key.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return part + '.' + b64(new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(part))));
}
export async function verify(cfg, kind, token) {
  try {
    if (typeof token !== 'string' || token.length > 1500000) throw Error();
    const parts = token.split('.'); if (parts.length !== 2) throw Error();
    const parsed = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    if (parsed.kind !== kind) throw Error();
    const key = cfg.keys.find(k => k.kid === parsed.kid); if (!key) throw Error();
    const imported = await crypto.subtle.importKey('raw', unb64(key.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('HMAC', imported, unb64(parts[1]), encoder.encode(parts[0]))) throw Error();
    return parsed.data;
  } catch { fail(422, 'invalid_proof', 'The signed artifact cannot be verified.'); }
}

export async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'content_type', 'Use application/json.');
  const max = 1600000, reader = request.body?.getReader(); if (!reader) invalid('A request body is required.');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); fail(413, 'too_large', 'Request is too large.'); } chunks.push(value); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))); } catch (error) { if (error instanceof InterfaceError) throw error; fail(400, 'invalid_json', 'Request must be valid JSON.'); }
}
