#!/usr/bin/env node

/**
 * import-linkedin-apps.mjs — one-shot: pull LinkedIn (and similar) job
 * applications out of the Gmail inboxes and into the career-ops tracker.
 *
 * Many applications are fired off via LinkedIn Easy Apply and never reach
 * data/applications.md. This recovers them: it reads the inbox, extracts
 * {company, role} from the application-confirmation emails, dedups against the
 * tracker, sponsor-checks each company (visa filter), flags recruiters, and
 * writes TSV additions to batch/tracker-additions/ so `merge-tracker.mjs`
 * folds them in (no direct edits to applications.md).
 *
 * Usage:
 *   node import-linkedin-apps.mjs [--days N] [--dry]
 *     --days N   how far back to scan (default 45)
 *     --dry      show what would be imported, write no TSVs
 *
 * After a real run:
 *   node merge-tracker.mjs        # fold the TSVs into data/applications.md
 *   node notion-log.mjs sync      # push to Notion
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { accounts, fetchRecent, fetchBody } from './gmail-sync.mjs';
import { loadRegister, checkSponsor } from './sponsor-check.mjs';

const args = process.argv.slice(2);
const DAYS = Number((args[args.indexOf('--days') + 1]) || 45);
const DRY = args.includes('--dry');
// Body fetches are slow (one IMAP round-trip each). Off by default: roles come
// from the subject line. Pass --bodies to recover roles from "sent to" emails.
const FETCH_BODIES = args.includes('--bodies');
const TRACKER = 'data/applications.md';
const ADD_DIR = 'batch/tracker-additions';

// ── recruiter / non-sponsor heuristic (mirrors the scan filter) ───────────────
const RECRUITER_RE = /(recruit|talent|resourcing|staffing|consult|search ltd|search limited|associates|gravitas|lawrence harvey|space executive|ventula|calyptus|harvey nash|hays|randstad|robert (walters|half)|michael page|sthree|huxley|harnham|nigel wright|mcs group|oliver james|akkodis|morgan mckinley|henderson scott|spencer|reperio|humand|yolk|tria\b|psd group)/i;

// ── subject parsers → {company, role} ─────────────────────────────────────────
function parseSubject(subj) {
  let m;
  // "Your application to {Role} at {Company}"  (also "...to {Role} ID49070 at {Company}")
  if ((m = subj.match(/your application to (.+?)\s+at\s+(.+)$/i)))
    return { role: cleanRole(m[1]), company: cleanCompany(m[2]), needBody: false };
  // "{Name}, your application was sent to {Company}"
  if ((m = subj.match(/your application was sent to (.+)$/i)))
    return { role: null, company: cleanCompany(m[1]), needBody: true };
  // "Your application was viewed by {Company}" — existing app, role unknown
  if ((m = subj.match(/your application was viewed by (.+)$/i)))
    return { role: null, company: cleanCompany(m[1]), needBody: true, viewedOnly: true };
  return null;
}

function cleanCompany(s) {
  return s.split('|')[0]              // drop pipe taglines ("ivee | The job platform...") — also protects the markdown table
          .replace(/[™®]/g, '')
          .replace(/\s+\(.*?\)\s*$/, '').replace(/[:.]\s*$/, '').trim();
}
function cleanRole(s) {
  return s.replace(/\s*\bID\d+\b/i, '').replace(/[™®|]/g, '').replace(/\s+/g, ' ').trim();
}

// Pull a job title out of a LinkedIn "application sent" body when the subject lacks it.
function roleFromBody(parsed) {
  const text = (parsed.text || '').replace(/\r/g, '');
  // LinkedIn bodies usually show the role near "your application" context.
  let m = text.match(/application (?:for|to)\s+(.+?)(?:\s+(?:at|was sent)|\n)/i);
  if (m) return cleanRole(m[1]);
  // Fallback: first analyst/data-ish line.
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.length > 4 && t.length < 90 && /\b(analyst|data|scientist|engineer|business intelligence|\bbi\b|reporting|insight)\b/i.test(t))
      return cleanRole(t);
  }
  return null;
}

// ── tracker dedup keys ────────────────────────────────────────────────────────
function norm(s = '') {
  return s.toLowerCase().replace(/\b(ltd|limited|plc|inc|llc|group|uk|the)\b/g, '')
          .replace(/[^a-z0-9]/g, '').trim();
}
function loadTracker() {
  const keys = new Set();
  let maxNum = 0;
  if (!existsSync(TRACKER)) return { keys, maxNum };
  for (const line of readFileSync(TRACKER, 'utf8').split('\n')) {
    const c = line.split('|').map(s => s.trim());
    if (c.length < 6) continue;
    const num = parseInt(c[1], 10);
    if (!isNaN(num)) maxNum = Math.max(maxNum, num);
    const company = c[3], role = c[4];
    if (!company || company === 'Company' || /^-+$/.test(company)) continue;
    keys.add(norm(company) + '|' + norm(role));
    keys.add(norm(company)); // also block company-only when role unknown
  }
  return { keys, maxNum };
}

function tsvDate(d) { try { return new Date(d).toISOString().slice(0, 10); } catch { return '2026-06-29'; } }

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  const accs = accounts();
  if (!accs.length) { console.error('No inbox credentials in .env.'); process.exit(1); }

  console.log(`Scanning ${accs.length} inbox(es), last ${DAYS}d for application confirmations...\n`);
  const raw = [];
  for (const acc of accs) {
    let msgs; try { msgs = await fetchRecent(acc, DAYS); }
    catch (e) { console.error(`Inbox ${acc.n} failed: ${e.message}`); continue; }
    for (const m of msgs) {
      const p = parseSubject(m.subject || '');
      if (!p || p.viewedOnly) continue;          // skip "viewed by" — not a fresh submission
      let role = p.role;
      if (!role && p.needBody && FETCH_BODIES) {
        const body = await fetchBody(acc, m.uid).catch(() => null);
        if (body) role = roleFromBody(body);
      }
      raw.push({ company: p.company, role: role || '(role unconfirmed)', date: tsvDate(m.date), acc: acc.n });
    }
  }

  // dedup within harvest (company+role) keeping earliest date
  const byKey = new Map();
  for (const r of raw) {
    const k = norm(r.company) + '|' + norm(r.role);
    const prev = byKey.get(k);
    if (!prev || new Date(r.date) < new Date(prev.date)) byKey.set(k, r);
  }

  // dedup against tracker
  const { keys, maxNum } = loadTracker();
  const fresh = [...byKey.values()].filter(r =>
    !keys.has(norm(r.company) + '|' + norm(r.role)) && !keys.has(norm(r.company)));

  if (!fresh.length) { console.log('Nothing new to import — all inbox applications already in the tracker.'); return; }

  // sponsor-check each unique company
  await loadRegister();
  const companies = [...new Set(fresh.map(r => r.company))];
  const sponsorMap = new Map();
  for (const c of companies) {
    try { const res = await checkSponsor(c); sponsorMap.set(c, res); }
    catch { sponsorMap.set(c, { licensed: false }); }
  }

  // build rows
  let num = maxNum;
  const rows = fresh.sort((a, b) => new Date(a.date) - new Date(b.date)).map(r => {
    num += 1;
    const recruiter = RECRUITER_RE.test(r.company);
    const sp = sponsorMap.get(r.company) || {};
    const sponsor = sp.licensed && (sp.skilledWorker !== false);
    const flags = [];
    if (recruiter) flags.push('⚠recruiter/non-direct');
    flags.push(sponsor ? 'Sponsor✓' : 'Sponsor✗');
    const note = `${flags.join(' ')} — imported from LinkedIn email (${r.date})`;
    return { num, ...r, recruiter, sponsor, note };
  });

  // print review table
  console.log(`${rows.length} new application(s) to import:\n`);
  console.log('  #   Date        Sponsor  Type        Company — Role');
  for (const r of rows) {
    const sp = r.sponsor ? '  ✓   ' : '  ✗   ';
    const ty = r.recruiter ? 'recruiter ' : 'direct    ';
    console.log(`  ${String(r.num).padEnd(3)} ${r.date}  ${sp}  ${ty}  ${r.company} — ${r.role}`);
  }
  const sponsoredDirect = rows.filter(r => r.sponsor && !r.recruiter).length;
  console.log(`\n  Sponsor-licensed direct employers: ${sponsoredDirect} / ${rows.length}`);
  console.log(`  Recruiters / non-direct: ${rows.filter(r => r.recruiter).length}`);
  console.log(`  No sponsor licence: ${rows.filter(r => !r.sponsor).length}`);

  if (DRY) { console.log('\nDry run — no TSVs written. Re-run without --dry to import.'); return; }

  // write one TSV per row (status Applied; score/report blank — external apps)
  mkdirSync(ADD_DIR, { recursive: true });
  for (const r of rows) {
    const slug = norm(r.company).slice(0, 24) || 'company';
    // Score is N/A — these are external apps career-ops never scored (verify-pipeline accepts N/A).
    const tsv = [r.num, r.date, r.company, r.role, 'Applied', 'N/A', '❌', '—', r.note].join('\t');
    writeFileSync(`${ADD_DIR}/${r.num}-${slug}-linkedin.tsv`, tsv + '\n');
  }
  console.log(`\n✓ Wrote ${rows.length} TSV addition(s) to ${ADD_DIR}/`);
  console.log('→ Next: node merge-tracker.mjs   then   node notion-log.mjs sync');
})();
