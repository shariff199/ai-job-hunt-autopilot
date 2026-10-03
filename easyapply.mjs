#!/usr/bin/env node
/**
 * easyapply.mjs — one LinkedIn Easy Apply per command, through the LinkedIn Chrome on port 9555
 * (./launch-linkedin-chrome.sh; you log in once). Built because driving each form step by step
 * from an AI session cost thousands of tokens per application.
 *
 * Setup: copy config/easyapply-answers.example.json to config/easyapply-answers.json and fill it
 * in (phone, postcode, salary, education mapping, ...). The answers are injected into the page as
 * window.__A before scripts/easyapply-helpers.js runs; the helpers hold no personal data.
 *
 *   node easyapply.mjs --id <linkedin job id> --company "X" --title "Y"   → tailors the CV (tailor-v2 --lean),
 *        opens the job, fills every page from the answer rules in scripts/easyapply-helpers.js, uploads
 *        the CV, optionally swaps the Work Experience description, fixes education rows, and STOPS at
 *        Review, printing it.
 *   node easyapply.mjs --id <id> --submit   → presses Submit on the Review page (only after your yes).
 *
 * Exit 0 = at Review (or submitted), 2 = a question it has no rule for (printed; add a rule and re-run),
 * 3 = not Easy Apply / closed / already applied, 4 = not logged in.
 * It never submits without --submit, and --submit refuses unless the dialog is on Review for that company.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc, []));
if (!a.id) { console.error('usage: node easyapply.mjs --id <job id> --company "X" --title "Y" [--submit]'); process.exit(1); }
const ANSWERS_PATH = new URL('./config/easyapply-answers.json', import.meta.url).pathname;
if (!existsSync(ANSWERS_PATH)) { console.error('config/easyapply-answers.json not found: copy config/easyapply-answers.example.json and fill it in.'); process.exit(1); }
const ANSWERS = JSON.parse(readFileSync(ANSWERS_PATH, 'utf8'));
const HELPERS = `window.__A = ${JSON.stringify(ANSWERS)};\n` + readFileSync(new URL('./scripts/easyapply-helpers.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.connectOverCDP('http://127.0.0.1:9555');
const ctx = b.contexts()[0];
let p = ctx.pages().find(x => x.url().includes(`/jobs/view/${a.id}`)) || await ctx.newPage();
const inject = () => p.evaluate(HELPERS);
const done = (code, msg) => { console.log(msg); b.close().catch(() => {}); process.exit(code); };

if (a.submit) {
  await inject();
  const company = (a.company || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const r = await p.evaluate(async ([c]) => { const d = __dlg(); if (!d || !/Review your application/.test(d.innerText) || (c && !new RegExp(c, 'i').test(d.innerText))) return 'ABORT: not on the Review page' + (c ? ' for ' + c : '');
    const s = [...d.querySelectorAll('button')].find(x => /^Submit application$/i.test(x.innerText.trim())); if (!s) return 'ABORT: no Submit button'; s.click(); await new Promise(r => setTimeout(r, 4000));
    return /application was sent|Application sent|applied/i.test(document.body.innerText) ? 'SUBMITTED' : 'clicked Submit; check the page'; }, [company]);
  done(/SUBMITTED|clicked/.test(r) ? 0 : 1, r);
}

// 1. tailored CV
let cvPath = a.cv;
if (!cvPath) {
  const short = (a.company || 'job').replace(/[^A-Za-z0-9]+/g, '');
  const out = execFileSync(new URL('./scripts/mkcv.sh', import.meta.url).pathname, [a.id, a.company || 'Company', a.title || 'Data Analyst', short], { encoding: 'utf8' }).trim().split('\n').pop();
  cvPath = (out.match(/^(.*\.pdf) pages/) || [, out.split(' ')[0]])[1]; console.log('CV:', out);
  if (!/pages 1$/.test(out)) console.log('WARNING: CV is not one page');
}
const cvName = cvPath.split('/').pop().replace(/\.pdf$/, '');

// 2. open job, open Easy Apply
await p.goto(`https://www.linkedin.com/jobs/view/${a.id}/`, { waitUntil: 'domcontentloaded' }); await sleep(4000);
const body = await p.evaluate(() => document.body.innerText);
if (/Sign in|Join now/.test(body.slice(0, 600)) && !/Messaging/.test(body.slice(0, 2000))) done(4, 'NOT LOGGED IN: log into LinkedIn in the port-9555 Chrome once');
if (/No longer accepting|not currently accepting/i.test(body)) done(3, 'CLOSED');
if (/Applied \d|Application submitted/i.test(body)) done(3, 'ALREADY APPLIED');
const ea = p.locator('button:visible').filter({ hasText: /^\s*Easy Apply\s*$/ }).first();
if (!(await ea.count())) done(3, 'NOT EASY APPLY (external apply)');
for (let i = 0; i < 3 && !(await p.locator('dialog[open], dialog').count()); i++) { await ea.click().catch(() => {}); await sleep(3000); }
await inject();

// 3. walk the pages
for (let guard = 0; guard < 14; guard++) {
  const s = await p.evaluate(() => __step());
  if (/^RESUME PAGE/.test(s)) {
    const btn = p.locator('dialog button').filter({ hasText: /Upload resume/i }).first();
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null), btn.click().catch(() => {})]);
    if (fc) await fc.setFiles(cvPath); else { const inp = p.locator('dialog input[type=file]').first(); if (await inp.count()) await inp.setInputFiles(cvPath); }
    await sleep(3500);
    const picked = await p.evaluate(n => { const r = __pickCV(n); window.__cvdone = true; return r; }, cvName);
    console.log('resume:', picked); continue;
  }
  if (/^(NEXT OK|EDU)/.test(s)) { console.log(s.split('\n')[0].slice(0, 120)); continue; }
  if (/^AT REVIEW/.test(s)) {
    const rev = await p.evaluate(() => __review());
    console.log('\n===== REVIEW (not submitted) =====\n' + rev + '\n===== end =====');
    console.log(`\nTo send after your yes: node easyapply.mjs --id ${a.id} --company "${a.company || ''}" --submit`);
    done(0, 'AT REVIEW');
  }
  done(2, 'NEEDS A RULE / HUMAN:\n' + s);
}
done(2, 'gave up after 14 steps');
