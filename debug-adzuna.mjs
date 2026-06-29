import { readFileSync } from 'fs';

// Load .env
const lines = readFileSync('.env', 'utf-8').split('\n');
for (const l of lines) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const id  = process.env.ADZUNA_APP_ID;
const key = process.env.ADZUNA_APP_KEY;

console.log('App ID loaded:', id);
console.log('App Key loaded:', key ? key.slice(0,6) + '...' : 'MISSING');

const url = `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${id}&app_key=${key}&what=data+analyst&where=london&results_per_page=3&sort_by=date`;
console.log('Calling:', url.replace(key, '[KEY]'));

const res = await fetch(url, { headers: { Accept: 'application/json' } });
const body = await res.text();
console.log('HTTP status:', res.status);
console.log('Response:', body.slice(0, 400));
