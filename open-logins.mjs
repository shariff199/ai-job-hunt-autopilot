// Opens the persistent Edge profile with login tabs for the aggregators,
// then parks open (keep-alive) so the user can log in + upload CV once.
import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const userDataDir = resolve(__dirname, '.browser-profile');
const channel = process.env.CAREER_OPS_BROWSER_CHANNEL || 'msedge';
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, channel, viewport: null, args: ['--start-maximized'],
});
const sites = [
  'https://www.linkedin.com/login',
  'https://uk.indeed.com/account/login',
  'https://www.adzuna.co.uk/account/sign-in',
  'https://www.reed.co.uk/signin',
  'https://www.cv-library.co.uk/login',
  'https://www.jobs.nhs.uk/candidate/login',
];
const first = ctx.pages()[0] || await ctx.newPage();
await first.goto(sites[0]).catch(()=>{});
for (const s of sites.slice(1)) { const p = await ctx.newPage(); await p.goto(s).catch(()=>{}); }
console.log('Login tabs open: LinkedIn, Indeed, Adzuna, Reed. Log in + upload your CV to each, then close the window.');
const keepAlive = setInterval(()=>{}, 1<<30);
ctx.on('close', ()=>{ clearInterval(keepAlive); process.exit(0); });
await new Promise(()=>{});
