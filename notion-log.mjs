#!/usr/bin/env node

/**
 * notion-log.mjs — write-side sync: applications.md -> Notion "Job Applications" DB.
 *
 * data/applications.md stays the source of truth. This pushes each row into the
 * Notion database as a page, keyed by Company+Role so re-running UPDATES the
 * existing row (status, notes) instead of creating duplicates.
 *
 * Zero new dependencies — uses global fetch (Node >= 18) and a tiny .env loader.
 *
 * Usage:
 *   node notion-log.mjs sync                 # push every row in applications.md
 *   node notion-log.mjs sync --status Applied   # only rows with that status
 *   node notion-log.mjs sync --id 7          # only row #7
 *   node notion-log.mjs sync --dry           # show what would be written, write nothing
 *
 * Importable (for auto-apply.mjs):
 *   import { logApplication } from './notion-log.mjs';
 *   await logApplication({ company, role, score, status, date, url, notes, resumeUsed, coverUsed });
 */

import { readFileSync, existsSync } from 'fs';
import { pathToFileURL } from 'url';

// ── tiny .env loader (no dependency) ──────────────────────────────────────────
function loadEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DB_ID;
const NOTION_VERSION = '2022-06-28';
const MD_PATH = process.env.CAREER_OPS_TRACKER || 'data/applications.md';

const H = {
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
};

// Allowed select options in the DB (must match exactly).
const STATUS_OPTIONS = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded'];
const SOURCE_OPTIONS = ['Indeed', 'LinkedIn', 'Reed', 'Totaljobs', 'CV-Library', 'Career-ops', 'Company', 'Civil-Service', 'NHS', 'Other'];

// ── mappers ───────────────────────────────────────────────────────────────────
function normStatus(raw) {
  if (!raw) return 'Evaluated';
  const s = raw.trim().toLowerCase();
  const direct = STATUS_OPTIONS.find(o => o.toLowerCase() === s);
  if (direct) return direct;
  if (/(submit|applied|sent)/.test(s)) return 'Applied';
  if (/(reject|declin|unsuccess|not selected)/.test(s)) return 'Rejected';
  if (/(respond|replied|response|recruiter)/.test(s)) return 'Responded';
  if (/(interview|screen|call booked)/.test(s)) return 'Interview';
  if (/offer/.test(s)) return 'Offer';
  if (/(discard|drop|not recommend|skip|withdraw)/.test(s)) return 'Discarded';
  if (/(evaluat|review|shortlist)/.test(s)) return 'Evaluated';
  return 'Evaluated';
}

function detectSource(url = '', notes = '') {
  const u = (url + ' ' + notes).toLowerCase();
  if (u.includes('linkedin.com')) return 'LinkedIn';
  if (u.includes('indeed.')) return 'Indeed';
  if (u.includes('reed.co.uk')) return 'Reed';
  if (u.includes('totaljobs')) return 'Totaljobs';
  if (u.includes('cv-library')) return 'CV-Library';
  if (u.includes('jobs.nhs') || u.includes('nhs.uk')) return 'NHS';
  if (u.includes('civilservice') || u.includes('civil-service')) return 'Civil-Service';
  if (u.includes('greenhouse.io') || u.includes('ashbyhq.com') || u.includes('lever.co') || u.includes('workable')) return 'Company';
  return 'Career-ops';
}

function parseScore(raw) {
  if (!raw) return null;
  const m = String(raw).match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function parseDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function extractUrl(notes = '') {
  const m = String(notes).match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[).,]+$/, '') : null;
}

const rt = (s) => (s ? [{ text: { content: String(s).slice(0, 2000) } }] : []);

function toProperties(app) {
  const url = app.url || extractUrl(app.notes);
  const props = {
    Company: { title: rt(app.company || '(unknown)') },
    Role: { rich_text: rt(app.role) },
    Status: { select: { name: normStatus(app.status) } },
    Source: { select: { name: SOURCE_OPTIONS.includes(app.source) ? app.source : detectSource(url, app.notes) } },
    Notes: { rich_text: rt(app.notes) },
  };
  const score = parseScore(app.score);
  if (score !== null) props.Score = { number: score };
  const date = parseDate(app.date);
  if (date) props.Date = { date: { start: date } };
  if (url) props.URL = { url };
  if (app.resumeUsed) props['Resume Used'] = { rich_text: rt(app.resumeUsed) };
  if (app.coverUsed) props['Cover Used'] = { rich_text: rt(app.coverUsed) };
  return props;
}

// ── applications.md parser ────────────────────────────────────────────────────
function parseApplications(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 6) continue;
    if (/^#$/.test(cells[0]) || /^-+$/.test(cells[0])) continue; // header / divider
    if (!/^\d+$/.test(cells[0])) continue;                       // data rows start with a number
    const [num, date, company, role, score, status, pdf, report, notes] = cells;
    rows.push({ num, date, company, role, score, status, pdf, report, notes: notes || '' });
  }
  return rows;
}

// ── Notion API ────────────────────────────────────────────────────────────────
function assertConfig() {
  if (!TOKEN) throw new Error('NOTION_TOKEN missing in .env');
  if (!DB_ID) throw new Error('NOTION_DB_ID missing in .env');
}

async function notion(path, opts = {}) {
  const r = await fetch(`https://api.notion.com/v1/${path}`, { ...opts, headers: H });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Notion ${path} -> ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

const keyOf = (company, role) => `${(company || '').trim().toLowerCase()}::${(role || '').trim().toLowerCase()}`;

// Fetch all existing pages once -> map key -> pageId (so we update, not duplicate).
async function fetchExisting() {
  const map = new Map();
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const j = await notion(`databases/${DB_ID}/query`, { method: 'POST', body: JSON.stringify(body) });
    for (const pg of j.results || []) {
      const company = pg.properties?.Company?.title?.[0]?.plain_text || '';
      const role = pg.properties?.Role?.rich_text?.[0]?.plain_text || '';
      map.set(keyOf(company, role), pg.id);
    }
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return map;
}

async function upsert(app, existing) {
  const props = toProperties(app);
  const k = keyOf(app.company, app.role);
  const pageId = existing?.get(k);
  if (pageId) {
    await notion(`pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
    return 'updated';
  }
  const created = await notion('pages', { method: 'POST', body: JSON.stringify({ parent: { database_id: DB_ID }, properties: props }) });
  existing?.set(k, created.id);
  return 'created';
}

/** Public single-record entry point (for auto-apply.mjs). Never throws — logs and returns. */
export async function logApplication(app) {
  try {
    assertConfig();
    const existing = await fetchExisting();
    const action = await upsert(app, existing);
    console.log(`   📓 Notion: ${action} "${app.company} — ${app.role}"`);
    return action;
  } catch (e) {
    console.log(`   ⚠️  Notion log skipped: ${e.message}`);
    return null;
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'sync';
  if (cmd !== 'sync') {
    console.log('Usage: node notion-log.mjs sync [--status X] [--id N] [--dry]');
    process.exit(1);
  }
  assertConfig();

  const dry = args.includes('--dry');
  const statusFilter = args[args.indexOf('--status') + 1] && args.includes('--status') ? args[args.indexOf('--status') + 1] : null;
  const idFilter = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

  if (!existsSync(MD_PATH)) throw new Error(`${MD_PATH} not found`);
  let rows = parseApplications(readFileSync(MD_PATH, 'utf8'));
  if (statusFilter) rows = rows.filter(r => normStatus(r.status).toLowerCase() === statusFilter.toLowerCase());
  if (idFilter) rows = rows.filter(r => r.num === String(idFilter));

  console.log(`Found ${rows.length} application(s) to sync${dry ? ' (DRY RUN)' : ''}.`);
  if (!rows.length) return;

  if (dry) {
    for (const r of rows) {
      const url = r.url || extractUrl(r.notes);
      console.log(`  #${r.num}  ${r.company} — ${r.role}  [${normStatus(r.status)}]  score=${parseScore(r.score)}  src=${detectSource(url, r.notes)}${url ? '  ' + url : ''}`);
    }
    return;
  }

  const existing = await fetchExisting();
  let created = 0, updated = 0;
  for (const r of rows) {
    const action = await upsert(r, existing);
    action === 'created' ? created++ : updated++;
    console.log(`  ${action === 'created' ? '➕' : '♻️ '} #${r.num}  ${r.company} — ${r.role}  [${normStatus(r.status)}]`);
  }
  console.log(`\n✅ Done — ${created} created, ${updated} updated in Notion.`);
}

// Run as CLI only (not when imported).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
