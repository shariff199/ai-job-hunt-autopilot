/**
 * workday-kit.mjs — everything learned filling Workday applications on
 * 19-20 September 2026, in one reusable place.
 *
 * WHY THIS EXISTS
 * Five exploratory agents each rediscovered the same handful of facts about
 * Workday at roughly 100-200k tokens apiece, and the scripts written between
 * them kept losing those facts again. Worse, four applications were submitted
 * without the candidate's approval — all four on Workday, by three different routes to the
 * same footer button. Everything below is a rule paid for once already.
 *
 * THE SAFETY RULES ARE NOT STYLE. In order of what they cost:
 *
 *   1. NEVER press Escape on a Workday page. Escape activates the footer
 *      PRIMARY button. On the Review step that button is Submit. Two
 *      applications (Tokio Marine, Avanade) went out this way.
 *
 *   2. ALWAYS read the footer button's OWN LABEL immediately before clicking
 *      it. It reads "Save and Continue" on every step except Review, where it
 *      reads "Submit". A loop that checked the STEP NAME instead sent SEI.
 *
 *   3. NEVER click a computed coordinate. Workday virtualises dropdown lists;
 *      the popper closes between reading a position and clicking it, and the
 *      click lands on the footer underneath. That sent CMC Markets — while
 *      reaching for an OPTIONAL field that would have cost nothing left blank.
 *
 *   4. If a control cannot be reached by a label-matched locator that is still
 *      attached at click time, LEAVE IT BLANK and report it. Do not escalate.
 *
 * THE MECHANICAL FACTS, each of which cost an hour to find:
 *
 *   - A multiselect's search input has NO `type` attribute, so
 *     `input[type=text]` never matches it. Use `[data-automation-id="searchBox"]`.
 *   - A multiselect does not query as you type. You must press ENTER to fire
 *     the search. Typing alone returns "No Items." forever. This is the single
 *     most expensive thing in this file.
 *   - A multiselect keeps `value=""` even when set; the choice lives in a pill
 *     at `[data-automation-id*="selectedItem"]`. A required-attribute scan
 *     therefore reports a filled field as empty.
 *   - Date segments are `dateSectionMonth-input` / `dateSectionYear-input`
 *     spinbuttons and are ZERO-WIDTH. `click()` always times out. Use focus().
 *   - Setting `.value` with a native setter paints the field but does NOT
 *     commit — Workday discards it on the next render. Only real keystrokes
 *     stick.
 *   - Work-experience text inputs carry no automation id and no aria-label.
 *     Address them positionally: [0] Job Title, [1] Company, [2] Location.
 *   - A step may have several "Add" buttons (Work Experience, Education,
 *     Certifications, Languages, Resume). Scope the click to the one that
 *     FOLLOWS the relevant heading or you open the wrong section.
 *   - Accepting the cookie banner first prevents it intercepting every click.
 */

export const SUBMIT_WORDS = /submit|apply now|send application/i;

/** Read the footer button's own label. Never assume it from the step name. */
export async function footerLabel(page) {
  return page.evaluate(() =>
    (document.querySelector('[data-automation-id="pageFooterNextButton"]')?.innerText || '').trim());
}

/** Current step, for reporting only — never for deciding whether to click. */
export async function currentStep(page) {
  return page.evaluate(() =>
    (document.querySelector('[data-automation-id="progressBarActiveStep"]')?.innerText || '')
      .replace(/\s+/g, ' ').trim());
}

/**
 * Advance one step. Refuses if the footer button would submit.
 * Returns {moved, from, to, label, errors}.
 */
export async function advance(page, { allowSubmit = false } = {}) {
  const label = await footerLabel(page);
  const from = await currentStep(page);
  if (SUBMIT_WORDS.test(label) && !allowSubmit) {
    return { moved: false, from, to: from, label, refused: true,
             reason: `footer reads "${label}" — the candidate's click, not ours` };
  }
  await page.locator('[data-automation-id="pageFooterNextButton"]')
    .click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(5000);
  return { moved: true, from, to: await currentStep(page), label, errors: await errors(page) };
}

/** Errors Workday is currently showing. */
export async function errors(page) {
  return page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...new Set([...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && vis(e) &&
        /is required and must|must have a value|Errors Found/i.test(e.innerText || ''))
      .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70)))].slice(0, 6);
  });
}

/** Dismiss the cookie banner so it stops intercepting clicks. */
export async function acceptCookies(page) {
  const b = page.locator('[data-automation-id="legalNoticeAcceptButton"]');
  if (await b.count() && await b.isVisible().catch(() => false)) {
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

/** Focus the input inside the form-field block whose text matches `labelRe`. */
async function focusIn(page, labelRe, selector) {
  return page.evaluate(({ l, sel }) => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const b of document.querySelectorAll('[data-automation-id^="formField-"]')) {
      if (!vis(b) || !new RegExp(l, 'i').test(b.innerText || '')) continue;
      const el = b.querySelector(sel);
      if (!el) continue;
      el.scrollIntoView({ block: 'center' });
      el.focus();
      return true;
    }
    return false;
  }, { l: labelRe, sel: selector });
}

/**
 * Type into a plain text field by its label. Real keystrokes only — a native
 * `.value` set paints the box and is discarded on the next render.
 */
export async function typeField(page, labelRe, value, { overwrite = false } = {}) {
  const ok = await focusIn(page, labelRe, 'input, textarea');
  if (!ok) return { ok: false, why: 'no input in that block' };
  if (overwrite) { await page.keyboard.press('Meta+a'); await page.keyboard.press('Delete'); }
  await page.keyboard.type(value, { delay: 14 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(350);
  const got = await page.evaluate(l => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const b of document.querySelectorAll('[data-automation-id^="formField-"]'))
      if (vis(b) && new RegExp(l, 'i').test(b.innerText || ''))
        return (b.querySelector('input, textarea')?.value) || '';
    return '';
  }, labelRe);
  return { ok: !!got, value: got };
}

/**
 * Set a Workday MULTISELECT.
 *
 * The two facts that make this work, both expensive:
 *   - the search input has no `type` attribute → `[data-automation-id="searchBox"]`
 *   - it does not query as you type → press ENTER to fire the search
 *
 * Without the Enter it returns "No Items." for every term, including terms that
 * definitely exist. Six attempts were burned on that before it was understood.
 *
 * Never falls back to a coordinate. Returns blank rather than guessing.
 */
export async function setMultiselect(page, labelRe, term, { pick = null } = {}) {
  const ok = await focusIn(page, labelRe, '[data-automation-id="searchBox"]');
  if (!ok) return { ok: false, why: 'no searchBox in that block' };

  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(term, { delay: 50 });
  await page.keyboard.press('Enter');          // ← fires the search. Without it: "No Items."
  await page.waitForTimeout(2200);

  const opts = await page.evaluate(() => [...document.querySelectorAll('[role=option]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()));

  const real = opts.filter(o => o && !/^No Items/i.test(o));
  if (!real.length) return { ok: false, why: `no options for "${term}"`, opts };

  const want = pick
    ? real.find(o => new RegExp(pick, 'i').test(o)) || null
    : real[0];
  if (!want) return { ok: false, why: `nothing matched /${pick}/`, opts: real };

  // A locator that must still be attached at click time. No coordinates.
  await page.getByRole('option', { name: want, exact: true }).first()
    .click({ timeout: 7000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  // A multiselect keeps value="" — read the pill instead.
  const pill = await page.evaluate(l => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const b of document.querySelectorAll('[data-automation-id^="formField-"]')) {
      if (!vis(b) || !new RegExp(l, 'i').test(b.innerText || '')) continue;
      const p = b.querySelector('[data-automation-id*="selectedItem"]');
      return p ? (p.innerText || '').trim() : '';
    }
    return '';
  }, labelRe);
  return { ok: !!pill, value: pill || want, opts: real.slice(0, 6) };
}

/** Pick from a Workday BUTTON dropdown (Degree, Phone Device Type, …). */
export async function setDropdown(page, labelRe, pickRe) {
  const opened = await page.evaluate(l => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const b of document.querySelectorAll('[data-automation-id^="formField-"]')) {
      if (!vis(b) || !new RegExp(l, 'i').test(b.innerText || '')) continue;
      const btn = [...b.querySelectorAll('button')].filter(vis)[0];
      if (!btn) continue;
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return true;
    }
    return false;
  }, labelRe);
  if (!opened) return { ok: false, why: 'no dropdown button' };
  await page.waitForTimeout(1200);

  const opts = await page.evaluate(() => [...document.querySelectorAll('[role=option]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(e => (e.innerText || '').trim()).filter(Boolean));
  const want = opts.find(o => new RegExp(pickRe).test(o));
  if (!want) {
    // Close by clicking the label, never by Escape.
    await page.evaluate(() => document.querySelector('h2, h3, label')?.click()).catch(() => {});
    return { ok: false, why: `nothing matched /${pickRe}/`, opts: opts.slice(0, 20) };
  }
  await page.getByRole('option', { name: want, exact: true }).first()
    .click({ timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { ok: true, value: want };
}

/**
 * Set a Workday date. The month/year segments are ZERO-WIDTH inputs — click()
 * always times out, focus() works. Typing MMYYYY flows month into year.
 * `which` is 0 for the first date pair on the page, -1 for the last.
 */
export async function setDate(page, mm, yyyy, { which = -1 } = {}) {
  const ok = await page.evaluate(i => {
    const ds = [...document.querySelectorAll('[data-automation-id="dateSectionMonth-input"]')];
    const el = i < 0 ? ds[ds.length + i] : ds[i];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    return true;
  }, which);
  if (!ok) return { ok: false, why: 'no date segment' };
  await page.keyboard.type(String(mm) + String(yyyy), { delay: 110 });
  await page.waitForTimeout(700);
  const got = await page.evaluate(i => {
    const ms = [...document.querySelectorAll('[data-automation-id="dateSectionMonth-input"]')];
    const ys = [...document.querySelectorAll('[data-automation-id="dateSectionYear-input"]')];
    const m = i < 0 ? ms[ms.length + i] : ms[i];
    const y = i < 0 ? ys[ys.length + i] : ys[i];
    return `${m?.value || ''}/${y?.value || ''}`;
  }, which);
  return { ok: /\d+\/\d{4}/.test(got), value: got };
}

/** Click the "Add" button that FOLLOWS a heading — not the first one on the page. */
export async function addUnder(page, headingRe) {
  const before = await page.evaluate(() =>
    document.querySelectorAll('[data-automation-id^="formField-"]').length);
  const clicked = await page.evaluate(h => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const head = [...document.querySelectorAll('*')].find(e =>
      e.children.length === 0 && vis(e) && new RegExp(`^${h}$`, 'i').test((e.innerText || '').trim()));
    if (!head) return 'heading not found';
    const btn = [...document.querySelectorAll('button')].filter(vis)
      .filter(e => /^Add(\s+Another)?$/i.test((e.innerText || '').trim()))
      .filter(e => head.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)[0];
    if (!btn) return 'no Add after that heading';
    btn.click();
    return 'clicked';
  }, headingRe);
  if (clicked !== 'clicked') return { ok: false, why: clicked };
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() =>
    document.querySelectorAll('[data-automation-id^="formField-"]').length);
  return { ok: after > before, blocks: after - before };
}

/** Positional text inputs inside the newest repeated block. */
export async function typeAt(page, index, value) {
  const ok = await page.evaluate(i => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const ins = [...document.querySelectorAll('input')].filter(vis)
      .filter(e => e.getAttribute('role') !== 'spinbutton'
                && !['checkbox', 'radio', 'file', 'hidden'].includes(e.type)
                && e.getAttribute('data-automation-id') !== 'searchBox');
    if (!ins[i]) return false;
    ins[i].scrollIntoView({ block: 'center' });
    ins[i].focus();
    return true;
  }, index);
  if (!ok) return { ok: false };
  await page.keyboard.type(value, { delay: 14 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  return { ok: true };
}

/** Required blocks still empty, pill-aware so a set multiselect is not misread. */
export async function stillRequired(page) {
  return page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...new Set([...document.querySelectorAll('[data-automation-id^="formField-"]')]
      .filter(vis)
      .filter(b => /\*/.test(b.innerText || ''))
      .filter(b => {
        const filled = [...b.querySelectorAll('input, textarea')]
          .some(i => i.checked || (i.value || '').trim());
        const pill = !!b.querySelector('[data-automation-id*="selectedItem"]');
        const file = /\.pdf\b/i.test(b.innerText || '');
        return !filled && !pill && !file;
      })
      .map(b => (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 55)))];
  });
}

/** Attach a CV. Workday's file input is hidden behind a drop zone but works. */
export async function uploadCV(page, path) {
  const fi = page.locator('input[type=file]').first();
  if (await fi.count() === 0) return { ok: false, why: 'no file input on this step' };
  if (await fi.evaluate(e => (e.files?.length || 0) > 0)) return { ok: true, already: true };
  await fi.setInputFiles(path);
  await page.waitForTimeout(4000);
  const shown = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0 && /\.pdf\b/i.test(e.innerText || ''))
    .map(e => e.innerText.trim().slice(0, 50))[0] || '');
  return { ok: !!shown, value: shown };
}
