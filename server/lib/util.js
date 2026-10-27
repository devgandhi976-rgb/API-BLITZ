import crypto from 'node:crypto';

export function uid(prefix = '') {
  return prefix + crypto.randomBytes(12).toString('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Error type carrying an HTTP status so the API layer can respond correctly. */
export class AppError extends Error {
  constructor(status, message, code = 'error', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Sign in required') => new AppError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Not allowed') => new AppError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found') => new AppError(404, msg, 'not_found');
export const conflict = (msg) => new AppError(409, msg, 'conflict');
export const upstream = (msg, details) => new AppError(502, msg, 'upstream_error', details);
export const notConfigured = (msg) => new AppError(503, msg, 'not_configured');

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function truncate(str, max = 2000) {
  if (typeof str !== 'string') return str;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function titleCase(str = '') {
  return String(str).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function slugify(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Consistent, dependency-free keyword extraction used by the demo engine. */
export function keywords(text = '', limit = 12) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were', 'are',
    'but', 'not', 'you', 'your', 'our', 'their', 'they', 'them', 'his', 'her', 'its', 'about',
    'into', 'over', 'when', 'what', 'which', 'will', 'would', 'could', 'should', 'been', 'were',
    'more', 'most', 'some', 'such', 'than', 'then', 'there', 'these', 'those', 'very', 'also',
    'like', 'just', 'much', 'many', 'work', 'working', 'time', 'people', 'person', 'thing',
  ]);
  const counts = new Map();
  for (const raw of String(text).toLowerCase().match(/[a-z][a-z+-]{2,}/g) || []) {
    if (stop.has(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}
