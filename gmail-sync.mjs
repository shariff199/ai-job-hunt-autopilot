#!/usr/bin/env node

/**
 * gmail-sync.mjs — job-only email sync across two Gmail inboxes (read + write).
 *
 * Reads both inboxes over IMAP (read-only fetch), keeps ONLY job-related mail
 * (LinkedIn / job boards, recruitment agencies, and replies about applications
 * you have in data/applications.md), classifies each one, and can draft + send
 * replies over SMTP. Sending is GATED: drafts print to the screen and are only
 * transmitted when you pass --send, mirroring the career-ops "never send without
 * review" rule.
 *
 * Credentials (in .env):
 *   GMAIL_INBOX1_EMAIL / GMAIL_INBOX1_APP_PASSWORD   (16-char Google app password)
 *   GMAIL_INBOX2_EMAIL / GMAIL_INBOX2_APP_PASSWORD
 *
 * Requires 2-Step Verification ON + IMAP enabled on each account.
 *
 * Commands:
 *   node gmail-sync.mjs digest  [--days N] [--inbox 1|2] [--all]
 *       Group recent job mail by category (alerts / application updates / agency).
 *       --all also shows non-job mail counts. Default window: 14 days.
 *
 *   node gmail-sync.mjs alerts  [--days N] [--inbox 1|2] [--pipeline]
 *       Extract individual jobs from job-alert digests (LinkedIn/Indeed/Reed...).
 *       --pipeline appends new ones to data/pipeline.md for evaluation.
 *
 *   node gmail-sync.mjs updates [--days N]
 *       Show replies about YOUR applications, matched to data/applications.md,
 *       with a suggested tracker status (Responded / Interview / Rejected).
 *
 *   node gmail-sync.mjs read   --inbox N --uid U
 *       Print the full plain-text body of one message.
 *
 *   node gmail-sync.mjs reply  --inbox N --uid U --body "..."  [--send]
 *       Draft a reply (prints by default). With --send, transmit over SMTP.
 *
 *   node gmail-sync.mjs send   --inbox N --to a@b.com --subject "..." --body "..." [--send]
 *       Compose a new message. Same --send gate.
 *
 * Read-only by default. Nothing is ever sent without --send.
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';

// ── tiny .env loader (no dependency) ──────────────────────────────────────────
function loadEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

// ── lazy imports (so --help works without the libs) ───────────────────────────
async function imap() { return (await import('imapflow')).ImapFlow; }
async function parser() { return (await import('mailparser')).simpleParser; }
async function smtp() { return (await import('nodemailer')).default; }

// ── account config ────────────────────────────────────────────────────────────
function accounts() {
  const out = [];
  for (const n of ['1', '2']) {
    const email = process.env[`GMAIL_INBOX${n}_EMAIL`];
    const pass = (process.env[`GMAIL_INBOX${n}_APP_PASSWORD`] || '').replace(/\s+/g, '');
    if (email && pass) out.push({ n, email, pass });
  }
  return out;
}

// ── job-relevance classification ──────────────────────────────────────────────
const BOARD_DOMAINS = [
  'linkedin.com', 'indeed.com', 'indeed.co.uk', 'reed.co.uk', 'glassdoor',
  'totaljobs.com', 'cv-library.co.uk', 'otta.com', 'welcometothejungle',
  'ziprecruiter', 'monster.co.uk', 'adzuna', 'jobserve', 'cwjobs',
  'workable.com', 'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkday',
  'smartrecruiters', 'teamtailor', 'jobs.', 'careers.', 'notify.linkedin.com',
];
const AGENCY_HINTS = [
  'hays', 'michael page', 'michaelpage', 'randstad', 'robert walters', 'robert half',
  'harnham', 'reed', 'sanderson', 'pontoon', 'tenth revolution', 'nigel wright',
  'mcs group', 'oliver james', 'akkodis', 'morgan mckinley', 'henderson scott',
  'eden james', 'ashdown', 'outsource uk', 'emagine', 'recruit', 'recruitment',
  'talent', 'resourcing', 'staffing', 'search ltd', 'consultancy', 'headhunt',
];
const ALERT_SUBJECT = [
  'job alert', 'jobs for you', 'new jobs', 'recommended for you', 'recommended jobs',
  'new job', 'jobs matching', 'your job alert', 'top job picks', 'jobs you may',
  'is hiring', 'are hiring', 'new opportunities', 'job recommendations',
  'people who viewed', 'job posted',
];
const APP_UPDATE_SUBJECT = [
  'your application', 'application received', 'thank you for applying', 'thanks for applying',
  'we received your', 'application to', 'application for', 'interview', 'next steps',
  'assessment', 'unfortunately', 'we regret', 'not be progressing', 'not progressing',
  'shortlisted', 'phone screen', 'video call', 'we would like to', 'invitation to',
  'update on your', 'status of your', 'application status', 'role at',
];

function host(addr = '') {
  const m = (addr || '').toLowerCase().match(/@([^>\s]+)/);
  return m ? m[1] : (addr || '').toLowerCase();
}
function any(hay, list) { const h = (hay || '').toLowerCase(); return list.some(k => h.includes(k)); }

/**
 * Returns { job: bool, category: 'alert'|'update'|'agency'|'board'|null, company?:string }
 * companies = normalized company names from applications.md (for sender/subject match).
 */
function classify(msg, companies) {
  const from = `${msg.fromName || ''} ${msg.from || ''}`.toLowerCase();
  const dom = host(msg.from);
  const subj = (msg.subject || '').toLowerCase();
  const text = `${from} ${subj}`;

  const fromBoard = BOARD_DOMAINS.some(d => dom.includes(d) || from.includes(d));
  const fromAgency = any(text, AGENCY_HINTS);
  const isAlert = any(subj, ALERT_SUBJECT);
  const isUpdate = any(subj, APP_UPDATE_SUBJECT);

  // company match against the tracker (strong job signal)
  let company = null;
  for (const c of companies) {
    if (c.length < 3) continue;
    if (text.includes(c) || dom.includes(c.replace(/\s+/g, ''))) { company = c; break; }
  }

  if (isAlert && (fromBoard || fromAgency)) return { job: true, category: 'alert' };
  if (company && isUpdate) return { job: true, category: 'update', company };
  if (company) return { job: true, category: 'update', company };
  if (isUpdate && (fromBoard || fromAgency)) return { job: true, category: 'update' };
  if (fromAgency) return { job: true, category: 'agency' };
  if (fromBoard) return { job: true, category: isAlert ? 'alert' : 'board' };
  return { job: false, category: null };
}

function suggestStatus(subj = '', body = '') {
  const t = `${subj} ${body}`.toLowerCase();
  if (/(unfortunately|we regret|not be progressing|not progressing|unsuccessful|decided not to|other candidates)/.test(t)) return 'Rejected';
  if (/(interview|phone screen|video call|invitation to|schedule a call|next stage|assessment|technical test|meet the team)/.test(t)) return 'Interview';
  if (/(received your application|thank you for applying|thanks for applying|we have received|application received)/.test(t)) return 'Responded';
  return 'Responded';
}

// ── tracker companies ─────────────────────────────────────────────────────────
function trackerCompanies(path = 'data/applications.md') {
  if (!existsSync(path)) return [];
  const out = new Set();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const cells = line.split('|').map(s => s.trim());
    if (cells.length < 5) continue;
    const company = cells[3];
    if (!company || company === 'Company' || /^-+$/.test(company)) continue;
    out.add(company.toLowerCase().replace(/\s+(ltd|limited|plc|inc|llc|group|uk|bank)\.?$/g, '').trim());
  }
  return [...out].filter(Boolean);
}

// ── IMAP fetch ────────────────────────────────────────────────────────────────
async function fetchRecent({ email, pass }, days, mailbox = 'INBOX') {
  const ImapFlow = await imap();
  const c = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: email, pass }, logger: false,
    connectionTimeout: 20000, greetingTimeout: 15000,
  });
  await c.connect();
  await c.mailboxOpen(mailbox);
  const since = new Date(Date.now() - days * 864e5);
  const msgs = [];
  for await (const m of c.fetch({ since }, { uid: true, envelope: true, internalDate: true })) {
    const e = m.envelope || {};
    const fromObj = (e.from && e.from[0]) || {};
    msgs.push({
      uid: m.uid,
      date: m.internalDate || e.date,
      subject: e.subject || '(no subject)',
      from: fromObj.address || '',
      fromName: fromObj.name || '',
      replyTo: (e.replyTo && e.replyTo[0] && e.replyTo[0].address) || fromObj.address || '',
      messageId: e.messageId || '',
    });
  }
  await c.logout();
  return msgs.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function fetchBody({ email, pass }, uid) {
  const ImapFlow = await imap();
  const simpleParser = await parser();
  const c = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: email, pass }, logger: false,
    connectionTimeout: 20000, greetingTimeout: 15000,
  });
  await c.connect();
  await c.mailboxOpen('INBOX');
  const { content } = await c.download(String(uid), undefined, { uid: true });
  const chunks = []; for await (const ch of content) chunks.push(ch);
  const parsed = await simpleParser(Buffer.concat(chunks));
  await c.logout();
  return parsed;
}

// ── job extraction from alert emails ──────────────────────────────────────────
function extractJobs(parsed) {
  const jobs = [];
  const html = parsed.html || '';
  const text = parsed.text || '';
  // LinkedIn/Indeed style: anchor text = role, href = job link
  const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]{6,120})<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1];
    const title = m[2].replace(/\s+/g, ' ').trim();
    if (!/job|view|apply|position|role|vacancy|\/jobs\//i.test(url)) continue;
    if (/unsubscribe|settings|privacy|manage|help|profile/i.test(title)) continue;
    if (/\b(analyst|data|business intelligence|\bbi\b|scientist|reporting|insight|engineer)\b/i.test(title)) {
      jobs.push({ title, url: url.split('?')[0] });
    }
  }
  // fallback: plain-text "Role — Company" lines
  if (!jobs.length && text) {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (/\b(analyst|data scientist|reporting|insight)\b/i.test(t) && t.length < 120) {
        jobs.push({ title: t, url: '' });
      }
    }
  }
  // dedup by title
  const seen = new Set();
  return jobs.filter(j => { const k = j.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ── arg parsing ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[k] = true;
      else { a[k] = next; i++; }
    } else a._.push(t);
  }
  return a;
}

function fmtDate(d) { try { return new Date(d).toISOString().slice(0, 10); } catch { return '?'; } }

// ── commands ──────────────────────────────────────────────────────────────────
async function cmdDigest(args) {
  const days = Number(args.days || 14);
  const mailbox = args.mailbox || 'INBOX';
  const companies = trackerCompanies();
  const accs = accounts().filter(a => !args.inbox || a.n === String(args.inbox));
  if (!accs.length) return console.error('No inbox credentials in .env.');
  for (const acc of accs) {
    console.log(`\n━━ Inbox ${acc.n}: ${acc.email} — [${mailbox}] last ${days}d ━━`);
    let msgs;
    try { msgs = await fetchRecent(acc, days, mailbox); }
    catch (e) { console.error(`  connect failed: ${e.responseText || e.message}`); continue; }
    const groups = { alert: [], update: [], agency: [], board: [] };
    let nonJob = 0;
    for (const m of msgs) {
      const c = classify(m, companies);
      if (!c.job) { nonJob++; continue; }
      m._company = c.company;
      groups[c.category]?.push(m);
    }
    const label = { update: 'APPLICATION UPDATES', alert: 'JOB ALERTS', agency: 'RECRUITER / AGENCY', board: 'JOB BOARDS' };
    for (const cat of ['update', 'agency', 'alert', 'board']) {
      const g = groups[cat]; if (!g.length) continue;
      console.log(`\n  ${label[cat]} (${g.length})`);
      for (const m of g.slice(0, 25)) {
        const who = m.fromName || m.from;
        const tag = m._company ? ` [${m._company}]` : '';
        console.log(`    [uid ${m.uid}] ${fmtDate(m.date)}  ${who}${tag}`);
        console.log(`              ${m.subject}`);
      }
    }
    console.log(`\n  (${nonJob} non-job emails ignored)`);
  }
  console.log('\n→ Read one: node gmail-sync.mjs read --inbox N --uid U');
  console.log('→ Pull jobs from alerts: node gmail-sync.mjs alerts');
}

async function cmdAlerts(args) {
  const days = Number(args.days || 14);
  const companies = trackerCompanies();
  const accs = accounts().filter(a => !args.inbox || a.n === String(args.inbox));
  const all = [];
  for (const acc of accs) {
    let msgs; try { msgs = await fetchRecent(acc, days); } catch (e) { console.error(`Inbox ${acc.n} failed: ${e.message}`); continue; }
    const alerts = msgs.filter(m => classify(m, companies).category === 'alert');
    console.log(`\nInbox ${acc.n}: ${alerts.length} alert email(s) — extracting jobs...`);
    for (const m of alerts.slice(0, 15)) {
      const parsed = await fetchBody(acc, m.uid);
      const jobs = extractJobs(parsed);
      for (const j of jobs) { all.push(j); }
      if (jobs.length) console.log(`  ${fmtDate(m.date)} ${m.fromName || m.from}: ${jobs.length} job(s)`);
    }
  }
  const seen = new Set();
  const uniq = all.filter(j => { const k = j.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  console.log(`\n${uniq.length} unique job(s) found in alerts:\n`);
  for (const j of uniq) console.log(`  • ${j.title}${j.url ? `  ${j.url}` : ''}`);
  if (args.pipeline && uniq.length) {
    const lines = uniq.filter(j => j.url).map(j => `- [ ] ${j.url} | (from email alert) | ${j.title}`).join('\n');
    if (lines) { appendFileSync('data/pipeline.md', `\n${lines}\n`); console.log(`\n✓ Appended ${uniq.filter(j => j.url).length} to data/pipeline.md`); }
  } else if (uniq.length) {
    console.log('\n→ Add to pipeline: re-run with --pipeline');
  }
}

async function cmdUpdates(args) {
  const days = Number(args.days || 30);
  const companies = trackerCompanies();
  const accs = accounts();
  console.log(`\nApplication updates — last ${days}d (matched to your tracker)\n`);
  let found = 0;
  for (const acc of accs) {
    let msgs; try { msgs = await fetchRecent(acc, days); } catch (e) { console.error(`Inbox ${acc.n} failed: ${e.message}`); continue; }
    for (const m of msgs) {
      const c = classify(m, companies);
      if (c.category !== 'update') continue;
      found++;
      const parsed = await fetchBody(acc, m.uid).catch(() => ({ text: '' }));
      const status = suggestStatus(m.subject, parsed.text || '');
      console.log(`  [uid ${m.uid}, inbox ${acc.n}] ${fmtDate(m.date)}  ${m.fromName || m.from}${c.company ? ` [${c.company}]` : ''}`);
      console.log(`     ${m.subject}`);
      console.log(`     → suggested status: ${status}\n`);
    }
  }
  if (!found) console.log('  No application-related replies found.');
  else console.log('→ Update data/applications.md status accordingly (I can do this for you).');
}

async function cmdRead(args) {
  const acc = accounts().find(a => a.n === String(args.inbox));
  if (!acc || !args.uid) return console.error('Usage: read --inbox N --uid U');
  const p = await fetchBody(acc, args.uid);
  console.log(`From:    ${p.from?.text || ''}`);
  console.log(`Subject: ${p.subject || ''}`);
  console.log(`Date:    ${p.date || ''}`);
  console.log(`Reply-To:${p.replyTo?.text || p.from?.text || ''}`);
  console.log('\n' + (p.text || '(no plain text body)').trim().slice(0, 4000));
}

async function sendMail(acc, { to, subject, body, inReplyTo, references }) {
  const nodemailer = await smtp();
  const t = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: acc.email, pass: acc.pass },
  });
  const info = await t.sendMail({
    from: acc.email, to, subject, text: body,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
  });
  return info;
}

async function cmdReply(args) {
  const acc = accounts().find(a => a.n === String(args.inbox));
  if (!acc || !args.uid || !args.body) return console.error('Usage: reply --inbox N --uid U --body "..." [--send]');
  const orig = await fetchBody(acc, args.uid);
  const to = orig.replyTo?.value?.[0]?.address || orig.from?.value?.[0]?.address;
  const subject = /^re:/i.test(orig.subject || '') ? orig.subject : `Re: ${orig.subject || ''}`;
  console.log('\n── DRAFT REPLY ──');
  console.log(`From:    ${acc.email}`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`\n${args.body}\n`);
  console.log('─────────────────');
  if (!args.send) return console.log('Draft only. Add --send to transmit.');
  const info = await sendMail(acc, { to, subject, body: args.body, inReplyTo: orig.messageId, references: orig.messageId });
  console.log(`✓ Sent. id=${info.messageId}`);
}

async function cmdSend(args) {
  const acc = accounts().find(a => a.n === String(args.inbox)) || accounts()[0];
  if (!acc || !args.to || !args.subject || !args.body) return console.error('Usage: send --inbox N --to a@b.com --subject "..." --body "..." [--send]');
  console.log('\n── DRAFT ──');
  console.log(`From:    ${acc.email}`);
  console.log(`To:      ${args.to}`);
  console.log(`Subject: ${args.subject}`);
  console.log(`\n${args.body}\n───────────`);
  if (!args.send) return console.log('Draft only. Add --send to transmit.');
  const info = await sendMail(acc, { to: args.to, subject: args.subject, body: args.body });
  console.log(`✓ Sent. id=${info.messageId}`);
}

// ── rejections: server-side BODY search for rejection language (fast) ─────────
const REJECT_TERMS = [
  'unfortunately', 'we regret', 'not be progressing', 'not progressing',
  'unsuccessful', 'not moving forward', "won't be moving forward",
  'decided not to', 'not been selected', 'other candidates', 'position has been filled',
  'will not be taking', 'no longer considering',
];
async function cmdRejections(args) {
  const days = Number(args.days || 60);
  const companies = trackerCompanies();
  const ImapFlow = await imap();
  const since = new Date(Date.now() - days * 864e5);
  const hits = [];
  for (const acc of accounts().filter(a => !args.inbox || a.n === String(args.inbox))) {
    const c = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: acc.email, pass: acc.pass }, logger: false, connectionTimeout: 20000, greetingTimeout: 15000 });
    try {
      await c.connect(); await c.mailboxOpen('INBOX');
      // one server-side search per term (Gmail IMAP has no multi-term OR on BODY) — fast, no body downloads
      const uidSet = new Set();
      for (const term of REJECT_TERMS) {
        const uids = await c.search({ since, body: term }, { uid: true }).catch(() => []);
        for (const u of (uids || [])) uidSet.add(u);
      }
      if (uidSet.size) {
        const TRANSACTIONAL = /amex|americanexpress|hsbc|vanquis|amazon|digibank|\bbank\b|statement|deposit|order|maintenance|newsletter|fullenrich|free-work|lounge|credit limit/i;
        const NOISE_SUBJECT = /job alert|jobs for you|new jobs|recommended|your application was sent|application received|thanks for your application|thank you for applying|apply to jobs|first look|why recruiters|maintenance|statement|on sale/i;
        for await (const m of c.fetch({ uid: [...uidSet].join(',') }, { uid: true, envelope: true, internalDate: true })) {
          const e = m.envelope || {}; const f = (e.from && e.from[0]) || {};
          const subj = e.subject || ''; const dom = host(f.address || '');
          if (NOISE_SUBJECT.test(subj)) continue;
          if (TRANSACTIONAL.test(`${f.name || ''} ${f.address || ''} ${subj}`)) continue;
          let company = null;
          const hay = `${f.name || ''} ${f.address || ''} ${subj}`.toLowerCase();
          for (const co of companies) { if (co.length > 3 && hay.includes(co)) { company = co; break; } }
          const fromBoard = BOARD_DOMAINS.some(d => dom.includes(d));
          // LinkedIn/board "Your application to X at Y" / "was sent" = submission receipt, not a rejection
          if (fromBoard && /your application (to|was sent)|application (to|sent)/i.test(subj)) continue;
          // keep only genuine replies: a tracked company OR a direct (non-board) sender
          if (!company && fromBoard) continue;
          hits.push({ inbox: acc.n, uid: m.uid, date: m.internalDate || e.date,
            from: f.name || f.address, subject: subj, company, fromBoard });
        }
      }
      await c.logout();
    } catch (err) { console.error(`Inbox ${acc.n} failed: ${err.message}`); }
  }
  hits.sort((a, b) => new Date(b.date) - new Date(a.date));
  console.log(`\nLikely REJECTIONS — last ${days}d (server-side body search)\n`);
  if (!hits.length) return console.log('  None found.');
  for (const h of hits) {
    console.log(`  [uid ${h.uid}, inbox ${h.inbox}] ${fmtDate(h.date)}  ${h.from}${h.company ? ` [${h.company}]` : ''}`);
    console.log(`     ${h.subject}`);
  }
  console.log(`\n  ${hits.length} candidate(s). Confirm a body: node gmail-sync.mjs read --inbox N --uid U`);
}

// ── label: route job mail into a "Jobs" Gmail label for day-to-day scans ───────
async function cmdLabel(args) {
  const days = Number(args.days || 60);
  const labelName = args.name || 'Jobs';
  const companies = trackerCompanies();
  const ImapFlow = await imap();
  for (const acc of accounts().filter(a => !args.inbox || a.n === String(args.inbox))) {
    const c = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: acc.email, pass: acc.pass }, logger: false, connectionTimeout: 20000, greetingTimeout: 15000 });
    try {
      await c.connect();
      try { await c.mailboxCreate(labelName); } catch { /* exists */ }
      await c.mailboxOpen('INBOX');
      const since = new Date(Date.now() - days * 864e5);
      const toLabel = [];
      for await (const m of c.fetch({ since }, { uid: true, envelope: true })) {
        const e = m.envelope || {}; const f = (e.from && e.from[0]) || {};
        const msg = { from: f.address || '', fromName: f.name || '', subject: e.subject || '' };
        if (classify(msg, companies).job) toLabel.push(m.uid);
      }
      if (toLabel.length) await c.messageCopy(toLabel.join(','), labelName, { uid: true });
      console.log(`Inbox ${acc.n} (${acc.email}): labeled ${toLabel.length} job email(s) -> "${labelName}"`);
      await c.logout();
    } catch (err) { console.error(`Inbox ${acc.n} failed: ${err.message}`); }
  }
  console.log(`\nBackfill done. For AUTO-routing new mail (zero scripting), add one Gmail filter per account:`);
  console.log(`  Gmail -> Settings -> Filters -> Create filter`);
  console.log(`  From:  linkedin.com OR indeed.com OR reed.co.uk OR greenhouse.io OR ashbyhq.com OR no-reply OR recruit OR talent`);
  console.log(`  Action: Apply label "${labelName}" (and optionally Skip Inbox)`);
  console.log(`\nThen day-to-day: scan only this label — node gmail-sync.mjs digest --mailbox "${labelName}" --days 1`);
}

// ── exports (for import-linkedin-apps.mjs and other tools) ────────────────────
export { accounts, fetchRecent, fetchBody, classify, trackerCompanies };

// ── main (only when run directly, not when imported) ──────────────────────────
import { pathToFileURL } from 'url';
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  const run = {
    digest: cmdDigest, alerts: cmdAlerts, updates: cmdUpdates,
    rejections: cmdRejections, label: cmdLabel,
    read: cmdRead, reply: cmdReply, send: cmdSend,
  }[cmd];

  if (!run) {
    console.log('gmail-sync — job-only email sync (read + gated send)\n');
    console.log('Commands: digest | alerts | updates | read | reply | send');
    console.log('Run with no creds working? Fix .env: 2FA on, IMAP enabled, fresh 16-char app password.');
    process.exit(cmd ? 1 : 0);
  }
  run(args).catch(e => { console.error('Error:', e.responseText || e.message); process.exit(1); });
}
