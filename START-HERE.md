# Start here

> **New (24 Sept 2026): read `job-hunt/CV-AND-APPLY-GUIDE.md` first.** It covers how CVs are built and
> tailored, the ATS rules, the form-filling scripts (Workday, LinkedIn Easy Apply), email sync, LinkedIn
> outreach, running several terminals, and the known bugs.

This repo is a job-application system run by AI agents. It finds jobs, writes a CV and cover
letter for each one, checks its own work, fills the forms, and stops. **You press Submit.**

You need: Node 18+, a Claude Code (or similar) terminal, and 30 minutes for setup.

---

## Setup, once

```bash
npm install
npx playwright install chromium        # needed for every PDF; skip it and PDF generation fails
cp config/profile.example.yml config/profile.yml
cp master/bullets.example.yml master/bullets.yml
node doctor.mjs                        # tells you what is still missing
```

Then open this folder in Claude Code and paste the prompt below.

---

## The onboarding prompt (paste this, once)

> Read `job-hunt/SYSTEM-HANDBOOK.md`, `job-hunt/AGENT-BRIEF.md` and `job-hunt/APPLY-BRIEF.md` first,
> then set this system up for me. Work through it with me one step at a time, and do not move on
> until each step is actually done.
>
> **1. My details.** Ask me for my name, email, phone, the address I put on applications, LinkedIn,
> GitHub, my right-to-work position in one sentence, my target roles, and my salary range. Write
> them into `config/profile.yml`. Never invent one of these.
>
> **2. My CV.** I will give you my current CV (paste, file or LinkedIn). Convert it to `cv.md`,
> keeping every fact exactly as I state it.
>
> **3. My fact base.** Build `master/FACT-BASE.md` by interviewing me about the CV: for every
> claim, ask where the number came from and whether I can defend it in an interview. Anything I
> cannot evidence goes in a BANNED table at the top with the reason. This file is what stops the
> system inventing things later. Do not skip it and do not fill it in from guesses.
>
> **4. My ledger.** Build `master/bullets.yml` from the fact base, following the shape and the
> comments in `master/bullets.example.yml`: every publishable bullet split into its parts, each
> citing its FACT-BASE row, each tagged with the bands (grad / mid / senior) it may appear in and
> the skills it evidences. Then run `node tailor-v2.mjs --self-test` — all tests must pass.
>
> **5. Make the CV sound like me, not like AI.** Run the `humanizer` skill over `cv.md` in audit
> mode and over the generated cover letter properly: no stock AI words, no inflated claims, plain
> verbs, varied sentence length. Show me what changed. Facts stay exactly as they are.
>
> **6. Test it.** Pick one real advert, save the text, then:
> `node tailor-v2.mjs --jd-file <file> --company "X" --title "Y"`, generate both PDFs, and run
> `node ats-check.mjs <today's date>`. Show me the CV, the letter and the coverage score, and
> tell me honestly what is weak about them.
>
> **7. Then ask me** whether to run a first search, and follow the daily run in
> `job-hunt/DAILY-APPLY-ORCHESTRA.md`.
>
> Rules that do not bend: never submit an application, never create accounts or type passwords,
> never send a message to a person without showing me the exact words first, and never put a claim
> on my CV that is not in my fact base.

---

## Every day after that

Paste: **"Run the daily apply loop"**, and the session follows `job-hunt/DAILY-APPLY-ORCHESTRA.md`:

1. **Inbox** — read replies, update the tracker.
2. **Find** — Indeed, LinkedIn (last 24 hours and past week), the ATS boards, then the employer's
   own careers page. Licensed sponsors first if you need sponsorship.
3. **Prep** — agents in parallel: vet, tailor, letter, ATS pass, form answers, recruiter name.
4. **Verify** — every pack re-checked against the advert and your fact base.
5. **Decision sheet** — you see the list, the questions only you can answer, and the accounts you
   need to create. **Nothing is filled until you say start.**
6. **Fill in batch** — several agents, one browser tab each, all stopping before Submit.
7. **You submit.** Then the tracker, the mirror and the recruiter queue are updated.
8. **Outreach next working day**, before 6pm, one named person per application you actually sent.

---

## Where jobs come from

| Source | How | Worth |
|---|---|---|
| ATS boards direct (Greenhouse, Ashby, Lever, Workable, SmartRecruiters) | `scan.mjs`, public JSON APIs, no LLM cost | highest: employer-hosted forms take a tailored CV |
| LinkedIn, logged in | job search filtered to last 24h / past week, entry and associate level | high: freshest, and shows the hiring team |
| Indeed | the Indeed MCP or the site | mixed: often stale or agency-posted |
| Aggregators (Adzuna, Reed) | APIs | good for discovery, but their links die quickly, so always confirm on the employer's page |
| Public sector / NHS / Civil Service | their own portals | different game: the written statement is scored, not the CV |
| Sponsor register (UK) | `sponsor-check.mjs`, `sponsor-mine.mjs` against the Home Office list | the filter that matters if you need sponsorship |

**Rules learned the hard way:** a dead aggregator link is not a dead job, check the employer's page.
A sponsor licence is not a promise to sponsor; adverts say so. A match percentage is a keyword
count, not a judgement. Read the advert for the three things that actually reject you: years
required, an essential domain you do not have, and a contract that ends after your right to work.

---

## What this system will not do

- Submit an application. Ever. You press Submit.
- Create an account, type a password, or complete a captcha.
- Send an email, LinkedIn message or connection note without showing you the exact final text.
- Put a claim on your CV that is not in your fact base, or a number you cannot defend.

---

## Known weaknesses (measured, not guessed)

Honest state of the system as of 20 Sept 2026, from `job-hunt/SYSTEM-EVALUATION.md`:

- **The generated cover letter is a skeleton.** In practice the agent rewrites it from the ledger
  facts and the advert. Budget for that; it is where the time goes.
- **Skills-line inflation is the easiest way to spoil this.** Adding an advert keyword to the
  skills line with nothing in the body to evidence it costs you the credibility the ledger buys.
  If a skill matters, put the evidence in a bullet or leave the skill out.
- **Keyword lists need a human eye.** The extractor now matches whole words only, but it still
  picks terms out of perks lists.
- **The tracker is the record, not the chat.** If a submitted application is not in the tracker,
  it did not happen.
