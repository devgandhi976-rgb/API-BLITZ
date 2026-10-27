import { config } from '../config.js';
import { notConfigured, upstream } from './util.js';

/**
 * Server-side AI proxy for OpenAI (and any OpenAI-compatible endpoint).
 * The API key never leaves the server. If no key is configured the caller
 * receives an explicit `not_configured` error — the app never pretends the
 * model answered.
 */

export class AiUnavailableError extends Error {
  constructor(message, code = 'ai_not_configured') {
    super(message);
    this.code = code;
  }
}

export function isAiConfigured() {
  return Boolean(config.ai.apiKey);
}

function buildMessages(system, user) {
  return [
    { role: 'system', content: system },
    { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) },
  ];
}

async function callChat(messages, { temperature = 0.6, maxTokens, json = false, signal } = {}) {
  if (!isAiConfigured()) {
    throw new AiUnavailableError(
      'AI provider is not configured. Set OPENAI_API_KEY (and optionally OPENAI_MODEL) in the server environment.',
      'ai_not_configured',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature,
        max_tokens: maxTokens || config.ai.maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw upstream(`AI provider returned HTTP ${res.status}`, {
        status: res.status,
        body: body.slice(0, 500),
      });
    }

    const payload = await res.json();
    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw upstream('AI provider returned an empty completion');
    }
    return {
      content,
      model: payload.model || config.ai.model,
      usage: payload.usage || null,
      finishReason: choice?.finish_reason || null,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw upstream(`AI provider timed out after ${config.ai.timeoutMs}ms`);
    }
    if (err.status) throw err;
    throw upstream(`Could not reach AI provider: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the model for a JSON object matching `schema` (best-effort validation). */
export async function askJson(system, user, schema, opts = {}) {
  const result = await callChat(buildMessages(system, user), { ...opts, json: true });
  let parsed;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    // Some models wrap JSON in fences — strip and retry once.
    const cleaned = result.content.replace(/```json|```/g, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw upstream('AI provider did not return valid JSON');
    }
  }
  if (schema) {
    const errors = validateAgainst(parsed, schema);
    if (errors.length) {
      throw upstream('AI response did not match the expected structure', { errors });
    }
  }
  return { data: parsed, usage: result.usage, model: result.model };
}

export async function askText(system, user, opts = {}) {
  const result = await callChat(buildMessages(system, user), opts);
  return { text: result.content, usage: result.usage, model: result.model };
}

/* ------------------------------------------------------- tiny validator */

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Minimal JSON-schema check supporting: object/array/string/number/boolean,
 * required properties, enum and item types. Enough to catch malformed model
 * output without pulling in a validation library.
 */
export function validateAgainst(data, schema, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  const t = schema.type;
  if (t) {
    const actual = typeOf(data);
    const ok =
      (t === 'object' && actual === 'object') ||
      (t === 'array' && actual === 'array') ||
      (t === 'string' && actual === 'string') ||
      (t === 'number' && actual === 'number') ||
      (t === 'boolean' && actual === 'boolean');
    if (!ok) {
      errors.push(`${path} should be ${t} but is ${actual}`);
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  }

  if (schema.type === 'object') {
    for (const key of schema.required || []) {
      if (data == null || data[key] === undefined) errors.push(`${path}.${key} is required`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (data && data[key] !== undefined) {
        errors.push(...validateAgainst(data[key], sub, `${path}.${key}`));
      }
    }
  }

  if (schema.type === 'array' && schema.items) {
    (data || []).forEach((item, i) => {
      errors.push(...validateAgainst(item, schema.items, `${path}[${i}]`));
    });
  }

  return errors;
}

export { notConfigured };
