#!/usr/bin/env node
/**
 * sponsor-mine.mjs — match a list of trading names against the sponsor register.
 *
 * WHY THIS EXISTS
 *   `sponsor-check.mjs` answers "is THIS company licensed?" one name at a time.
 *   Nothing could take a scan's worth of employers and say which of them can
 *   sponsor, so the 143k-row register was never used as a targeting asset —
 *   only as a lookup. His words, 2026-09-16: "i have given you lots of companies
 *   list and all that you have missed lots of compaiens too".
 *
 * WHY THE MATCHING IS STRICT
 *   A loose prefix match built this shortlist first, and it produced:
 *       Legora     -> LEGO Company Ltd
 *       Asana      -> A.S. LIMITED
 *       Snowflake  -> SNOW TECHNOLOGY LTD
 *       Marshmallow-> MA & CO. LTD
 *   Every one of those would have told him a company could sponsor him when it
 *   cannot. That is worse than returning nothing, because he would act on it.
 *   This is the third substring-matching defect in one day (see also the wrong
 *   Capgemini role on 15 Sept and "R" ranking above Power BI in tailor-v2).
 *
 *   So there are exactly three verdicts and no fuzzy middle:
 *     YES       the normalised names are equal once legal suffixes are stripped
 *     CHECK     the trading name is the complete OPENING token run of a licensed
 *               entity ("Snowflake" -> "Snowflake Computing U.K. Limited").
 *               A candidate to confirm by hand, never a confirmation.
 *     NOT FOUND no entry. Often means the licence is under a different legal
 *               name — Ofgem is licensed as "Office of Gas and Electricity
 *               Markets", so searching "Ofgem" returns nothing. Add those to
 *               data/sponsor-aliases.md rather than loosening the matcher.
 *
 * Usage:
 *   node sponsor-mine.mjs --names "Monzo,Snowflake,Legora"
 *   node sponsor-mine.mjs --file <newline-separated-names> [--json]
 *   node sponsor-mine.mjs --self-test
 */
import { readFileSync, existsSync } from 'fs';

const REGISTER = 'data/sponsor-register.csv';
const ALIASES = 'data/sponsor-aliases.md';

const SUFFIX = /\b(limited|ltd|plc|llp|inc|llc|corporation|corp|company|co|group|holdings|uk|technologies|technology)\b/g;

export function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(SUFFIX, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
export const nameKey = s => tokens(s).join('');

// Minimal CSV reader — the register has quoted fields with embedded commas.
function readCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length === head.length)
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export function buildIndex(records) {
  const exact = new Map(), byFirst = new Map();
  for (const r of records) {
    const name = (r['Organisation Name'] || '').trim();
    if (!name) continue;
    const k = nameKey(name);
    if (k) { if (!exact.has(k)) exact.set(k, []); exact.get(k).push(r); }
    const t = tokens(name);
    if (t.length) { if (!byFirst.has(t[0])) byFirst.set(t[0], []); byFirst.get(t[0]).push(r); }
  }
  return { exact, byFirst };
}

const isSW = r => /Skilled Worker/i.test(r.Route || '');

export function matchOne(name, index, aliases = new Map()) {
  const resolved = aliases.get(nameKey(name)) || name;
  const k = nameKey(resolved);
  const hit = index.exact.get(k);
  if (hit) {
    const sw = hit.find(isSW);
    return sw
      ? { verdict: 'YES', entity: (sw['Organisation Name'] || '').trim(), town: (sw['Town/City'] || '').trim() }
      : { verdict: 'OTHER-ROUTE', entity: (hit[0]['Organisation Name'] || '').trim(), town: (hit[0]['Town/City'] || '').trim() };
  }
  // Candidate only: the trading name must be the ENTIRE opening token run of a
  // licensed entity. "snowflake" != "snow", so SNOW TECHNOLOGY LTD cannot match.
  const t = tokens(resolved);
  if (t.length) {
    for (const r of index.byFirst.get(t[0]) || []) {
      const rt = tokens(r['Organisation Name']);
      if (rt.length >= t.length && t.every((x, i) => rt[i] === x) && isSW(r)) {
        return { verdict: 'CHECK', entity: (r['Organisation Name'] || '').trim(), town: (r['Town/City'] || '').trim() };
      }
    }
  }
  return { verdict: 'NOT FOUND', entity: '', town: '' };
}

export function loadAliases(path = ALIASES) {
  const m = new Map();
  if (!existsSync(path)) return m;
  // Rows shaped: | Trading name | Licensed entity | ... |
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const c = line.split('|').map(s => s.trim());
    if (c.length < 4 || !c[1] || /^-+$/.test(c[2]) || /trading/i.test(c[1])) continue;
    m.set(nameKey(c[1]), c[2]);
  }
  return m;
}

export function loadRegisterIndex(path = REGISTER) {
  return buildIndex(readCsv(readFileSync(path, 'utf8')));
}

// ── self-test ────────────────────────────────────────────────────────────────
function selfTest() {
  let pass = 0, fail = 0;
  const t = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
  const idx = buildIndex([
    { 'Organisation Name': 'Synthesia Limited', 'Town/City': 'London', Route: 'Skilled Worker' },
    { 'Organisation Name': 'Snowflake Computing U.K. Limited', 'Town/City': 'London', Route: 'Skilled Worker' },
    { 'Organisation Name': 'SNOW TECHNOLOGY LTD', 'Town/City': 'Leeds', Route: 'Skilled Worker' },
    { 'Organisation Name': 'LEGO Company Ltd', 'Town/City': 'Slough', Route: 'Skilled Worker' },
    { 'Organisation Name': 'MA & CO. LTD', 'Town/City': 'Luton', Route: 'Skilled Worker' },
    { 'Organisation Name': 'Monzo Bank Ltd', 'Town/City': 'London', Route: 'Skilled Worker' },
    { 'Organisation Name': 'Office of Gas and Electricity Markets', 'Town/City': 'London', Route: 'Skilled Worker' },
    { 'Organisation Name': 'Tiny Co', 'Town/City': 'Hull', Route: 'Temporary Worker' },
  ]);
  const v = n => matchOne(n, idx).verdict;

  t('exact match after stripping "Limited"', v('Synthesia') === 'YES');
  t('opening-token-run match is CHECK, not YES', v('Snowflake') === 'CHECK');
  t('Snowflake resolves to Snowflake Computing, not SNOW TECHNOLOGY',
    matchOne('Snowflake', idx).entity === 'Snowflake Computing U.K. Limited');
  // The four false positives the loose matcher produced on 2026-09-16.
  t('Legora does NOT match LEGO', v('Legora') === 'NOT FOUND');
  t('Marshmallow does NOT match MA & CO.', v('Marshmallow Insurance') === 'NOT FOUND');
  t('Monzo matches Monzo Bank', v('Monzo') === 'CHECK');
  t('a non-Skilled-Worker route is not reported as YES', v('Tiny') !== 'YES');
  t('an unlisted name returns NOT FOUND', v('Completely Made Up Plc') === 'NOT FOUND');
  // Ofgem: the alias case that motivated data/sponsor-aliases.md.
  t('"Ofgem" alone is not found', v('Ofgem') === 'NOT FOUND');
  const al = new Map([[nameKey('Ofgem'), 'Office of Gas and Electricity Markets']]);
  t('"Ofgem" resolves through the alias table', matchOne('Ofgem', idx, al).verdict === 'YES');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// Only run the CLI when invoked directly. Importing this module must not exit —
// mkshort and any other caller import matchOne/loadRegisterIndex from here.
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
if (!isMain) { /* imported as a library */ }
else if (args.includes('--self-test')) selfTest();
else runCli();

function runCli() {
const namesArg = flag('names');
const fileArg = flag('file');
if (!namesArg && !fileArg) {
  console.error('usage: node sponsor-mine.mjs --names "A,B" | --file <path> [--json]');
  process.exit(2);
}
const names = namesArg ? namesArg.split(',').map(s => s.trim()).filter(Boolean)
  : readFileSync(fileArg, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);

const index = loadRegisterIndex();
const aliases = loadAliases();
const out = names.map(n => ({ name: n, ...matchOne(n, index, aliases) }));
if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
else for (const r of out) console.log(`${r.verdict.padEnd(10)} ${r.name.padEnd(30)} ${r.entity}`);
}
