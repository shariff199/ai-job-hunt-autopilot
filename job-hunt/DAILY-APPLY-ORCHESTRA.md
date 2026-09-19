# Daily apply run: the structure

First run: Sat 19 Sept 2026. Run it every day. Nothing is applied until the candidate says "start".

## Who does what

| Role | Works in | Does | Never does |
|---|---|---|---|
| **Orchestrator** (the main Claude session) | Terminal | Runs the stages in order, merges results, shows them every decision, keeps the tracker, Notion and recruiter queue current | Starts applying before they says start |
| **Prep agents** (3-4 in parallel) | Terminal + employer careers sites | Read each advert on the employer's own page, vet it, tailor the CV, write the cover letter, draft form answers, find the recruiter | Fill forms, contact anyone, edit master files |
| **Sourcing agent** | Indeed MCP + LinkedIn public search + careers sites | Finds fresh roles (last 24h, past week) at licensed sponsors not already applied to | Apply |
| **LinkedIn agent** | Claude in Chrome, their Chrome Default (a972bff6) | Logged-in LinkedIn job search, last 24h and past week; records Easy Apply vs company site and "Meet the hiring team" | Click Apply, Connect, Message; send anything |
| **Verifier** | Terminal | Re-checks every pack: advert live, vet correct, every claim traced to FACT-BASE / bullets.yml, cover letter rules, PDFs match | Rewrite text (reports only) |
| **Apply agents** (3-4 in parallel) | Separate Chrome, port 9444 (profile `.apply-chrome-profile/`, logins persist), one tab each | Fill forms in parallel, upload the tailored CV and cover letter, stop before Submit, screenshot | Press Submit, create accounts, enter passwords |
| **the candidate** | Both Chromes | Logs in, creates Workday/ATS accounts when told, answers the "their call" questions, reads cover letters, **presses Submit** | |

## The stages, in order

**Stage 1. Inbox first.** Orchestrator reads all job inboxes (`node gmail-sync.mjs digest --days 2 --inbox 1` and `updates`). Replies to humans outrank everything. Tracker statuses updated, Notion synced.

**Stage 2. Find.** In parallel:
- Sourcing agent: Indeed MCP + LinkedIn guest search, then the employer careers site for each.
- LinkedIn agent: logged-in search, last 24h and past week, entry and associate level.
- Orchestrator: the board (`reports/MASTER-ALL-JOBS-*.csv`), P1/P2, direct employer ATS links only, then `node check-liveness.mjs`.
Filter: licensed sponsor first, not already in `data/applications.md`, no senior/lead/manager, UK only.

**Stage 3. Prep.** Prep agents follow `job-hunt/AGENT-BRIEF.md` for every job:
1. Advert text from the employer's own page, saved as `jd.txt`.
2. Vet for eligibility only: UK, not student-only, no clearance needed, FTC/start vs 12 <your visa/right-to-work end date>, closing date, title not senior. Skill and domain gaps never skip a job. AI and Claude engineer roles count.
3. `node tailor-v2.mjs --jd-file jd.txt --company X --title Y`. Picks true bullets from `master/bullets.yml` for the advert's level. Reads the MISSING list.
4. ATS keyword pass (top 15 advert keywords, truthful ones in the advert's wording), then cover letter from the same selection, humanizer pass, 250-350 words, their voice rules.
5. `generate-cv.mjs` and `generate-cover-letter.mjs` make the PDFs.
6. `answers.md` for form questions; anything not in the fact base is marked HIS CALL.
7. Recruiter / hiring manager, collected only.
Output: `output/tailored-<date>/<company-role>/` with STATUS.md (GO / SKIP + reason).

**Stage 4. Verify.** Verifier writes VERIFY.md per GO pack: READY or FIX. Only READY packs go forward. It checks:
- Advert live; eligibility vet correct (skill gaps are NOT a skip reason).
- CV tailored: bullets chosen for this advert, not the generic master; every SENTENCE traced to FACT-BASE / bullets.yml (skills lines are the loose part, sentences are not).
- ATS: score with `node ats-check.mjs <date>` (never a hand count); add the advert's missing keywords they can reasonably back up to the Skills lines (skills lines are loose: exposure or credible ability is enough; never strip a label just for being off the approved list); in the advert's own wording; single column, standard headings, PDF text extractable and matches cv.md.
- Cover letter: names the right company and role, one specific reason for this company, 3-5 advert keywords used naturally, reads human (humanizer rules, no stock AI words), 250-350 words, visa line correct.
Anything FIX goes back to a prep agent and is re-verified.

**Stage 5. Decision sheet (STOP HERE).** Orchestrator shows them one list:
- READY jobs, in apply order, with salary, location, route, and any HIS CALL questions.
- Skipped jobs with the reason.
- Accounts they must create (Workday etc.).
- The first two cover letters in full; the rest spot-checked.
**They says "start".** Nothing before this.

**Stage 6. Apply in a batch.** Several apply agents run in parallel, each in its own tab of the port 9444 Chrome (Playwright `connectOverCDP`, one page per job). Each fills its form, uploads that job's tailored CV and letter, stops before Submit, and saves a full-page screenshot to the job folder (`PRE-SUBMIT.png`) plus a `FORM-STATUS.md` (filled / blocked + why).
Orchestrator watches every apply agent: reads each FORM-STATUS.md (every field and the value entered), checks it against the job's answers.md and pack (right CV and letter uploaded, right company, sponsorship answer correct, no field left on a default), and opens the screenshot. Anything wrong is sent back to that agent to correct before the tab reaches them. Then one review sheet: job, tab title, screenshot, any blocker. They goes tab by tab, checks, presses Submit on each. Blocked forms are fixed together at the end.
- Before the batch starts: all their account logins (Workday etc.) are done in one sitting from the Stage 5 list, so agents don't stall mid-batch.
- Workday / login walls hit anyway: agent marks it BLOCKED and moves on; never waits.
- Easy Apply only when no company-site route exists; they clicks Upload and picks the named file.
- Indeed Apply: runs in the 9444 Chrome (blocked in Claude in Chrome); they uploads the tailored CV, never the profile's stored CV.

**Stage 7. Log.** After each Submit: tracker row via a TSV in `batch/tracker-additions/` then `node merge-tracker.mjs` (never hand-add rows), `node notion-log.mjs sync --id N`, recruiter row in the week's `data/fulltime/RECRUITER-QUEUE-*.md`.

**Stage 8. Close.** STATE.md updated, commit and push career-ops, receipt.

## Outreach: the sending window (their rule, 19 Sept 2026)

- **Weekdays only. Never Saturday or Sunday.**
- **Nothing sent after 18:00 UK time.** A message that lands at 22:00 reads as desperate and gets buried by the morning.
- Outreach runs the day after an apply batch (a Monday after a weekend batch), never in the same sitting as the applications.
- Only for applications they actually submitted: draft each note, humanizer pass, show them the exact text, send only on their yes. No cold DMs (about 30 went out 1-16 Sept, 0 replies).
- If the window has passed, the drafts wait for the next weekday morning. Nothing is sent "quickly before midnight".

## Their standing answers (so nobody asks twice)

- Right to work: yes, now, Graduate visa to <your visa/right-to-work end date>. Sponsorship: needed after <your visa/right-to-work end date> ("now or in future" = Yes).
- Location: <your town>, London. Manchester or elsewhere: ask them per job.
- Salary: ask them per job unless they have given a range for the day.
- Consent / privacy boxes on forms: may tick; say what was agreed.
- Work history: closed. <a past employer>, <a past employer> stay as tailor-v2 emits them; Amazon never on data CVs.
