import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
const cfg = yaml.load(readFileSync('portals.yml','utf8'));
const base = (cfg.tracked_companies||[]).filter(c=>c.enabled && c.api_provider);
const extra = [
  ['Checkout.com','greenhouse','checkoutcom'],['ClearScore','greenhouse','clearscore'],['Snyk','greenhouse','snyk'],
  ['Deliveroo','greenhouse','deliveroo'],['Octopus Energy','greenhouse','octoenergy'],['Wise','greenhouse','wise'],
  ['Starling Bank','greenhouse','starlingbank'],['Improbable','greenhouse','improbable'],['Ramp','ashby','ramp'],['Deel','ashby','deel'],
].map(([name,prov,slug])=>({name,api_provider:prov,slug}));
function slugOf(c){if(c.slug)return c.slug;const u=c.careers_url||'';const m=u.match(/(?:greenhouse\.io|ashbyhq\.com|lever\.co)\/([^/?]+)/);return m?m[1]:null;}
const companies=[...base,...extra];
const ANALYST=/(data analyst|business analyst|\bbi\b|power bi|reporting analyst|insight analyst|business intelligence|analytics engineer|mi analyst|product analyst|commercial analyst|marketing analyst)/i;
const SENIOR=/(senior|lead|principal|staff|head of|vp|vice president|director|manager| ii\b| iii\b)/i;
const UK=/(uk|united kingdom|london|manchester|edinburgh|leeds|bristol|birmingham|cardiff|glasgow|england|scotland|wales|remote)/i;
async function gj(u){const c=new AbortController();const t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(u,{signal:c.signal,headers:{'User-Agent':'career-ops'}});return r.ok?r.json():null}catch{return null}finally{clearTimeout(t)}}
const out=[];
await Promise.all(companies.map(async c=>{
  const slug=slugOf(c);if(!slug)return;let jobs=[];
  if(c.api_provider==='greenhouse'){const j=await gj(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);jobs=(j?.jobs||[]).map(x=>({t:x.title,l:x.location?.name||'',url:x.absolute_url}));}
  else if(c.api_provider==='ashby'){const j=await gj(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);jobs=(j?.jobs||[]).map(x=>({t:x.title,l:x.location||'',url:x.jobUrl||x.applyUrl||''}));}
  else if(c.api_provider==='lever'){const j=await gj(`https://api.lever.co/v0/postings/${slug}?mode=json`);jobs=(Array.isArray(j)?j:[]).map(x=>({t:x.text,l:x.categories?.location||'',url:x.hostedUrl}));}
  for(const job of jobs){if(!job.t||!ANALYST.test(job.t)||SENIOR.test(job.t))continue;if(!UK.test(job.l+' '+job.t))continue;out.push({co:c.name,...job});}
}));
let s='=== AUTO-FILLABLE analyst roles (direct ATS) ===\n';
out.forEach((o,i)=>{s+=`${i+1}. ${o.co} — ${o.t} | ${o.l}\n   ${o.url}\n`;});
s+=`\nTotal: ${out.length}\n`;
writeFileSync('temp/autofill-scan.txt',s);
console.log(s);
