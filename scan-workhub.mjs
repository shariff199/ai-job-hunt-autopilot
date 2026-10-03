#!/usr/bin/env node
/**
 * scan-workhub.mjs — search GOV.UK Work Hub (jobs.service.gov.uk, DWP "Find a job") with no browser
 * and no model tokens. Checks every employer against the Home Office sponsor register and drops
 * employers already in data/applications.md. Writes data/fulltime/workhub-YYYY-MM-DD.md.
 *   node scan-workhub.mjs [--pages 5] [--location London]
 */
import { readFileSync, writeFileSync } from 'fs';
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc, []));
const pages = Number(a.pages || 5), loc = a.location || 'London';
const terms = a.terms ? a.terms.split(',') : ['data analyst', 'junior data analyst', 'graduate data', 'data scientist', 'business intelligence analyst',
  'data engineer', 'insight analyst', 'reporting analyst', 'power bi', 'machine learning', 'ai engineer', 'analytics',
  'compliance analyst', 'compliance officer', 'compliance assistant', 'kyc analyst', 'aml analyst', 'financial crime analyst',
  'risk analyst', 'operational risk', 'business analyst', 'operations analyst', 'process improvement', 'research analyst',
  'mi analyst', 'performance analyst', 'pricing analyst', 'commercial analyst', 'finance analyst', 'graduate analyst',
  'graduate scheme', 'data quality', 'data governance', 'automation', 'crm analyst', 'systems analyst', 'digital analyst'];
const norm = s => s.toLowerCase().replace(/&amp;/g, '&').replace(/\b(ltd|limited|plc|llp|uk|group|holdings|the|inc)\b|[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const reg = new Map();
for (const l of readFileSync('data/sponsor-register.csv', 'utf8').split('\n')) {
  const name = l.startsWith('"') ? l.slice(1, l.indexOf('"', 1)) : l.split(',')[0];
  if (/Skilled Worker/.test(l)) reg.set(norm(name), (l.match(/\((A|B) rating\)/) || [])[1] || '?');
}
const applied = new Set(readFileSync('data/applications.md', 'utf8').split('\n').map(r => r.split('|')[3]).filter(Boolean).map(norm));
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
const seen = new Map();
for (const t of terms) for (let p = 1; p <= pages; p++) {
  const url = `https://www.jobs.service.gov.uk/jobs/search?keywords=${encodeURIComponent(t)}&location=${encodeURIComponent(loc)}&pageNumber=${p}`;
  const h = await (await fetch(url)).text();
  const cards = h.split('data-testid="searchResultCard-').slice(1);
  if (!cards.length) break;
  for (const c of cards) {
    const id = c.slice(0, 24);
    if (seen.has(id)) continue;
    const title = strip((c.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '');
    const emp = c.match(/searchResultCardEmployer"><span>([\s\S]*?)<\/span><span[^>]*>([\s\S]*?)<\/span>/) || [];
    const employer = strip(emp[1] || '?'), place = strip(emp[2] || '').replace(/^- /, '');
    const text = strip(c.slice(0, 1500));
    const salary = (text.match(/£[\d,.]+(?:\s*(?:-|to)\s*£[\d,.]+)?(?:\s*(?:per|a)\s*(?:year|annum|hour|day))?/i) || [''])[0];
    seen.set(id, { id, title, employer, place, salary, perm: /Permanent/.test(text), full: /Full time/.test(text), term: t });
  }
  await new Promise(r => setTimeout(r, 400));
}
const rows = [...seen.values()].map(j => {
  const n = norm(j.employer);
  const sp = reg.get(n) || [...reg.keys()].find(k => k.length > 5 && (k === n || k.startsWith(n + ' ') || n.startsWith(k + ' '))) && 'A?';
  return { ...j, sponsor: sp || '', done: applied.has(n) };
});
const ROLE = /complian|kyc|aml|financial crime|risk|governance|quality|process|operations|pricing|commercial|finance|research|systems|crm|automation|graduate|\bdata\b|analyst|analytics|insight|intelligence|\bBI\b|machine learning|\bAI\b|scientist|reporting|power bi|\bML\b/i;
const NOT = /health and safety|H&S|fire|nurse|clinical|care |teacher|driver|warehouse|asbestos|chef|baker|biomedical|genetic|counsell|structural|civil|SOC analyst|security analyst|meter|HR |human resources/i;
const AGENCY = /inploi|pertemps|carbon60|manpower|hays|morgan hunt|reed|randstad|adecco|tiro training|hospitality & catering/i;
const keep = rows.filter(r => r.sponsor && !r.done && r.full && ROLE.test(r.title) && !NOT.test(r.title) && !AGENCY.test(r.employer)
  && !/senior|lead|head|principal|manager|director/i.test(r.title)
  && !(() => { const m = r.salary.match(/£([\d,]+)/g); if (!m || !/year|annum/i.test(r.salary)) return false;
       return Math.max(...m.map(x => +x.replace(/[£,]/g, ''))) < 33400; })())
  .filter((r, i, arr) => arr.findIndex(x => x.title === r.title && x.employer === r.employer) === i);
const day = new Date().toISOString().slice(0, 10);
const md = [`# Work Hub scan ${day} (${loc})`, '', `${seen.size} unique jobs across ${terms.length} searches · ${rows.filter(r => r.sponsor).length} at licensed sponsors · ${keep.length} shortlisted (sponsor, full time, not senior, not already applied)`,
  '', '| Title | Employer | Where | Salary | Sponsor | Found by | Link |', '|---|---|---|---|---|---|---|',
  ...keep.map(r => `| ${r.title} | ${r.employer} | ${r.place} | ${r.salary} | ${r.sponsor} | ${r.term} | https://www.jobs.service.gov.uk/jobs/${r.id} |`)].join('\n');
writeFileSync(`data/fulltime/workhub-${day}-${loc.toLowerCase().replace(/\W+/g, "-")}.md`, md + '\n');
console.log(md.split('\n').slice(0, 3).join('\n'));
console.log(keep.map(r => `${r.title} | ${r.employer} | ${r.salary}`).join('\n'));
