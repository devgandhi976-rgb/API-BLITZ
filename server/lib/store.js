import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { uid, nowIso, conflict, notFound } from './util.js';

/**
 * Storage layer with two drivers behind one interface:
 *   - json : file-backed store (development / single instance)
 *   - pg   : PostgreSQL (Supabase or any managed Postgres) with row-level security
 *
 * Interface (all methods are ownership scoped by userId):
 *   users.create / users.byEmail / users.byId / users.update / users.remove
 *   sessions.create / sessions.get / sessions.remove / sessions.removeForUser
 *   docs.list / docs.get / docs.create / docs.update / docs.remove
 */
export const COLLECTIONS = [
  'profiles',
  'dna_answers',
  'recommendations',
  'plans',
  'challenges',
  'submissions',
  'experiences',
  'passport_entries',
  'conversations',
  'events',
];

function assertCollection(collection) {
  if (!COLLECTIONS.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
}

/* ------------------------------------------------------------------ JSON */

class JsonStore {
  constructor() {
    this.kind = 'json';
    this.dir = config.db.dataDir;
    this.cache = new Map();
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    for (const c of COLLECTIONS) {
      await this.load(c);
    }
  }

  file(collection) {
    return path.join(this.dir, `${collection}.json`);
  }

  async load(collection) {
    try {
      const raw = await fs.readFile(this.file(collection), 'utf8');
      this.cache.set(collection, JSON.parse(raw));
    } catch {
      this.cache.set(collection, []);
    }
  }

  async persist(collection) {
    const data = JSON.stringify(this.cache.get(collection) ?? [], null, 2);
    const target = this.file(collection);
    const tmp = `${target}.${process.pid}.tmp`;
    // Serialise writes so concurrent requests cannot interleave.
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(tmp, data, 'utf8');
      await fs.rename(tmp, target);
    });
    await this.writeQueue;
  }

  async users_create(user) {
    const list = this.cache.get('users') ?? [];
    if (list.some((u) => u.email === user.email)) throw conflict('An account with that email already exists');
    const record = { id: uid('usr_'), ...user, created_at: nowIso() };
    list.push(record);
    this.cache.set('users', list);
    await this.persist('users');
    return record;
  }

  async users_byEmail(email) {
    return (this.cache.get('users') ?? []).find((u) => u.email === email) || null;
  }

  async users_byId(id) {
    return (this.cache.get('users') ?? []).find((u) => u.id === id) || null;
  }

  async users_update(id, patch) {
    const list = this.cache.get('users') ?? [];
    const i = list.findIndex((u) => u.id === id);
    if (i === -1) throw notFound('User not found');
    list[i] = { ...list[i], ...patch, updated_at: nowIso() };
    this.cache.set('users', list);
    await this.persist('users');
    return list[i];
  }

  async users_remove(id) {
    const list = this.cache.get('users') ?? [];
    this.cache.set('users', list.filter((u) => u.id !== id));
    await this.persist('users');
    for (const c of COLLECTIONS) {
      const docs = this.cache.get(c) ?? [];
      this.cache.set(c, docs.filter((d) => d.user_id !== id));
      await this.persist(c);
    }
    const sessions = this.cache.get('sessions') ?? [];
    this.cache.set('sessions', sessions.filter((s) => s.user_id !== id));
    await this.persist('sessions');
  }

  async sessions_create(session) {
    const list = this.cache.get('sessions') ?? [];
    const record = { id: uid('ses_'), created_at: nowIso(), ...session };
    list.push(record);
    this.cache.set('sessions', list);
    await this.persist('sessions');
    return record;
  }

  async sessions_get(id) {
    return (this.cache.get('sessions') ?? []).find((s) => s.id === id) || null;
  }

  async sessions_getByTokenHash(tokenHash) {
    return (
      (this.cache.get('sessions') ?? []).find((s) => s.token_hash === tokenHash) || null
    );
  }

  async sessions_remove(id) {
    const list = this.cache.get('sessions') ?? [];
    this.cache.set('sessions', list.filter((s) => s.id !== id));
    await this.persist('sessions');
  }

  async sessions_removeForUser(userId) {
    const list = this.cache.get('sessions') ?? [];
    this.cache.set('sessions', list.filter((s) => s.user_id !== userId));
    await this.persist('sessions');
  }

  async docs_list(userId, collection, { filter } = {}) {
    assertCollection(collection);
    let rows = (this.cache.get(collection) ?? []).filter((d) => d.user_id === userId);
    if (filter) {
      rows = rows.filter((d) =>
        Object.entries(filter).every(([k, v]) => d.data?.[k] === v),
      );
    }
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async docs_get(userId, collection, id) {
    assertCollection(collection);
    return (this.cache.get(collection) ?? []).find((d) => d.id === id && d.user_id === userId) || null;
  }

  async docs_create(userId, collection, data) {
    assertCollection(collection);
    const list = this.cache.get(collection) ?? [];
    const record = { id: uid('doc_'), user_id: userId, data, created_at: nowIso(), updated_at: nowIso() };
    list.push(record);
    this.cache.set(collection, list);
    await this.persist(collection);
    return record;
  }

  async docs_update(userId, collection, id, data) {
    assertCollection(collection);
    const list = this.cache.get(collection) ?? [];
    const i = list.findIndex((d) => d.id === id && d.user_id === userId);
    if (i === -1) throw notFound('Entry not found');
    list[i] = { ...list[i], data, updated_at: nowIso() };
    this.cache.set(collection, list);
    await this.persist(collection);
    return list[i];
  }

  async docs_remove(userId, collection, id) {
    assertCollection(collection);
    const list = this.cache.get(collection) ?? [];
    const i = list.findIndex((d) => d.id === id && d.user_id === userId);
    if (i === -1) throw notFound('Entry not found');
    const [removed] = list.splice(i, 1);
    this.cache.set(collection, list);
    await this.persist(collection);
    return removed;
  }
}

/* -------------------------------------------------------------------- PG */

class PgStore {
  constructor(pool) {
    this.kind = 'pg';
    this.pool = pool;
  }

  async init() {
    await this.pool.query('select 1');
  }

  /** Run `fn` inside a transaction with the RLS context set to `userId`. */
  async withUser(userId, fn) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.user_id', $1, true)", [String(userId || '')]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async users_create(user) {
    const res = await this.pool.query(
      `insert into users (id, email, password_hash, name, created_at)
       values ($1,$2,$3,$4,now()) returning *`,
      [uid('usr_'), user.email, user.password_hash, user.name || ''],
    );
    return res.rows[0];
  }

  async users_byEmail(email) {
    const res = await this.pool.query('select * from users where email = $1', [email]);
    return res.rows[0] || null;
  }

  async users_byId(id) {
    const res = await this.pool.query('select * from users where id = $1', [id]);
    return res.rows[0] || null;
  }

  async users_update(id, patch) {
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!['name', 'password_hash', 'location', 'updated_at'].includes(k)) continue;
      values.push(v);
      fields.push(`${k} = $${values.length}`);
    }
    values.push(id);
    const res = await this.pool.query(
      `update users set ${fields.join(', ')}, updated_at = now() where id = $${values.length} returning *`,
      values,
    );
    if (!res.rows[0]) throw notFound('User not found');
    return res.rows[0];
  }

  async users_remove(id) {
    await this.pool.query('delete from users where id = $1', [id]);
  }

  async sessions_create(session) {
    const res = await this.pool.query(
      `insert into sessions (id, user_id, token_hash, expires_at, created_at)
       values ($1,$2,$3,$4,now()) returning *`,
      [uid('ses_'), session.user_id, session.token_hash, session.expires_at],
    );
    return res.rows[0];
  }

  async sessions_get(id) {
    const res = await this.pool.query('select * from sessions where id = $1 and expires_at > now()', [id]);
    return res.rows[0] || null;
  }

  async sessions_getByTokenHash(tokenHash) {
    const res = await this.pool.query(
      'select * from sessions where token_hash = $1 and expires_at > now()',
      [tokenHash],
    );
    return res.rows[0] || null;
  }

  async sessions_remove(id) {
    await this.pool.query('delete from sessions where id = $1', [id]);
  }

  async sessions_removeForUser(userId) {
    await this.pool.query('delete from sessions where user_id = $1', [userId]);
  }

  async docs_list(userId, collection, { filter } = {}) {
    assertCollection(collection);
    return this.withUser(userId, async (client) => {
      const res = await client.query(
        `select id, user_id, data, created_at, updated_at from documents
         where collection = $1 order by created_at desc`,
        [collection],
      );
      let rows = res.rows;
      if (filter) {
        rows = rows.filter((d) => Object.entries(filter).every(([k, v]) => d.data?.[k] === v));
      }
      return rows;
    });
  }

  async docs_get(userId, collection, id) {
    assertCollection(collection);
    const res = await this.withUser(userId, async (client) => {
      const r = await client.query(
        `select id, user_id, data, created_at, updated_at from documents
         where collection = $1 and id = $2`,
        [collection, id],
      );
      return r.rows[0] || null;
    });
    return res;
  }

  async docs_create(userId, collection, data) {
    assertCollection(collection);
    const id = uid('doc_');
    const res = await this.withUser(userId, async (client) => {
      const r = await client.query(
        `insert into documents (id, collection, user_id, data, created_at, updated_at)
         values ($1,$2,$3,$4,now(),now()) returning id, user_id, data, created_at, updated_at`,
        [id, collection, userId, JSON.stringify(data)],
      );
      return r.rows[0];
    });
    return res;
  }

  async docs_update(userId, collection, id, data) {
    assertCollection(collection);
    const res = await this.withUser(userId, async (client) => {
      const r = await client.query(
        `update documents set data = $3, updated_at = now()
         where collection = $1 and id = $2 returning id, user_id, data, created_at, updated_at`,
        [collection, id, JSON.stringify(data)],
      );
      return r.rows[0] || null;
    });
    if (!res) throw notFound('Entry not found');
    return res;
  }

  async docs_remove(userId, collection, id) {
    assertCollection(collection);
    const res = await this.withUser(userId, async (client) => {
      const r = await client.query(
        `delete from documents where collection = $1 and id = $2 returning id`,
        [collection, id],
      );
      return r.rows[0] || null;
    });
    if (!res) throw notFound('Entry not found');
    return res;
  }
}

/* --------------------------------------------------------------- factory */

let storePromise = null;

export async function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      if (config.db.driver === 'pg') {
        if (!config.db.url) {
          throw new Error('DRIVER=pg requires DATABASE_URL to be set');
        }
        const { default: pg } = await import('pg');
        const pool = new pg.Pool({ connectionString: config.db.url, ssl: config.db.ssl });
        const store = new PgStore(pool);
        await store.init();
        return store;
      }
      const store = new JsonStore();
      await store.init();
      return store;
    })();
  }
  return storePromise;
}

/** Test helper: drop cached store (used between test files). */
export function __resetStoreForTests() {
  storePromise = null;
}
