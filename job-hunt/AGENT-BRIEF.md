# Application prep brief (daily; first used 19 Sept 2026)

You are preparing job applications for <YOUR NAME>. You PREPARE only. A different
session fills the forms and they presses Submit himself.

Repo: `~/code/career-ops` (cd there first). Use today's date for folder names: output/tailored-YYYY-MM-DD/

## Hard limits (breaking any of these ruins the batch)
- Do NOT submit, fill, or open any application form. Do NOT create accounts or log in anywhere.
- Do NOT message, connect with, or email anyone. Recruiter details are collected, never contacted.
- Do NOT edit `data/applications.md`, `master/*`, `tailor-v2.mjs`, `cv.md`, `config/*`. Do NOT git commit.
- Work only inside your job folders: `output/tailored-<today>/<company-slug>-<role-slug>/`.

## Facts rules (non-negotiable)
- Every CV and cover-letter claim must trace to `master/bullets.yml` / `master/FACT-BASE.md`. No new claims, no stronger claims, no invented numbers or percentages.
- <a past employer> and <a past employer> stay exactly as `tailor-v2.mjs` emits them. Never add to, embellish, or build on them.
- The Amazon warehouse job never appears on a data CV or letter.
- Never write: <a number you must never invent>%, BERT, LSTM, "Amazon reviews", "Data & Automation Consultant".
- Visa line: full UK right to work now on the Graduate visa until <your visa/right-to-work end date>; would need Skilled Worker sponsorship after that.

## Skills list vs sentences (their rule, 19 Sept 2026)
- **Skills lines (Functional Competencies / Technical Tools) are loose.** A keyword they have some exposure to, or could credibly do, is allowed. Add the advert's keywords they can reasonably back up; do not strip labels just because they are not on the FACT-BASE approved list. Only remove a skill that is plainly false (a tool they have never touched and has no adjacent experience with, or a banned claim).
- **Sentences stay true.** CV bullets and cover-letter sentences state facts: no invented numbers, no employer they did not work for, no "most of my work is X" overweighting, no availability that contradicts the visa, no named skill gap. Interviewers probe sentences.

## Per job, in order
1. **Get the advert text.** Save the full body to `jd.txt` in the job folder. Use WebFetch, curl, or the Ashby/Greenhouse/Lever public JSON APIs (e.g. `https://api.ashbyhq.com/posting-api/job-board/<org>`, `https://boards-api.greenhouse.io/v1/boards/<org>/jobs/<id>`). For Workday, try WebFetch of the URL; if JS-only, use `node apply-browser-jd.mjs` or a headless Playwright read. If you cannot get the text, verdict = SKIP (no text).
2. **Vet — eligibility only (rule from the candidate, 19 Sept 2026: "don't worry about skills not matching... first we need to get interviews").**
   SKIP only for things that make them ineligible, never for skill or domain gaps:
   - Not UK-based (or not remote-UK).
   - Restricted to students/undergraduates, or needs security clearance (SC/DV) or a specific regulated qualification/licence they lacks.
   - Starts after 12 <your visa/right-to-work end date>, or fixed-term past 12 <your visa/right-to-work end date> AND the advert rules out sponsorship.
   - Closing date passed.
   - Senior/lead/principal/manager-of-people scope where the title itself is senior (e.g. Senior, Lead, Head).
   Everything else is GO: skill gaps, domain gaps, "X years preferred/required" on a non-senior title, tools they have not used. Record gaps as notes, never as a reason to skip.
   AI roles count: AI engineer, AI automation, LLM/Claude/GenAI, applied AI, GTM engineer, solutions engineer — they builds with Claude, n8n, APIs.
   "We do not sponsor" → GO-SPONSOR-RISK (they have right to work to <your visa/right-to-work end date>).
   Also run `node vet-advert.mjs <job-folder-parent>` if useful.
3. **Tailor (GO jobs only).** `node tailor-v2.mjs --jd-file <folder>/jd.txt --company "<Company>" --title "<Title>"` — check where it writes; move/copy `cv.md`, `cover-letter.txt`, `match-report.md` into the job folder. Read the MISSING section and note it in STATUS.md; missing skills never change the verdict.
4. **ATS keyword pass.** Run `node ats-check.mjs <today>` when the batch is built and use ITS number, never a hand count. Measured 19 Sept 2026: 30 of 44 hand-written `ATS: n/15` lines disagreed with the real coverage, one by 7 points. Take the advert's top 15 keywords (match-report.md lists them). Every keyword they can truthfully claim (in bullets.yml / FACT-BASE) must appear in the CV text in the advert's own wording (e.g. "stakeholder management" not "working with stakeholders"), in the summary, skills or a bullet. Keywords they cannot evidence stay out of the CV. Record coverage in STATUS.md as `ATS: n/15 covered; missing: ...`. The CV stays single-column, standard headings (Profile, Experience, Projects, Education, Skills), no tables or graphics, so ATS parsers read it.
5. **Cover letter. tailor-v2's `cover-letter.txt` is a SKELETON, not a draft to polish.** Measured 19 Sept 2026: the letters that actually went out had 0.16 similarity to the generator's output, so pretending otherwise hid the real work. Read the generator's version for the facts it selected, then WRITE THE LETTER. Invoke the `humanizer` skill (Skill tool) on it. It must read like a person wrote it: varied sentence length, plain verbs, no stock AI words (delve, tapestry, testament, pivotal, crucial, meticulous, seamless, robust, comprehensive, leverage, passionate, "I am excited to", "not only... but also"), no em-dash chains, no three-item adjective strings. Their rules outrank humanizer's: plain voice, no bold, PL-300 at most once, never name a skill gap, no invented numbers, facts unchanged, 250-350 words, one specific line on why THIS company (from the advert/company, not generic), two examples matched to their top requirements using 3-5 of their keywords naturally, the visa line, a short close. Save the final as `cover-letter.txt`.
6. **PDFs.**
   - `node generate-cv.mjs --md <folder>/cv.md --output <folder>/CV-Mohammed-the candidate-<SURNAME>-<Company>.pdf`
   - `node generate-cover-letter.mjs --text <folder>/cover-letter.txt --output <folder>/Cover-Letter-Mohammed-the candidate-<SURNAME>-<Company>.pdf`
   Confirm both files exist and are non-empty.
7. **Form preview.** Note the ATS (Ashby/Greenhouse/Workday/Lever/…) and, where the public API exposes them (Ashby and Greenhouse do), the application questions — especially sponsorship/right-to-work, salary, notice period, and any free-text questions. Draft plain answers for free-text questions from the fact base only, saved to `answers.md`.
8. **Recruiter / hiring manager (collect only).** Find the named recruiter or hiring manager: first the advert itself, then a WebSearch like `site:linkedin.com/in "<Company>" "talent acquisition" London` or the hiring team for that function. Record up to 2 people: name, title, LinkedIn URL, where you found them, confidence (high = named on advert, medium = TA at company in London, low = guess). Never guess a URL; leave blank if not found.
9. **Write `STATUS.md`** in the job folder:
   ```
   Company / Title / URL / ATS / Location / Salary
   Verdict: GO | SKIP (reason) | GO-SPONSOR-RISK
   Notes: years bar, domain gates, FTC end date, closing date
   Files: CV pdf, cover pdf, answers.md
   Recruiters: name | title | url | source | confidence
   ```

## Return to the caller
One markdown table, one row per job: # | Company | Title | Verdict | Reason (short) | ATS | Folder | Recruiter name (or —).
Then any problems (script failures, fetch failures). Keep it under 40 lines.
