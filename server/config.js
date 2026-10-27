import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

/** Minimal .env loader (no dependency) — real environment variables always win. */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

const int = (v, d) =>
  Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d;

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  appOrigin: process.env.APP_ORIGIN || '',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 30),

  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: int(process.env.OPENAI_MAX_TOKENS, 2500),
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 45000),
  },

  db: {
    driver: (process.env.DRIVER || 'json').toLowerCase(),
    dataDir: path.resolve(ROOT, process.env.DATA_DIR || './.data'),
    url: process.env.DATABASE_URL || '',
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  },

  bls: {
    key: process.env.BLS_API_KEY || '',
    baseUrl:
      process.env.BLS_BASE_URL || 'https://api.bls.gov/publicAPI/v2/timeseries/data',
  },
  wiki: {
    baseUrl: process.env.WIKI_API_URL || 'https://en.wikipedia.org/w/api.php',
  },
};

export const aiConfigured = () =>
  Boolean(config.ai.apiKey && config.ai.provider === 'openai');
