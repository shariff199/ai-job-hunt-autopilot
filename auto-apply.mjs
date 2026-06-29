#!/usr/bin/env node

/**
 * auto-apply.mjs — Auto-fill UK job application form with full demographics
 *
 * Loads candidate profile from config/candidate-profile.json. Launches a
 * VISIBLE Chromium browser, navigates to the application URL, fills:
 *   - basic identity (name, email, phone, LinkedIn, GitHub, location)
 *   - file uploads (CV PDF + cover letter PDF)
 *   - demographic dropdowns / radio buttons (gender, ethnicity,
 *     disability, sexual orientation, religion, veteran, etc.)
 *   - common custom Qs (right to work, sponsorship, salary, notice)
 *
 * NEVER auto-submits. User clicks submit.
 *
 * Usage:
 *   node auto-apply.mjs <URL> [--cv <path>] [--cover <path>]
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Parse args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const URL = args[0];
if (!URL || URL.startsWith('--')) {
  console.error('Usage: node auto-apply.mjs <URL> [--cv <path>] [--cover <path>]');
  process.exit(1);
}
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}
const cvPath    = flag('cv');
const coverPath = flag('cover');
const cvAbs     = cvPath    ? resolve(cvPath)    : null;
const coverAbs  = coverPath ? resolve(coverPath) : null;
if (cvPath    && !existsSync(cvAbs))    { console.error(`CV not found: ${cvPath}`);    process.exit(1); }
if (coverPath && !existsSync(coverAbs)) { console.error(`Cover not found: ${coverPath}`); process.exit(1); }

// ── Load candidate profile ─────────────────────────────────────────
const profilePath = resolve(__dirname, 'config/candidate-profile.json');
if (!existsSync(profilePath)) {
  console.error(`Profile not found: ${profilePath}`);
  process.exit(1);
}
const p = JSON.parse(readFileSync(profilePath, 'utf-8'));

// ── Helpers ────────────────────────────────────────────────────────
async function tryFill(page, selector, value, label) {
  if (!value) return false;
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1200 }).catch(() => false)) {
      await el.fill(String(value));
      console.log(`  ✓ ${label || selector}: ${String(value).substring(0, 40)}`);
      return true;
    }
  } catch (e) {}
  return false;
}

async function tryClick(page, selector, label) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click();
      console.log(`  ✓ Clicked: ${label || selector}`);
      return true;
    }
  } catch (e) {}
  return false;
}

async function tryUpload(page, selectors, filePath, label) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.setInputFiles(filePath);
        console.log(`  ✓ ${label} uploaded: ${sel}`);
        return true;
      }
    } catch (e) {}
  }
  console.log(`  ⚠ ${label}: no upload field matched — upload manually`);
  return false;
}

// Classify every file input by its attributes + nearby label text, then route
// the CV to the resume slot and the cover letter to the cover slot. Prevents the
// cover letter (or CV) from clobbering the wrong slot on 2-upload forms.
async function uploadFiles(page, cvAbs, coverAbs) {
  const handles = await page.$$('input[type="file"]');
  if (!handles.length) {
    console.log('  ⚠ no file inputs found — upload manually');
    return;
  }
  // Gather context text for each input (name/id/aria + closest label / preceding text)
  const meta = [];
  for (let i = 0; i < handles.length; i++) {
    const ctx = await handles[i].evaluate((el) => {
      const bits = [el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('accept')];
      // climb a few ancestors for label text
      let node = el, hops = 0;
      while (node && hops < 4) { bits.push(node.getAttribute && node.getAttribute('aria-label')); bits.push(node.innerText || ''); node = node.parentElement; hops++; }
      const lbl = el.labels && el.labels[0] ? el.labels[0].innerText : '';
      bits.push(lbl);
      return bits.filter(Boolean).join(' ').toLowerCase().slice(0, 400);
    }).catch(() => '');
    meta.push({ idx: i, ctx });
  }
  const isCover = (s) => /cover|covering letter|motivation/.test(s);
  const isResume = (s) => /resume|cv|curriculum/.test(s);
  let cvInput = null, coverInput = null;
  // cover first (more specific), so resume's generic "cv" doesn't steal it
  if (coverAbs) coverInput = meta.find((m) => isCover(m.ctx))?.idx ?? null;
  if (cvAbs)   cvInput   = meta.find((m) => isResume(m.ctx) && m.idx !== coverInput)?.idx ?? null;
  // single-input form → it's the CV
  if (cvAbs && cvInput === null && handles.length === 1 && coverInput === null) cvInput = 0;
  // two inputs, only one classified → infer the other
  if (handles.length === 2) {
    if (cvAbs && cvInput === null && coverInput !== null) cvInput = coverInput === 0 ? 1 : 0;
    if (coverAbs && coverInput === null && cvInput !== null) coverInput = cvInput === 0 ? 1 : 0;
  }
  try {
    if (cvAbs && cvInput !== null) { await handles[cvInput].setInputFiles(cvAbs); console.log(`  ✓ CV → file input #${cvInput}`); }
    else if (cvAbs) console.log('  ⚠ CV: no resume slot identified — attach manually');
    if (coverAbs && coverInput !== null && coverInput !== cvInput) { await handles[coverInput].setInputFiles(coverAbs); console.log(`  ✓ Cover → file input #${coverInput}`); }
    else if (coverAbs && coverInput === null) console.log('  ⚠ Cover: no cover slot found — paste cover text manually');
  } catch (e) { console.log('  ⚠ upload failed:', e.message); }
}

// Generic pass: fill any remaining REQUIRED native <select> still on its
// placeholder, choosing a sensible option (avoids "please complete" blockers).
async function fillRemainingSelects(page) {
  try {
    const n = await page.evaluate(() => {
      let filled = 0;
      for (const sel of document.querySelectorAll('select')) {
        if (sel.value && sel.selectedIndex > 0) continue;            // already set
        const required = sel.required || sel.getAttribute('aria-required') === 'true';
        if (!required) continue;
        const ctx = ((sel.name || '') + ' ' + (sel.id || '') + ' ' + (sel.labels?.[0]?.innerText || '')).toLowerCase();
        const opts = [...sel.options];
        const pick = (kw) => opts.find((o) => kw.some((k) => o.text.toLowerCase().includes(k)));
        let choice = null;
        if (/right to work|eligible to work|authoris|authoriz/.test(ctx)) choice = pick(['yes']);
        else if (/sponsor|visa/.test(ctx)) choice = pick(['no', 'do not', "don't", 'not require']);
        else if (/hear about|source|referr/.test(ctx)) choice = pick(['linkedin', 'job board', 'company website', 'other']);
        else if (/country|nationality/.test(ctx)) choice = pick(['united kingdom', 'india']);
        else if (/notice/.test(ctx)) choice = pick(['immediately', '1 month', 'less than']);
        if (!choice) choice = opts.find((o) => o.value && !/please|select|choose|^--/.test(o.text.toLowerCase().trim()));
        if (choice) { sel.value = choice.value; sel.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
      }
      return filled;
    });
    if (n) console.log(`  ✓ Filled ${n} remaining required dropdown(s)`);
  } catch (e) {}
}

// Select an <option> by case-insensitive substring match
async function trySelect(page, selector, valueKeywords, label) {
  try {
    const el = page.locator(selector).first();
    if (!await el.isVisible({ timeout: 1500 }).catch(() => false)) return false;
    // Get all options
    const opts = await el.locator('option').allTextContents();
    const lower = valueKeywords.map(k => k.toLowerCase());
    for (let i = 0; i < opts.length; i++) {
      const optText = opts[i].toLowerCase();
      if (lower.some(k => optText.includes(k))) {
        await el.selectOption({ index: i });
        console.log(`  ✓ ${label}: selected "${opts[i].trim()}"`);
        return true;
      }
    }
  } catch (e) {}
  return false;
}

// Fill an input by its associated label text (Ashby + custom forms)
async function tryFillByLabel(page, labelPatterns, value, label) {
  if (!value) return false;
  for (const pattern of labelPatterns) {
    try {
      const input = page.getByLabel(new RegExp(pattern, 'i')).first();
      if (await input.count() > 0) {
        const visible = await input.isVisible({ timeout: 800 }).catch(() => false);
        if (visible) {
          await input.fill(String(value));
          console.log(`  ✓ ${label} (label "${pattern}"): ${String(value).substring(0, 40)}`);
          return true;
        }
      }
    } catch (e) {}
    // Fallback: find input/textarea following a label whose text contains pattern
    try {
      const el = page.locator(
        `label:has-text("${pattern}") + input, ` +
        `label:has-text("${pattern}") + textarea, ` +
        `label:has-text("${pattern}") input, ` +
        `label:has-text("${pattern}") textarea, ` +
        `:text("${pattern}") ~ input, ` +
        `:text("${pattern}") ~ textarea`
      ).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 600 }).catch(() => false)) {
        await el.fill(String(value));
        console.log(`  ✓ ${label} (near "${pattern}"): ${String(value).substring(0, 40)}`);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

// Greenhouse custom dropdowns use random `question_XXXXX` IDs. Find them by
// matching the visible label text, then select an option by keyword match.
async function trySelectByLabel(page, labelPatterns, optionKeywords, label) {
  if (!optionKeywords || optionKeywords.length === 0) return false;
  for (const labelPattern of labelPatterns) {
    try {
      // Strategy 1: Playwright's getByLabel (handles for=ID associations)
      let select = page.getByLabel(new RegExp(labelPattern, 'i')).first();
      if (await select.count() === 0) continue;

      // Verify it's actually a select element
      const tagName = await select.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
      if (tagName !== 'select') continue;

      // Read all options, find best match
      const options = await select.locator('option').allTextContents();
      const lowerKeys = optionKeywords.map(k => k.toLowerCase());
      for (let i = 0; i < options.length; i++) {
        const optText = options[i].toLowerCase().trim();
        if (!optText || optText.includes('select...') || optText === 'select') continue;
        if (lowerKeys.some(k => optText.includes(k))) {
          await select.selectOption({ index: i });
          console.log(`  ✓ ${label} (label "${labelPattern}" → "${options[i].trim()}")`);
          return true;
        }
      }
    } catch (e) {}
  }
  return false;
}

// Click a radio in a fieldset matching label keywords
async function tryRadioByLabel(page, fieldsetKeyword, optionKeyword, label) {
  try {
    // Find fieldset/legend whose text contains fieldsetKeyword
    const fieldset = page.locator(`fieldset:has-text("${fieldsetKeyword}"), div:has(> label:has-text("${fieldsetKeyword}"))`).first();
    if (await fieldset.count() === 0) return false;
    const radio = fieldset.locator(`label:has-text("${optionKeyword}") input[type="radio"], input[type="radio"] + label:has-text("${optionKeyword}")`).first();
    if (await radio.count() > 0) {
      await radio.check({ force: true }).catch(async () => { await radio.click(); });
      console.log(`  ✓ ${label}: ${optionKeyword}`);
      return true;
    }
    // Fallback: find any radio whose nearby label matches
    const altRadio = page.locator(`input[type="radio"]:near(:text("${fieldsetKeyword}")) + label:has-text("${optionKeyword}")`).first();
    if (await altRadio.count() > 0) {
      await altRadio.click();
      console.log(`  ✓ ${label}: ${optionKeyword} (fallback)`);
      return true;
    }
  } catch (e) {}
  return false;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  career-ops auto-apply v2 — full demographic fill');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Target:    ${URL}`);
  console.log(`  Candidate: ${p.name.full}`);
  if (cvAbs)    console.log(`  CV:        ${cvAbs}`);
  if (coverAbs) console.log(`  Cover:     ${coverAbs}`);
  console.log('');

  // Persistent profile — keeps Reed/LinkedIn logins across runs.
  // First run: log in manually once. Every run after stays logged in.
  const userDataDir = resolve(__dirname, '.browser-profile');
  // Use stable Edge (always present on Windows 11). The bundled Chrome-for-Testing
  // build crashes on headed persistent-context launch in some Windows setups
  // (STATUS_BREAKPOINT). Override with CAREER_OPS_BROWSER_CHANNEL if needed.
  const channel = process.env.CAREER_OPS_BROWSER_CHANNEL || 'msedge';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel,
    slowMo: 120,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();

  console.log('🚀 Opening browser...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Click Apply button
  console.log('🔍 Clicking Apply button...');
  await tryClick(page, 'button:has-text("Apply for this job")', 'Apply')
    || await tryClick(page, 'a:has-text("Apply for this job")', 'Apply')
    || await tryClick(page, 'button:has-text("Apply now")', 'Apply')
    || await tryClick(page, 'a:has-text("Apply now")', 'Apply')
    || await tryClick(page, 'button:has-text("Apply")', 'Apply')
    || await tryClick(page, 'a:has-text("Apply")', 'Apply');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  // ── Identity ────────────────────────────────────────────────────
  console.log('');
  console.log('✍️  Filling identity fields...');
  await tryFill(page, 'input[name="first_name"]',          p.name.first, 'First name');
  await tryFill(page, 'input[name="firstName"]',           p.name.first, 'First name');
  await tryFill(page, 'input[id*="first_name" i]',         p.name.first, 'First name');
  await tryFill(page, 'input[id*="firstname" i]',          p.name.first, 'First name');
  await tryFill(page, 'input[name="last_name"]',           p.name.last, 'Last name');
  await tryFill(page, 'input[name="lastName"]',            p.name.last, 'Last name');
  await tryFill(page, 'input[id*="last_name" i]',          p.name.last, 'Last name');
  await tryFill(page, 'input[id*="lastname" i]',           p.name.last, 'Last name');
  await tryFill(page, 'input[name="_systemfield_name"]',   p.name.full, 'Full name (Ashby)');
  await tryFill(page, 'input[name="full_name"]',           p.name.full, 'Full name');

  await tryFill(page, 'input[type="email"]',               p.contact.email, 'Email');
  await tryFill(page, 'input[name="email"]',               p.contact.email, 'Email');
  await tryFill(page, 'input[name="_systemfield_email"]',  p.contact.email, 'Email (Ashby)');

  await tryFill(page, 'input[type="tel"]',                 p.contact.phone, 'Phone');
  await tryFill(page, 'input[name="phone"]',               p.contact.phone, 'Phone');
  await tryFill(page, 'input[name*="phone" i]',            p.contact.phone, 'Phone');

  // LinkedIn — name/id/placeholder + label-based (Ashby + Greenhouse)
  await tryFill(page, 'input[name*="linkedin" i]',         p.contact.linkedin, 'LinkedIn');
  await tryFill(page, 'input[id*="linkedin" i]',           p.contact.linkedin, 'LinkedIn');
  await tryFill(page, 'input[placeholder*="linkedin" i]',  p.contact.linkedin, 'LinkedIn');
  await tryFillByLabel(page, ['LinkedIn URL', 'LinkedIn profile', 'LinkedIn'], p.contact.linkedin, 'LinkedIn');

  // GitHub — name/id/placeholder + label-based
  await tryFill(page, 'input[name*="github" i]',           p.contact.github, 'GitHub');
  await tryFill(page, 'input[id*="github" i]',             p.contact.github, 'GitHub');
  await tryFill(page, 'input[placeholder*="github" i]',    p.contact.github, 'GitHub');
  await tryFillByLabel(page, ['GitHub URL', 'GitHub profile', 'GitHub'], p.contact.github, 'GitHub');

  // Portfolio / Website
  await tryFillByLabel(page, ['Portfolio', 'Website', 'Personal website'], p.contact.linkedin, 'Portfolio (fallback to LinkedIn)');

  // Location
  await tryFill(page, 'input[name*="location" i]',         p.location.address, 'Location');
  await tryFill(page, 'input[id*="location" i]',           p.location.address, 'Location');
  await tryFill(page, 'input[name*="city" i]',             p.location.city,    'City');
  await tryFill(page, 'input[name*="address" i]',          p.location.address, 'Address');
  await tryFillByLabel(page, ['Current location', 'City', 'Location'], p.location.address, 'Location (by label)');

  // Name fallback via label (Ashby)
  await tryFillByLabel(page, ['Full name', 'Name'], p.name.full, 'Full name (by label)');
  await tryFillByLabel(page, ['First name'], p.name.first, 'First name (by label)');
  await tryFillByLabel(page, ['Last name'], p.name.last, 'Last name (by label)');

  // Email/phone fallback via label
  await tryFillByLabel(page, ['Email address', 'Email'], p.contact.email, 'Email (by label)');
  await tryFillByLabel(page, ['Phone number', 'Phone', 'Mobile'], p.contact.phone, 'Phone (by label)');

  // ── File uploads (smart routing: CV→resume input, cover→cover input) ──
  // Each file input is classified by name/id/aria + its nearby label text, so the
  // cover letter never lands in the resume slot (or vice-versa). Generic positional
  // fallback only fires when there is exactly ONE file input on the page.
  if (cvAbs || coverAbs) {
    console.log('');
    console.log('📎 Uploading files (routing by field)...');
    await uploadFiles(page, cvAbs, coverAbs);
    await page.waitForTimeout(1500);
  }

  // ── Demographics (selects + radios) ────────────────────────────
  console.log('');
  console.log('🌍 Filling demographic / EEO fields (Greenhouse uses label-matching)...');

  // Gender
  await trySelect(page, 'select[name*="gender" i], select[id*="gender" i]', ['male'], 'Gender');
  await trySelectByLabel(page, ['gender do you identify', 'what is your gender', 'gender'], ['male'], 'Gender (Greenhouse)');
  await tryRadioByLabel(page, 'Gender', 'Male', 'Gender (radio)');

  // Pronouns
  await trySelect(page, 'select[name*="pronoun" i]', ['he', 'him'], 'Pronouns');
  await trySelectByLabel(page, ['pronoun'], ['he/him', 'he / him', 'he'], 'Pronouns (Greenhouse)');

  // Ethnicity / Race
  await trySelect(page, 'select[name*="ethnic" i], select[id*="ethnic" i]', ['indian', 'asian indian', 'asian or asian british'], 'Ethnicity');
  await trySelectByLabel(page, ['race/ethnicity', 'race', 'ethnicity', 'ethnic'], ['asian or asian british', 'indian', 'asian indian', 'asian'], 'Ethnicity (Greenhouse)');
  await tryRadioByLabel(page, 'Ethnicity', 'Indian', 'Ethnicity (radio)');

  // Sexual orientation
  await trySelect(page, 'select[name*="orient" i], select[name*="sexual" i]', ['heterosexual', 'straight'], 'Orientation');
  await trySelectByLabel(page, ['sexual orientation', 'orientation'], ['heterosexual', 'straight'], 'Orientation (Greenhouse)');
  await tryRadioByLabel(page, 'sexual orientation', 'Heterosexual', 'Orientation (radio)');

  // Age band
  await trySelectByLabel(page, ['how old are you', 'age band', 'age range', 'what is your age'], ['25', '25-34', '25 - 34', '25–34'], 'Age band (Greenhouse)');

  // Highest education
  await trySelectByLabel(page, ['highest level of education', 'highest education', 'education level'], ["master", "msc", "postgrad"], 'Education (Greenhouse)');

  // Disability
  await trySelect(page, 'select[name*="disab" i], select[id*="disab" i]', ['no'], 'Disability');
  await trySelectByLabel(page, ['consider yourself disabled', 'do you have a disability', 'disability status', 'disability'], ['no'], 'Disability (Greenhouse)');
  await tryRadioByLabel(page, 'disability', 'No', 'Disability (radio)');

  // Neurodiverse
  await trySelectByLabel(page, ['neurodiverse', 'neurodivergent'], ['no'], 'Neurodiverse (Greenhouse)');

  // Cis status — gender identity = sex at birth
  await trySelectByLabel(page, ['gender identity the same as the sex', 'identify as cisgender', 'cisgender'], ['yes'], 'Cis status (Greenhouse)');

  // Religion
  await trySelect(page, 'select[name*="religion" i], select[name*="belief" i]', ['muslim', 'islam'], 'Religion');
  await trySelectByLabel(page, ['religion', 'belief'], ['muslim', 'islam'], 'Religion (Greenhouse)');
  await tryRadioByLabel(page, 'religion', 'Muslim', 'Religion (radio)');

  // Veteran
  await trySelect(page, 'select[name*="veteran" i], select[name*="military" i]', ['not a', 'no', 'never served'], 'Veteran');
  await trySelectByLabel(page, ['veteran status', 'military'], ['no', 'not a', 'never served'], 'Veteran (Greenhouse)');
  await tryRadioByLabel(page, 'veteran', 'No', 'Veteran (radio)');

  // Right to work
  await trySelect(page, 'select[name*="right_to_work" i], select[name*="work_auth" i], select[name*="authorize" i]', ['yes'], 'Right to work');
  await trySelectByLabel(page, ['right to work', 'authorised to work', 'authorized to work', 'eligible to work'], ['yes'], 'Right to work (Greenhouse)');
  await tryRadioByLabel(page, 'right to work', 'Yes', 'Right to work (radio)');

  // Sponsorship needed
  await trySelect(page, 'select[name*="sponsor" i], select[name*="visa" i]', ['no', 'not require', "don't"], 'Sponsorship now');
  await trySelectByLabel(page, ['require sponsorship', 'need sponsorship', 'visa sponsorship'], ['no', 'not require', "don't"], 'Sponsorship (Greenhouse)');
  await tryRadioByLabel(page, 'sponsorship', 'No', 'Sponsorship (radio)');

  // ── Common custom Q text fields ─────────────────────────────────
  console.log('');
  console.log('✍️  Filling text answers (salary, notice, etc.)...');
  await tryFill(page, 'textarea[name*="salary" i], input[name*="salary" i], input[id*="salary" i], textarea[id*="salary" i]', p.work.salaryExpect, 'Salary');
  await tryFill(page, 'textarea[name*="notice" i], input[name*="notice" i], textarea[id*="notice" i], input[id*="notice" i]', p.work.noticePeriod, 'Notice period');
  await tryFill(page, 'textarea[name*="start_date" i], input[name*="start_date" i], textarea[id*="earliest" i]', p.work.earliestStart, 'Start date');
  await tryFill(page, 'textarea[name*="why" i], textarea[id*="why" i]', 'Tailored answer in cover letter — see PDF attached.', 'Why us');

  // Sweep any required dropdowns still on their placeholder
  console.log('');
  console.log('🔽 Filling remaining required dropdowns...');
  await fillRemainingSelects(page);

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  ✅ Auto-fill complete (filled what could be matched).');
  console.log('');
  console.log('  📋 NOW DO THIS YOURSELF:');
  console.log('     1. Scroll through every field, fix anything wrong');
  console.log('     2. Verify uploads attached');
  console.log('     3. Answer any remaining custom questions');
  console.log('     4. Read everything one last time');
  console.log('     5. Click Submit yourself');
  console.log('');
  console.log('  📝 Quick-copy answers:');
  console.log('     Visa:        ' + p.visa.rightToWork);
  console.log('     Sponsor now: ' + p.visa.sponsorshipNow);
  console.log('     Sponsor later: ' + p.visa.sponsorshipLater);
  console.log('     Salary:      ' + p.work.salaryExpect);
  console.log('     Notice:      ' + p.work.noticePeriod);
  console.log('     Gender:      ' + p.demographics.gender);
  console.log('     Ethnicity:   ' + p.demographics.ethnicity);
  console.log('     Disability:  ' + p.demographics.disability);
  console.log('     Orientation: ' + p.demographics.sexualOrientation);
  console.log('     Religion:    ' + p.demographics.religion);
  console.log('     Nationality: ' + p.location.nationality);
  console.log('');
  console.log('  Browser stays open. Close it when done.');
  console.log('═══════════════════════════════════════════════════');

  // Keep the Node process alive so the window stays open for review + submit.
  // Without a live handle, an unresolved promise alone won't stop Node exiting
  // (which closed the browser prematurely). Exit cleanly when the user closes it.
  const keepAlive = setInterval(() => {}, 1 << 30);
  context.on('close', () => { clearInterval(keepAlive); process.exit(0); });
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
