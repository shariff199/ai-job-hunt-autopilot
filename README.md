# AI Job Hunt Autopilot

An end-to-end, AI-assisted job-search pipeline for the UK market: it scans job boards, filters to roles that can actually sponsor a visa, scores each role against your CV, generates tailored CVs and cover letters, auto-fills application forms, and keeps a single source of truth synced to Notion and your inbox.

Built on top of the open-source [career-ops](https://github.com/santifer/career-ops) framework (MIT) by [santifer](https://santifer.io), extended with a custom UK + visa-sponsorship automation layer.

> **Privacy:** All personal data (CV, profile, demographics, tracker, reports, API keys) is gitignored and stays local. This repo contains the tooling only.

## What it does

```
scan boards ─▶ filter to visa sponsors ─▶ score vs CV (A–G) ─▶ tailor CV + cover ─▶ auto-fill form ─▶ track + sync
```

## Custom automation layer

| Tool | What it does |
|------|--------------|
| `scan-uk.mjs` | Scans Reed, Adzuna, and NHS job feeds for analyst/data roles |
| `sponsor-check.mjs` | Cross-references every employer against the official **UK Home Office Register of Licensed Sponsors** — the single source of truth for "can this company sponsor a Skilled Worker visa?" |
| `import-linkedin-apps.mjs` | Recovers LinkedIn Easy-Apply submissions from Gmail into the tracker (sponsor-checked, recruiter-flagged) |
| `gmail-sync.mjs` | Job-only sync across multiple Gmail inboxes: digests, job-alert extraction, application-update + rejection detection (server-side search), and gated send/reply |
| `auto-apply.mjs` | Playwright-driven form auto-fill (identity, demographics, uploads) — **never auto-submits** |
| `notion-log.mjs` | Pushes the application tracker to a Notion database |
| `generate-cv.mjs` / `generate-cover-letter.mjs` | Render tailored, ATS-friendly CV and cover-letter PDFs |
| `role-matcher.mjs` / `scan-ats-full.mjs` | Role scoring and ATS portal sweeps |

## Inherited from career-ops

A–G offer evaluation, archetype scoring, zero-token ATS scanners (Greenhouse/Ashby/Lever/Workday), report generation, pipeline integrity tooling, and a multi-CLI agent skill (Claude Code, OpenCode, Gemini, Qwen).

## Stack

Node.js (ESM), Playwright, IMAP/SMTP (`imapflow`, `nodemailer`, `mailparser`), Notion API, Reed/Adzuna APIs, YAML config, Markdown data, HTML/LaTeX CV templates.

## Quick start

```bash
npm install
cp config/profile.example.yml config/profile.yml                          # your profile
cp config/candidate-profile.example.json config/candidate-profile.json    # form-fill details
# add API keys to a local .env (REED_API_KEY, ADZUNA_APP_ID/KEY, NOTION_TOKEN, GMAIL_*)
node scan-uk.mjs                          # scan UK boards
node sponsor-check.mjs "Company Name"     # check visa sponsorship
```

## Ethics

Quality over quantity. The system is designed to find genuine matches and help apply well — not to mass-spam recruiters. It never submits an application without human review.

## Credits

- Core framework: [career-ops](https://github.com/santifer/career-ops) by [santifer](https://santifer.io) (MIT)
- UK sponsorship + multi-inbox + Notion automation layer: this repository

## License

MIT — see [LICENSE](LICENSE).
