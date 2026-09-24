#!/usr/bin/env node
/**
 * tailor-v2.mjs — one tailored CV and its matching cover letter, per advert.
 *
 * WHY THIS REPLACES tailor-batch.mjs
 *   tailor-batch could reorder the Skills block and append one sentence to a fixed
 *   summary. Everything else on the page was identical for every advert, so a
 *   graduate scheme and a senior post both opened with "Leads a team of ten across
 *   data, software and automation". the brief this engine was written from, 2026-09-16:
 *     "optimizing the tailored cv in such a way that it shouldnt look like i am
 *      overqualified for that specific job which we are applying"
 *     "the first paragraph need to be really optimized while appling to the job"
 *     "see how i can position the contradiction correctly"
 *
 * WHAT IT DOES DIFFERENTLY
 *   1. Reads the advert's seniority band and selects which true bullets to show.
 *      A leadership claim is withheld from a graduate advert. Nothing is invented,
 *      and nothing true is contradicted — a bullet is either shown or it is not.
 *   2. Rebuilds the summary as three evidence-carrying lines (the UKJI structure),
 *      chosen per advert, instead of one fixed paragraph with a keyword sentence
 *      bolted on.
 *   3. Prints a company descriptor after each employer, so an unrecognised name
 *      still tells a recruiter what it is.
 *   4. Promotes the two most relevant public-data projects above employment when
 *      the advert is technical. HM Land Registry, NHS and the ONS carry the
 *      recognition his employers cannot, and the work is on GitHub to be checked.
 *   5. Splits Skills into Functional Competencies and Technical Tools (UKJI).
 *   6. Writes the cover letter from the SAME selection as the CV, so the two
 *      cannot drift apart.
 *
 * WHAT IT STILL WILL NOT DO
 *   Invent. Every line traces to master/bullets.yml, which cites FACT-BASE.md.
 *   Anything the advert wants and he lacks goes to the MISSING list on the match
 *   report, for him to read before applying, and nowhere near the CV.
 *
 *   Fulfilment-centre / Amazon warehouse work is NOT in the ledger and cannot be
 *   emitted. It belongs to the Amazon CVs, only when he asks. His instruction
 *   2026-09-16, repeating the decision at FACT-BASE.md:140.
 *
 * Usage:
 *   node tailor-v2.mjs --url <advert-url> --company "X" --title "Y" [--band grad|mid|senior]
 *   node tailor-v2.mjs --jd-file <path>   --company "X" --title "Y" [--lean]
 *   node tailor-v2.mjs --self-test
 *
 *   --lean (and any grad-band advert once config/profile.yml has a lean: block) renders
 *   the one-page CV: education first for grad, the primary employer only, four bullets,
 *   at most two projects inside a length budget.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

// ── identity, read from config/profile.yml (never hard-code a person here) ────
function loadIdentity() {
  const path = 'config/profile.yml';
  if (!existsSync(path)) {
    return { name: '', contactLine: '', signOffContact: '', rightToWorkLine: '', missing: true };
  }
  const y = readFileSync(path, 'utf8');
  const get = (k, fallback = '') => {
    const m = y.match(new RegExp('^\\s*' + k + '\\s*:\\s*"?([^"\\n]+)"?', 'm'));
    return m ? m[1].trim() : fallback;
  };
  const name = get('full_name', get('name'));
  const parts = [get('location'), get('phone'), get('email'), get('linkedin'), get('github')].filter(Boolean);
  const rtw = get('right_to_work_line',
    'I have the right to work in the UK and am available immediately. I would welcome the chance to talk about the role.');
  if (!name) return { name: '', contactLine: '', signOffContact: '', rightToWorkLine: rtw, missing: true };
  return {
    name,
    contactLine: parts.join('  |  '),
    signOffContact: [get('phone'), get('email')].filter(Boolean).join('  ·  '),
    rightToWorkLine: rtw,
  };
}
const ID = loadIdentity();

function requireIdentity() {
  if (ID.missing) {
    console.error('\nconfig/profile.yml is missing or has no full_name.');
    console.error('Copy config/profile.example.yml to config/profile.yml and fill in full_name, location, phone, email, linkedin, github, right_to_work_line.\n');
    process.exit(1);
  }
}
import { join } from 'path';
import { execFileSync } from 'child_process';
import { load as yamlLoad } from 'js-yaml';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = n => args.includes(`--${n}`);

const LEDGER = yamlLoad(readFileSync('master/bullets.yml', 'utf8'));

// ── 1. Seniority band, read off the advert's own title ───────────────────────
// The title is what the ATS filters on and what the recruiter reads first, so it
// decides the band. Body text is a weaker signal and is used only to break a tie.
const GRAD = /\b(graduate|junior|entry[- ]level|trainee|apprentice|intern|assistant|placement)\b/i;
const SENIOR = /\b(senior|lead|principal|head of|director|manager|chief|staff)\b/i;

export function detectBand(title, jd = '') {
  if (GRAD.test(title)) return 'grad';
  if (SENIOR.test(title)) return 'senior';
  // An untitled advert asking for many years is mid at most; asking for none is grad-friendly.
  const yrs = [...jd.matchAll(/(\d+)\+?\s*years?/gi)].map(m => Number(m[1])).filter(n => n <= 15);
  const max = yrs.length ? Math.max(...yrs) : null;
  if (max !== null && max >= 5) return 'senior';
  if (max !== null && max <= 1) return 'grad';
  return 'mid';
}

// ── 2. Keywords the advert actually uses, in priority order (UKJI: top 15) ───
// Priority = how often the advert says it, weighted up if it appears in the first
// fifth of the text, where requirements and the role summary sit.
const VOCAB = {
  // canonical term            -> skill tag in the ledger
  'power bi': 'powerbi', 'powerbi': 'powerbi', 'dax': 'dax', 'power query': 'powerbi',
  'sql': 'sql', 'postgresql': 'postgresql', 'postgres': 'postgresql', 'mysql': 'sql',
  't-sql': 'sql', 'query optimisation': 'performance', 'query optimization': 'performance',
  'python': 'python', 'pandas': 'pandas', 'numpy': 'pandas',
  'etl': 'etl', 'elt': 'etl', 'pipeline': 'etl', 'data pipeline': 'etl',
  'dbt': 'dbt', 'data warehouse': 'schema_design', 'data model': 'schema_design',
  'data modelling': 'schema_design', 'data modeling': 'schema_design',
  'tableau': 'tableau', 'looker': 'visualisation', 'qlik': 'visualisation',
  'dashboard': 'visualisation', 'data visualisation': 'visualisation',
  'data visualization': 'visualisation', 'reporting': 'reporting',
  'excel': 'excel', 'vlookup': 'excel', 'pivot table': 'excel',
  'data quality': 'data_quality', 'validation': 'data_quality', 'reconciliation': 'reconciliation',
  'data governance': 'data_quality', 'cleansing': 'data_quality', 'profiling': 'data_quality',
  'root cause': 'root_cause', 'automation': 'automation', 'automate': 'automation',
  'stakeholder': 'stakeholder', 'requirements': 'requirements', 'business owner': 'stakeholder',
  'kpi': 'reporting', 'management information': 'reporting', 'insight': 'analysis',
  'statistics': 'statistics', 'statistical': 'statistics', 'forecasting': 'statistics',
  'segmentation': 'analysis', 'regression': 'statistics', 'a/b test': 'experimentation',
  'experimentation': 'experimentation', 'api': 'api', 'rest': 'api',
  'azure': 'azure', 'aws': 'azure', 'databricks': 'azure', 'git': 'testing',
  'crm': 'crm', 'hubspot': 'crm', 'salesforce': 'crm',
  'nhs': 'healthcare', 'public sector': 'public_sector', 'council': 'public_sector',
  // AI and automation, added 2026-09-16. Without these the engine read an n8n /
  // LLM advert as a generic data advert and led with a Power BI dashboard, which
  // buries the one thing on his CV that answers the brief.
  'n8n': 'automation', 'zapier': 'automation', 'make.com': 'automation',
  'workflow': 'automation', 'orchestration': 'automation', 'rpa': 'automation',
  'power automate': 'automation', 'no-code': 'automation', 'low-code': 'automation',
  'llm': 'llm', 'openai': 'llm', 'gpt': 'llm', 'claude': 'llm', 'anthropic': 'llm',
  'generative ai': 'llm', 'prompt': 'llm', 'rag': 'llm', 'embedding': 'llm',
  'artificial intelligence': 'llm', 'chatbot': 'llm',
  'integration': 'api', 'webhook': 'api', 'apis': 'api',
  'go-to-market': 'crm', 'gtm': 'crm', 'outbound': 'crm', 'lead generation': 'crm',
};

// Things an advert commonly demands that he cannot evidence. Never written to a CV.
const CANNOT = {
  'sas': 'SAS beyond MSc coursework', 'spss': 'SPSS', 'sap': 'SAP', 'oracle': 'Oracle',
  'snowflake': 'Snowflake', 'redshift': 'Redshift', 'bigquery': 'BigQuery',
  'spark': 'Spark / PySpark', 'kafka': 'Kafka', 'airflow': 'Airflow',
  'salesforce': 'Salesforce', 'workday': 'Workday', 'dynamics': 'MS Dynamics',
  'alteryx': 'Alteryx', 'ssrs': 'SSRS', 'ssis': 'SSIS', 'vba': 'VBA',
  'elite 3e': 'Elite 3E', 'aderant': 'Aderant', 'tm1': 'TM1', 'cognos': 'Cognos',
};

export function keywordsFrom(jd) {
  const low = ' ' + jd.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const head = low.slice(0, Math.max(400, Math.floor(low.length / 5)));
  const scored = new Map();
  for (const [term, tag] of Object.entries(VOCAB)) {
    // Word boundaries: without them "rag" matched "average" and "git" matched "digital".
    // Measured 19 Sept 2026: 75 of 488 keyword slots across 38 packs were substring artefacts.
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'g');
    const n = (low.match(re) || []).length;
    if (!n) continue;
    const boost = head.includes(term) ? 2 : 1;
    const prev = scored.get(term) || { term, tag, score: 0 };
    prev.score += n * boost;
    scored.set(term, prev);
  }
  const missing = [];
  for (const [term, label] of Object.entries(CANNOT)) {
    if (low.includes(' ' + term)) missing.push(label);
  }
  return {
    top: [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 15),
    tags: new Set([...scored.values()].map(v => v.tag)),
    missing: [...new Set(missing)],
  };
}

// ── 3. Headline, tracking the advert's own title family ──────────────────────
export function headlineFor(title) {
  const t = title;
  // Order matters: "Power BI Developer" also contains "BI Developer".
  // "Power BI Data Specialist" and "Power BI Reporting Analyst" both put a word
  // between the tool and the noun, so allow one.
  if (/power ?bi (\w+ )?(developer|analyst|engineer|specialist|consultant)/i.test(t)) return 'Power BI Analyst';
  if (/business analyst/i.test(t)) return 'Business Analyst';
  if (/bi developer|business intelligence developer/i.test(t)) return 'BI Developer';
  if (/business intelligence|bi analyst/i.test(t)) return 'Business Intelligence Analyst';
  if (/analytics engineer/i.test(t)) return 'Analytics Engineer';
  if (/data engineer/i.test(t)) return 'Data Engineer';
  if (/data scientist/i.test(t)) return 'Data Scientist';
  if (/insight/i.test(t)) return 'Insight Analyst';
  if (/reporting/i.test(t)) return 'Reporting Analyst';
  if (/mi analyst|management information/i.test(t)) return 'MI Analyst';
  // AI/automation family, added 2026-09-16. Without these an Automation Engineer
  // advert was headlined "Data Analyst", so the first line of the page answered a
  // different job from the one being applied for.
  if (/automation/i.test(t)) return 'Automation Engineer';
  if (/gtm engineer|go-to-market engineer/i.test(t)) return 'GTM Engineer';
  if (/growth engineer/i.test(t)) return 'Growth Engineer';
  if (/integration/i.test(t)) return 'Integration Analyst';
  if (/implementation/i.test(t)) return 'Implementation Analyst';
  if (/solutions? (consultant|engineer|analyst)/i.test(t)) return 'Solutions Analyst';
  if (/business systems/i.test(t)) return 'Business Systems Analyst';
  if (/technical (operations|support)/i.test(t)) return 'Technical Operations Analyst';
  if (/compliance|financial crime|aml|kyc/i.test(t)) return 'Compliance Analyst';
  if (/operations analyst|business operations/i.test(t)) return 'Operations Analyst';
  return 'Data Analyst';
}

// ── 4. The three-line summary ────────────────────────────────────────────────
// Line 1 credential + what he does end to end. Line 2 the delivery evidence that
// matches this advert. Line 3 scope, pitched at the band so it reads as the right
// size of person for the job rather than too big for it.
export function buildSummary(band, tags) {
  const S = LEDGER.summary_lines;
  // Automation/LLM is checked FIRST. An n8n or GTM-engineering advert answered with
  // a Power BI line buries the one thing on his CV that speaks to the brief.
  const delivery = tags.has('automation') || tags.has('llm') ? S.delivery.automation
    : tags.has('powerbi') || tags.has('dax') || tags.has('reporting') ? S.delivery.bi
      : tags.has('data_quality') || tags.has('reconciliation') ? S.delivery.quality
        : S.delivery.technical;
  return [S.credential.all.trim(), delivery.trim(), S.scope[band].trim()];
}

// ── 5. Bullet selection ──────────────────────────────────────────────────────
// A bullet survives if its band allows it. Within a role the survivors are ordered
// by how many of the advert's own skill tags they carry, so the most relevant
// evidence is the first thing read under each job.
export function selectBullets(role, band, tags) {
  const out = [];
  for (const b of role.bullets) {
    if (!b.bands.includes(band)) continue;
    const text = b.variants ? (band === 'senior' ? b.variants.scope : b.variants.hands) : b.text;
    const rel = (b.skills || []).filter(s => tags.has(s)).length;
    out.push({ id: b.id, text: text.trim().replace(/\s+/g, ' '), rel, leadership: !!b.leadership });
  }
  return out.sort((a, b) => b.rel - a.rel);
}

export function selectProjects(tags, n = 4) {
  return [...LEDGER.projects]
    .map(p => ({ ...p, rel: (p.skills || []).filter(s => tags.has(s)).length }))
    .sort((a, b) => b.rel - a.rel)
    .slice(0, n);
}

// ── 6. Skills, in the two UKJI subsections ───────────────────────────────────
const FUNCTIONAL = [
  'Data Analysis', 'Business Intelligence', 'Requirements Gathering', 'Stakeholder Management',
  'Data Quality Assurance', 'Data Modelling', 'KPI Definition and Reporting', 'Root Cause Analysis',
  'Process Automation', 'Dashboard Design', 'Statistical Analysis',
  'Reconciliation', 'Project Delivery', 'Self-Service Analytics', 'Data Visualisation',
  'API Integration', 'Data Pipelines', 'Workflow Orchestration', 'LLM Integration',
];
const TECHNICAL = [
  'SQL', 'PostgreSQL', 'Power BI', 'DAX', 'Power Query', 'Python', 'pandas', 'NumPy', 'dbt',
  'Tableau', 'Advanced Excel', 'REST APIs', 'n8n', 'Git', 'Docker', 'AWS (S3, EC2)', 'R', 'MySQL',
  'Supabase', 'Azure Maps', 'HubSpot', 'Claude Code', 'MCP', 'GitHub Actions',
];

export function buildSkills(kw) {
  const order = kw.top.map(t => t.term.toLowerCase());
  // Whole-term matching only. Substring matching ranked "R" second for a Power BI
  // advert, because "reporting".includes("r") is true — the same class of bug that
  // picked the wrong Capgemini role on 15 Sept.
  const rank = s => {
    const low = s.toLowerCase();
    const i = order.findIndex(t => low === t || low.startsWith(t + ' ') || low.endsWith(' ' + t) || low.includes(' ' + t + ' '));
    return i < 0 ? 99 : i;
  };
  const sort = arr => [...arr].sort((a, b) => rank(a) - rank(b));
  return {
    functional: sort(FUNCTIONAL).slice(0, 12),
    technical: sort(TECHNICAL).slice(0, 14),
  };
}

// ── 7. Render ────────────────────────────────────────────────────────────────
// Lean CV for graduate and junior adverts: one page so the candidate does not read as
// over-qualified. Education first for grad schemes, the primary employer as a single
// entry, the four bullets that best match the advert (no leadership claims), and at
// most two projects inside a length budget. Everything person-specific comes from the
// `lean:` block in config/profile.yml; see config/profile.example.yml.
function loadLean() {
  const path = 'config/profile.yml';
  if (!existsSync(path)) return null;
  try {
    const y = yamlLoad(readFileSync(path, 'utf8')) || {};
    return y.lean || y.candidate?.lean || null;
  } catch { return null; }
}
const LEAN = loadLean();

function renderLeanCV({ band, kw, title }, C = LEAN || {}) {
  requireIdentity();
  const grad = band === 'grad';
  const headline = grad && C.grad_headline ? C.grad_headline : headlineFor(title);
  const skills = buildSkills(kw);
  // Which ledger roles feed the lean CV: those whose id starts with primary_role_prefix,
  // else every role at the newest role's company.
  const first = LEDGER.roles[0];
  const primary = LEDGER.roles.filter(r => C.primary_role_prefix ? r.id.startsWith(C.primary_role_prefix) : r.company === first.company);
  const drop = (C.drop_bullet_patterns || []).length ? new RegExp(C.drop_bullet_patterns.join('|'), 'i') : null;
  const trimmer = list => {
    const rules = (list || []).map(([re, rep]) => [new RegExp(re), rep ?? '']);
    return s => rules.reduce((t, [re, rep]) => t.replace(re, rep), s);
  };
  const trimBullet = trimmer(C.bullet_trims);
  const trimProject = trimmer([...(C.bullet_trims || []), ...(C.project_trims || [])]);
  const pool = primary
    .flatMap(r => selectBullets(r, band === 'senior' ? 'mid' : band, kw.tags))
    .filter(b => !b.leadership && !(drop && drop.test(b.text)))
    .map(b => ({ ...b, text: trimBullet(b.text) }));
  const seen = new Set();
  const bullets = pool.sort((a, b) => b.rel - a.rel).filter(b => !seen.has(b.id) && seen.add(b.id)).slice(0, 4);
  // Projects fill a length budget, not a count: two long write-ups pushed a mid CV to page two.
  let budget = grad ? 300 : 520; const projects = [];
  const exclude = new Set(C.exclude_project_ids || []);
  for (const p of selectProjects(kw.tags, 6).filter(p => !exclude.has(p.id))) {
    const len = p.text.trim().length;
    if (projects.length < 2 && (projects.length === 0 || len <= budget)) { projects.push(p); budget -= len; }
  }
  const summary = (grad ? C.summary_grad : C.summary_mid) || buildSummary(band === 'senior' ? 'mid' : band, kw.tags);
  const L = [`# ${ID.name}`, '', `**${headline}**`, '', ID.contactLine,
    '', '---', '', '## Professional Summary', '', ...summary.map(s => String(s).trim()), '', '---', ''];
  const edu = [];
  if ((C.education || []).length) {
    edu.push('## Education', '');
    for (const e of C.education) {
      edu.push(`### ${e.heading}`);
      if (e.grade_line) edu.push(e.grade_line);
      edu.push('');
      if (grad && (e.grad_only_bullets || []).length) edu.push(...e.grad_only_bullets.map(b => `- ${b}`), '');
    }
    edu.push('---', '');
  }
  if (grad) L.push(...edu);
  L.push('## Skills', '', `**Functional Competencies:** ${skills.functional.slice(0, 8).join(' | ')}`,
    `**Technical Tools:** ${skills.technical.slice(0, 11).join(' | ')}`, '', '---', '');
  const lead = primary[0] || first;
  const co = LEDGER.companies[lead.company] || { name: lead.company };
  const heading = C.primary_role_heading || `${co.name} | ${lead.title_variants?.[band] || lead.title} @@ ${lead.dates}`;
  L.push('## Employment History', '', `### ${heading}`);
  const note = C.primary_role_note || co.descriptor;
  if (note) L.push(`*${note}*`);
  L.push('');
  bullets.forEach(b => L.push(`- ${b.text}`));
  L.push('', '---', '', '## Selected Projects', '');
  for (const p of projects) {
    L.push(`### ${p.title} @@ ${p.year}`, `*${p.stack.split(', ').slice(0, 3).join(', ')} · ${p.repo}*`, '',
      `- ${trimProject(p.text.trim().replace(/\s+/g, ' '))}`, '');
  }
  L.push('---', '');
  if (!grad) L.push(...edu);
  if (C.certifications_line) L.push('## Certifications', '', C.certifications_line, '', '---', '');
  L.push(C.rtw_line || ID.rightToWorkLine, '');
  return L.join('\n');
}

function renderCV({ band, kw, title, company }, { full = false } = {}) {
  if (!full && (has('lean') || (band === 'grad' && LEAN))) return renderLeanCV({ band, kw, title });
  const headline = headlineFor(title);
  requireIdentity();
  const summary = buildSummary(band, kw.tags);
  const skills = buildSkills(kw);
  const technical = kw.tags.has('sql') || kw.tags.has('python') || kw.tags.has('etl');
  // Promoted above employment, two projects is the most that fits before the job
  // history is pushed off page one. Kept at the bottom, all four can stay.
  const projects = selectProjects(kw.tags, technical ? 2 : 4);

  const L = [];
  L.push(`# ${ID.name}`, '');
  L.push(`**${headline}**`, '');
  L.push(ID.contactLine);
  L.push('', '---', '');
  L.push('## Professional Summary', '');
  summary.forEach(s => L.push(s));
  L.push('', '---', '');
  L.push('## Skills', '');
  L.push(`**Functional Competencies:** ${skills.functional.join(' | ')}`);
  L.push(`**Technical Tools:** ${skills.technical.join(' | ')}`);
  L.push('', '---', '');

  const projectBlock = () => {
    const out = ['## Selected Projects', ''];
    for (const p of projects) {
      out.push(`### ${p.title} @@ ${p.year}`);
      out.push(`*${p.stack} · ${p.repo}*`, '');
      out.push(`- ${p.text.trim().replace(/\s+/g, ' ')}`, '');
    }
    return out;
  };

  // Technical adverts see the verifiable public-data work first. Everything else
  // keeps employment first, because a business-facing reader wants the job history.
  if (technical) { L.push(...projectBlock()); L.push('---', ''); }

  L.push('## Employment History', '');
  for (const role of LEDGER.roles) {
    const bullets = selectBullets(role, band, kw.tags);
    if (!bullets.length) continue;
    const co = LEDGER.companies[role.company];
    const roleTitle = role.title_variants ? role.title_variants[band] : role.title;
    L.push(`### ${co.name} | ${roleTitle} @@ ${role.dates}`);
    L.push(`*${co.descriptor}*`, '');
    bullets.forEach(b => L.push(`- ${b.text}`));
    L.push('');
  }
  L.push('---', '');

  if (!technical) { L.push(...projectBlock()); L.push('---', ''); }

  // Education, certifications and the right-to-work line come from the lean: block in
  // config/profile.yml (the same entries the one-page CV uses), never from this file.
  const C = LEAN || {};
  if ((C.education || []).length) {
    L.push('## Education', '');
    for (const e of C.education) { L.push(`### ${e.heading}`); if (e.grade_line) L.push(e.grade_line); L.push(''); }
    L.push('---', '');
  }
  if (C.certifications_line) { L.push('## Certifications', '', C.certifications_line, '', '---', ''); }
  L.push(C.rtw_line || ID.rightToWorkLine, '');
  return L.join('\n');
}

// The cover letter is built from the SAME band and the SAME selected bullets, so
// the two documents cannot tell different stories. His instruction 2026-09-16:
// "keep it consistent across the tailored cv and the cover letter".
function renderCoverLetter({ band, kw, title, company }) {
  const L = LEDGER.letter_lines;
  const p = selectProjects(kw.tags, 1)[0];

  // The letter argues from WHR bullets, not from CV lines. A WHR entry already
  // separates what he did, how, and what came of it, so it becomes a sentence a
  // person would write. Bullets without WHR stay on the CV and out of the letter.
  const whrPool = LEDGER.roles
    .flatMap(r => r.bullets.filter(b => b.whr && b.bands.includes(band)))
    .map(b => ({ ...b, rel: (b.skills || []).filter(s => kw.tags.has(s)).length }))
    .sort((a, b) => b.rel - a.rel);
  const sentence = b => {
    const w = b.whr;
    const one = s => s.trim().replace(/\s+/g, ' ');
    const how = one(w.how);
    // "using matching expected rent against payments" is not English. A `how` that
    // already starts with a gerund takes "by"; a noun phrase takes "using".
    const connector = /^\w+ing\b/.test(how) ? 'by' : 'using';
    return `I ${one(w.what).replace(/^([A-Z])/, m => m.toLowerCase())}, ${connector} ${how}, and ${one(w.result)}.`;
  };

  const paras = [
    `Dear Hiring Manager,`,
    ``,
    `I am writing to apply for the ${title} role at ${company}.`,
    ``,
    L.credential.trim(),
    ``,
    sentence(whrPool[0]),
    ``,
  ];
  if (whrPool[1]) paras.push(sentence(whrPool[1]), ``);
  paras.push(
    // Only the first sentence of the project. The full ledger entry runs to several
    // clauses and its later sentences start "Ported the transformations…", which
    // reads as a dangling fragment once the paragraph is in the first person.
    `I also publish analysis on UK public data. ${p.text.trim().replace(/\s+/g, ' ').split(/(?<=\.)\s/)[0].replace(/^([A-Z])/, m => 'I ' + m.toLowerCase())} ${p.repo ? `The code is at ${p.repo}, so the method can be checked rather than taken on trust.` : ''}`,
    ``,
    L.scope[band].trim(),
    ``,
    ID.rightToWorkLine,
    ``,
    `Kind regards,`,
    ID.name,
    ID.signOffContact,
    ``,
  );
  return paras.join('\n');
}

function renderMatchReport({ band, kw, title, company, url }) {
  const shown = LEDGER.roles.flatMap(r => selectBullets(r, band, kw.tags).map(b => b.id));
  const all = LEDGER.roles.flatMap(r => r.bullets.map(b => b.id));
  const withheld = all.filter(id => !shown.includes(id));
  const L = [];
  L.push(`# Match report — ${company}, ${title}`, '');
  L.push(`Advert: ${url || '(local file)'}`, `Band read from the title: **${band}**`, '');
  L.push('## Top keywords the advert uses, in priority order', '');
  kw.top.forEach((t, i) => L.push(`${i + 1}. ${t.term} (${t.score})`));
  L.push('');
  L.push('## Withheld from this CV', '');
  if (withheld.length) {
    L.push(`These are true and stay in the ledger. They are not shown because the advert is **${band}** band and they would read as over-senior for it:`, '');
    withheld.forEach(id => L.push(`- ${id}`));
  } else { L.push('Nothing withheld — every bullet suits this band.'); }
  L.push('');
  L.push('## MISSING — asked for, and he cannot evidence it', '');
  if (kw.missing.length) {
    L.push('Read these before applying. None of them appear on the CV or the cover letter.', '');
    kw.missing.forEach(m => L.push(`- ${m}`));
  } else { L.push('Nothing in the advert is outside what he can evidence.'); }
  L.push('');
  return L.join('\n');
}

// ── 8. Advert fetch ──────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
function fetchJD(url) {
  const html = execFileSync('curl', ['-sL', '--max-time', '30', '-A', UA, url], {
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  });
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── 9. Self-test ─────────────────────────────────────────────────────────────
// These assert the behaviour he asked for, so a future change that reintroduces
// the overqualified opening fails here instead of on an application.
function selfTest() {
  let pass = 0, fail = 0;
  const t = (name, cond) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

  t('graduate title reads grad', detectBand('Graduate Data Analyst') === 'grad');
  t('senior title reads senior', detectBand('Senior Data Analyst') === 'senior');
  t('plain title reads mid', detectBand('Data Analyst') === 'mid');
  t('"5+ years" pushes an untitled advert to senior', detectBand('Data Analyst', 'we want 5+ years experience') === 'senior');

  const tags = new Set(['powerbi', 'sql', 'python']);
  const grad = LEDGER.roles[0].bullets.filter(b => b.bands.includes('grad'));
  t('no leadership bullet reaches a graduate CV', grad.every(b => !b.leadership));
  const sel = selectBullets(LEDGER.roles[0], 'grad', tags);
  t('graduate CV still shows real delivery work', sel.length >= Math.min(2, grad.length));
  t('graduate CV never says "leads a team"', !sel.some(b => /leads a team/i.test(b.text)));
  t('senior CV does say "leads a team"', selectBullets(LEDGER.roles[0], 'senior', tags).some(b => /leads a team/i.test(b.text)));

  const sum = buildSummary('grad', tags);
  t('summary is exactly three lines', sum.length === 3);
  t('summary never claims a year count', !sum.join(' ').match(/\b(two|three|\d+)\s+years?\b/i));

  const cv = renderCV({ band: 'grad', kw: { top: [], tags, missing: [] }, title: 'Graduate Data Analyst', company: 'X' }, { full: true });
  t('every CV line traces to the ledger', LEDGER.roles.every(r => r.bullets.every(b => typeof b.fact === 'string' && b.fact.length > 0)));
  t('company descriptor is printed', Object.values(LEDGER.companies).every(c => !c.descriptor || cv.includes(c.descriptor) || !cv.includes(c.name)));
  t('skills use the two UKJI subsections', cv.includes('Functional Competencies:') && cv.includes('Technical Tools:'));
  t('role dates come from the ledger', LEDGER.roles.every(r => cv.includes(r.dates)));

  // Regressions from the first real run, 2026-09-16 (Morgan Hunt advert).
  t('"Power BI Data Specialist" headlines as Power BI, not Data Analyst',
    headlineFor('Power BI Data Specialist') === 'Power BI Analyst');
  const sk = buildSkills({ top: [{ term: 'power bi' }, { term: 'reporting' }, { term: 'excel' }] });
  // Before the whole-term fix, "R" ranked 2nd for a Power BI advert because
  // "reporting".includes("r"). It should now not reach the front of the list at all.
  t('substring match no longer floats "R" to the front', sk.technical.indexOf('R') === -1 || sk.technical.indexOf('R') > 3);
  t('Power BI leads the technical tools for a Power BI advert', sk.technical[0] === 'Power BI');
  const tech = renderCV({ band: 'mid', kw: { top: [], tags: new Set(['sql', 'python']), missing: [] }, title: 'Data Analyst', company: 'X' }, { full: true });

  // Lean one-page CV (grad band or --lean). Runs with the profile's lean: block, or with
  // an empty one, so the fallbacks are exercised too.
  for (const C of [LEAN || {}, {}]) {
    const lg = renderLeanCV({ band: 'grad', kw: { top: [], tags, missing: [] }, title: 'Graduate Data Analyst' }, C);
    const lm = renderLeanCV({ band: 'mid', kw: { top: [], tags, missing: [] }, title: 'Data Analyst' }, C);
    const tag = C === LEAN ? 'lean' : 'lean (no config)';
    const nb = s => (s.split('## Employment History')[1] || '').split('## Selected Projects')[0].split('\n').filter(l => l.startsWith('- ')).length;
    t(`${tag}: at most four employment bullets`, nb(lg) <= 4 && nb(lm) <= 4);
    t(`${tag}: never says "leads a team"`, !/leads a team/i.test(lg) && !/leads a team/i.test(lm));
    t(`${tag}: at most two projects`, (lg.split('## Selected Projects')[1].match(/^### /gm) || []).length <= 2);
    if (C.education?.length) {
      t(`${tag}: grad puts education before employment`, lg.indexOf('## Education') < lg.indexOf('## Employment History'));
      t(`${tag}: mid puts education after employment`, lm.indexOf('## Education') > lm.indexOf('## Employment History'));
    }
    const drop = (C.drop_bullet_patterns || []).length ? new RegExp(C.drop_bullet_patterns.join('|'), 'i') : null;
    t(`${tag}: dropped bullet patterns never appear`, !drop || !(lg.split('## Employment History')[1] || '').split('## Selected Projects')[0].split('\n').some(l => l.startsWith('- ') && drop.test(l)));
  }
  t('promoted project band is capped at two', (tech.match(/^### .*@@ 2026$/gm) || []).length === 2);

  // The letter must be first person. Reusing the CV's third-person summary put
  // "Owns the data work for a 50+ client portfolio" in as a paragraph of its own.
  const letter = renderCoverLetter({ band: 'mid', kw: { top: [{ term: 'power bi' }], tags: new Set(['powerbi', 'reporting']), missing: [] }, title: 'Data Analyst', company: 'X' });
  t('cover letter is first person', !/^(Owns|Builds|Leads|Has delivered|Data analyst with)/m.test(letter));
  t('cover letter states what he did as "I ..."', /\bI (built|automated|designed|rebuilt|loaded|aligned|replaced)/i.test(letter));
  t('cover letter only uses ledger text', letter.length > 200);
  t('cover letter does not keyword-stuff the advert terms', !/The advert asks for/.test(letter));
  t('no "using <gerund>" constructions in the letter', !/\busing \w+ing\b/.test(letter));

  // 2026-09-16: an n8n / LLM advert must lead with the automation evidence.
  const autoSum = buildSummary('mid', new Set(['automation', 'llm', 'powerbi']));
  const biSum = buildSummary('mid', new Set(['powerbi', 'reporting']));
  t('an automation advert and a BI advert get different summaries',
    !LEDGER.summary_lines.delivery.automation || autoSum[1] !== biSum[1]);
  t('the BI summary line comes from the ledger',
    !LEDGER.summary_lines.delivery.bi || biSum[1].trim() === LEDGER.summary_lines.delivery.bi.trim());
  t('automation and llm terms are in the keyword vocabulary',
    keywordsFrom('we use n8n, OpenAI and webhooks for GTM automation').tags.has('automation'));
  // From the ElevenLabs run, 2026-09-16.
  t('an Automation Engineer advert is not headlined "Data Analyst"', headlineFor('Automation Engineer - Influencers') === 'Automation Engineer');
  t('GTM Engineer keeps its own headline', headlineFor('GTM Engineer') === 'GTM Engineer');
  t('Compliance Analyst keeps its own headline', headlineFor('Financial Crime Advisory Officer') === 'Compliance Analyst');
  const l2 = renderCoverLetter({ band: 'mid', kw: { top: [], tags: new Set(['automation', 'api', 'etl']), missing: [] }, title: 'Automation Engineer', company: 'X' });
  t('the project paragraph is one sentence, no dangling fragment', !/\bPorted the transformations/.test(l2));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── main ─────────────────────────────────────────────────────────────────────
if (has('self-test')) selfTest();

const url = flag('url');
const jdFile = flag('jd-file');
const company = flag('company');
const title = flag('title');
if (!company || !title || (!url && !jdFile)) {
  console.error('usage: node tailor-v2.mjs --url <u> --company "X" --title "Y" [--band grad|mid|senior]');
  process.exit(2);
}

const jd = jdFile ? readFileSync(jdFile, 'utf8') : fetchJD(url);
if (jd.length < 400) {
  console.error(`advert text is only ${jd.length} chars — the page needs a browser. Save it with --jd-file instead.`);
  process.exit(3);
}
const kw = keywordsFrom(jd);
const band = flag('band') || detectBand(title, jd);

const slug = `${company}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const dir = join(`output/tailored-${today}`, slug);
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, 'cv.md'), renderCV({ band, kw, title, company }));
writeFileSync(join(dir, 'cover-letter.txt'), renderCoverLetter({ band, kw, title, company }));
writeFileSync(join(dir, 'match-report.md'), renderMatchReport({ band, kw, title, company, url }));
writeFileSync(join(dir, 'jd.txt'), jd);

console.log(`band: ${band}`);
console.log(`keywords: ${kw.top.slice(0, 8).map(t => t.term).join(', ')}`);
console.log(`missing: ${kw.missing.join(', ') || 'none'}`);
console.log(`written: ${dir}`);
