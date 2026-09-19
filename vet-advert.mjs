#!/usr/bin/env node
/**
 * vet-advert.mjs — the three things that kill an application, read from the advert itself.
 *
 * The scorer works off the GOV.UK sponsor register and the job title. Neither can see:
 *   1. "we do not sponsor" — an employer can hold a licence and still refuse to use it.
 *      British Council did exactly this and ranked #1 in the queue on 9 Sept 2026.
 *   2. a fixed-term contract that runs past Feb 2027, when his right to work ends.
 *   3. a closing date that has already passed.
 *
 * Only the advert body carries these, so every job description must be vetted before
 * a CV is tailored to it, not after.
 *
 * Usage: node vet-advert.mjs <dir-of-tailored-jobs>
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const NO_SPONSOR = /(not able to (support or )?sponsor|cannot sponsor|unable to sponsor|do(es)? not (offer|provide) sponsorship|no sponsorship (is )?(available|offered)|will not sponsor|not in a position to sponsor|sponsorship is not available|we are unable to provide sponsorship)/i;
const WILL_SPONSOR = /(we (can|are able to|do) sponsor|sponsorship (is )?available|visa sponsorship (offered|available)|we offer sponsorship|skilled worker (visa )?sponsorship)/i;
const FIXED_TERM = /(fixed[- ]term|\bFTC\b|\d+\s*(year|month)s?\s*(fixed|contract)|maternity cover|secondment|until (march|april|may|june|july|august|september|october|november|december)\s*20\d\d)/i;
const VISA_END = new Date('2027-02-28');

const root = process.argv[2] || `output/tailored-${new Date().toISOString().slice(0,10)}`;
const rows = [];

for (const d of readdirSync(root)) {
  const p = join(root, d);
  if (!statSync(p).isDirectory()) continue;
  const jd = join(p, 'job-description.txt');
  if (!existsSync(jd)) { rows.push({ d, verdict: 'NO ADVERT TEXT — cannot vet' }); continue; }
  const t = readFileSync(jd, 'utf8');
  const flags = [];
  if (NO_SPONSOR.test(t)) flags.push('WILL NOT SPONSOR');
  else if (WILL_SPONSOR.test(t)) flags.push('says it will sponsor');
  if (FIXED_TERM.test(t)) flags.push('fixed term / contract');
  // a closing date in the past
  const close = t.match(/clos(?:ing|es)[^.]{0,40}?(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(20\d\d)/i);
  if (close) {
    const when = new Date(`${close[1]} ${close[2]} ${close[3]}`);
    if (!isNaN(when)) {
      if (when < new Date()) flags.push(`CLOSED ${close[0].slice(-18)}`);
      else if (when > VISA_END) flags.push('closes after his visa ends');
    }
  }
  rows.push({ d, verdict: flags.length ? flags.join(' + ') : 'clear' });
}

const bad = rows.filter(r => /WILL NOT SPONSOR|CLOSED/.test(r.verdict));
const warn = rows.filter(r => /fixed term/.test(r.verdict));
console.log(`vetted ${rows.length} folders`);
console.log(`\nHARD FAILS (${bad.length}):`);
bad.forEach(r => console.log('  ✗', r.d, '—', r.verdict));
console.log(`\nWARNINGS (${warn.length}):`);
warn.forEach(r => console.log('  ⚠', r.d, '—', r.verdict));
console.log(`\nno advert text, cannot vet: ${rows.filter(r=>/NO ADVERT/.test(r.verdict)).length}`);
