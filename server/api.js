import express from 'express';
import { config, aiConfigured } from './config.js';
import { getStore } from './lib/store.js';
import {
  attachUser,
  requireAuth,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
} from './lib/auth.js';
import { str, email as vEmail, arr, obj, oneOf, httpUrl, num, bool } from './lib/validate.js';
import { badRequest, conflict, notFound, unauthorized } from './lib/util.js';
import { askJson, askText, AiUnavailableError, isAiConfigured } from './lib/ai.js';
import { SCENARIOS, INTEREST_FACETS } from './lib/scenarios.js';
import {
  buildCareerDna,
  hiddenCareers,
  talentEvidence,
  translateExperience,
  dayInLife,
  careerBridge,
  noDeadEndPlanner,
  decodeRejection,
  careerCollision,
  rankFamilies,
  scoreAnswers,
} from './lib/engine.js';
import { fetchWagesForSoc, wikiSummary } from './lib/sources.js';

export const api = express.Router();

api.use(express.json({ limit: '256kb' }));
api.use(attachUser);

/* --------------------------------------------------------------- health */

api.get('/health', async (_req, res) => {
  let db = 'unknown';
  try {
    const store = await getStore();
    db = store.kind;
  } catch (err) {
    db = `error: ${err.message}`;
  }
  res.json({
    ok: true,
    ai: {
      provider: config.ai.provider,
      model: config.ai.model,
      configured: aiConfigured(),
      note: aiConfigured()
        ? 'AI calls are proxied server-side.'
        : 'No AI key configured — features run in labelled demo mode using the offline rules engine.',
    },
    db: { driver: config.db.driver, active: db },
    serverTime: new Date().toISOString(),
  });
});

/* ----------------------------------------------------------------- auth */

api.post('/auth/register', async (req, res) => {
  const body = obj(req.body, 'body');
  const mail = vEmail(body.email);
  const password = str(body.password, 'password', { min: 8, max: 200 });
  const name = str(body.name, 'name', { min: 1, max: 80 });
  const store = await getStore();
  if (await store.users_byEmail(mail)) throw conflict('An account with that email already exists');
  const user = await store.users_create({
    email: mail,
    password_hash: await hashPassword(password),
    name,
  });
  const { token } = await createSession(user.id);
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user) });
});

api.post('/auth/login', async (req, res) => {
  const body = obj(req.body, 'body');
  const mail = vEmail(body.email);
  const password = str(body.password, 'password', { min: 1, max: 200 });
  const store = await getStore();
  const user = await store.users_byEmail(mail);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw unauthorized('Email or password is incorrect');
  }
  const { token } = await createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

api.post('/auth/logout', async (req, res) => {
  if (req.sessionToken) await destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

api.get('/auth/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
});

api.delete('/auth/me', requireAuth, async (req, res) => {
  const store = await getStore();
  await store.sessions_removeForUser(req.user.id);
  await store.users_remove(req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true, message: 'Account and all associated data deleted.' });
});

api.patch('/auth/me', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const store = await getStore();
  const patch = {};
  if (body.name != null) patch.name = str(body.name, 'name', { min: 1, max: 80 });
  if (body.location != null) patch.location = str(body.location, 'location', { max: 120, required: false });
  if (body.newPassword != null) {
    const pwd = str(body.newPassword, 'newPassword', { min: 8, max: 200 });
    patch.password_hash = await hashPassword(pwd);
  }
  const user = await store.users_update(req.user.id, patch);
  res.json({ user: publicUser(user) });
});

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, location: u.location || '', createdAt: u.created_at };
}

/* ------------------------------------------------------------ scenarios */

api.get('/scenarios', (_req, res) => {
  res.json({ scenarios: SCENARIOS, interestFacets: INTEREST_FACETS });
});

/* ------------------------------------------------------------- feature 1 */

api.post('/dna', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const answers = arr(body.answers, 'answers', { min: 1, max: 50 });
  const clean = answers.map((a, i) => ({
    scenarioId: str(a.scenarioId, `answers[${i}].scenarioId`, { max: 20 }),
    optionId: str(a.optionId, `answers[${i}].optionId`, { max: 20 }),
  }));
  const result = await withAi(
    () => buildCareerDna(clean),
    async () => {
      const { data } = await askJson(
        'You are a career psychologist. You never ask for job titles and you never invent salary data. Return strict JSON.',
        {
          task: 'Produce a Career DNA profile from these scenario answers.',
          answers: clean,
        },
        {
          type: 'object',
          required: ['summary', 'workingStyle', 'strengths'],
          properties: {
            summary: { type: 'string' },
            workingStyle: { type: 'string' },
            strengths: { type: 'array', items: { type: 'object' } },
            watchOuts: { type: 'array', items: { type: 'object' } },
          },
        },
      );
      return { ...data, id: `dna_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  await saveDoc(req.user.id, 'profiles', { kind: 'dna', result });
  res.json(result);
});

/* ------------------------------------------------------------- feature 2 */

api.post('/hidden-careers', requireAuth, async (req, res) => {
  const answers = await loadAnswers(req.user.id, req.body?.answers);
  const result = hiddenCareers(buildCareerDna(answers));
  await saveDoc(req.user.id, 'recommendations', { kind: 'hidden_careers', result });
  res.json(result);
});

/* ------------------------------------------------------------- feature 3 */

api.post('/talent-evidence', requireAuth, async (req, res) => {
  const answers = await loadAnswers(req.user.id, req.body?.answers);
  const dna = buildCareerDna(answers);
  const existing = await listDocs(req.user.id, 'passport_entries');
  const result = talentEvidence(dna, existing);
  await saveDoc(req.user.id, 'recommendations', { kind: 'talent_evidence', result });
  res.json(result);
});

/* ------------------------------------------------------------- feature 4 */

api.post('/experience-translator', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const text = str(body.text, 'text', { min: 20, max: 8000 });
  const result = await withAi(
    () => translateExperience(text),
    async () => {
      const { data } = await askJson(
        'You rewrite career history into clear, truthful resume bullets. Never invent employers, dates or metrics that were not supplied. Return strict JSON.',
        { text },
        {
          type: 'object',
          required: ['bullets', 'keywords'],
          properties: {
            bullets: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
            transferable: { type: 'array', items: { type: 'object' } },
          },
        },
      );
      return { ...data, id: `ex_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  await saveDoc(req.user.id, 'experiences', { kind: 'translated', result });
  res.json(result);
});

/* ------------------------------------------------------------- feature 5 */

api.post('/day-in-career', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const familyId = str(body.familyId, 'familyId', { max: 40 });
  const result = await withAi(
    () => dayInLife(familyId, body.socCodes || []),
    async () => {
      const { data } = await askJson(
        'You describe a realistic working day in a career family. Be honest and specific, avoid marketing language. Return strict JSON.',
        { familyId },
        {
          type: 'object',
          required: ['typicalDay', 'whatItIsNot'],
          properties: {
            typicalDay: { type: 'array', items: { type: 'object' } },
            whatItIsNot: { type: 'array', items: { type: 'string' } },
          },
        },
      );
      return { ...data, id: `day_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  res.json(result);
});

/* ------------------------------------------------------------- feature 6 */

api.post('/career-bridge', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const from = str(body.from, 'from', { min: 3, max: 4000 });
  const to = str(body.toFamilyId, 'toFamilyId', { max: 40 });
  const result = await withAi(
    () => careerBridge(from, to),
    async () => {
      const { data } = await askJson(
        'You build concrete, sequenced career transition plans. Never promise outcomes. Return strict JSON.',
        { from, to },
        {
          type: 'object',
          required: ['steps'],
          properties: { steps: { type: 'array', items: { type: 'object' } } },
        },
      );
      return { ...data, id: `br_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  await saveDoc(req.user.id, 'plans', { kind: 'bridge', result });
  res.json(result);
});

/* ------------------------------------------------------------- feature 7 */

api.get('/reality-check', requireAuth, async (req, res) => {
  const soc = str(req.query.soc, 'soc', { max: 10 });
  if (!/^\d{6}$/.test(soc)) throw badRequest('"soc" must be a 6-digit SOC code');
  const { data, errors, retrievedAt } = await fetchWagesForSoc([soc]);
  const record = data[soc] || null;
  if (!record) {
    return res.json({
      ok: false,
      errors,
      retrievedAt,
      message: 'The BLS did not return data for this occupation.',
    });
  }
  res.json({
    ok: true,
    occupation: { soc },
    ...record,
    uncertainty:
      'Figures are official BLS estimates for the most recent survey year; they are not a promise for any individual, and regional variation is not shown here.',
    retrievalNote: `Retrieved from the BLS Public Data API on ${retrievedAt}.`,
  });
});

api.get('/reality-check/related', async (req, res) => {
  const title = str(req.query.title, 'title', { max: 120 });
  if (!title) throw badRequest('"title" is required');
  const summary = await wikiSummary(title);
  if (!summary) return res.json({ ok: false, message: 'No Wikipedia article matched that title.' });
  res.json({ ok: true, ...summary });
});

/* ------------------------------------------------------------- feature 8 */

api.post('/no-dead-end-planner', requireAuth, async (req, res) => {
  const answers = await loadAnswers(req.user.id, req.body?.answers);
  const result = noDeadEndPlanner(buildCareerDna(answers));
  await saveDoc(req.user.id, 'plans', { kind: 'no_dead_end', result });
  res.json(result);
});

/* ------------------------------------------------------------- feature 9 */

api.post('/rejection-decoder', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const text = str(body.text, 'text', { min: 10, max: 6000 });
  const result = await withAi(
    () => decodeRejection(text, body.familyId),
    async () => {
      const { data } = await askJson(
        'You decode rejection feedback carefully and without cynicism. You state uncertainty when the text is ambiguous. Return strict JSON.',
        { text },
        {
          type: 'object',
          required: ['primary'],
          properties: {
            primary: { type: 'object' },
            alternatives: { type: 'array', items: { type: 'object' } },
          },
        },
      );
      return { ...data, id: `rj_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  await saveDoc(req.user.id, 'recommendations', { kind: 'rejection', result });
  res.json(result);
});

/* ----------------------------------------------------------- feature 10 */

api.get('/passport', requireAuth, async (req, res) => {
  const entries = await listDocs(req.user.id, 'passport_entries');
  res.json({ entries, count: entries.length });
});

api.post('/passport', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const entry = {
    title: str(body.title, 'title', { min: 3, max: 160 }),
    description: str(body.description, 'description', { max: 2000, required: false }),
    evidenceType: oneOf(body.evidenceType, 'evidenceType', ['self_reported', 'verified']),
    verificationMethod: str(body.verificationMethod, 'verificationMethod', { max: 200, required: false }),
    link: httpUrl(body.link, 'link', { required: false }),
    skills: arr(body.skills, 'skills', { max: 20, required: false }).map((s) => str(s, 'skill', { max: 40 })),
    occurredAt: str(body.occurredAt, 'occurredAt', { max: 30, required: false }),
  };
  const doc = await saveDoc(req.user.id, 'passport_entries', entry);
  res.status(201).json({ entry: doc });
});

api.patch('/passport/:id', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const store = await getStore();
  const existing = await store.docs_get(req.user.id, 'passport_entries', req.params.id);
  if (!existing) throw notFound('Passport entry not found');
  const data = { ...existing.data };
  if (body.title != null) data.title = str(body.title, 'title', { min: 3, max: 160 });
  if (body.description != null) data.description = str(body.description, 'description', { max: 2000, required: false });
  if (body.evidenceType != null)
    data.evidenceType = oneOf(body.evidenceType, 'evidenceType', ['self_reported', 'verified']);
  if (body.verificationMethod != null)
    data.verificationMethod = str(body.verificationMethod, 'verificationMethod', { max: 200, required: false });
  if (body.link != null) data.link = httpUrl(body.link, 'link', { required: false });
  if (body.skills != null)
    data.skills = arr(body.skills, 'skills', { max: 20, required: false }).map((s) => str(s, 'skill', { max: 40 }));
  const updated = await store.docs_update(req.user.id, 'passport_entries', req.params.id, data);
  res.json({ entry: updated });
});

api.delete('/passport/:id', requireAuth, async (req, res) => {
  const store = await getStore();
  const removed = await store.docs_remove(req.user.id, 'passport_entries', req.params.id);
  res.json({ ok: true, removed: removed.id });
});

api.get('/passport/export', requireAuth, async (req, res) => {
  const entries = await listDocs(req.user.id, 'passport_entries');
  const lines = [
    '# Proof-of-Ability Passport',
    '',
    `Exported: ${new Date().toISOString()}`,
    '',
  ];
  for (const e of entries) {
    const verified = e.data.evidenceType === 'verified';
    lines.push(`## ${e.data.title}`);
    lines.push(`- Status: ${verified ? 'VERIFIED' : 'Self-reported (not independently verified)'}`);
    if (e.data.verificationMethod) lines.push(`- Verified via: ${e.data.verificationMethod}`);
    if (e.data.link) lines.push(`- Link: ${e.data.link}`);
    if (e.data.skills?.length) lines.push(`- Skills: ${e.data.skills.join(', ')}`);
    if (e.data.description) lines.push('', e.data.description);
    lines.push('');
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="life-trace-passport.md"');
  res.send(lines.join('\n'));
});

/* ----------------------------------------------------------- feature 11 */

api.post('/collision', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const interests = arr(body.interests, 'interests', { min: 2, max: 5 }).map((i) =>
    str(i, 'interest', { max: 30 }),
  );
  for (const i of interests) {
    if (!INTEREST_FACETS.some((f) => f.id === i)) throw badRequest(`Unknown interest: ${i}`);
  }
  const context = str(body.context, 'context', { max: 1000, required: false });
  const result = await withAi(
    () => careerCollision(interests, context),
    async () => {
      const { data } = await askJson(
        'You generate unusual, specific career combinations from two or more unrelated interests. Every suggestion must explain why it fits, and must include a mini-mission. Never produce generic career lists. Return strict JSON.',
        { interests, context },
        {
          type: 'object',
          required: ['suggestions'],
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'why', 'mission'],
                properties: {
                  title: { type: 'string' },
                  why: { type: 'string' },
                  mission: { type: 'object' },
                },
              },
            },
          },
        },
      );
      return { ...data, id: `cc_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  await saveDoc(req.user.id, 'recommendations', { kind: 'collision', result });
  res.json(result);
});

/* ------------------------------------------------------------ mini tasks */

api.post('/challenges', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const title = str(body.title, 'title', { min: 3, max: 160 });
  const notes = str(body.notes, 'notes', { max: 4000, required: false });
  const mission = obj(body.mission, 'mission', { required: false });
  const doc = await saveDoc(req.user.id, 'challenges', { title, notes, mission, status: 'open' });
  res.status(201).json({ challenge: doc });
});

api.get('/challenges', requireAuth, async (req, res) => {
  const list = await listDocs(req.user.id, 'challenges');
  res.json({ challenges: list });
});

api.patch('/challenges/:id', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const store = await getStore();
  const existing = await store.docs_get(req.user.id, 'challenges', req.params.id);
  if (!existing) throw notFound('Challenge not found');
  const data = { ...existing.data };
  if (body.status != null) data.status = oneOf(body.status, 'status', ['open', 'done', 'abandoned']);
  if (body.notes != null) data.notes = str(body.notes, 'notes', { max: 4000, required: false });
  const updated = await store.docs_update(req.user.id, 'challenges', req.params.id, data);
  res.json({ challenge: updated });
});

/* ----------------------------------------------------------- dashboard */

api.get('/dashboard', requireAuth, async (req, res) => {
  const store = await getStore();
  const [profiles, recommendations, plans, challenges, passport] = await Promise.all([
    store.docs_list(req.user.id, 'profiles'),
    store.docs_list(req.user.id, 'recommendations'),
    store.docs_list(req.user.id, 'plans'),
    store.docs_list(req.user.id, 'challenges'),
    store.docs_list(req.user.id, 'passport_entries'),
  ]);
  const latestDna = profiles.find((p) => p.data?.kind === 'dna')?.data?.result || null;
  res.json({
    profile: latestDna,
    counts: {
      profiles: profiles.length,
      recommendations: recommendations.length,
      plans: plans.length,
      challenges: challenges.length,
      passport: passport.length,
    },
    plans: plans.map((p) => ({ id: p.id, kind: p.data.kind, createdAt: p.created_at })),
    challenges: challenges.map((c) => ({ id: c.id, ...c.data, createdAt: c.created_at })),
    recentPassport: passport.slice(0, 5).map((p) => ({ id: p.id, ...p.data })),
    aiConfigured: isAiConfigured(),
  });
});

api.get('/plans', requireAuth, async (req, res) => {
  const list = await listDocs(req.user.id, 'plans');
  res.json({ plans: list });
});

api.delete('/plans/:id', requireAuth, async (req, res) => {
  const store = await getStore();
  const removed = await store.docs_remove(req.user.id, 'plans', req.params.id);
  res.json({ ok: true, removed: removed.id });
});

/* ---------------------------------------------------------- AI assistant */

api.post('/chat', requireAuth, async (req, res) => {
  const body = obj(req.body, 'body');
  const message = str(body.message, 'message', { min: 1, max: 4000 });
  const store = await getStore();
  const [profile, passport] = await Promise.all([
    store.docs_list(req.user.id, 'profiles'),
    store.docs_list(req.user.id, 'passport_entries'),
  ]);
  const dna = profile.find((p) => p.data?.kind === 'dna')?.data?.result || null;
  const context = {
    message,
    careerDna: dna
      ? { primary: dna.primaryFamily?.label, workingStyle: dna.workingStyle, strengths: dna.strengths }
      : null,
    passport: passport.slice(0, 10).map((p) => ({ title: p.data.title, type: p.data.evidenceType })),
  };
  const result = await withAi(
    async () => ({
      id: `chat_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      mode: 'demo',
      reply:
        'AI is not configured on this server, so I cannot generate a personalised answer yet. Your profile data is safe and stored — add an AI provider key to enable live answers.',
      contextUsed: context,
    }),
    async () => {
      const { data } = await askJson(
        'You are the LIFE TRACE career assistant. You use the user profile supplied and you never invent salary figures or job openings. If the data is insufficient you say so. Return strict JSON.',
        context,
        { type: 'object', required: ['reply'], properties: { reply: { type: 'string' } } },
      );
      return { ...data, id: `chat_${Date.now()}`, generatedAt: new Date().toISOString(), mode: 'ai' };
    },
  );
  await saveDoc(req.user.id, 'conversations', { message, reply: result.reply, mode: result.mode });
  res.json(result);
});

api.get('/chat/history', requireAuth, async (req, res) => {
  const list = await listDocs(req.user.id, 'conversations');
  res.json({ history: list.map((c) => c.data) });
});

/* ------------------------------------------------------------- helpers */

async function withAi(demoFn, aiFn) {
  if (!isAiConfigured()) return demoFn();
  try {
    return await aiFn();
  } catch (err) {
    if (err instanceof AiUnavailableError) return demoFn();
    // Surface the real failure rather than silently pretending success.
    throw err;
  }
}

async function saveDoc(userId, collection, data) {
  const store = await getStore();
  return store.docs_create(userId, collection, data);
}

async function listDocs(userId, collection) {
  const store = await getStore();
  return store.docs_list(userId, collection);
}

async function loadAnswers(userId, supplied) {
  if (Array.isArray(supplied) && supplied.length) return supplied;
  const store = await getStore();
  const docs = await store.docs_list(userId, 'dna_answers');
  const latest = docs[0];
  return latest?.data?.answers || [];
}

export { loadAnswers, saveDoc, listDocs, withAi };
