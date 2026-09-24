# How we make CVs and apply: the working rules

Written 24 Sept 2026 from the full-time search that submitted 18 applications that day. It adds
what we learned from 20 to 24 Sept to `SYSTEM-HANDBOOK.md`. Read this first, then the handbook for
the agent set-up.

Contents:
1. The loop for one job
2. Finding jobs
3. Reading and vetting the advert
4. How the CV is built
5. How the CV is tailored to one advert
6. ATS rules
7. Cover letters
8. Filling the form (scripts)
9. Standing answers for forms
10. Things on forms that submit without asking
11. After you submit
12. Email sync
13. LinkedIn outreach
14. Several terminals at once
15. Commands cheat sheet
16. Review: known bugs and what to improve next

---

## 1. The loop for one job

1. Find the job, then open the employer's own advert. An aggregator link is not the advert.
2. Vet it (section 3). Most jobs die here, and that's cheap.
3. Build the pack: tailored CV PDF, cover letter, answers. `make-pack.mjs` or `easyapply.mjs` do
   this without any model tokens.
4. Fill the form with a script, never by hand-driving a browser from Claude (that costs thousands of
   tokens per job).
5. The script stops on the Review page. **You read it and press Submit yourself.**
6. Confirm by the confirmation email, not by "done" on screen.
7. Log it: one TSV row in `batch/tracker-additions/`, then `node merge-tracker.mjs`.
8. Next working day: a short note to a named person at that company (section 13).

---

## 2. Finding jobs

Sponsorship is the filter that matters, so every source is checked against the Home Office sponsor
register.

| Source | Command | Notes |
|---|---|---|
| Sponsor register mining | `node sponsor-mine.mjs` | The register is the target list. Fix a missed company in `data/sponsor-aliases.md`, never by loosening the matcher |
| Greenhouse / Ashby / Lever boards | `node scan.mjs` | Zero tokens, hits the job-board APIs directly |
| GOV.UK Find a Job | `node scan-workhub.mjs --pages 5 --location London` | Checks every employer against the register, drops ones already applied to |
| LinkedIn | guest API, no login: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<id>` | Use it to read the advert and check it is still open before anything else |
| Workday employers | the CXS API: `https://<tenant>.wd3.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs` | `make-pack.mjs --url` reads the advert this way |
| Is it still live? | `node check-liveness.mjs <url>` | |

Graduate schemes, banks, retail head offices, compliance and project roles are all in scope, not
just "Data Analyst". What decides it is whether the job code can be sponsored:

- RQF 6 codes are sponsorable. Examples with their new-entrant floor: 2431 business analyst ~£35.1K,
  2440 project manager ~£39.6K, 2482 compliance ~£33.7K, 2426 research £33.4K, 2422 finance £33.4K,
  2133 IT business analyst ~£38.4K.
- Data Analyst (3544) is sponsorable only through the Temporary Shortage List, which ends
  31 Dec 2026.
- Caseworker and admin roles (RQF 3-5) are not sponsorable for new applicants.
- The general floor is £33,400. A job paying less cannot carry the visa.

---

## 3. Reading and vetting the advert

Read the advert yourself. A match score is a keyword count. Once a platform scored a CV at 92.84%
against a job asking for seven years, when the candidate had four.

Drop the job if any of these is true:
- The years bar is well above yours (5+ years for a junior profile).
- A domain is required first in the list and you have none of it (capital markets, SAP,
  insurance syndicates, clinical).
- It needs SC/DV/CTC security clearance (needs 5-10 years of UK residence).
- The contract ends after your visa and they won't sponsor.
- "Indefinite right to work only", or "we do not sponsor".
- It's an agency repost of a job you can reach directly.
- It's closed (the LinkedIn guest API says "No longer accepting applications").

A skill gap alone is never a reason to skip.

---

## 4. How the CV is built

**The rule underneath everything: the engine may drop a true bullet. It may never write a new one.**

| File | What it is | Tracked in git? |
|---|---|---|
| `master/FACT-BASE.md` | Everything true about you: jobs, dates, numbers, projects. Every claim cites a row here | No (personal) |
| `master/bullets.yml` | Every publishable bullet, split and tagged, each citing its FACT-BASE row | No (`bullets.example.yml` shows the shape) |
| `config/profile.yml` | Name, contact line, right-to-work line, and the `lean:` block for the one-page CV | No (`profile.example.yml`) |
| `master/cover-letter-facts.md` | The only facts a generated cover letter may use | No |
| `tailor-v2.mjs` | Reads the advert, picks bullets and projects, writes `cv.md` and `match-report.md` | Yes |
| `generate-cv.mjs` | Turns `cv.md` into an ATS-readable PDF (Playwright + Chrome) | Yes |

The CV layout, fixed:

```
# NAME
**One neutral job-family title**        e.g. Data Analyst, Business Analyst, Data Engineer
Town, London | phone | email | linkedin | github

## Professional Summary                 3 plain lines
## Skills                               Functional Competencies line + Technical Tools line
## Employment History                   Company | Role @@ dates   (3-5 bullets each)
## Selected Projects                    2, with real numbers
## Education
## Certifications
Right-to-work line
```

Format rules:
- One job title under the name. It's a job family picked by `headlineFor()`, never the advert's full
  title and never two or three titles stacked.
- No bold inside bullets, no tables, no columns, no photo, no graphics. An ATS has to parse it.
- Bullets are flat job-description sentences ("Built a Power BI report with DAX and scheduled
  refresh that cut weekly reporting from four hours to ten minutes"), with no voice and no adjectives.
- Skills go above Employment on data and technical CVs, and below it on operations and part-time
  CVs.
- Numbers only from the fact base. Keep the number that is the point of the bullet. Drop the
  decorative ones.

---

## 5. How the CV is tailored to one advert

`tailor-v2.mjs` does it in this order:

1. **Band** from the advert title: `grad` (graduate, junior, entry level, trainee, assistant),
   `senior` (senior, lead, manager, principal), otherwise `mid`. If the title says nothing, the
   years asked in the body decide.
2. **Keywords**: the advert's terms are counted with word boundaries (an old bug matched "rag" inside
   "average"). They decide which bullets, which projects and the order of the Skills lines.
3. **Bullets**: the most relevant bullets for this advert, taken from the ledger. Leadership bullets
   are held back from grad and junior adverts.
4. **Projects**: the most relevant two.
5. **Skills lines**: ordered by the advert. An advert term you can back up is added in the advert's
   own wording.

**Lean mode** (`--lean`, and always for `grad`) is the one-page CV for graduate schemes, entry-level
and junior roles. It exists so a graduate recruiter doesn't read you as over-qualified:
- the headline is the degree ("MSc Data Science Graduate") on grad adverts
- Education comes first, with dissertation and coursework bullets
- your current job appears once, under its plain title, with any senior title only as a small italic
  note
- 4 bullets, chosen by relevance, with no leadership, "team of", "portfolio of" or content-engine
  material
- projects fill a length budget (300 characters grad, 520 otherwise), 2 at most, so it stays on
  one page
- facts are never changed, only selected and reordered

Everything personal in lean mode (headline, summary lines, education, which role feeds it, which
bullet phrases to trim) lives in the `lean:` block of `config/profile.yml`. A grad advert gets the
lean CV only when that block exists. `--lean` forces it.

**Skills lines vs sentences:** a Skills line can carry a tool you have used a little. A sentence
must be true in every word, because interviewers ask about sentences.

Check every CV after building it:
- `node ats-check.mjs <YYYY-MM-DD>` gives keyword coverage per CV, and flags any CV that claims
  something the fact base can't back or went out untailored
- page count: `mkcv.sh` prints it. Lean should be 1 page, full 2
- open the PDF once. The PDF text must match `cv.md`, not a stale earlier file

---

## 6. ATS rules

- One column, standard headings (Professional Summary, Skills, Employment History, Education,
  Certifications), real text (no images of text), a PDF made from HTML, 10-11pt.
- File name `CV-First-Last-Company.pdf`. Recruiters see it.
- The advert's exact words for skills you really have ("Power Query", not "PQ").
- Job titles and dates in the same format on every role: `Company | Role @@ Month YYYY - Month YYYY`.
- No headers or footers holding contact details. Some parsers drop them.
- Don't stuff keywords. A term with no evidence in the body is spotted in the first interview
  question.

---

## 7. Cover letters

Use one wherever the form takes one. About 250-350 words:
1. Greeting to the team. Why this role and company in one specific line in their words.
2. Two short evidence paragraphs matched to their top two requirements.
3. Qualifications once. Name a certification once, not five times.
4. The work-rights line: can work now on the Graduate visa, will need sponsorship after.
5. Sign-off with phone and email.

`make-pack.mjs` drafts it with Gemini from `master/cover-letter-facts.md` only. **Fact-check every
generated letter before sending:** on 21-22 Sept, 3 of 4 invented a feeling or a claim. Never write
a gap into a letter ("I have not used X"). Name the nearest real tool you have used and stop there.
Run it through the `humanizer` skill so it doesn't read machine-written.

---

## 8. Filling the form (scripts)

Two browsers, both started once and kept logged in:

| Browser | Start it | Used for |
|---|---|---|
| Apply Chrome, CDP port 9444 | see `open-logins.mjs` / the handbook | Employer portals: Workday, Oracle, SuccessFactors, iCIMS, Greenhouse, Ashby |
| LinkedIn Chrome, CDP port 9555 | `./launch-linkedin-chrome.sh`, then log into LinkedIn once | Easy Apply only |

| Form type | Command |
|---|---|
| Build a pack from any advert | `node make-pack.mjs --url <workday url> --company X --slug X-Role [--band grad]` or `--jd-file jd.txt --title "..."` |
| Workday | `node workday-apply.mjs --match <url-part> --files cv.pdf,cover.pdf`. Answers come from `config/workday-profile.json` |
| LinkedIn Easy Apply | `node easyapply.mjs --id <job id> --company "X" --title "Y"`. It tailors the CV, fills every page, uploads, and stops at Review. Add `--submit` only after you have read the Review page |
| One CV only | `scripts/mkcv.sh <linkedin id> "<Company>" "<Title>" <Short>` |
| Cost of an application | `node token-log.mjs --session <id> --since <ISO> --company X --role Y` |

Exit codes for `easyapply.mjs`: 0 = at Review or submitted, 2 = a question it has no rule for (add
the rule to `config/easyapply-answers.json`, don't answer by hand), 3 = closed / not Easy Apply /
already applied, 4 = not logged in.

When a form asks something new, add the answer to the config, not to a one-off. The next form then
fills itself.

---

## 9. Standing answers for forms

Every value lives in your config files (`config/easyapply-answers.json`,
`config/workday-profile.json`, and your own `diversity-answers.md` outside the repo). Rules:

- **Two sponsorship questions, opposite answers.** "Do you need sponsorship now or in future?" →
  **Yes**. "Do you have the right to work WITHOUT sponsorship?" → **No**. One script answered Yes to
  the second once, and it was caught on the Review page. The rule order in the answers file matters:
  the "without sponsorship" rule must come before the generic "sponsor" rule.
- "Are you legally allowed to work in the UK now?" → Yes (Graduate visa).
- "Subject to immigration control?" → Yes.
- Salary ask: the midpoint of the advert's band. With no band, the London market rate for that title
  (Reed / Glassdoor / ITJobsWatch). Never below £33,400 on a job meant to carry the visa. Current
  salary is a different question: give your real one. Check the pay-frequency box. Oracle has
  defaulted to Monthly before.
- Notice: available immediately.
- **Diversity fields: fill them all with your real answers.** "Prefer not to say" is not a default.
- Years of experience: only what the fact base supports. LinkedIn pre-fills answers you gave on
  earlier forms, and the script leaves a filled field alone, so read every number on the Review page.
  A wrong "1 year of GCP" from an old form survived until the Review page on 24 Sept.
- Where did you hear about us: LinkedIn, or the real source.

---

## 10. Things on forms that submit without asking

Each of these sent an application before the candidate had approved it:
- **Workday: never press Escape and never click blind coordinates.** It activates the footer's
  primary button, and on the Review page that button is Submit.
- **amazon.jobs Review page** has a sticky Submit bar. Stray clicks submit. Read it with innerText
  only.
- **Chatbot forms (Paradox/Olivia type):** answering the consent question submits the application
  with whatever CV is on file. Upload the tailored CV first.
- **LinkedIn Easy Apply "Import profile"** is a different input from "Upload resume". Uploading into
  it scrambles every field.

---

## 11. After you submit

- Confirm it by the email ("we've received your application"). A form that looks finished may still
  be sitting on its Equal Opportunities page.
- Log it: TSV in `batch/tracker-additions/`, then `node merge-tracker.mjs`.
- Status changes (rejection, interview) go in `data/applications.md`, and the live picture in
  `data/<lane>/STATE.md`: one STATE file per lane, overwritten, never a new HANDOFF file.

---

## 12. Email sync

`gmail-sync.mjs` reads your Gmail over IMAP, finds job mail (confirmations, rejections, interview
invites, assessment links), and matches it to your tracker rows. It can draft replies. **It sends
nothing unless you pass `--send`**, and you only do that after reading the exact text.

Set up once:
1. Turn on 2-step verification on the Google account, then create an **App password**
   (myaccount.google.com → Security → App passwords). It is 16 letters.
2. Put it in `.env` (gitignored, never committed), one pair per mailbox:
   ```
   GMAIL_INBOX1_EMAIL=you@gmail.com
   GMAIL_INBOX1_APP_PASSWORD=abcdabcdabcdabcd
   GMAIL_INBOX2_EMAIL=second@gmail.com
   GMAIL_INBOX2_APP_PASSWORD=...
   ```
3. Test: `node gmail-sync.mjs digest --inbox 1 --days 3`

Daily use:
| Command | What it does |
|---|---|
| `node gmail-sync.mjs digest --inbox 1 --days 2` | Job mail from the last 2 days, classified |
| `node gmail-sync.mjs updates --inbox 1` | Only replies from companies you applied to |
| `node gmail-sync.mjs read --inbox 1 --uid <uid>` | Read one email (HTML-only emails are converted to text) |
| `node gmail-sync.mjs reply --inbox 1 --uid <uid> --body-file r.txt` | Shows the draft reply, To and Subject. Add `--send` to send it |

The digest filters out alerts and newsletters. It has also filtered out an assessment invite before.
When you are waiting for something specific, search All Mail for a keyword as well.

An app password gives full read and send access to that mailbox. Keep it in `.env` only, never in a
committed file. If it leaks, delete it in Google Security and make a new one.

---

## 13. LinkedIn outreach

What worked and what didn't, measured from 1 to 24 Sept:
- About 30 cold "anything on your desk?" messages to recruiters: **0 replies.** Don't send cold DMs.
- Every message needs something behind it: an application you have submitted, a thread they
  started, or an invite they accepted.
- After you apply: one short casual note to a named person at that company ("Hi X, I have applied for
  the Y role…"), next working day. It isn't a project showcase.
- Weekdays only, before 18:00. Max 3 new recruiter contacts a week.
- About 55 words. "You/your" should outnumber "I/my". Put the work-rights line early. The ask is
  interest-based ("worth having my CV on file?"), never "can we jump on a call".
- Don't chase people who didn't reply. Keep following up with anyone who does.
- No outreach at all for name-blind sifts (Civil Service, Applied).
- Read the exact text before it is sent, every time. A rejection since a draft was written makes
  the draft wrong.
- Replying inside an existing thread is free. A Message button on a 2nd/3rd-degree profile with no
  thread uses a paid InMail credit.
- Check the advert is still open (guest API) before writing "I've applied" to anyone.

---

## 14. Several terminals at once

We run 4-6 Claude Code terminals at once (full-time jobs, part-time jobs, LinkedIn, email). Three
things keep them from contradicting each other:

1. **One home per fact.** Application status lives only in `data/applications.md`, and the lane's
   live picture only in `data/<lane>/STATE.md`. Terminals read those. They never keep their own copy
   of a count or a date.
2. **The other-terminals feed** (`tools/terminal-feed/`). A hook runs on every message you type. It
   tells the current terminal what you said in your other terminals and which files they changed
   since it last heard from you. It reads the transcripts Claude Code already writes, so no terminal
   has to remember to report. Install it by adding this to `~/.claude/settings.json`:
   ```json
   "hooks": { "UserPromptSubmit": [ { "hooks": [ { "type": "command",
     "command": "python3 ~/code/ai-job-search-automation/tools/terminal-feed/hook.py" } ] } ] }
   ```
   Merge it into any `hooks` block you already have. Test with
   `echo '{"session_id":"x"}' | python3 tools/terminal-feed/hook.py`.
3. **Commit and push when a terminal finishes something**, so the STATE file other terminals read is
   current.

Split the lanes by terminal: one for full-time applications, one for part-time, one for LinkedIn,
and one for email and admin. Two terminals should never fill forms in the same browser tab.

---

## 15. Commands cheat sheet

```bash
# setup, once
npm install && npx playwright install chromium
cp config/profile.example.yml config/profile.yml            # then fill it
cp master/bullets.example.yml master/bullets.yml            # then fill it from your FACT-BASE
cp config/easyapply-answers.example.json config/easyapply-answers.json
cp config/workday-profile.example.json config/workday-profile.json
cp master/cover-letter-facts.example.md master/cover-letter-facts.md
echo GEMINI_API_KEY=... >> .env                 # for cover letters (free key: aistudio.google.com)
node tailor-v2.mjs --self-test                 # should say 40 passed, 0 failed
node doctor.mjs

# find
node sponsor-mine.mjs ; node scan.mjs ; node scan-workhub.mjs --pages 5

# build + check
node make-pack.mjs --jd-file jds/x.txt --title "Data Analyst" --company X --slug x-data-analyst
node ats-check.mjs $(date +%F)

# fill
./launch-linkedin-chrome.sh                   # once, log in
node easyapply.mjs --id 4470298607 --company "X" --title "Y"
node workday-apply.mjs --match <url-part> --files cv.pdf,cover.pdf

# log + mail
node merge-tracker.mjs
node gmail-sync.mjs digest --inbox 1 --days 2
```

---

## 16. Review: known bugs and what to improve next

Checked on 24 Sept against the 33 CVs built that day:

**Working:** `ats-check` found 0 CVs claiming anything the fact base can't back, and 0 untailored CVs
sent. Across the 33 CVs, the most common bullet set was used only 5 times, so the tailoring really
varies. Lean CVs fit on one page.

**Bugs and weak spots, most important first:**
1. **Keyword coverage is overstated.** The match report pulls only 2-6 terms from most adverts, so
   "100%" often means 3 of 3. Pull the advert's top 15 terms by hand for jobs that matter.
2. **Advert skills with no evidence in the body.** Measured 19 Sept: most advert-specific skills sit
   only on the Skills line. A term that matters should also appear in a bullet or project that
   proves it, or come off.
3. **The lean summary is fixed text.** Every lean CV opens with the same three lines. It should be
   chosen per advert, the way the full CV's summary is.
4. **The lean Technical Tools line barely changes** between adverts (the same line on 6 CVs). It
   should reorder by the advert's terms, like the full CV.
5. **Easy Apply keeps LinkedIn's pre-filled answers.** The script skips any field that already has a
   value, so a wrong answer from an old form survives. Read every number on the Review page.
6. **Checkbox groups and some consent boxes don't tick from script** on SmartRecruiters-style
   Easy Apply pages ("Where did you hear about us", "I consent"). They need a real click. The script
   stops (exit 2) so you can do it.
7. **Long Easy Apply runs time out** when driven through Claude in Chrome (45s limit). Run 3 steps at
   a time, or use `easyapply.mjs` on port 9555, which has no limit.
8. **Salary is one number in the answers file.** The rule is per advert (section 9). Change it per
   job until the script reads the band from the advert.
9. **Gemini cover letters fail at busy times** (HTTP 503) and there's no retry. Re-run `make-pack`
   for the letter, then fact-check it.
10. **The email digest can hide an assessment invite.** Search All Mail when you're expecting one.
