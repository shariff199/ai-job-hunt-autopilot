# The job application system: how it works

Written 19 Sept 2026, the night it ran end to end for the first time and put out 24 applications.
This is the operating manual. `DAILY-APPLY-ORCHESTRA.md` is the short daily checklist; this file
explains the parts so a second person can run it without breaking anything.

---

## 1. What it is

A team of AI agents that finds jobs, writes a CV and cover letter for each one, checks its own work,
fills the forms, and stops. **The human presses Submit.** Nothing is sent, posted or messaged without
the person saying yes to the exact words first.

It runs on Claude Code in a terminal, with two browsers:
- **Chrome Default** (their own, logged in) for LinkedIn reading. Read-only.
- **A second Chrome** started on debugging port 9444 with its own profile, for filling application
  forms. Logins made there persist, so portals only need signing into once.

---

## 2. The six roles

| Role | What it does | What it may never do |
|---|---|---|
| **Orchestrator** (the main session) | Runs the stages in order, splits work between agents, checks every agent's output against the pack, keeps the tracker, Notion and the recruiter queue current, reports to them | Start applying before they says start. Press Submit |
| **Sourcing agent** | Finds fresh roles: Indeed MCP, LinkedIn public search, the scored master board, then the employer's own careers site | Apply to anything |
| **LinkedIn agent** | Logged-in LinkedIn job search (last 24 hours and past week), reads the real apply route and the "Meet the hiring team" names | Click Apply, Connect, Message, or send anything |
| **Prep agents** (3-4 in parallel) | Per job: read the advert on the employer's page, vet it, tailor the CV, write the cover letter, run the ATS keyword pass, draft the form answers, find the recruiter | Fill forms, contact anyone, edit the master files |
| **Verifier** | Re-checks every pack against the advert and the fact base. Writes VERIFY.md: READY or FIX | Rewrite CV or letter text (it reports; a prep agent fixes) |
| **Apply agents** (3-6 in parallel) | One browser tab each: fill the form, upload that job's CV and letter, stop before Submit, screenshot, write down every field and value | Press Submit, create accounts, type passwords, click "Apply with LinkedIn" |

**Why so many agents:** 44 adverts had to be read in full, and one session reading 44 adverts runs out
of room. Each agent keeps its own reading in its own head and hands back a short report. That is also
why the reports are the record: `STATUS.md`, `VERIFY.md` and `FORM-STATUS.md` live in the job folder.

---

## 3. How the orchestrator watches the agents

This is the part that stops mistakes reaching a real employer.

1. **Every agent writes its work down in files, not just in chat.** A prep agent writes STATUS.md; an
   apply agent writes FORM-STATUS.md listing every field and the value it typed, plus a full-page
   screenshot of the filled form.
2. **The orchestrator reads those files and compares them to the pack:** right CV file, right cover
   letter, right company name, sponsorship answer correct, salary correct, address correct, no field
   left blank or on a default.
3. **Anything wrong goes back to that agent** with the correction, and the agent re-screenshots.
4. **Independent audits catch what agents miss.** On 19 Sept the orchestrator scanned every filled
   form for the name split and found four forms with "Mohammed" / "the candidate <SURNAME>" instead of
   "<YOUR FIRST NAME>" / "<SURNAME>", and scanned all 44 CVs for skills with no evidence behind them.
5. **Numbers, not impressions.** Keyword coverage is counted out of 15. Word counts are counted. PDF
   text is extracted and compared with the markdown. "Looks fine" is not a check.

---

## 4. How a CV gets tailored to the advert

**The rule underneath everything: the engine may drop a true bullet, it may never write a new one.**

The ledger is `master/bullets.yml`: every publishable bullet split into its parts, each citing the
row in `master/FACT-BASE.md` that licenses it. `tailor-v2.mjs` reads the advert and selects.

1. **Band.** The advert is read as graduate, mid or senior. Leadership bullets are withheld from a
   graduate advert, because there they read as overqualified and get filtered out. Suppressing a true
   bullet is honest; writing a false one is not.
2. **Keywords.** The advert's own terms are counted. They decide which bullets and which of the two
   public-data projects appear, and the order of the Skills lines.
3. **Summary.** Three evidence-carrying lines chosen for this advert, not one fixed paragraph.
4. **Projects.** The two most relevant public-data projects (NHS prescribing ETL, HM Land Registry,
   ONS vacancies, NHS A&E) are promoted above employment when the advert is technical.
5. **ATS keyword pass.** The advert's top 15 terms are listed by hand from the advert (tailor-v2's
   own keyword list is noisy: it matches "rag" inside "average"). Every term they can back up goes into
   the Skills lines **in the advert's own wording**. Terms they cannot back up stay out, and are
   recorded in STATUS.md as `ATS: n/15 covered; missing: ...`.
6. **The cover letter is written from the same selection**, so the CV and the letter cannot drift
   apart, then rewritten through the `humanizer` skill.

### The CV structure (fixed format, chosen by them 2 Sept 2026)

```
# <YOUR NAME>
**<the advert's job title>**              <- headline changes per advert
<your town>, London · phone · email · LinkedIn · GitHub

## Professional Summary                   <- 3 lines, chosen per advert
## Skills
**Functional Competencies:** ...          <- ordered and extended per advert
**Technical Tools:** ...                  <- ordered and extended per advert
## Selected Projects                      <- 2 chosen per advert, with real numbers
## Employment History                     <- <your employer> x2, <a past employer>, <a past employer>
## Education                              <- MSc Data Science (Distinction), B.Tech
## Certifications                         <- PL-300
```

Single column, standard headings, no tables, no graphics, no photo: an ATS parser has to read it.
Two pages. The PDF is built by `generate-cv.mjs`, the letter by `generate-cover-letter.mjs`.

### Skills lines vs sentences (their rule, 19 Sept)

- **Skills lines are loose.** A keyword they have some exposure to, or could credibly do, stays. Missing
  advert keywords they can back up are added.
- **Sentences are strict.** Every sentence in the CV and the letter must be true: no invented numbers,
  no employer they did not work for, no "most of my work is X" overweighting, no availability that
  contradicts the visa, no naming a gap. Interviewers ask about sentences.

---

## 5. What the verifier checks

Per pack, written to VERIFY.md as PASS/FAIL per line, ending READY or FIX:

1. The advert is still live (re-fetched that day).
2. Eligibility vet is right: UK, not student-only, no clearance needed, start/contract end against the
   visa date, closing date, title not senior. **A skill gap is never a reason to skip a job.**
3. The CV is tailored to *this* advert, not the generic master, and every sentence traces to the ledger.
4. ATS: keyword coverage counted; single column; standard headings; PDF text extractable and matching
   the markdown, not a stale file.
5. The letter: right company and role, one specific reason for this company, 3-5 advert keywords used
   naturally, reads like a person wrote it, 250-350 words, correct visa line.
6. `answers.md`: right-to-work answers say they can work now and will need sponsorship after <your visa/right-to-work end date>.

Only READY packs are filled. A FIX goes back to a prep agent and is verified again.

---

## 6. Batch applying

1. They says **start**. Not before.
2. 3-6 apply agents run at once, each with its own tab in the port-9444 Chrome.
3. Each fills its form, uploads that job's CV and cover letter, ticks privacy/data-processing consents,
   **stops before Submit**, saves `PRE-SUBMIT.png` and `FORM-STATUS.md`.
4. Anything only they can answer is left empty and listed, never guessed.
5. A login wall or an account requirement is marked BLOCKED and the agent moves on; it never waits.
6. The orchestrator checks every FORM-STATUS against the pack and sends corrections back.
7. They goes through the tabs, reads each form, and presses Submit himself.
8. Each submitted job is logged: a TSV in `batch/tracker-additions/` merged with `merge-tracker.mjs`,
   then `notion-log.mjs sync`, then a row in that week's recruiter queue.

**Standing answers so nobody asks twice:** right to work now, sponsorship needed after <your visa/right-to-work end date>;
the address they put on applications (which may not be where they live); their legal name split exactly as their passport has it; available immediately; salary as agreed for that day's batch; consents may be ticked
and are reported back; never an e-signature, never an account, never a password.

---

## 7. Reaching out to recruiters

**After applying, never instead of applying.** Both interviews in this search came from a person.

- Every submitted application puts a row in `data/fulltime/RECRUITER-QUEUE-<date>.md`: the named
  recruiter or hiring manager, their title, LinkedIn URL, where the name came from, and a confidence.
- **Weekdays only. Nothing after 18:00 UK time.** A note landing at 22:00 or on a Sunday reads as
  desperate and is buried by Monday.
- Outreach happens the next working day, not in the same sitting as the applications.
- **No cold DMs.** Every target needs a submitted application, an open thread, or an accepted invite
  behind it. About 30 cold "anything on your desk?" messages went out 1-16 Sept and got zero replies.
- Max 3 new recruiter contacts a week. Personalise with a real signal or do not send it.
- ~55 words, "you" and "your" outnumbering "I" and "my", the work-rights line early, and an
  interest-based ask ("Worth having my CV on file for your data desk?"), never "can we jump on a call".
- **They reads the exact final text and says yes before anything is sent.** Summarising a draft is not
  showing it. A rejection since the draft was written invalidates the draft.
- Name-blind sifts (e.g. Applied): no outreach at all.

---

## 8. What one full day looks like

The first end-to-end run of this system, by its author, on 19 September 2026:

| Stage | Number |
|---|---|
| Roles ranked on the board | 3,922 |
| Shortlisted (direct employer, right band, under 24 days old, sponsor-licensed) | 98 |
| Still live when checked | 45 |
| Packs prepared (CV, letter, answers, recruiter) | 44 |
| Verified READY | 44 |
| Forms filled by apply agents | 24 |
| **Submitted (every Submit pressed by hand)** | **24** |

It took one evening with 12 agents, and about 20 to 40 minutes of agent attention per job.
The 20 not filled were waiting on portal accounts that only the candidate can create.

## 9. The files

| File | What it is |
|---|---|
| `job-hunt/DAILY-APPLY-ORCHESTRA.md` | The daily checklist: 8 stages, who does what |
| `job-hunt/AGENT-BRIEF.md` | The prep agent's rules (vet, tailor, ATS, letter, PDFs, recruiter) |
| `job-hunt/APPLY-BRIEF.md` | The apply agent's rules (browser, fill, stop, screenshot) |
| `job-hunt/SYSTEM-HANDBOOK.md` | This file |
| `master/FACT-BASE.md` | What is true about them, and what is banned. The source of every claim |
| `master/bullets.yml` | Every publishable bullet, split and cited, for the engine to select from |
| `tailor-v2.mjs` | Reads the advert, selects bullets, writes cv.md + cover-letter.txt + match-report.md |
| `generate-cv.mjs`, `generate-cover-letter.mjs` | Markdown to ATS-readable PDF |
| `check-liveness.mjs`, `vet-advert.mjs`, `sponsor-check.mjs`, `sponsor-mine.mjs` | Is it live, is it eligible, do they hold a sponsor licence |
| `merge-tracker.mjs`, `notion-log.mjs` | Logging: tracker rows, then the Notion mirror |
| `data/applications.md` | The tracker. The source of truth (gitignored: it holds personal detail) |
| `data/fulltime/RECRUITER-QUEUE-*.md` | Who to contact next working day, and nobody contacted yet |
| `output/tailored-<date>/<job>/` | One folder per job: jd, cv, letter, PDFs, answers, STATUS, VERIFY, screenshot |

---

## 10. The rules that exist because something went wrong

- **A job list with no URL is worthless.** Build from the data files that carry the link.
- **An aggregator link dying is not the job dying.** Check the employer's own careers page.
- **A sponsor licence is not a promise to sponsor.** <an employer> holds one and says on its own form
  that it only sponsors Principal Engineer and Technical Lead roles.
- **A match score is a keyword count, not a judgement.** Read the advert.
- **Never trust a filled form you have not read back.** Four forms had the wrong name split.
- **Never trust a default in a config file.** The profile still said <an old town left in a config> after the move to London;
  every cover letter PDF carried a <an old town left in a config> header until it was measured.
- **Skills a tool invents are not skills.** "Data Governance" was on 20 CVs with nothing behind it.
- **A long text typed into a web form can silently lose characters.** Set the value, read it back,
  count the characters.
