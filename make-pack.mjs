#!/usr/bin/env node
/**
 * make-pack.mjs — build a full application pack with ZERO Claude tokens.
 *
 * WHY: an agent building one pack spent ~85-90k tokens, most of it fixed startup
 * context. The pack itself is deterministic apart from the cover letter, and Gemini
 * writes that from a fixed prompt for a few thousand tokens on the free tier.
 *
 *   node make-pack.mjs --url <workday advert url> --company Acme --slug Acme-Analyst \
 *        [--band grad|mid|senior] [--angle "one line on what to lead with"]
 *   node make-pack.mjs --jd-file <advert.txt> --title "Data Analyst" --company Acme --slug Acme-Analyst
 *
 * Needs: config/profile.yml (candidate.full_name, phone, email), master/bullets.yml,
 * master/cover-letter-facts.md (copy the .example files), GEMINI_API_KEY in .env or the env.
 *
 * Output: output/tailored-YYYY-MM-DD/<slug>/ with jd.txt, cv.md, cover-letter.txt, both PDFs,
 * and a GATE line (clearance / passport / no-sponsorship) printed first. A failed gate stops.
 * Afterwards: read cover-letter.txt once, then run workday-apply.mjs.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { load as yamlLoad } from 'js-yaml';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) =>
  v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc, []));
if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!a.company || (!a.url && !a['jd-file']) || (a['jd-file'] && !a.title)) {
  console.error('usage: node make-pack.mjs (--url <workday advert> | --jd-file <txt> --title "Y") --company "X" [--slug S] [--band grad|mid|senior] [--angle "..."]');
  process.exit(1);
}
for (const f of ['config/profile.yml', 'master/bullets.yml', 'master/cover-letter-facts.md']) {
  if (!existsSync(f)) { console.error(`${f} is missing: copy the matching .example file and fill it in.`); process.exit(1); }
}
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set (.env or environment).'); process.exit(1); }

// Candidate identity, from config/profile.yml only.
const prof = yamlLoad(readFileSync('config/profile.yml', 'utf8')) || {};
const cand = prof.candidate || {};
const NAME = cand.full_name;
if (!NAME) { console.error('config/profile.yml has no candidate.full_name'); process.exit(1); }
const SIGN_OFF = [cand.phone, cand.email].filter(Boolean).join(' · ');
const NAME_SLUG = NAME.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const slug = (a.slug || a.company).replace(/[^A-Za-z0-9._-]+/g, '-');

// 1. Advert via Workday CXS (no browser): .../en-US/<site>/job/... -> /wday/cxs/<tenant>/<site>/job/...
// Non-Workday adverts (LinkedIn, councils, Applied): --jd-file <text> --title "..." [--url <advert>]
let info, jd, title;
if (a['jd-file']) {
  jd = readFileSync(a['jd-file'], 'utf8'); title = a.title; info = { title, location: a.location || '' };
} else {
  const u = new URL(a.url);
  const tenant = u.hostname.split('.')[0];
  const parts = u.pathname.split('/').filter(Boolean);           // [en-US, site, job, ...]
  const i = parts[0].includes('-') && parts[0].length === 5 ? 1 : 0;
  const api = `${u.origin}/wday/cxs/${tenant}/${parts[i]}/${parts.slice(i + 1).join('/')}`;
  info = (await (await fetch(api)).json()).jobPostingInfo;
  if (!info) { console.error('Workday API returned no jobPostingInfo; save the advert text and use --jd-file'); process.exit(1); }
  jd = info.jobDescription.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
  title = info.title;
}

// 2. Gate before writing anything
const gate = [/security clearance|\bSC\b clearance|\bDV\b|continuous UK address/i, /British passport/i,
  /(unable to|cannot|will not|do not) (offer|provide) (visa )?sponsorship/i, /without (employer )?sponsorship/i]
  .map(r => jd.match(r)?.[0]).filter(Boolean);
console.log(`GATE: ${gate.length ? 'FAIL — ' + gate.join(' | ') : 'pass'}  (${title}, ${info.location})`);
if (gate.length) process.exit(2);

const tmp = join(tmpdir(), `jd-${slug}.txt`); writeFileSync(tmp, jd);

// 3. CV via tailor-v2
const t = execFileSync('node', ['tailor-v2.mjs', '--jd-file', tmp, '--company', a.company, '--title', title, '--band', a.band || 'grad', '--lean'], { encoding: 'utf8' });
const dir = t.match(/written: (\S+)/)[1];
console.log(t.split('\n').filter(l => /keywords|missing/.test(l)).join('\n'));
writeFileSync(`${dir}/jd.txt`, jd);

// 4. Cover letter via Gemini, from the fixed facts file only
const facts = readFileSync('master/cover-letter-facts.md', 'utf8');
const prompt = `Write a UK cover letter for ${NAME} for the role "${title}" at ${a.company}.

RULES (break none):
- 250-330 words. Plain British English. First person. Paragraphs only: no bullets, no bold, no headings.
- Open with the advert's own wording or example (quote or paraphrase one concrete thing they ask for), then the candidate's closest real work.
- Use ONLY facts from FACTS below. Copy every number exactly. Do not add any fact, number, tool, employer or claim not in FACTS.
- Never write about skills the candidate lacks. Never say "I haven't", "new to me", "eager to learn". Lead with related work instead.
- Banned words: delve, tapestry, testament, underscore, pivotal, crucial, meticulous, vibrant, showcase, foster, realm, intricate, seamless, robust, comprehensive, nuanced, passionate, leverage, excited, thrilled, landscape.
- No em dashes or en dashes. No "not only... but also", no "it's not X, it's Y", no lists of three adjectives, no closing pleasantries beyond the fixed closing line.
- ${a.angle ? 'Angle to lead with: ' + a.angle : 'Pick the two or three facts that match the advert best; leave the rest out.'}
- End with the closing line from FACTS, then "Kind regards," and "${NAME}"${SIGN_OFF ? ` and "${SIGN_OFF}"` : ''} on separate lines.
- Start with "Dear Hiring Manager,".

FACTS:
${facts}

ADVERT:
${jd.slice(0, 6000)}`;
// Retry busy/overloaded responses, then fall back through models. 404 = retired name.
const models = [process.env.GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-3.6-flash-lite', 'gemini-3.5-flash'].filter(Boolean);
let j = {}, letter = '';
outer: for (const model of models) for (let tryN = 0; tryN < 4; tryN++) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }),
  });
  j = await r.json();
  letter = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (letter) { console.log(`GEMINI: ${model}`); break outer; }
  if (![429, 500, 503].includes(j.error?.code)) break;          // not transient: next model
  await new Promise(res => setTimeout(res, 4000 * (tryN + 1)));
}
if (!letter) { console.log('GEMINI FAILED', JSON.stringify(j).slice(0, 300)); process.exit(3); }
letter = letter.replace(/[—–]/g, ',').replace(/\*\*/g, '').trim() + '\n';
writeFileSync(`${dir}/cover-letter.txt`, letter);

// Mechanical checks the reader should not have to do
const banned = letter.match(/\b(delve|tapestry|testament|underscore|pivotal|crucial|meticulous|vibrant|showcase|foster|realm|intricate|seamless|robust|comprehensive|nuanced|passionate|leverage|excited|thrilled|landscape|I haven't|new to me|eager to learn)\b/gi) || [];
// The sign-off line (phone number) is not a claim, so it is not checked against FACTS.
const nums = (letter.replace(SIGN_OFF || '\u0000', '').match(/\d[\d,.]*%?/g) || []).filter(n => !facts.includes(n.replace(/[,.]$/, '')));
console.log(`LETTER: ${letter.split(/\s+/).length} words · banned: ${banned.join(',') || 'none'} · numbers not in facts: ${nums.join(',') || 'none'}`);

// 5. PDFs
const html = `<html><head><meta charset="utf-8"><style>body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.45;margin:0}p{margin:0 0 11pt}</style></head><body>${
  letter.trim().split(/\n\s*\n/).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')}</body></html>`;
writeFileSync(`${dir}/cover-letter.html`, html);
const cv = `${dir}/CV-${NAME_SLUG}-${slug}.pdf`, cl = `${dir}/Cover-Letter-${NAME_SLUG}-${slug}.pdf`;
execFileSync('node', ['generate-cv.mjs', '--md', `${dir}/cv.md`, '--output', cv], { stdio: 'ignore' });
execFileSync('node', ['generate-pdf.mjs', `${dir}/cover-letter.html`, cl, '--format=a4'], { stdio: 'ignore' });
console.log(`PACK: ${dir}`);
if (!a['jd-file']) console.log(`FILL: node workday-apply.mjs --job "${a.url}" --files "${process.cwd()}/${cv},${process.cwd()}/${cl}"`);
