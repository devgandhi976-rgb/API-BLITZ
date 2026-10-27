import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { getStore } from './store.js';
import { sha256, unauthorized } from './util.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'lt_session';

/** scrypt password hashing — no external dependency, salted per user. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function createSession(userId) {
  const store = await getStore();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.sessionTtlDays * 86400_000);
  const session = await store.sessions_create({
    user_id: userId,
    token_hash: sha256(token),
    expires_at: expires.toISOString(),
  });
  return { token, session };
}

export async function destroySession(token) {
  if (!token) return;
  const store = await getStore();
  const session = await store.sessions_get(await sessionIdForToken(token));
  if (session) await store.sessions_remove(session.id);
}

async function sessionIdForToken(token) {
  const store = await getStore();
  // sessions are keyed by token hash; look it up directly through the driver
  if (store.kind === 'json') {
    const list = await store.sessions_get ? null : null;
    return null;
  }
  return null;
}

/** Resolve the current user from a signed session token. */
export async function userFromToken(token) {
  if (!token) return null;
  const store = await getStore();
  const session = await store.sessions_getByTokenHash?.(sha256(token));
  if (!session) return null;
  return store.users_byId(session.user_id);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token) {
  const secure = config.appOrigin.startsWith('https://') ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${config.sessionTtlDays * 86400}${secure}`,
  );
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export { SESSION_COOKIE };

/** Express middleware: attaches req.user when a valid session cookie is present. */
export async function attachUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    req.sessionToken = cookies[SESSION_COOKIE] || '';
    req.user = await userFromToken(req.sessionToken);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized('You must be signed in to do that'));
  next();
}
