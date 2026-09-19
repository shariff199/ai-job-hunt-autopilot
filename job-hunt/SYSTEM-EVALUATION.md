# System evaluation

An adversarial review of this system, run on a real 44-application batch before it was handed
to a second person. Names and personal details are replaced with placeholders. Every number
comes from a script, not a reading. Read section 7 and the fix list before you trust anything.

---


Adversarial review of the 44 application packs in `output/tailored-2026-09-19/`, run before the
system is handed to a second person. Every number below comes from a script, not a reading.
Scripts live in the session scratchpad (`eval/q1_tailoring.py`, `q2_keywords.py`, `q3_skills.py`,
`q4_bullets.py`, `q4_numbers.py`, `q5_artifacts.py`, `substr_all2.py`, `repro-test/regen.py`,
`repro-test/diffgen.py`). Nothing in `output/`, `master/` or `config/` was edited.

Scope: 52 folders exist; 8 hold only `STATUS.md` + `jd.txt` (all SKIP verdicts — Denmark, Vietnam,
Colombia, Philippines, two US roles, an undergraduate-only placement, one FTC past the visa).
44 folders hold a full pack. 24 of those 44 also have `FORM-STATUS.md` and `PRE-SUBMIT.png`.

---

## 1. Is the CV tailored, or 44 copies of one file?

**It is tailored. Not one CV is a copy of another, and the variation is structural, not cosmetic.**

- 44 of 44 `cv.md` files are byte-distinct. **No identical pairs.**
- Average lines differing from the centroid CV (`aircall-forward-deployed-engineer-ai-solutions`,
  the pack closest to all others): **22.30%**. Median 20.72%, min 7.14%, max 50.85%
  (`metaview-implementation-specialist`).
- 33 lines appear in all 44 CVs, out of 175 distinct lines corpus-wide and ~50.5 distinct lines per
  CV. **The fixed core is 65% of an average CV; 35% moves per advert.**

Per section:

| Section | Distinct values across 44 | Largest identical group |
|---|---|---|
| Headline / title line | 16 | 19 (`Data Analyst`) |
| Professional Summary | 13 | 26 |
| Skills | **44** | 1 |
| Selected Projects (which ones, in what order) | 16 | 9 |
| Employment History (bullet set) | 43 | 2 |
| Education | **1** | 44 |
| Certifications | 2 | 36 |

Detail worth knowing:

- **Summary variation sits entirely in line 2.** Line 1 (credential) is identical in 44/44, line 3
  (scope) has 3 variants, line 2 (delivery evidence) has 11. That is the design working — but it
  means the first sentence a recruiter reads is the same on every application.
- **Employment bullets: 18 distinct bullets exist in the whole corpus. 10 appear in all 44 packs.
  Only 4 appear in 3 packs or fewer.** So "43 distinct bullet sets" is really selection and
  re-ordering of a pool of 18, with 10 always present. That is honest (the engine selects, never
  writes) but it caps how different two CVs can look.
- **Project selection genuinely moves**: 5 projects, 2–4 shown, 16 distinct selections. <a personal project>
  appears only on 11 packs (the AI/automation adverts), which is correct targeting.
- Headline: 19 of 44 say `Data Analyst`. `headlineFor()` maps the advert title to one of ~22
  canned headlines. See §6 — this mapping loses the advert's actual title, which is the single
  highest-value ATS keyword.

**Verdict: passes.** This is the strongest part of the system.

---

## 2. Does tailoring track the advert?

Keyword lists taken from each pack's `match-report.md`; coverage measured against `pdftotext` of
the shipped CV PDF.

- **Median coverage 14.0/15 (93%). Mean 13.8/15. No pack below 8/15 equivalent.**
- Distribution of raw hits: 15/15 ×5, 14/15 ×7, 13 ×3, 12 ×4, 11 ×5, 10 ×6, rest below.

That headline number is misleading, for three measured reasons.

### 2a. "Top 15" is not 15. It is however many the vocabulary happened to hit.

**30 of 44 match-reports list fewer than 15 keywords.** `acturis` and `oaknorth` list **3**.
`jpmorganchase` lists 5. `globaldata`, `linklaters-people-transformation`, `metaview-implementation`,
`nest`, `octopus-energy` list 6.

`keywordsFrom()` scores a fixed `VOCAB` against the advert and takes the top 15 — there is no floor
and no fallback to advert-native terms. An advert written in plain English scores almost nothing,
and the resulting "3/3 covered" reads as a perfect score.

### 2b. 15% of all keyword slots are substring artefacts.

Measured across all 488 keyword slots in the 44 match-reports, allowing normal inflections
(`insight`→`insights`, `api`→`APIs`):

**75 of 488 slots (15%) are terms that never appear in the advert as a word. 38 of 44 packs affected.**

| Phantom term | Slots | What it actually matched in the advert |
|---|---|---|
| `rag` | 23 | Leverage, average, courage, storage, pragmatic |
| `api` | 12 | Capital, CapitalG, rapid, rapidly |
| `git` | 11 | GitHub, Legitimate, digit, digital, digitally |
| `rest` | 11 | Interested, Interests, Restaurant |
| `excel` | 6 | Excellent, excellence |
| `automate` | 4 | automated |
| `data model` | 3 | data modelling |
| `aws` | 2 | Laws, laws |
| `elt` | 1 | novelty |
| `rpa` | 1 | counterparty |
| `etl` | 1 | quietly |

`tailor-v2.mjs:128` builds the matcher with `new RegExp(term, 'g')` — no word boundaries. This is
the exact failure pattern already recorded in memory as *"substring matching keeps breaking things."*

Consequences that actually shipped: 11 packs list `git` as a top advert keyword when the advert says
"digital"; the CV then carries Git to cover it. `the-guardian` and `verkada` STATUS lines record
`rag` as a **missing** keyword — the agent was chasing a keyword no advert ever asked for.

### 2c. The self-reported ATS numbers are wrong in 30 of 44 packs.

`STATUS.md` and `VERIFY.md` both record `ATS: n/15`. Measured against the actual PDF:

**30 of 44 packs have a STATUS or VERIFY number that disagrees with measurement.** 9 packs have no
ATS line in STATUS.md at all, though step 4 of AGENT-BRIEF requires one.

Worst disagreements:

| Pack | Measured | STATUS says | VERIFY says |
|---|---|---|---|
| `acturis-graduate-technical-business-analyst` | 2/3 | 9 | 10 |
| `globaldata-energy-transition-analyst` | 5/6 | 12 | 12 |
| `nest-associate-bi-analyst` | 5/6 | 13 | 13 |
| `gic-associate-real-estate-portfolio-monitoring` | 6/8 | 9 | 9 |
| `linklaters-people-transformation-business-analyst` | 6/6 | 7 | 11 |
| `jpmorganchase-pension-ops-analyst` | 4/5 | 7 | 9 |
| `tokio-marine-hcc-claims-business-analyst` | 10/11 | 6 | 11 |
| `oaknorth-deposit-operations-analyst` | 2/3 | — | 10 |

`ably-gtm-engineer` is the clean illustration: STATUS says 14, VERIFY says 15, measurement says
15/15. Two records of the same fact, written at different times, never reconciled.

**The ATS score in this system is a claim, not a measurement. Do not trust it.**

### 2d. Invented filler

Checking skills-line entries that appear in exactly one pack AND in no `jd.txt` anywhere:
**63 entries.** Most are paraphrases of advert intent rather than fabrications
(`Escalation Handling`, `Client-facing Delivery`, `Ad-hoc Analysis`, `BAU Reporting`). Those are
allowed by their 19 Sept rule but they defeat AGENT-BRIEF step 4, which says keywords must appear
"in the advert's own wording".

A smaller set are **named tools** that need fact-base sourcing, not paraphrase:

| Pack | Tool claimed | In its advert? | In FACT-BASE? |
|---|---|---|---|
| `genomics-data-operations-engineer` | Docker, PyArrow, Parquet, Unix/Linux Command Line | no | Docker ✓ PyArrow ✓; Parquet ✓ (NHS ETL); Unix CLI — not stated anywhere |
| `oc-c-visualisation-and-tools-analyst` | Web Scraping and HTML Parsing (Playwright), JavaScript | no | Playwright ✓ (lead pipeline); **JavaScript not in FACT-BASE** |
| `omnea-revenue-operations-associate` | SaaS CRM build (PostgreSQL, Supabase) | no | ✓ (TeleCRM) |
| `anthropic-business-systems-analyst` | OpenAI GPT API | no | ✓ (n8n/OpenAI) |
| `gic-…-portfolio-monitoring` | Advanced Microsoft Excel | no | ✓ |

Nothing here is a lie, but `JavaScript` and `Unix/Linux Command Line` have no ledger row.

---

## 3. Did skills really get added per advert?

**Yes, heavily — and that is the problem.**

| | Functional Competencies | Technical Tools |
|---|---|---|
| Distinct labels across 44 packs | **171** | **61** |
| Items per pack | 12–22, mean 14.5 | 12–20, mean 15.2 |
| Present in all 44 packs | **0** | **4** (Power BI, Python, SQL, pandas) |
| Present in 1–3 packs only | **145** | **36** |

Near-universal functional labels (not quite universal): Stakeholder Management 43, Requirements
Gathering 41, Root Cause Analysis 40, Data Analysis 37, Data Modelling 34, KPI Definition and
Reporting 30. Near-universal tools: dbt 43, DAX 43, PostgreSQL 42, Tableau 41, Git 41, REST APIs 40,
Power Query 36, n8n 35, Advanced Excel 34.

**Are the per-advert additions real or cosmetic? Cosmetic, mostly.**

Of 231 advert-specific skill mentions (labels appearing in ≤3 packs):
- **37 (16%)** also appear somewhere in the CV body — a bullet or the summary.
- **194 (84%)** appear **only** on the skills line, with nothing on the page to evidence them.

That includes `Generative AI` (4 packs), `User Acceptance Testing`, `Requirements Workshops`,
`User Stories`, `Process Mapping`, `Change Management`, `Team Leadership`, `Team Coaching`,
`HubSpot CRM`, `Next.js`, `Playwright`, `Zapier`, `Anthropic Claude Code` — all skills-line only.

This is inside their 19 Sept rule ("skills lines are loose, sentences stay true"), so it is not a
truth violation. But it is a **CV-quality** problem: 145 functional labels used once each, 84% of
them unevidenced, reads to a human reviewer as keyword stuffing. `cube-data-analyst` carries 16
non-core functional labels; `cytora` carries 17.

Separately, **171 distinct functional labels for one person across 44 adverts** is a vocabulary
problem: `Problem Solving` and `Problem-Solving`, `Data Validation` and `Data Validation and Data
Quality` and `Data Accuracy and Data Quality`, `Reporting` and `Performance Reporting` and
`Reporting and Management Information` all exist as separate entries. There is no controlled
vocabulary.

---

## 4. Truth check

### 4a. Mechanical check, all 44 packs

Every `- ` bullet in every `cv.md` matched verbatim (whitespace-normalised) against `master/bullets.yml`.

- **CV bullets not verbatim from the ledger: 2 packs, 1 bullet.**
  `acturis-graduate-technical-business-analyst` and `aveni-support-operations-analyst` both carry
  *"Designed and built a multi-tenant PostgreSQL **SaaS** CRM…"* — the ledger says
  "multi-tenant PostgreSQL CRM". The word **SaaS** is sourced (FACT-BASE: "TeleCRM — multi-tenant
  PostgreSQL SaaS CRM") so it is **true**, but it was hand-typed into a pack, which breaks
  bullets.yml's own rule: *"The engine may drop a bullet. It may never write one."*
- **Summary lines not from `summary_lines`: 8 packs** — `ealing-council`, `global-analytics`,
  `royal-london`, `sei-junior`, `smiths-detection`, `tokio-marine-hcc`, `trm-labs`, `wgsn`.
  Seven of the eight are hand-written but fully sourceable (26 tests/29 checks, 11,380→304 ms,
  four hours→ten minutes, 500 prospects/8 channels, multi-tenant CRM, 25+ engagements).
- Education block identical in 44/44, with the corrected `June 2016 - July 2020`.

### 4b. One real defect

**`ealing-council-performance-and-data-analyst-send/cv.md`, summary line 2:**

> "…and has built forecasting models (**Prophet, ARIMA**) in MSc work."

FACT-BASE's BANNED table says: *"Prophet on the time-series project | That project is ARIMA in R."*
Prophet is real (dissertation) and ARIMA is real (MS4S09), but naming them together in one clause
about "forecasting models in MSc work" is precisely the conflation the ban exists to stop. It is
also on a public-sector CV where the statement is scored and the panel can ask. **Fix before this
goes out.**

### 4c. Banned-list sweep, all 44 packs

`98.24`, `BERT`, `LSTM`, `Amazon reviews`, `Data & Automation Consultant`, `Data and Automation
Consultant` — scanned across `cv.md`, `cover-letter.txt`, `answers.md`, `STATUS.md` **and both
PDFs**. **Zero hits.**

Amazon warehouse work: three `warehouse` hits, all `warehouse management system` (the client WMS
Power BI job). **Zero Amazon warehouse content on any data CV or letter.** Clean.

### 4d. Every number, all 44 packs

Extracted every numeric token from `cv.md`, `cover-letter.txt` and `answers.md`. Every figure in a
CV or cover letter traces to FACT-BASE: 500/8, 50+, 25+, 10+, 478/129/100,000, 18,080,573,
3,584,000, 26/29, 17.2, 31,430,611, 11,380, 304, 128 kB, 1,287 MB, 61%, 0.988, 14.3pp, 89.8%,
80.3%, 15%, 1.82M Reddit records, MSc module marks 83/79/75/74. Unrecognised figures in
`answers.md` are all salary bands and portal/vacancy IDs. **No invented numbers found.**

### 4e. Deep read, 8 randomly sampled packs

`msc-cruises-port-cost-control-data-analyst`, `ping-identity-demo-engineering-business-analyst`,
`royal-london-data-business-analyst-rlam`, `auto-trader-data-analyst`,
`cytora-customer-business-analyst`, `metaview-implementation-specialist`,
`elevenlabs-automation-engineer-influencers`, `globaldata-energy-transition-analyst`.

Every sentence in all 16 files (8 × `cv.md` + 8 × `cover-letter.txt`) traced to bullets.yml or
FACT-BASE. **No unsourceable claim found.** Four soft spots:

1. **`ping-identity`** — *"Most of my work starts with a loose request from a business owner."*
   Their own AGENT-BRIEF bans *"most of my work is X"* overweighting. Its own `VERIFY.md` already
   flagged a different "Most of my work is integration and troubleshooting" sentence as a FAIL —
   the fix replaced one overweighting sentence with another.
2. **`royal-london`** — *"I write SQL against relational databases most days."* Frequency claim,
   not in the fact base. Plausible, unsourced.
3. **`cytora`** — *"I also build the analytical reporting clients use to track performance, **mostly**
   in Power BI and Tableau."* Same overweighting pattern, milder.
4. **`globaldata`** — *"I do most data manipulation in Excel and Python and write up findings in Word
   and PowerPoint. I proofread my own work before anyone else sees it."* Word/PowerPoint are not in
   the FACT-BASE skill list; the proofreading line is an unverifiable self-assessment.

### 4f. The verify→fix loop does not close

`job-hunt/FIX-BRIEF-2026-09-19.md` named specific things to remove. Still present:

- `aircall-forward-deployed-engineer-ai-solutions/cv.md` still carries **`CRM Automation`** and
  **`Cross-functional Delivery`** — both named in the fix brief as invented labels to strip.
- `ping-identity` still carries a "most of my work" sentence (see above).

And **4 packs still carry `VERDICT: FIX`** in `VERIFY.md` — `ealing-council`,
`linklaters-people-transformation`, `nest-associate-bi-analyst`, `modulr-implementation-analyst` —
although the specific flagged sentences have all been removed from the text. The fix brief said
"do not change its VERDICT; the verifier re-checks." **The verifier never re-ran.** Anyone picking
these packs up reads FIX and has no way to know the work is done.

---

## 5. Do the artifacts actually work?

### Passing, on all 44

- CV PDF exists, non-empty, text-extractable: **44/44**.
- CV PDF page count: **44/44 are exactly 2 pages** (none is 1 page).
- Single column, no tabular layout: **44/44** — PyMuPDF `find_tables()` detects zero table
  structures in any CV PDF.
- Contact details correct and complete on every CV PDF: `<email>`, `<phone>`,
  `<town>, London`, `<linkedin>`, `<github>`. **44/44.**
- **PDF fidelity: 880 random lines sampled (20 per pack) from `cv.md` and searched in the extracted
  PDF text. 880/880 found. Zero drift between markdown and PDF.**
- Cover letter PDF exists wherever `cover-letter.txt` exists: **44/44**, all 1 page.
- Cover PDF header says **<town>** and **never Cardiff**: 44/44. The Cardiff default is fixed.
- `STATUS.md`, `VERIFY.md`, `jd.txt`, `match-report.md`, `answers.md` present and non-empty in all 44.
- `jd.txt` ≥ 800 chars in all 44 (no thin advert captures).
- A named recruiter recorded in all 44 STATUS files.

### Failures

| Failure | Count | Folders |
|---|---|---|
| Stale `.bak` files shipped inside the pack | **24** | ably, accenture, accordience, aircall, allica-bank, anthropic, better-society-capital, cube, drw, elevenlabs, genomics, linklaters-bdm, linklaters-people-transformation, metaview-business-operations, metaview-implementation, modulr, omnea, parameta, ping-identity, sei-junior, trm-labs, verkada, wgsn, xero (`answers.md.bak`, `cover-letter.txt.bak`, and in 11 cases `cv.md.bak` + `match-report.md.bak`) |
| Cover letter over 350 words | 2 | `elevenlabs-automation-engineer-influencers` (358), `trm-labs-marketing-technology-engineer` (352) |
| Cover PDF does not name the company | 1 | `jpmorganchase-pension-ops-analyst` — letter says "J.P. Morgan"; STATUS says "JPMorganChase". Cosmetic, but a string match on the company name fails |

### Collisions (not caught by any check)

**Four PDF filenames are shared between two packs each:**

- `CV-Mohammed-the candidate-<surname>-Linklaters.pdf` and `Cover-Letter-…-Linklaters.pdf` →
  `linklaters-bdm-data-analyst` **and** `linklaters-people-transformation-business-analyst`
- `CV-Mohammed-the candidate-<surname>-Metaview.pdf` and `Cover-Letter-…-Metaview.pdf` →
  `metaview-business-operations` **and** `metaview-implementation-specialist`

The files differ; only the names collide. Two applications to the same company with
identically-named but different attachments is a real risk at upload time, and any flat copy
(Downloads folder, email attachment, a merged drop) silently overwrites one.

### Cover letters are genuinely distinct

- Word counts: min 292, median 319, max 358.
- Median pairwise text similarity between any two of the 44 letters: **0.19**. Max 0.48
  (`global-analytics-engineer` vs `zego-analytics-engineer`).
- 526 distinct sentences across 44 letters; 31% of sentence instances are a repeat used elsewhere,
  and those repeats are the signature, visa line and availability line — as intended.

### Batch incompleteness

**Only 24 of 44 packs have `FORM-STATUS.md` / `PRE-SUBMIT.png`.** 20 are prepared but never filled:
accenture, acturis, better-society-capital, ealing-council, gic, global, globaldata, jpmorganchase,
linklaters-bdm, linklaters-people-transformation, massive-rocket, msc-cruises, nest, oc-c, parameta,
royal-london, sei-junior, smiths-detection, the-guardian, tokio-marine-hcc.

Form states on the 24: 20 FILLED, 4 PARTIAL (each waiting on a decision only they can make).

Recruiter quality: 29 of 44 recruiter lines contain a real `linkedin.com/in/` URL; confidence is
**high on 5**, medium on 17, low on 10.

---

## 6. Reproducibility test

**Advert chosen:** Quantum, *Junior Commercial Insights Analyst*, London hybrid, Ashby
(`ef97d9ff-19ee-4d08-a906-633504d661f6`) — listed under "Also seen, lower priority" in
`data/fulltime/LINKEDIN-JOBS-2026-09-19.md`, not in `output/tailored-2026-09-19/`.

**Where it ran:** `/private/tmp/…/scratchpad/repro-test/`, as an isolated working copy with
`master`, `config`, `node_modules`, `fonts`, `templates`, `providers` symlinked in. Nothing was
written to `output/`.

**Wall clock, fetch to both PDFs: 107 seconds**, of which the scripts account for ~3s
(tailor-v2 0.06s, each PDF ~1.5s). The rest is a human/agent reading and deciding.

### Do the commands in AGENT-BRIEF work as written?

| Step | Result |
|---|---|
| 1. Ashby posting API (`api.ashbyhq.com/posting-api/job-board/quantum`) | **Works.** 0.2s, full JD in `descriptionPlain` |
| 3. `node tailor-v2.mjs --jd-file … --company … --title …` | **Works.** Emits cv.md, cover-letter.txt, match-report.md, jd.txt |
| 4. ATS keyword pass | Manual. Result below |
| 5. Humanizer on the letter | Not scriptable; an LLM pass |
| 6. `node generate-cv.mjs` | **FAILED first run:** `ERR_MODULE_NOT_FOUND: pw-chrome.mjs`. Both PDF generators have an undeclared dependency on `pw-chrome.mjs` at the repo root. Worked after copying it in |
| 6. `node generate-cover-letter.mjs` | Same failure, same fix. Header correctly says `<town>, London` |
| 7–9 | Manual |

### Five things a newcomer trips over

1. **`tailor-v2.mjs` has no `--out` flag.** It hard-codes
   `output/tailored-<UTC-today>/<company-title-slug>/` relative to cwd, and reads
   `master/bullets.yml` relative to cwd too. You cannot point it at a folder, and you cannot run it
   from anywhere but the repo root. AGENT-BRIEF papers over this with *"check where it writes;
   move/copy … into the job folder"* — a manual step on every job.
2. **The date folder is UTC.** This run, at 00:02 BST on 20 Sept, wrote to
   `output/tailored-2026-09-19/`. Any session working past midnight British Summer Time silently
   files packs under yesterday's date.
3. **`tailor-v2.mjs` overwrites `cv.md` AND `cover-letter.txt` in place.** The fix brief tells you
   to `.bak` them first. That instruction is why 24 packs shipped with `.bak` files inside them.
4. **Undeclared `pw-chrome.mjs` dependency** in both PDF generators (above).
5. **The headline is not the advert's title.** `headlineFor()` mapped
   *"Junior Commercial Insights Analyst"* → **`Insight Analyst`**. The advert's exact job title does
   not appear anywhere in the generated CV. For a keyword-matching ATS that is the most expensive
   miss available.

### Resulting Skills line (raw generator output, no hand pass)

```
Functional Competencies: Dashboard Design | Data Visualisation | KPI Definition and Reporting |
Process Automation | Data Analysis | Business Intelligence | Requirements Gathering |
Stakeholder Management | Data Quality Assurance | Data Modelling | Root Cause Analysis |
Statistical Analysis
Technical Tools: SQL | Tableau | Git | Power BI | Advanced Excel | Claude Code | PostgreSQL |
DAX | Power Query | Python | pandas | NumPy | dbt | REST APIs
```

`Git` is there because "digital" appears twice in the advert. BigQuery, Looker, cohort analysis and
affiliate marketing — the four things this advert actually asks for — appear nowhere.

### Resulting summary (raw generator output)

```
Data analyst with an MSc in Data Science (Distinction) and the Microsoft PL-300, who takes client
analytics from the first requirement through to the report in daily use.
Builds the automation around the analysis as well as the analysis: an n8n workflow chaining Apollo,
ZeroBounce, OpenAI, HubSpot and Slack that scored over 500 prospects across 8 channels, and a
resumable REST extractor for an 18-million-row NHS dataset.
Has delivered analytics across more than 25 client engagements and over 10 dashboards, and presents
results to business owners as often as to technical teams.
```

Band read correctly as `grad`; `lead_team` and `definitions_escalations` correctly withheld.
`MISSING: BigQuery` correctly flagged. But the delivery line chose the **automation** variant for a
Tableau/BigQuery/dashboards advert, because `automation` appeared once in the advert and outranks
everything in `buildSummary()`. Two of the 14 "top keywords" (`claude`, `gpt`) came from the
**perks list** — *"Paid for AI Subscription (Claude / ChatGPT / Gemini)"*. There is no section
weighting: benefits feed the CV.

### The finding that matters most

I regenerated **all 44 packs** from their own `jd.txt` and diffed against what shipped.

| | Median similarity to raw generator output | Byte-identical |
|---|---|---|
| `cv.md` | **0.88** | 0 of 44 |
| `cover-letter.txt` | **0.16** (min 0.10, max 0.37) | 0 of 44 |

**The shipped cover letters share roughly a sixth of their text with what the script produces.
Every one of the 44 was rewritten by an LLM.** That is not a criticism of the letters — they are
good — but it means "run the pipeline" is not a description of how a letter gets made.

Why the raw letters are unusable: **38 of 44 carry a visible text defect.** The commonest is

> "The code is at **, so the method can be checked** rather than taken on trust."

— an empty repo URL, because `a personal project entry` has `repo: ""` in bullets.yml and
`renderCoverLetter()` does not guard it. Others splice the `whr` fields into broken grammar:
*"…and recurring reporting automated and over ten hours a week saved."* None of the raw letters
contains a company-specific line.

And on the CV side: **all 44 Skills sections differ from generator output.** Every skills line in
this batch was hand-extended after the script ran. Employment History differs in 35/44, Selected
Projects in 32/44, Professional Summary in 12/44, Education in 0/44.

**Honest conclusion: `tailor-v2.mjs` reliably produces a good CV skeleton and a throwaway letter
draft. Everything else is an LLM session, at roughly 20–40 minutes of agent time per job.
The 44-pack batch is not "a pipeline run"; it is 44 supervised agent sessions.**

---

## 7. Handover blockers — everything hard-coded to the candidate

Exhaustive. This is the list to work through before Ajaz can use it.

### A. Identity compiled into the pipeline source (the blocker)

`config/candidate-profile.json` exists and holds their full identity — **but the three scripts that
build the documents never read it.** They are read only by `auto-apply.mjs`, `doctor.mjs`,
`followup-cadence.mjs`, `cv-sync-check.mjs` and `gemini-eval.mjs`.

| File | Line | Hard-coded |
|---|---|---|
| `tailor-v2.mjs` | 54 | `readFileSync('master/bullets.yml')` — cwd-relative, single ledger |
| `tailor-v2.mjs` | 258 | `'# <the candidate>'` |
| `tailor-v2.mjs` | 260 | `<town>, London \| <phone> \| <email> \| <linkedin> \| <github>` |
| `tailor-v2.mjs` | 309 | `'Eligible to work full-time in the UK through <right-to-work end date>; sponsorship required thereafter.'` |
| `tailor-v2.mjs` | 356 | Same visa sentence, letter voice |
| `tailor-v2.mjs` | 359–360 | Name + phone + email signature block |
| `tailor-v2.mjs` | 493–494 | Output path `output/tailored-<UTC date>/<slug>` — no override |
| `generate-cv.mjs` | 127 | `<title>CV — <the candidate></title>` |
| `generate-cover-letter.mjs` | 37 | `location` default `'<town>, London'` |
| `generate-cover-letter.mjs` | 38 | `subtitle` default `'MSc Data Science (Distinction) \| Python • SQL • Machine Learning • Power BI'` — a fixed strapline that never tracks the advert |
| `generate-cover-letter.mjs` | 82, 132–139 | Name, phone, email, GitHub URL in the HTML template |

Also hard-coding their name or contact details: `merge-parttime.mjs`, `generate-docx.mjs`,
`notion-amazon-log.mjs`, `cv-figure-audit.mjs`, `parttime-crawl.mjs`, `parttime-crawl2.mjs`,
`parttime-scan.mjs`, `browser-apply.py`, `browser-apply-login.py`, `build-followups.py`,
`build-dual-tracker.py`, `test-all.mjs`, `data/amazon/{render,apply-now,apply-gate,score,render-list}.py`,
`data/lanes/linkedin-sweep.json`, `_jobs.json`.

### B. The fact base is one person's

- `master/bullets.yml` — the whole ledger (their roles, dates, bullets, projects, summary lines).
  One file, one candidate, no namespacing.
- `master/FACT-BASE.md` — their transcript, certificate IDs, Amazon employment record, the BANNED
  table, the Flipkart open contradiction, the keyword bank.
- `master/cv-master-*.md` — 12 master CVs, all their.
- `master/MASTER-DETAILED.md`, `CAREER-PROFILE.md`, `BLACK-ARROW-EXPERIENCE-MASTER-DRAFT.md`,
  `cma-personal-statement.*`, `ontrak/`.
- A second candidate already exists at `candidates/ajaz/` with its own `cv-master-AJAZ-DS.md`,
  `applications.md`, `tailored/` and `outreach/` — **and `tailor-v2.mjs` cannot see it.** There is
  no `--candidate` flag and no `candidates/<id>/bullets.yml` convention. The Ajaz lane is currently
  a parallel folder tree maintained by hand; `output/` already holds
  `CV-Azaj-Patel-AI-Data-Analytics-Engineer.pdf` and `CV-Azaj-Patel-Data-Scientist.pdf` produced
  outside this pipeline.

### C. Visa and eligibility wording

- "<right-to-work end date>" is a literal string in `tailor-v2.mjs` (twice) and in
  `config/candidate-profile.json` (`visa.visaExpiry`, `rightToWork`, `sponsorshipNow`,
  `sponsorshipLater`, `visaType`).
- `job-hunt/APPLY-BRIEF.md` hard-codes the sponsorship answers: *"Do you now or will you in the
  future require sponsorship?" = Yes*. Wrong for anyone on a different route.
- `job-hunt/AGENT-BRIEF.md` vet rules are built around **their** dates: "Starts after 12 <right-to-work end date>",
  "fixed-term past 12 <right-to-work end date>". Every SKIP decision in this batch is keyed to that date.
- The skill at `~/.claude/skills/job-hunt/SKILL.md` line 42 states their visa, their Skilled Worker
  threshold (~£33,400 new-entrant) and their sponsor-targeting rule.

### D. Config, credentials, machine state

- `.env` — 27 secrets, all their: `REED_API_KEY`, `ADZUNA_APP_ID`/`KEY`, `NOTION_TOKEN`/`DB_ID`,
  **six** `GMAIL_INBOX{1..6}_EMAIL` + `_APP_PASSWORD` pairs, `GEMINI_API_KEY`,
  `COOLIFY_URL`/`API_TOKEN`, `TELEGRAM_BOT_TOKEN`/`CHAT_ID`, `N8N_URL`/`API_KEY`,
  `JOBPORTAL_EMAIL`/`PASSWORD`, `PLAYWRIGHT_CHROME_PATH`. A second person needs a second `.env`;
  nothing in the repo supports two.
- `config/candidate-profile.json` — name, email, phone, **home address `<street address>,
  <town>, <postcode>`**, postcode, nationality `Indian`, country of birth `India`, visa block,
  demographics. Read by `auto-apply.mjs` on every form fill.
- `config/profile.yml` — second, overlapping identity file. `config/profile.example.yml` shows the
  intended multi-user shape ("Jane Smith") that the pipeline never adopted.
- `.apply-chrome-profile/` — a **47-directory live Chrome profile with their logged-in sessions**,
  checked into the working tree. Handing over the repo hands over the sessions.
- `APPLY-BRIEF.md` hard-codes **CDP port 9444** and assumes a Chrome is already running on it.
- `APPLY-BRIEF.md` hard-codes their salary band **£35,000–£42,000** and a per-company exception
  ("Octopus: pick the £35k+ band").
- `job-hunt/SKILL.md` line 19: repo path `~/code/career-ops` assumed absolute.
- `job-hunt/SKILL.md` line 75: Chrome deviceId selection rules, and an explicit warning that
  `switch_browser` can reach **Ajaz's own machine**. Running two candidates from one Mac makes that
  hazard routine rather than exceptional.

### E. Sourcing and targeting

- `data/sponsor-register.csv` — 143,169 rows, 11 MB. Candidate-neutral and reusable, **but** the
  way it is used is not: `sponsor-mine.mjs` and every STATUS `Sponsor register:` line assume the
  Skilled Worker route and their <right-to-work end date> cliff.
- `data/applications.md`, `data/fulltime/`, `data/lanes/`, `data/amazon/` — their pipeline state,
  their exclusion lists, their "already applied" dedupe. A second candidate needs a parallel tree;
  `candidates/ajaz/applications.md` is that tree, maintained by hand.
- `portals.yml` (99 KB) and `.apply-chrome-profile` encode which portals they already has accounts on.
- `data/lanes/linkedin-sweep.json` contains their name.
- The lane model itself — part-time/security/Amazon/data — is their situation, not a general one.

### F. Reporting and downstream

- `output/` mixes 44 packs with ~30 loose master PDFs/DOCXs and `JOB-HUNT-TRACKER.xlsx`; there is
  no per-candidate namespace.
- `notion-log.mjs` / `notion-amazon-log.mjs` write to **their** Notion DB id from `.env`.
- `telegram-digest.mjs` posts to **their** chat id.
- `gmail-sync.mjs` reads six of **their** inboxes.
- The repo root holds 4 stale `HANDOFF-*.md` / `SESSION-HANDOFF-*.md` files plus `NEXT.md`,
  `STATE.md`, `MASTER-TASKS.md`, `RESUME-HERE-2026-09-15.md` — directly against their own standing
  rule (*"Do not create new HANDOFF / NEXT / START-HERE / RESUME-HERE / DO-NEXT files; update
  STATE.md"*). A newcomer has no way to tell which is current.

---

## The 3 biggest real weaknesses

**1. The system measures itself and is wrong 30 times out of 44.** The ATS score is the one number
that claims to prove the CV was tailored to the advert, and it is written by hand into STATUS.md and
VERIFY.md from memory of a run, not read off the artefact. 30 of 44 packs disagree with measurement;
two packs claim 9/15 and 10/15 against a real 2/3. Underneath it, the keyword extractor itself is
broken: 15% of all keyword slots are substring artefacts (`rag` from "leverage" in 23 packs, `git`
from "digital" in 11, `aws` from "laws", `etl` from "quietly"), 30 of 44 "top 15" lists contain fewer
than 15 items and two contain three, and a perks line offering a Claude subscription feeds the CV as
a job requirement. Nothing in the loop compares a claim to the file it is about. That is the same
defect in three places — self-reported ATS, self-reported VERIFY verdicts (4 packs still say FIX
although the flagged text is gone, because the verifier never re-ran), and self-reported fix-brief
closure (two named items were never actually removed).

**2. The letters are not produced by the pipeline, and nobody has written down that they aren't.**
Measured: the shipped letters share a median 0.16 text similarity with what `tailor-v2.mjs`
generates. 38 of 44 raw generator letters contain a visible defect — most of them the sentence
"The code is at , so the method can be checked", an unguarded empty repo URL — and none contains a
company-specific line, which AGENT-BRIEF requires. All 44 Skills lines were also hand-extended after
the script ran. So AGENT-BRIEF step 5 says "start from tailor-v2's cover-letter.txt", and in practice
the right move is to throw it away and write one. The gap between the documented process and the real
process is where a second person will lose a day, and it is also why this scales at roughly 20–40
minutes of agent attention per job rather than seconds.

**3. Skills-line inflation is turning a true CV into one that reads as keyword-stuffed.** 171
distinct functional-competency labels across 44 CVs for one person, with **zero** appearing on all
44 and 145 appearing on three or fewer. 84% of the advert-specific additions (194 of 231) appear
only on the skills line with nothing on the page to back them — `Generative AI`, `User Acceptance
Testing`, `Team Leadership`, `Requirements Workshops`, `Next.js`, `Playwright`, `Zapier`. There is
no controlled vocabulary, so `Problem Solving` and `Problem-Solving`, `Reporting` and `Performance
Reporting` and `Reporting and Management Information` are separate entries. Every individual label
is defensible under their 19 Sept "skills lines are loose" rule. The aggregate is not: a human reader
sees sixteen unevidenced competencies and discounts the whole page, which costs exactly the
credibility the ledger discipline was built to buy.

## The 3 things that genuinely work

**1. The ledger discipline holds under adversarial testing, and that is rare.** Every `- ` bullet
across all 44 CVs was matched verbatim against `master/bullets.yml`: 2 packs deviate, by one word
(`SaaS`), and that word is itself sourced in FACT-BASE. Every number in every CV and cover letter
traces to FACT-BASE. The banned-list sweep across 44 packs and 88 PDFs returns zero hits for 98.24,
BERT, LSTM, "Amazon reviews" and "Data & Automation Consultant" — claims that were once in 18 and 23
CVs respectively. Zero Amazon warehouse content reached a data CV. A deep sentence-by-sentence read
of 8 randomly chosen packs found exactly one real defect (the Prophet/ARIMA pairing on the Ealing
council CV) and three soft overweightings. For a system that emitted 44 documents in a day, that is
a genuinely good truth record, and it is the direct result of building the ledger before building
the generator.

**2. The tailoring is real, structural, and correctly band-aware.** 44 of 44 CVs are distinct, 22.3%
of lines differ from the centroid, 16 distinct project selections, 13 distinct summaries, 16 distinct
headlines. Crucially the *selection* logic works: <a personal project> appears on 11 packs and they are the AI and
automation adverts; `lead_team` is withheld from graduate-band adverts and was correctly withheld in
the live reproducibility test; the `MISSING` list correctly surfaced BigQuery as a gap rather than
inventing it. Suppressing a true bullet to avoid reading as overqualified is a hard idea to implement
honestly, and it is implemented honestly.

**3. The artefact layer is solid.** 880 of 880 sampled markdown lines appear in the corresponding
PDF — zero drift between what was written and what will be sent. 44 of 44 CV PDFs are two pages,
single-column, with zero detected table structures, and carry the correct email, phone, city,
LinkedIn and GitHub. Every cover PDF is one page and says <town>, not Cardiff. Every pack has its
advert text, its match report, its status file and its drafted free-text answers, and 24 have a
full-page pre-submit screenshot so they can check a form before pressing Submit himself. The 71
failures I found are 24 stale `.bak` files, 2 letters 2–8 words over length, and 1 cosmetic company
name — housekeeping, not correctness. The rule that the agent prepares and they submits is enforced
everywhere I looked.

---

## Fix list, in order

**Before anything else goes out**
1. `ealing-council-…/cv.md` — remove the `(Prophet, ARIMA)` pairing from the summary.
2. `aircall-…/cv.md` — strip `CRM Automation` and `Cross-functional Delivery` (fix brief, unclosed).
3. `ping-identity-…/cover-letter.txt` — rewrite "Most of my work starts with…".
4. Rename the two Linklaters and two Metaview PDF pairs so no two packs share a filename.
5. Delete the 24 packs' `.bak` files.
6. Re-run the verifier on the 4 packs still marked `VERDICT: FIX`.

**Before the next batch**
7. `tailor-v2.mjs:128` — add `\b` word boundaries to the keyword regex. One line, fixes 75 bad
   keyword slots across 38 packs.
8. Weight the advert body over the benefits/perks section in `keywordsFrom()`.
9. Guard the empty `repo` field in `renderCoverLetter()`.
10. Make `headlineFor()` fall through to the advert's own title when no pattern matches.
11. Replace the hand-written `ATS: n/15` line with a script that reads the PDF. Never write that
    number by hand again.
12. Import `pw-chrome.mjs` properly or inline it, so the PDF generators run standalone.
13. Use local date, not UTC, for the output folder.

**Before Ajaz**
14. Add `--candidate <id>` to `tailor-v2.mjs`, `generate-cv.mjs` and `generate-cover-letter.mjs`;
    resolve the ledger to `candidates/<id>/bullets.yml` and the identity block, visa sentence and
    contact line to `candidates/<id>/profile.json`. Delete every hard-coded name, email, phone,
    location and date from the three scripts.
15. Add `--out <dir>` to `tailor-v2.mjs` and stop the manual move step.
16. Move the visa/eligibility rules out of `AGENT-BRIEF.md` and `APPLY-BRIEF.md` into the candidate
    profile (expiry date, sponsorship answers, salary band).
17. Remove `.apply-chrome-profile/` from the tree; it carries their live logged-in sessions.
18. Split `.env` per candidate, or scope the inbox/Notion/Telegram keys behind the candidate id.
19. Collapse the 4 stale HANDOFF/SESSION-HANDOFF files, `NEXT.md` and `MASTER-TASKS.md` into
    `STATE.md`, per their own standing rule.
