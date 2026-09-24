#!/usr/bin/env node
/**
 * workday-apply.mjs — fill a Workday application from a standing profile, in ONE call.
 *
 * WHY: Accenture on 21 Sept 2026 took ~60 exploratory model calls to fill two steps,
 * each re-reading a 200k-token conversation. Every widget quirk found that day is
 * encoded here so the next Workday form is one command and a short printout.
 *
 * Usage (a Chrome with remote debugging on port 9444 must be running, signed in to the
 * Workday tenant; start one with:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9444 --user-data-dir=$HOME/.chrome-apply)
 *   node workday-apply.mjs --match <url-substring> --files cv.pdf,cover.pdf
 *   node workday-apply.mjs --job <advert url> --files cv.pdf,cover.pdf
 *        [--profile config/workday-profile.json] [--steps 3] [--port 9444]
 *
 * Standing answers live in config/workday-profile.json (gitignored). Copy
 * config/workday-profile.example.json and fill it in.
 *
 * It fills the step it finds, advances with workday-kit's advance() (which refuses
 * any footer button that reads Submit), and STOPS at: Review, a step it has no
 * answers for, or any required field it could not fill. It never submits.
 *
 * Facts learned 21 Sept (Accenture tenant, likely all Workday):
 *   - Multiselects may have NO data-automation-id="searchBox"; use the formField's input.
 *   - NEVER press Meta+A inside a multiselect: it selected 18 skills at once.
 *     Clear with Backspace per character.
 *   - Enter on a search that returns one strong match can auto-select the wrong
 *     school (a former name of a merged university, say). Always read the pill after.
 *   - Options carry data-automation-label; click by that, never by coordinate.
 *   - If your university isn't in the tenant's school list, pick "Other" (give it
 *     as the fallback in the profile). The same goes for a field of study that is
 *     missing: give the nearest listed one ("Data Science" -> "Data Analytics").
 *   - Year-only dates (education) are dateSectionYear-input; focus + type.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import * as wd from './workday-kit.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1]]] : a, []));
const profilePath = args.profile || new URL('./config/workday-profile.json', import.meta.url).pathname;
if (!existsSync(profilePath)) {
  console.error(`${profilePath} not found. Copy config/workday-profile.example.json to config/workday-profile.json and fill it in.`);
  process.exit(1);
}
const P = JSON.parse(readFileSync(profilePath, 'utf8'));
const maxSteps = Number(args.steps || 4);
const out = [];
const log = (k, v) => out.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const b = await chromium.connectOverCDP(`http://127.0.0.1:${args.port || 9444}`);
let page = args.match && b.contexts().flatMap(c => c.pages()).find(p => p.url().includes(args.match));
if (!page && args.job) {
  // --job <advert url>: open it, press Apply, prefer "Use My Last Application"
  // (Workday copies the previous application on the same tenant: saves step 1-2).
  page = await b.contexts()[0].newPage();
  await page.goto(args.job, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await wd.acceptCookies(page).catch(() => {});
  await page.getByRole('button', { name: /^Apply$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const reuse = page.getByText('Use My Last Application', { exact: true });
  const how = (await reuse.count()) ? 'Use My Last Application' : 'Apply Manually';
  await page.getByText(how, { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(5000);
  log('start', how);
  if (/Sign In|Create Account/i.test(await wd.currentStep(page).catch(() => ''))) {
    console.log(out.join('\n') + '\nSTOP: sign-in needed — your step'); process.exit(0);
  }
}
if (!page) { console.log('no tab matching', args.match, '— pass --job <url>'); process.exit(1); }

const field = (id, n = 0) => page.locator(`[data-automation-id="formField-${id}"]`).nth(n);
const blockByText = re => page.locator('[data-automation-id^="formField-"]').filter({ hasText: re }).first();
const pills = loc => loc.locator('[data-automation-id="selectedItem"]').allInnerTexts();
const esc = s => s.replace(/"/g, '\\"');
const calm = () => page.locator('h2, h3').first().click().catch(() => {});

async function clearInput(inp) {
  await inp.focus();
  const v = await inp.inputValue().catch(() => '');
  for (let i = 0; i < v.length; i++) await page.keyboard.press('Backspace');
}

/** Search a multiselect inside `block` and end with exactly one pill matching pickRe. */
async function pick(block, term, pickRe, fallback) {
  const re = new RegExp(pickRe, 'i');
  for (const x of await pills(block)) if (!re.test(x)) {
    await block.locator('[data-automation-id="selectedItem"]').filter({ hasText: x }).first()
      .locator('[data-automation-id="DELETE_charm"]').click().catch(() => {});
    await page.waitForTimeout(400);
  }
  if ((await pills(block)).some(x => re.test(x))) return (await pills(block))[0];
  for (const [t, r] of [[term, re], ...(fallback ? [[fallback, new RegExp(`^${fallback}$`, 'i')]] : [])]) {
    const inp = block.locator('input').first();
    await clearInput(inp);
    await page.keyboard.type(t, { delay: 40 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2300);
    const got = await pills(block);
    const bad = got.filter(x => !r.test(x));
    for (const x of bad) {           // Enter auto-picked something wrong: remove it
      await block.locator('[data-automation-id="selectedItem"]').filter({ hasText: x }).first()
        .locator('[data-automation-id="DELETE_charm"]').click().catch(() => {});
      await page.waitForTimeout(400);
    }
    if ((await pills(block)).some(x => r.test(x))) { await calm(); return (await pills(block)).find(x => r.test(x)); }
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-automation-id="promptOption"]')]
      .filter(e => e.getBoundingClientRect().width > 0).map(e => e.getAttribute('data-automation-label')));
    const want = labels.find(l => r.test(l || ''));
    if (want) {
      await page.locator(`[data-automation-id="promptOption"][data-automation-label="${esc(want)}"]`).first().click({ timeout: 5000 });
      await page.waitForTimeout(800);
      await calm();
      return want;
    }
  }
  await calm();
  return null;
}

async function dropdown(block, pickRe) {
  const btn = block.locator('button').first();
  if (new RegExp(pickRe, 'i').test(await btn.innerText())) return await btn.innerText();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role=option]')]
    .filter(e => e.getBoundingClientRect().width > 0).map(e => e.innerText.trim()));
  const w = opts.find(o => new RegExp(pickRe, 'i').test(o));
  if (w) await page.locator('[role=option]').filter({ hasText: w }).first().click({ timeout: 5000 });
  await page.waitForTimeout(700);
  return await btn.innerText();
}

async function typeIn(block, value) {
  const inp = block.locator('input, textarea').first();
  if ((await inp.inputValue()) === value) return value;
  await clearInput(inp);
  await page.keyboard.type(value, { delay: 14 });
  await page.keyboard.press('Tab');
  return inp.inputValue();
}

async function myInformation() {
  if (P.hearAbout) log('hear', await pick(field('source'), P.hearAbout.term, P.hearAbout.pick));
  const r = blockByText(/worked for/i).getByRole('radio', { name: new RegExp(`^${P.workedBefore}$`) });
  if (await r.count()) { await r.check(); log('workedBefore', await r.isChecked()); }
  for (const [id, v] of [['legalName--firstName', P.given], ['legalName--lastName', P.family],
    ['addressLine1', P.address1], ['city', P.city], ['postalCode', P.postcode], ['phoneNumber', P.phone]]) {
    const blk = page.locator(`[data-automation-id="formField-${id}"]`).first();
    if (v && await blk.count()) log(id, await typeIn(blk, v));
  }
}

async function myExperience() {
  const titles = () => page.locator('[data-automation-id="formField-jobTitle"]');
  P.experience ||= []; P.education ||= []; P.skills ||= [];
  for (let k = 0; k < P.experience.length; k++) {
    const e = P.experience[k];
    if (await titles().count() <= k) log('addExp', await wd.addUnder(page, 'Work Experience'));
    await typeIn(field('jobTitle', k), e.title);
    await typeIn(field('companyName', k), e.company);
    const cur = field('currentlyWorkHere', k).getByRole('checkbox');
    if (e.current && !(await cur.isChecked())) { await cur.check(); await page.waitForTimeout(600); }
    // A "current" role has no endDate block, so endDate indexes shift down by one per current role before k.
    const endIdx = k - P.experience.slice(0, k).filter(x => x.current).length;
    for (const [id, d, idx] of [['startDate', e.from, k], ['endDate', e.to, endIdx]]) {
      if (!d) continue;
      const m = field(id, idx).locator('[data-automation-id="dateSectionMonth-input"]');
      if ((await m.inputValue()) === String(Number(d[0]))) continue;
      await m.focus();
      await page.keyboard.type(d[0] + d[1], { delay: 110 });
      await page.waitForTimeout(400);
    }
    log(`exp${k + 1}`, `${e.title} @ ${e.company}`);
  }
  const schools = () => page.locator('[data-automation-id="formField-school"]');
  for (let k = 0; k < P.education.length; k++) {
    const e = P.education[k];
    if (await schools().count() <= k) log('addEdu', await wd.addUnder(page, k === 0 ? 'Education' : `Education ${k}`));
    log(`edu${k + 1}.school`, await pick(field('school', k), e.school[0], e.school[1], e.school[2]));
    log(`edu${k + 1}.degree`, await dropdown(field('degree', k), e.degree));
    log(`edu${k + 1}.field`, await pick(field('fieldOfStudy', k), e.field[0], e.field[1], e.field[2]));
    await typeIn(field('gradeAverage', k), e.result);
    for (const [id, y] of [['firstYearAttended', e.from], ['lastYearAttended', e.to]]) {
      const yi = field(id, k).locator('[data-automation-id="dateSectionYear-input"]');
      if ((await yi.inputValue()) === y) continue;
      await yi.focus(); await page.keyboard.type(y, { delay: 110 }); await page.keyboard.press('Tab');
    }
  }
  const sk = field('skills');
  if (await sk.count()) for (const [t, r] of P.skills)
    if (!(await pills(sk)).some(x => new RegExp(r, 'i').test(x))) {
      const before = (await pills(sk)).length;
      const inp = sk.locator('input').first();
      await clearInput(inp); await page.keyboard.type(t, { delay: 40 }); await page.keyboard.press('Enter');
      await page.waitForTimeout(2300);
      const labels = await page.evaluate(() => [...document.querySelectorAll('[data-automation-id="promptOption"]')]
        .filter(e => e.getBoundingClientRect().width > 0).map(e => e.getAttribute('data-automation-label')));
      const w = labels.find(l => new RegExp(r, 'i').test(l || ''));
      if (w && (await pills(sk)).length === before)
        await page.locator(`[data-automation-id="promptOption"][data-automation-label="${esc(w)}"]`).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      if ((await pills(sk)).length > before + 1) { log('SKILLS', 'added more than one, stopping skills'); break; }
    }
  await calm();
  log('skills', await pills(sk));
  if (args.files) {
    const want = args.files.split(',');
    const names = want.map(f => f.split('/').pop());
    // A reused application carries the LAST role's files. Delete any upload not in this pack.
    for (let g = 0; g < 8; g++) {
      const stale = page.locator('[data-automation-id="file-upload-item"]')
        .filter({ hasNotText: new RegExp(names.map(n => n.replace(/[.()]/g, '\\$&')).join('|')) });
      if (!(await stale.count())) break;
      await stale.first().locator('[data-automation-id="delete-file"], button[aria-label*="Delete" i]').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    const have = await page.evaluate(() => document.body.innerText);
    const missing = want.filter((f, i) => !have.includes(names[i]));
    if (missing.length) { await page.locator('input[type=file]').first().setInputFiles(missing); await page.waitForTimeout(6000); }
    log('files', await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && /\.pdf$/i.test((e.innerText || '').trim())).map(e => e.innerText.trim())));
  }
}

async function questions() {
  for (const [q, a] of P.questions || []) {
    const blk = blockByText(new RegExp(q, 'i'));
    if (await blk.count()) log(`Q ${q}`, await dropdown(blk, a));
  }
  for (const [q, v] of P.textAnswers || []) {
    const blk = blockByText(new RegExp(q, 'i'));
    const inp = blk.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea').first();
    if (await blk.count() && await inp.count() && !(await inp.inputValue())) { await inp.fill(v); log(`T ${q}`, v); }
  }
  if (P.startDate) {
    const blk = blockByText(new RegExp(P.startDate.match, 'i'));
    const m = blk.locator('[data-automation-id="dateSectionMonth-input"]');
    if (await blk.count() && await m.count()) {
      const d = new Date(Date.now() + P.startDate.daysFromToday * 864e5);
      await m.first().focus();
      await page.keyboard.type(String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + d.getFullYear(), { delay: 60 });
      log('startDate', d.toISOString().slice(0, 10));
    }
  }
  // Any question not in the profile is reported, never guessed.
  const unknown = await page.evaluate(() => [...document.querySelectorAll('[data-automation-id^="formField-"]')]
    .filter(b => b.getBoundingClientRect().width > 0)
    .filter(b => /Select One/.test(b.querySelector('button')?.innerText || ''))
    .map(b => (b.querySelector('label')?.innerText || b.innerText).replace(/\s+/g, ' ').slice(0, 90)));
  if (unknown.length) { log('UNANSWERED (your call)', unknown); return 'stop'; }
}

const handlers = { 'My Information': myInformation, 'My Experience': myExperience, 'Application Questions': questions };
for (let s = 0; s < maxSteps; s++) {
  const step = (await wd.currentStep(page)).replace(/^current step \d+ of \d+\s*/, '');
  log('STEP', step);
  if (/Review/i.test(step) || !handlers[step]) { log('STOP', `no handler for "${step}" — your step`); break; }
  if (await handlers[step]() === 'stop') { log('STOP', 'unanswered question: add it to the profile, never guess'); break; }
  const req = await wd.stillRequired(page);
  if (req.length) { log('STOP required', req); break; }
  const r = await wd.advance(page);
  log('advance', r);
  if (!r.moved) break;
  await page.waitForTimeout(2000);
}
console.log(out.join('\n'));
process.exit(0);
