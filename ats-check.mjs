#!/usr/bin/env node
/**
 * ats-check.mjs — does the tailored CV actually answer the job description?
 *
 * Two questions, measured not eyeballed:
 *   1. COVERAGE — of the keywords the advert uses AND he can evidence, how many
 *      appear in the CV text an ATS will parse?
 *   2. HONESTY  — does the CV claim anything the advert asked for that he does
 *      NOT have? That would be a fabrication and is a hard fail.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = `output/tailored-${process.argv[2] || new Date().toISOString().slice(0,10)}`;
const dirs = readdirSync(root).filter(d => statSync(join(root,d)).isDirectory()).sort();

const rows = [];
for (const d of dirs) {
  const p = join(root, d);
  const mrPath = join(p, 'match-report.md');
  const cvPath = join(p, 'cv.md');
  if (!existsSync(mrPath) || !existsSync(cvPath)) continue;
  if (existsSync(join(p, 'DEAD-DO-NOT-APPLY.txt'))) { rows.push({ d, dead: true }); continue; }

  const mr = readFileSync(mrPath, 'utf8');
  const cv = readFileSync(cvPath, 'utf8').toLowerCase();

  // tailor-v2 writes "## Top keywords the advert uses, in priority order" as a numbered
  // list, and "## MISSING" for what the advert asked for and he cannot evidence.
  // Older reports used "## ATS keywords" / "## Asked for"; both shapes are read here.
  const kwBlock = (mr.match(/## (?:Top keywords[^\n]*|ATS keywords[^\n]*)\n([\s\S]*?)(?:\n## |$)/) || [])[1] || '';
  const kws = kwBlock.split('\n')
    .map(l => l.replace(/^\s*(?:-|\d+\.)\s+/, '').trim())
    .filter(l => l && !/none extracted/i.test(l))
    .map(l => l.split(' (')[0].trim());
  const miss = (mr.match(/## (?:MISSING[^\n]*|Asked for[^\n]*)\n([\s\S]*?)(?:\n## |$)/) || [])[1] || '';
  const missing = miss.split('\n')
    .map(l => l.replace(/^\s*(?:-|\d+\.)\s+/, '').trim())
    .filter(l => l && !/nothing (flagged|in the advert)/i.test(l));

  // a keyword counts as covered if its distinctive word appears in the CV
  // Word-boundary matching, NOT substring. "scala" lives inside "escalations",
  // and a substring match once put a psychotherapy qualification on his live
  // LinkedIn profile. Never match a skill name as a bare substring again.
  const has = (hay, needle) => new RegExp('(^|[^a-z0-9])' + needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '([^a-z0-9]|$)', 'i').test(hay);
  const covered = kws.filter(k => {
    const core = k.toLowerCase().replace(/\(.*?\)/g,'').trim();
    if (has(cv, core)) return true;
    return core.split(/\s+/).filter(w => w.length > 4).every(w => has(cv, w));
  });
  // honesty gate: does the CV claim anything from the NOT-HAVE list?
  const fabricated = missing.filter(x => has(cv, x.toLowerCase()));

  const headline = (readFileSync(cvPath,'utf8').match(/^\*\*(.+)\*\*$/m)||[])[1] || '?';
  const title = (mr.match(/^# (.+)$/m)||[])[1] || d;

  rows.push({
    d, title, headline,
    kw: kws.length, cov: covered.length,
    pct: kws.length ? Math.round(covered.length / kws.length * 100) : null,
    gaps: kws.filter(k => !covered.includes(k)),
    fabricated,
  });
}

const live = rows.filter(r => !r.dead);
const withJD = live.filter(r => r.kw > 0);
console.log(`${rows.length} folders | ${rows.filter(r=>r.dead).length} dead | ${withJD.length} with a fetched job description\n`);
console.log(`${'coverage'.padStart(9)}  ${'kw'.padStart(3)}  ${'headline'.padEnd(30)} job`);
for (const r of withJD.sort((a,b)=>a.pct-b.pct)) {
  const flag = r.fabricated.length ? '  *** CLAIMS SOMETHING HE DOES NOT HAVE: ' + r.fabricated.join(', ') : '';
  console.log(`${String(r.pct).padStart(7)}%  ${String(r.cov+'/'+r.kw).padStart(5)}  ${r.headline.slice(0,29).padEnd(30)} ${r.title.slice(0,52)}${flag}`);
}
const avg = Math.round(withJD.reduce((a,r)=>a+r.pct,0)/withJD.length);
console.log(`\naverage coverage: ${avg}%`);
console.log(`CVs claiming something he cannot evidence: ${withJD.filter(r=>r.fabricated.length).length}`);
const noJD = live.filter(r => r.kw === 0);
console.log(`no job description fetched, so UNTAILORED master went out: ${noJD.length}`);
