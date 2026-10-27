import { badRequest } from './util.js';

export function str(value, field, { min = 0, max = 5000, required = true, trim = true } = {}) {
  if (value == null) {
    if (required) throw badRequest(`"${field}" is required`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`"${field}" must be a string`);
  const v = trim ? value.trim() : value;
  if (required && v.length < min) throw badRequest(`"${field}" must be at least ${min} characters`);
  if (v.length > max) throw badRequest(`"${field}" must be at most ${max} characters`);
  return v;
}

export function num(value, field, { min = -Infinity, max = Infinity, required = true, def } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`"${field}" is required`);
    return def;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`"${field}" must be a number`);
  if (n < min || n > max) throw badRequest(`"${field}" must be between ${min} and ${max}`);
  return n;
}

export function bool(value, field, { def = false } = {}) {
  if (value == null) return def;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  throw badRequest(`"${field}" must be a boolean`);
}

export function email(value, field = 'email') {
  const v = str(value, field, { min: 5, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
    throw badRequest(`"${field}" is not a valid email address`);
  }
  return v;
}

export function arr(value, field, { min = 0, max = 100, required = true } = {}) {
  if (value == null) {
    if (required) throw badRequest(`"${field}" is required`);
    return [];
  }
  if (!Array.isArray(value)) throw badRequest(`"${field}" must be an array`);
  if (value.length < min) throw badRequest(`"${field}" needs at least ${min} item(s)`);
  if (value.length > max) throw badRequest(`"${field}" accepts at most ${max} items`);
  return value;
}

export function oneOf(value, field, allowed, { required = true, def } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`"${field}" is required`);
    return def;
  }
  if (!allowed.includes(value)) {
    throw badRequest(`"${field}" must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

export function obj(value, field, { required = true } = {}) {
  if (value == null) {
    if (required) throw badRequest(`"${field}" is required`);
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`"${field}" must be an object`);
  }
  return value;
}

/** Allow only http(s) links — blocks javascript:/data: URLs in user supplied content. */
export function httpUrl(value, field, { required = false, max = 600 } = {}) {
  const raw = str(value, field, { required, max, trim: true });
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw badRequest(`"${field}" must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw badRequest(`"${field}" must start with http:// or https://`);
  }
  return parsed.toString();
}
