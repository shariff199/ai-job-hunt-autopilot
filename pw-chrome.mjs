/**
 * pw-chrome.mjs — one place that decides which browser Playwright launches.
 *
 * WHY THIS EXISTS
 * Playwright's bundled Chromium download hung at 428kB on this Mac and left a
 * stale lock in ~/Library/Caches/ms-playwright/__dirlock. Every launch then
 * failed with "Executable doesn't exist" and told us to run
 * `npx playwright install` — which is the command that caused it. Do not run it.
 *
 * The first attempt at a fix put PLAYWRIGHT_CHROME_PATH in .env, but none of
 * these scripts read .env, and the value has a space in it ("Google Chrome.app")
 * so `set -a; . ./.env` swallowed it too. It was inert. So this falls back to
 * probing the standard install locations and needs no configuration at all.
 *
 * Order: PLAYWRIGHT_CHROME_PATH if set → system Chrome → system Edge →
 * nothing, in which case Playwright uses its own bundled browser as before.
 */
import { existsSync } from 'fs';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

export function chromePath() {
  const fromEnv = (process.env.PLAYWRIGHT_CHROME_PATH || '').trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return CANDIDATES.find(existsSync) || null;
}

/** Merge an executablePath into launch options when a real browser was found. */
export function PW_OPTS(opts = {}) {
  const exe = chromePath();
  return exe ? { ...opts, executablePath: exe } : opts;
}

export default PW_OPTS;
