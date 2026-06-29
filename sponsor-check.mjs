#!/usr/bin/env node

/**
 * sponsor-check.mjs — UK visa sponsor-licence checker
 *
 * Cross-checks a company name against the official GOV.UK
 * "Register of Worker and Temporary Worker licensed sponsors".
 * This is the single source of truth for "can this employer sponsor a
 * Skilled Worker visa?" — works for ANY company: Amazon, a 5-person startup,
 * an NHS trust, anything on the register.
 *
 * The register is published as a CSV whose URL changes whenever UKVI updates
 * it (often daily). So we scrape the publications page for the current asset
 * link, download it, and cache locally in data/.
 *
 * Usage:
 *   node sponsor-check.mjs "Amazon UK Services"      # check one company
 *   node sponsor-check.mjs --refresh                 # force re-download the register
 *   node sponsor-check.mjs --refresh "Monzo"         # refresh then check
 *   node sponsor-check.mjs --json "Revolut"          # machine-readable output
 *   node sponsor-check.mjs --stale-days 3 "Wise"     # re-download if cache older than 3 days
 *
 * As a module:
 *   import { checkSponsor, loadRegister } from './sponsor-check.mjs';
 *   const r = await checkSponsor('Monzo Bank');
 *   // r.licensed (bool), r.skilledWorker (bool), r.matches [...]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';

const PUBLICATIONS_URL = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';
const CACHE_CSV   = 'data/sponsor-register.csv';
const CACHE_META  = 'data/sponsor-register.meta.json';
const DEFAULT_STALE_DAYS = 7;
const FETCH_TIMEOUT_MS = 30_000;

// ── HTTP helper ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'User-Agent': 'career-ops sponsor-check', ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Scrape the publications page for the current CSV asset URL. */
export async function resolveCsvUrl() {
  const res = await fetchWithTimeout(PUBLICATIONS_URL);
  if (!res.ok) throw new Error(`publications page HTTP ${res.status}`);
  const html = await res.text();
  // The CSV lives on assets.publishing.service.gov.uk and ends in .csv
  const m = html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^\s"']+?\.csv/i);
  if (!m) throw new Error('could not find CSV link on publications page');
  return m[0];
}

/** Download + cache the register. Returns { url, rows, updated }. */
export async function refreshRegister() {
  mkdirSync('data', { recursive: true });
  const url = await resolveCsvUrl();
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`CSV download HTTP ${res.status}`);
  const csv = await res.text();
  writeFileSync(CACHE_CSV, csv, 'utf-8');
  // Try to lift the YYYY-MM-DD date embedded in the asset filename
  const dateInName = (url.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const meta = { url, fetchedAtUnix: Math.floor(statSync(CACHE_CSV).mtimeMs / 1000), registerDate: dateInName };
  writeFileSync(CACHE_META, JSON.stringify(meta, null, 2), 'utf-8');
  return { url, rows: csv.split(/\r?\n/).length - 1, updated: dateInName };
}

function cacheAgeDays() {
  if (!existsSync(CACHE_CSV)) return Infinity;
  const ageMs = Date.now() - statSync(CACHE_CSV).mtimeMs;
  return ageMs / 86_400_000;
}

// ── CSV parsing ────────────────────────────────────────────────────────────
// Columns: Organisation Name, Town/City, County, Type & Rating, Route

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

let _register = null;

/** Load (and download if missing/stale) the register into memory. */
export async function loadRegister({ staleDays = DEFAULT_STALE_DAYS, refresh = false } = {}) {
  if (refresh || cacheAgeDays() > staleDays) await refreshRegister();
  if (_register) return _register;
  const csv = readFileSync(CACHE_CSV, 'utf-8');
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  lines.shift(); // header
  _register = lines.map((line) => {
    const [name, town, county, rating, route] = parseCsvLine(line);
    return { name, town, county, rating, route, key: normalize(name) };
  });
  return _register;
}

// ── Name normalization + matching ──────────────────────────────────────────

// Strip ONLY true legal-entity suffixes + country tags. Descriptive words
// (group, services, global, technology…) are kept — stripping them collapses
// many distinct firms to the same/empty key and causes false matches.
const SUFFIXES = /\b(ltd|limited|plc|llp|llc|inc|incorporated|company|co|holdings?|uk|gb)\b/g;

export function normalize(name = '') {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,/#!$%^*;:{}=\-_`~()'"]/g, ' ')
    .replace(/^\s*the\s+/, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check a company against the register.
 * Returns { company, licensed, skilledWorker, matches:[{name,town,rating,route}], confidence }.
 */
export async function checkSponsor(company, opts = {}) {
  const reg = await loadRegister(opts);
  const key = normalize(company);
  if (!key) return { company, licensed: false, skilledWorker: false, matches: [], confidence: 'none' };

  const qTokens = key.split(' ').filter(Boolean);

  // 1) exact normalized match
  let hits = reg.filter((r) => r.key && r.key === key);
  let confidence = hits.length ? 'exact' : 'none';

  // 2) word-boundary prefix either direction (e.g. "monzo" → "monzo bank").
  //    Guard against empty register keys and partial-word matches.
  if (!hits.length) {
    hits = reg.filter((r) =>
      r.key && (r.key.startsWith(`${key} `) || key.startsWith(`${r.key} `)));
    if (hits.length) confidence = 'strong';
  }

  // 3) all query tokens present in the entry — multi-word names only (>=2 tokens),
  //    so a single common word can't sweep in unrelated firms.
  if (!hits.length && qTokens.length >= 2) {
    hits = reg.filter((r) => {
      if (!r.key) return false;
      const rTokens = new Set(r.key.split(' '));
      return qTokens.every((t) => rTokens.has(t));
    });
    if (hits.length) confidence = 'likely';
  }

  // De-dup display rows (same org appears once per route/rating)
  const seen = new Set();
  const matches = [];
  for (const h of hits) {
    const id = `${h.name}|${h.rating}|${h.route}`;
    if (seen.has(id)) continue;
    seen.add(id);
    matches.push({ name: h.name, town: h.town, rating: h.rating, route: h.route });
  }

  const skilledWorker = matches.some((m) => /skilled worker/i.test(m.route));
  return { company, licensed: matches.length > 0, skilledWorker, matches, confidence };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function isMain() {
  return import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sponsor-check.mjs');
}

if (isMain()) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const refresh = args.includes('--refresh');
  const staleIdx = args.indexOf('--stale-days');
  const staleDays = staleIdx >= 0 ? Number(args[staleIdx + 1]) : DEFAULT_STALE_DAYS;
  const company = args.filter((a, i) => !a.startsWith('--') && !(staleIdx >= 0 && i === staleIdx + 1)).join(' ').trim();

  try {
    if (refresh) {
      const r = await refreshRegister();
      if (!json) console.error(`✅ Register refreshed: ${r.rows.toLocaleString()} sponsors (dated ${r.updated || '?'})`);
    }
    if (!company) {
      if (!refresh) {
        console.error('Usage: node sponsor-check.mjs [--refresh] [--json] "Company Name"');
        process.exit(1);
      }
      process.exit(0);
    }

    const result = await checkSponsor(company, { staleDays, refresh: false });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (!result.licensed) {
        console.log(`❌ "${company}" — NOT found on the licensed-sponsor register.`);
        console.log('   (No Skilled Worker sponsorship. OK for income-now on Graduate Route, but it will NOT convert past Feb 2027.)');
      } else {
        const sw = result.skilledWorker ? '✅ Skilled Worker sponsor' : '⚠ Licensed, but NOT for the Skilled Worker route';
        console.log(`${result.skilledWorker ? '✅' : '⚠'} "${company}" — ${sw}  (match confidence: ${result.confidence})`);
        for (const m of result.matches.slice(0, 8)) {
          console.log(`   • ${m.name}${m.town ? ` (${m.town})` : ''} — ${m.rating} — ${m.route}`);
        }
        if (result.matches.length > 8) console.log(`   …and ${result.matches.length - 8} more entries`);
      }
    }
  } catch (err) {
    if (json) console.log(JSON.stringify({ company, error: err.message }));
    else console.error(`⚠ sponsor-check failed: ${err.message}`);
    process.exit(2);
  }
}
