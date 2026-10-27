import { config } from '../config.js';
import { upstream } from './util.js';

/**
 * Real career data from documented public APIs.
 * Every figure returned here carries its source URL and retrieval date so the
 * UI can show provenance. Nothing here is hardcoded salary data.
 */

/* ------------------------------------------------------------------ BLS */
/**
 * BLS OEWS series id layout (25 characters):
 *   "OE" + U(seasonal) + areaType(2) + areaCode(7) + industry(6) + occupation(6) + datatype(2)
 *   National: "OEUN000000000000015125201"
 *   State:    "OEUN" + stateFips + "000000" + "000000" + occ + datatype
 */
export function blsSeriesId(socCode, { areaType = 'U', areaCode = '0000000', industry = '000000', datatype = '01' } = {}) {
  const occ = String(socCode).replace(/\D/g, '').padStart(6, '0').slice(0, 6);
  return `OE${areaType}${areaCode}${industry}${occ}${datatype}`;
}

const DATATYPE_LABEL = {
  '01': 'Employment (annual average)',
  '02': 'Employment (percent of wage and salary employment)',
  '03': 'Median hourly wage',
  '04': 'Mean hourly wage',
  '05': 'Annual mean wage',
  '06': 'Median annual wage',
  '07': 'Mean annual wage',
  '08': 'Average hourly wage',
};

export async function fetchBlsSeries(seriesIds) {
  if (!seriesIds.length) return { results: [], retrievedAt: new Date().toISOString() };
  const body = { seriesid: seriesIds.slice(0, 25), startyear: '2023', endyear: '2025' };
  const headers = { 'Content-Type': 'application/json' };
  if (config.bls.key) headers['X-API-KEY'] = config.bls.key;

  let res;
  try {
    res = await fetch(config.bls.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw upstream(`Could not reach the BLS API: ${err.message}`);
  }
  if (!res.ok) {
    throw upstream(`BLS API returned HTTP ${res.status}`);
  }
  const payload = await res.json();
  if (payload.status !== 'REQUEST_SUCCEEDED') {
    throw upstream(`BLS API error: ${(payload.message || []).join('; ') || 'unknown'}`);
  }
  return { results: payload.Results?.series || [], retrievedAt: new Date().toISOString() };
}

/** Turn a BLS series payload into a flat, labelled record. */
export function parseBlsSeries(series, socCode, { areaName = 'United States' } = {}) {
  if (!series || series.status !== 'REQUEST_SUCCEEDED' || !series.data?.length) return null;
  const rows = series.data.map((d) => ({
    year: d.year,
    period: d.period,
    value: d.value,
    footnotes: d.footnotes || [],
  }));
  const latestYear = rows[0]?.year || null;
  const byType = {};
  for (const r of rows) {
    if (r.year !== latestYear) continue;
    byType[r.period] = r;
  }
  const pick = (type) => (byType[type] ? Number(byType[type].value) : null);
  return {
    soc: socCode,
    area: areaName,
    year: latestYear,
    retrievedAt: new Date().toISOString(),
    employment: pick('01'),
    medianHourly: pick('03'),
    meanHourly: pick('04'),
    medianAnnual: pick('06'),
    meanAnnual: pick('07'),
    seriesId: series.seriesID,
    source: {
      name: 'U.S. Bureau of Labor Statistics — Occupational Employment and Wage Statistics',
      url: `https://www.bls.gov/oes/tables/oes_nat.htm`,
      retrievedAt: new Date().toISOString(),
    },
  };
}

/**
 * Fetch wage + employment for a list of SOC codes in one BLS request.
 * Returns a map keyed by SOC code. Partial failures are reported, not hidden.
 */
export async function fetchWagesForSoc(socCodes, options = {}) {
  const codes = [...new Set(socCodes.map((c) => String(c).replace(/\D/g, '').padStart(6, '0')))];
  const ids = codes.map((c) => blsSeriesId(c, options));
  const { results, retrievedAt } = await fetchBlsSeries(ids);
  const out = {};
  const errors = [];
  for (let i = 0; i < codes.length; i += 1) {
    const series = results.find((r) => r.seriesID === ids[i]);
    if (!series) {
      errors.push({ soc: codes[i], message: 'No data returned by BLS' });
      continue;
    }
    const parsed = parseBlsSeries(series, codes[i], options);
    if (!parsed) {
      errors.push({ soc: codes[i], message: 'BLS series had no usable data' });
      continue;
    }
    parsed.retrievedAt = retrievedAt;
    out[codes[i]] = parsed;
  }
  return { data: out, errors, retrievedAt };
}

/* -------------------------------------------------------------- Wikipedia */
export async function wikiSummary(title) {
  const url = new URL(config.wiki.baseUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'extracts|info');
  url.searchParams.set('exintro', '1');
  url.searchParams.set('explaintext', '1');
  url.searchParams.set('inprop', 'url');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('titles', title);
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  } catch (err) {
    throw upstream(`Could not reach Wikipedia: ${err.message}`);
  }
  if (!res.ok) throw upstream(`Wikipedia returned HTTP ${res.status}`);
  const payload = await res.json();
  const pages = payload?.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  return {
    title: page.title,
    extract: (page.extract || '').split('\n')[0].slice(0, 400),
    url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    source: {
      name: 'Wikipedia',
      url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      retrievedAt: new Date().toISOString(),
    },
  };
}
