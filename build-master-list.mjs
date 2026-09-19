#!/usr/bin/env node
/**
 * build-master-list.mjs — one ranked, linked, scored list of every live role.
 *
 * WHY IT EXISTS
 *   On 2026-09-16 I handed him a 238-row shortlist with NO URLs, because I parsed
 *   the scanner's console output instead of the data files that carry the link.
 *   His reply: "you dit give the list bu there are contract jobs as well aslo add
 *   the links to jobs too so ath i cna read and also score th as well ... what
 *   about h old jobs as well which we hdd found the 2000+ plus jobs".
 *   A job list without a URL cannot be applied from. Every row here carries one.
 *
 * SOURCES, all merged and deduped by URL
 *   reports/all-scored-<date>.csv   the 1,412-role pool, already scored, with URLs
 *   data/scan-history.tsv           every job the scanner has ever seen, with URLs
 *   scratchpad aiboards.json        a direct pull of 232 Ashby/Greenhouse boards
 *
 * SCORING — deliberately transparent, and NOT the old fit score.
 *   The old score does not separate outcomes on his own tracker: roles that
 *   progressed average 4.46/5, roles that were rejected average 4.28/5. So this
 *   scores the four things that actually gate an application:
 *     evidence 0-40  does the title match work he can show?
 *     sponsor  0-30  is there a Skilled Worker licence? (the binding constraint)
 *     band     0-20  is it at his level, or does it want 5+ years?
 *     location 0-10  London first, rest of UK second
 *   Every row shows its own breakdown, so he can disagree with a number.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { loadRegisterIndex, loadAliases, matchOne } from './sponsor-mine.mjs';

const SCRATCH = process.argv[2] || '.';
const out = [];

// ── tiny CSV/TSV readers ─────────────────────────────────────────────────────
function csv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// 1. the already-scored pool
for (const f of ['reports/all-scored-2026-09-13.csv']) {
  if (!existsSync(f)) continue;
  for (const r of csv(readFileSync(f, 'utf8'))) {
    if (!r.url) continue;
    out.push({ company: r.company, title: r.title, location: r.location, url: r.url,
      salary: r.salary || '', posted: r.posted || '', source: r.source || 'pool',
      oldBand: r.band || '', oldFit: r.fit || '' });
  }
}
// 2. scan history
if (existsSync('data/scan-history.tsv')) {
  for (const ln of readFileSync('data/scan-history.tsv', 'utf8').split('\n')) {
    const c = ln.split('\t');
    if (c.length < 5 || c[0] === 'url' || !/^https?:/.test(c[0])) continue;
    out.push({ company: c[4] || '', title: c[3] || '', location: '', url: c[0],
      salary: '', posted: c[1] || '', source: c[2] || 'scan', oldBand: '', oldFit: '' });
  }
}
// 3. today's direct board pull
if (existsSync(`${SCRATCH}/aiboards.json`)) {
  for (const r of JSON.parse(readFileSync(`${SCRATCH}/aiboards.json`, 'utf8'))) {
    out.push({ company: r.company, title: r.title, location: r.location, url: r.url,
      salary: r.salary || '', posted: '', source: r.source, oldBand: '', oldFit: '' });
  }
}

// ── dedupe by URL, then by company+title ─────────────────────────────────────
const byUrl = new Map();
for (const r of out) {
  if (!r.url || !r.title) continue;
  const k = r.url.split('?')[0];
  const prev = byUrl.get(k);
  if (!prev) byUrl.set(k, r);
  else for (const f of ['location','salary','posted','oldBand','oldFit','company']) if (!prev[f] && r[f]) prev[f] = r[f];
}
const seen = new Set(); const rows = [];
for (const r of byUrl.values()) {
  const k = (r.company + '|' + r.title).toLowerCase().replace(/\s+/g, ' ').trim();
  if (k === '|' || seen.has(k)) continue;
  seen.add(k); rows.push(r);
}

// ── classify ─────────────────────────────────────────────────────────────────
// Evidence tiers, from what master/bullets.yml can actually back.
const EV1 = /\b(gtm engineer|go-to-market engineer|automation (engineer|analyst|specialist)|data analyst|business analyst|business systems|analytics engineer|implementation (analyst|consultant|specialist)|revenue operations|business operations|operations analyst|data operations|bi (analyst|developer)|business intelligence|reporting analyst|power bi|mi analyst|insight analyst)\b/i;
const EV2 = /\b(solutions? (analyst|consultant|engineer)|technical (operations|support|consultant|analyst)|ai analyst|compliance (analyst|officer|associate)|financial crime|aml|kyc|risk analyst|fraud analyst|integration (analyst|specialist|engineer)|customer success engineer|data quality|data scientist|data engineer|analytics|growth engineer|supply chain analyst|inventory|demand plan|caseworker|onboarding (analyst|specialist))\b/i;
const SENIOR = /\b(senior|sr\.?|staff|principal|lead\b|head of|director|vp\b|chief|manager|architect|research (engineer|scientist)|fellows|expression of interest)\b/i;
const GRAD = /\b(graduate|junior|trainee|entry[- ]level|apprentice|placement)\b/i;
const CLEARANCE = /\b(sc[- ]cleared|sc clearance|dv[- ]cleared|dv clearance|security clearance|nppv)\b/i;
const CONTRACT = /\b(contract|contractor|interim|fixed[- ]term|\bftc\b|\d+\s*month|day rate|per day|daily rate|freelance|temporary|locum|secondment)\b/i;
const AGENCY = /\b(harnham|hays|reed\b|adecco|randstad|robert walters|robert half|michael page|morgan mckinley|sthree|huxley|anson mccade|la fosse|tenth revolution|broadgate|danos|emerald group|cognify|jacobson garner|tria\b|allegis|us tech solutions|\bemr\b|proactive|rockborne|compliance recruitment|lorien|investigo|sanderson|matchtech|salt\b|venturi|client server|nigel frank|oscar technology|spectrum it|computer futures|understanding recruitment|searchability|datatech|xcede|cathcart|gleeson|premier group|corriculo|noir|in technology)\b/i;

// Verified closed by opening the employer's own page on 2026-09-15. They still sit
// in the 09-13 pool, and Arcadis scores 100, so without this they lead the list.
const CLOSED = new Set(['arcadis', 'wates group', 'wates', 'costello medical']);
// Training providers and course sellers, not employers. "No experience required"
// plus a training company name is the tell.
const TRAINING = /\b(newto training|itonlinelearning|just it|nuyew|learning people|training room|skills? academy|bootcamp)\b/i;

const index = loadRegisterIndex(), aliases = loadAliases();
const tracker = existsSync('data/applications.md') ? readFileSync('data/applications.md', 'utf8').toLowerCase() : '';

for (const r of rows) {
  const blob = `${r.title} ${r.salary} ${r.location}`;
  r.contract = CONTRACT.test(blob) ? 'contract' : 'perm';
  r.agency = AGENCY.test(r.company);
  r.clearance = CLEARANCE.test(blob);
  const m = matchOne(r.company, index, aliases);
  r.sponsor = m.verdict; r.entity = m.entity;
  r.london = /london/i.test(`${r.location} ${r.company}`);
  r.touched = r.company.length > 3 && tracker.includes(r.company.toLowerCase());

  const ev = EV1.test(r.title) ? 40 : EV2.test(r.title) ? 25 : 8;
  const sp = r.sponsor === 'YES' ? 30 : r.sponsor === 'CHECK' ? 18 : 0;
  const bd = SENIOR.test(r.title) ? 0 : GRAD.test(r.title) ? 20 : 16;
  const lo = r.london ? 10 : /united kingdom|\bUK\b|england|scotland|wales/i.test(r.location) ? 5 : 3;
  r.ev = ev; r.sp = sp; r.bd = bd; r.lo = lo;
  r.score = ev + sp + bd + lo;
  // Age matters more than anything else on this list: 41% of his applications get
  // no reply at all, and a dead advert is the cheapest way to waste an evening.
  const d = Date.parse(r.posted);
  r.ageDays = Number.isFinite(d) ? Math.round((Date.now() - d) / 864e5) : null;

  r.closed = CLOSED.has(r.company.toLowerCase().trim());
  r.training = TRAINING.test(r.company) || /no experience required/i.test(r.title);

  r.p = (r.closed || r.training) ? 6
    : r.clearance ? 6
    : r.touched ? 5
    : SENIOR.test(r.title) ? 4
    : r.sponsor === 'NOT FOUND' ? 4
    : r.agency ? 3
    : r.score >= 85 ? 1
    : r.score >= 70 ? 2
    : 3;
}
rows.sort((a, b) => a.p - b.p || b.score - a.score || a.company.localeCompare(b.company));

writeFileSync(`${SCRATCH}/master-full.json`, JSON.stringify(rows));
const tally = {}; for (const r of rows) tally[r.p] = (tally[r.p] || 0) + 1;
const ct = rows.filter(r => r.contract === 'contract').length;
console.log(`rows ${rows.length} | with URL ${rows.filter(r => r.url).length} | contract ${ct} | perm ${rows.length - ct}`);
console.log('priority', JSON.stringify(tally));
console.log('sponsor', JSON.stringify(rows.reduce((a, r) => (a[r.sponsor] = (a[r.sponsor] || 0) + 1, a), {})));
