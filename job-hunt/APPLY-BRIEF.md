# Apply-agent brief (batch filling, never submitting)

You fill job application forms for <YOUR NAME>. **They presses Submit, never you.**

Repo `~/code/career-ops`. Packs: `output/tailored-<date>/<folder>/` with `cv.md`, `answers.md`,
`STATUS.md`, `CV-*.pdf`, `Cover-Letter-*.pdf`.

## Absolute limits
- **NEVER click Submit / Send / Apply-final / "Submit application".** Fill, then stop.
- **NEVER create an account, sign up, or type a password/OTP.** Login wall → mark BLOCKED, move on.
- Never click "Apply with LinkedIn", "Apply with Google", "Autofill with resume" — they open dialogs you cannot control.
- Never accept a job alert / marketing opt-in. Privacy-notice and data-processing consents: tick (they gave standing permission); say which ones you ticked.
- Never type their signature or full name into an e-signature field.
- Do not edit cv.md, cover-letter.txt, PDFs or anything in `master/`, `config/`, `data/`.

## Browser
A Chrome is already running with CDP on port 9444. Connect with Playwright from the repo:
```js
const { chromium } = require('playwright');           // or import
const b = await chromium.connectOverCDP('http://localhost:9444');
const ctx = b.contexts()[0];
const page = await ctx.newPage();                      // ONE new tab per job, keep it open
```
Run scripts with `node`. Keep each job's tab open at the end — they reviews them. Never close tabs, never close the browser.
If Playwright's bundled browser is missing that is fine; connectOverCDP uses the running Chrome.

## Per job
1. Read `answers.md` and `STATUS.md` in the pack, and `config/candidate-profile.json` for their details (name, email <your email>, phone, **application address: <your application address>**, LinkedIn, GitHub, demographics).
2. Open the apply URL from STATUS.md in a new tab.
3. Fill every field:
   - Uploads: use `setInputFiles` on the file input (never click the upload button). CV PDF always. Cover letter PDF wherever there is a slot; if there is a cover-letter TEXT box, paste the letter text from `cover-letter.txt`.
   - Right to work / sponsorship: state their real position, from config/profile.yml `right_to_work_line` (e.g. right to work now on a time-limited visa, sponsorship needed after <date>). "Do you now or will you in the future require sponsorship?" = **Yes**. "Are you legally authorised to work in the UK?" = **Yes**.
   - Salary expectation: **£35,000-£42,000** unless `answers.md` says otherwise (Octopus: pick the "£35k+" band).
   - Notice period / start: immediately available.
   - Free-text questions: use the drafts in `answers.md`. Never invent experience. If `answers.md` marks something HIS CALL or [HE MUST FILL], leave that field EMPTY and record it as needing them.
   - Demographics/EEO: from candidate-profile.json; "prefer not to say" only where it has no value.
4. **Stop before Submit.** Screenshot the whole filled form: `page.screenshot({ path: '<pack>/PRE-SUBMIT.png', fullPage: true })`.
5. Write `<pack>/FORM-STATUS.md`:
   ```
   URL / tab title / filled at <time>
   STATE: FILLED (ready for their Submit) | BLOCKED (<reason>) | PARTIAL (<what is missing>)
   Files uploaded: <exact filenames, and confirm the field shows them>
   Fields: <field> = <value>   (one line each, every field you touched)
   Consents ticked: <which>
   Needs them: <empty fields and why>
   ```
6. Next job. Do not wait on anything; a blocked form is recorded and skipped.

## Return
Table: Job | STATE | Tab title | Needs them. Then any form that fought you (multi-step wizards, captcha, login). Under 30 lines.
