#!/usr/bin/env node
/**
 * token-log.mjs — record what one application cost in model tokens.
 *
 * Reads a Claude Code session transcript, sums assistant usage between two times,
 * and appends one row to data/token-log.tsv, so the cost per application can be
 * tracked and pushed down.
 *
 *   node token-log.mjs --session <id-prefix> --since "2026-09-21T15:20" [--until ISO]
 *        --company Acme --role "Data Analyst" [--note "..."] [--project-dir <dir>]
 *   node token-log.mjs --show        # print the log
 *
 * --project-dir defaults to the Claude Code transcript folder for the current
 * directory (~/.claude/projects/<cwd with every non-alphanumeric turned into "-">).
 *
 * Columns: date, company, role, model_calls, cache_read, cache_write, output, note.
 * model_calls is the number to push down: every call re-reads the whole context.
 */
import { readFileSync, appendFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { dirname } from 'path';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) =>
  v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc, []));
const LOG = new URL('./data/token-log.tsv', import.meta.url).pathname;
mkdirSync(dirname(LOG), { recursive: true });
if (!existsSync(LOG)) writeFileSync(LOG, 'date\tcompany\trole\tmodel_calls\tcache_read\tcache_write\toutput\tnote\n');
if (a.show) { console.log(readFileSync(LOG, 'utf8')); process.exit(0); }
if (!a.session || !a.since) { console.error('usage: node token-log.mjs --session <id-prefix> --since <ISO> --company X --role Y'); process.exit(1); }

const dir = a['project-dir'] || `${homedir()}/.claude/projects/${process.cwd().replace(/[^A-Za-z0-9]/g, '-')}`;
if (!existsSync(dir)) { console.error('no transcript folder at', dir, '— pass --project-dir'); process.exit(1); }
const file = readdirSync(dir).find(f => f.startsWith(a.session) && f.endsWith('.jsonl'));
if (!file) { console.error('no transcript for session', a.session, 'in', dir); process.exit(1); }
const since = new Date(a.since), until = a.until ? new Date(a.until) : new Date();
const t = { calls: 0, read: 0, write: 0, out: 0 };
for (const line of readFileSync(`${dir}/${file}`, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let r; try { r = JSON.parse(line); } catch { continue; }
  const u = r.message?.usage;
  if (r.type !== 'assistant' || !u || !r.timestamp) continue;
  const ts = new Date(r.timestamp);
  if (ts < since || ts > until) continue;
  t.calls++; t.read += u.cache_read_input_tokens || 0;
  t.write += (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0); t.out += u.output_tokens || 0;
}
const row = [since.toISOString().slice(0, 10), a.company, a.role, t.calls, t.read, t.write, t.out, a.note || ''].join('\t');
appendFileSync(LOG, row + '\n');
console.log(row);
