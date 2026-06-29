#!/usr/bin/env node

/**
 * reed-setup.mjs — Open a page in the persistent browser profile + screenshot.
 *
 * Uses the same .browser-profile as auto-apply.mjs, so Reed/LinkedIn logins
 * persist. Navigates to the given URL, screenshots it, keeps browser open.
 *
 * Usage:
 *   node reed-setup.mjs [URL]
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = process.argv[2] || 'https://www.reed.co.uk/profile';

mkdirSync(resolve(__dirname, 'temp'), { recursive: true });

const userDataDir = resolve(__dirname, '.browser-profile');
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: null,
  args: ['--start-maximized'],
});
const page = context.pages()[0] || await context.newPage();

console.log(`Opening: ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(3500);

const shot = resolve(__dirname, 'temp', 'reed-screenshot.png');
await page.screenshot({ path: shot, fullPage: true });

console.log('───────────────────────────────────────');
console.log('Screenshot: ' + shot);
console.log('Final URL:  ' + page.url());
console.log('Page title: ' + (await page.title()));
console.log('───────────────────────────────────────');
console.log('Browser stays open. Review the page.');

await new Promise(() => {});
