#!/usr/bin/env node

/**
 * scan-uk.mjs — UK job board scanner
 *
 * Sources:
 *   - Reed API        (requires REED_API_KEY in .env)
 *   - Adzuna API      (requires ADZUNA_APP_ID + ADZUNA_APP_KEY in .env)
 *   - Indeed UK RSS   (no key needed — unofficial but legal RSS feed)
 *
 * Deduplicates against scan-history.tsv and pipeline.md.
 * Appends new offers to data/pipeline.md and data/scan-history.tsv.
 *
 * Usage:
 *   node scan-uk.mjs                    # scan all sources
 *   node scan-uk.mjs --dry-run          # preview without writing files
 *   node scan-uk.mjs --source reed      # single source (reed | adzuna)
 *   node scan-uk.mjs --min-salary 35000 # override minimum salary
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { classifyLiveness } from './liveness-core.mjs';

// ── Load .env ────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!existsSync('.env')) return;
  const lines = readFileSync('.env', 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}
loadEnv();

// ── Config ───────────────────────────────────────────────────────────────────

const REED_API_KEY    = process.env.REED_API_KEY;
const ADZUNA_APP_ID   = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY  = process.env.ADZUNA_APP_KEY;

const SCAN_HISTORY_PATH  = 'data/scan-history.tsv';
const PIPELINE_PATH      = 'data/pipeline.md';
const APPLICATIONS_PATH  = 'data/applications.md';
const FETCH_TIMEOUT_MS   = 15_000;

mkdirSync('data', { recursive: true });

// the candidate's target role keywords — drives all three API searches
const ROLE_KEYWORDS = [
  'data analyst',
  'business analyst',
  'power bi analyst',
  'bi analyst',
  'data scientist',
  'sql analyst',
  'reporting analyst',
  'insight analyst',
  'analytics engineer',
  'mi analyst',
];

// Title filter — applied after fetching, before dedup
const POSITIVE = [
  'data analyst', 'business analyst', 'power bi', 'bi analyst',
  'data scientist', 'sql analyst', 'reporting analyst', 'insight analyst',
  'analytics analyst', 'tableau analyst', 'analytics engineer',
  'mi analyst', 'management information', 'data and insight',
  'research analyst', 'commercial analyst', 'marketing analyst',
  'operations analyst', 'decision scientist', 'product analyst',
  'customer insight', 'people analyst', 'workforce analyst',
  'data engineer',
];

const NEGATIVE = [
  'intern', 'apprentice', '.net', 'java developer', 'php developer',
  'ruby', 'embedded', 'firmware', 'blockchain', 'web3',
  'salesforce admin', 'cobol', 'mainframe', 'network engineer',
  'devops engineer', 'security analyst', 'credit risk analyst',
];

function titleMatches(title) {
  const t = title.toLowerCase();
  return POSITIVE.some(k => t.includes(k)) && !NEGATIVE.some(k => t.includes(k));
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Reed API ─────────────────────────────────────────────────────────────────
// Docs: https://www.reed.co.uk/developers/jobseeker
// Auth: HTTP Basic with API key as username, empty password

async function scanReed(minSalary) {
  if (!REED_API_KEY) {
    console.warn('  ⚠ REED_API_KEY not set — skipping Reed');
    return [];
  }

  const auth = Buffer.from(`${REED_API_KEY}:`).toString('base64');
  const results = [];

  for (const keyword of ROLE_KEYWORDS) {
    try {
      const url = new URL('https://www.reed.co.uk/api/1.0/search');
      url.searchParams.set('keywords', keyword);
      url.searchParams.set('locationName', 'United Kingdom');
      url.searchParams.set('minimumSalary', String(minSalary));
      url.searchParams.set('resultsToTake', '100');

      const res = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Basic ${auth}` },
      });

      if (!res.ok) {
        console.warn(`  ⚠ Reed "${keyword}": HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const job of data.results || []) {
        const salaryMin = job.minimumSalary;
        const salaryMax = job.maximumSalary;
        results.push({
          title:      job.jobTitle || '',
          url:        `https://www.reed.co.uk/jobs/${job.jobId}`,
          company:    job.employerName || 'Unknown',
          location:   job.locationName || 'UK',
          salary:     salaryMin ? `£${salaryMin.toLocaleString()}–£${salaryMax?.toLocaleString() || '?'}` : 'Not stated',
          source:     'reed-api',
          posted:     job.date || '',
        });
      }
    } catch (err) {
      console.warn(`  ⚠ Reed "${keyword}": ${err.message}`);
    }
  }

  return results;
}

// ── Adzuna API ───────────────────────────────────────────────────────────────
// Docs: https://developer.adzuna.com/docs/search
// Aggregates: Indeed, Totaljobs, CV-Library, Guardian Jobs, Monster, CWJobs + more
// Requires BOTH app_id AND app_key from your Adzuna dashboard

async function scanAdzuna(minSalary) {
  if (!ADZUNA_APP_ID || ADZUNA_APP_ID === 'REPLACE_WITH_YOUR_ADZUNA_APP_ID') {
    console.warn('  ⚠ ADZUNA_APP_ID not set — skipping Adzuna (check .env for instructions)');
    return [];
  }
  if (!ADZUNA_APP_KEY) {
    console.warn('  ⚠ ADZUNA_APP_KEY not set — skipping Adzuna');
    return [];
  }

  const results = [];

  for (const keyword of ROLE_KEYWORDS) {
    try {
      const url = new URL('https://api.adzuna.com/v1/api/jobs/gb/search/1');
      url.searchParams.set('app_id',          ADZUNA_APP_ID);
      url.searchParams.set('app_key',         ADZUNA_APP_KEY);
      url.searchParams.set('what',            keyword);
      // No 'where' param — /gb/ endpoint already scopes to UK nationwide
      url.searchParams.set('salary_min',      String(minSalary));
      url.searchParams.set('results_per_page','50');
      url.searchParams.set('sort_by',         'date');

      const res = await fetchWithTimeout(url.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`  ⚠ Adzuna "${keyword}": HTTP ${res.status} — ${body.slice(0, 120)}`);
        continue;
      }

      const data = await res.json();
      if (!data.results) {
        console.warn(`  ⚠ Adzuna "${keyword}": unexpected response — ${JSON.stringify(data).slice(0, 120)}`);
        continue;
      }
      for (const job of data.results) {
        const sMin = job.salary_min;
        const sMax = job.salary_max;
        results.push({
          title:    job.title || '',
          url:      job.redirect_url || '',
          company:  job.company?.display_name || 'Unknown',
          location: job.location?.display_name || 'UK',
          salary:   sMin ? `£${Math.round(sMin).toLocaleString()}–£${Math.round(sMax || sMin).toLocaleString()}` : 'Not stated',
          source:   'adzuna-api',
          posted:   job.created || '',
        });
      }
    } catch (err) {
      console.warn(`  ⚠ Adzuna "${keyword}": ${err.message}`);
    }
  }

  return results;
}

// ── NHS Jobs API ───────────────────────────────────────────────────────────
// Public XML feed: https://www.jobs.nhs.uk/api/v1/search_xml?keyword=...&language=en
// NHS trusts are licensed Skilled Worker sponsors and routinely pay £39k–£56k for
// analyst/BI roles — squarely in the candidate's sponsorship-eligible band. The feed
// includes a closeDate, so we drop already-expired postings at scan time.

const NHS_KEYWORDS = [
  'data analyst',
  'business intelligence',
  'information analyst',
  'data scientist',
  'bi developer',
  'informatics analyst',
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
}

function xmlTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1].trim()) : '';
}

// "£49387.00 to £56515.00" / "£39,959 to £48,117" → first integer
function parseNhsSalaryMin(s) {
  const m = s.replace(/,/g, '').match(/£?\s*([0-9]+(?:\.[0-9]+)?)/);
  return m ? Math.round(Number(m[1])) : null;
}

async function scanNHS(minSalary) {
  const results = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const keyword of NHS_KEYWORDS) {
    try {
      const url = new URL('https://www.jobs.nhs.uk/api/v1/search_xml');
      url.searchParams.set('keyword', keyword);
      url.searchParams.set('language', 'en');

      const res = await fetchWithTimeout(url.toString(), {
        headers: { 'User-Agent': 'career-ops', Accept: 'application/xml' },
      });
      if (!res.ok) {
        console.warn(`  ⚠ NHS "${keyword}": HTTP ${res.status}`);
        continue;
      }

      const xml = await res.text();
      for (const block of xml.match(/<vacancyDetails>[\s\S]*?<\/vacancyDetails>/g) || []) {
        const title     = xmlTag(block, 'title');
        const jobUrl    = xmlTag(block, 'url');
        const employer  = xmlTag(block, 'employer') || 'NHS';
        const salaryRaw = xmlTag(block, 'salary');
        const closeDate = xmlTag(block, 'closeDate');
        const location  = xmlTag(block, 'location') || 'UK';
        const postDate  = xmlTag(block, 'postDate');
        if (!title || !jobUrl) continue;

        // Liveness at scan time: drop postings whose close date has passed.
        if (closeDate && closeDate < today) continue;

        const salMin = parseNhsSalaryMin(salaryRaw);
        if (salMin !== null && salMin < minSalary) continue;

        results.push({
          title,
          url:      jobUrl,
          company:  employer,
          location,
          salary:   salaryRaw || 'Not stated',
          source:   'nhs-api',
          posted:   postDate ? postDate.slice(0, 10) : '',
          closeDate,
        });
      }
    } catch (err) {
      console.warn(`  ⚠ NHS "${keyword}": ${err.message}`);
    }
  }

  return results;
}

// ── Indeed ───────────────────────────────────────────────────────────────────
// Indeed discontinued public RSS feeds in 2025 (403/404 responses).
// Indeed jobs are covered by Adzuna (which aggregates Indeed UK listings).
// No separate Indeed scanner needed.

// ── Liveness cross-check (zero-token, HTTP-level) ───────────────────────────
// Cross-checks each new offer URL with a plain fetch before it reaches the
// inbox, using the same classifier as scan --verify / check-liveness.mjs.
// HARD-expired (404/410, "no longer available" banners) → dropped.
// uncertain / anti-bot / network error → KEPT (fail-open; deep-verify at
// evaluation time with Playwright). NHS offers are skipped — already filtered
// by closeDate at fetch time.

async function verifyLive(offer) {
  try {
    const res = await fetchWithTimeout(offer.url, { redirect: 'follow' });
    const body = await res.text().catch(() => '');
    const verdict = classifyLiveness({
      status: res.status,
      finalUrl: res.url || offer.url,
      bodyText: body.replace(/<[^>]+>/g, ' ').slice(0, 20000),
      applyControls: [],
    });
    return verdict.result !== 'expired'; // keep active + uncertain
  } catch {
    return true; // network error → fail-open, keep and deep-verify later
  }
}

async function verifyOffers(offers, concurrency = 5) {
  const kept = [];
  let dropped = 0;
  const queue = [...offers];
  async function worker() {
    while (queue.length) {
      const offer = queue.shift();
      if (offer.source === 'nhs-api') { kept.push(offer); continue; }
      if (await verifyLive(offer)) kept.push(offer);
      else { dropped++; process.stdout.write('✗'); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { kept, dropped };
}

// ── Deduplication ────────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    for (const m of readFileSync(PIPELINE_PATH, 'utf-8').matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }

  if (existsSync(APPLICATIONS_PATH)) {
    for (const m of readFileSync(APPLICATIONS_PATH, 'utf-8').matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }

  return seen;
}

// ── Writers ──────────────────────────────────────────────────────────────────

function ensurePipeline() {
  if (!existsSync(PIPELINE_PATH)) {
    writeFileSync(PIPELINE_PATH,
      '# Pipeline\n\n## Pending\n\n## Processed\n',
      'utf-8'
    );
  }
}

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  ensurePipeline();

  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker   = '## Pending';
  const idx      = text.indexOf(marker);

  if (idx === -1) {
    // No Pending section — prepend one
    text = `## Pending\n\n${offers.map(fmt).join('\n')}\n\n` + text;
  } else {
    const after = idx + marker.length;
    const next  = text.indexOf('\n## ', after);
    const ins   = next === -1 ? text.length : next;
    text = text.slice(0, ins) + '\n' + offers.map(fmt).join('\n') + '\n' + text.slice(ins);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function fmt(o) {
  return `- [ ] ${o.url} | ${o.company} | ${o.title} | ${o.location} | ${o.salary}`;
}

function appendToHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH,
      'url\tfirst_seen\tsource\ttitle\tcompany\tstatus\n',
      'utf-8'
    );
  }
  appendFileSync(
    SCAN_HISTORY_PATH,
    offers.map(o => `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`).join('\n') + '\n',
    'utf-8'
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args      = process.argv.slice(2);
  const dryRun    = args.includes('--dry-run');
  const srcIdx    = args.indexOf('--source');
  const onlySource = srcIdx !== -1 ? args[srcIdx + 1] : null;
  const salaryIdx = args.indexOf('--min-salary');
  const minSalary = salaryIdx !== -1 ? Number(args[salaryIdx + 1]) : 30000;
  const noVerify  = args.includes('--no-verify'); // liveness cross-check is ON by default

  const date = new Date().toISOString().slice(0, 10);

  console.log('');
  console.log('  career-ops — UK Job Scanner');
  console.log('  ═══════════════════════════════════════════');
  console.log(`  Date:          ${date}`);
  console.log(`  Min salary:    £${minSalary.toLocaleString()}`);
  console.log(`  Sources:       ${onlySource || 'reed + adzuna + nhs'}`);
  if (dryRun) console.log('  Mode:          DRY RUN (no files written)');
  console.log('');

  // Run scanners in parallel
  const scanners = {
    reed:   () => scanReed(minSalary),
    adzuna: () => scanAdzuna(minSalary),
    nhs:    () => scanNHS(minSalary),
  };

  const toRun = onlySource
    ? { [onlySource]: scanners[onlySource] }
    : scanners;

  const rawBySource = {};
  await Promise.all(
    Object.entries(toRun).map(async ([name, fn]) => {
      if (!fn) { console.error(`  Unknown source: ${name}`); return; }
      process.stdout.write(`  Scanning ${name.padEnd(8)}`);
      const raw = await fn();
      rawBySource[name] = raw;
      console.log(`→ ${raw.length} raw results`);
    })
  );

  const allRaw = Object.values(rawBySource).flat();

  // Filter + dedup
  const seenUrls     = loadSeenUrls();
  const seenThisScan = new Set();
  const newOffers    = [];
  let   filteredOut  = 0;
  let   dupes        = 0;

  for (const offer of allRaw) {
    if (!offer.url || !offer.title) continue;

    if (!titleMatches(offer.title)) { filteredOut++; continue; }

    // Normalize URL — strip tracking params for dedup
    const baseUrl = offer.url.split('?')[0].replace(/\/$/, '');
    if (seenUrls.has(offer.url) || seenUrls.has(baseUrl)) { dupes++; continue; }
    if (seenInThisScan(seenThisScan, baseUrl))            { dupes++; continue; }

    seenThisScan.add(baseUrl);
    seenUrls.add(offer.url);
    newOffers.push(offer);
  }

  // Liveness cross-check (drops dead links before they reach the inbox)
  let liveOffers = newOffers;
  let deadDropped = 0;
  if (!noVerify && newOffers.length > 0) {
    process.stdout.write(`  Verifying ${newOffers.length} live `);
    const { kept, dropped } = await verifyOffers(newOffers);
    liveOffers = kept;
    deadDropped = dropped;
    console.log(` → ${dropped} dead dropped`);
  }

  // Summary
  console.log('');
  console.log('  ───────────────────────────────────────────');
  console.log(`  Total raw:     ${allRaw.length}`);
  console.log(`  Filtered out:  ${filteredOut} (title mismatch)`);
  console.log(`  Duplicates:    ${dupes} (already seen)`);
  console.log(`  Dead dropped:  ${deadDropped} (expired/404)`);
  console.log(`  New offers:    ${liveOffers.length}`);
  console.log('');

  if (liveOffers.length > 0) {
    console.log('  New offers found:');
    for (const o of liveOffers) {
      const src = `[${o.source}]`.padEnd(14);
      console.log(`    + ${src} ${o.company} — ${o.title} | ${o.location} | ${o.salary}`);
    }
    console.log('');
  }

  if (!dryRun && liveOffers.length > 0) {
    appendToPipeline(liveOffers);
    appendToHistory(liveOffers, date);
    console.log(`  Saved to: ${PIPELINE_PATH}`);
    console.log(`            ${SCAN_HISTORY_PATH}`);
    console.log('');
    console.log('  Next step: run /career-ops pipeline to evaluate all new offers.');
  } else if (dryRun) {
    console.log('  Dry run — no files written.');
  } else {
    console.log('  No new offers. Pipeline is up to date.');
  }

  console.log('');
}

function seenInThisScan(set, url) {
  if (set.has(url)) return true;
  // Also check Reed job ID variants (reed.co.uk/jobs/12345 vs /jobs/12345-title)
  const idMatch = url.match(/\/jobs\/(\d+)/);
  if (idMatch) {
    for (const s of set) {
      if (s.includes(`/jobs/${idMatch[1]}`)) return true;
    }
  }
  return false;
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
