#!/usr/bin/env node

/**
 * generate-cv.mjs — Markdown CV → ATS-friendly PDF
 *
 * Reads a tailored cv.md (standard career-ops CV markdown structure) and
 * renders it to a clean, single-column, ATS-parseable PDF via Playwright.
 *
 * Usage:
 *   node generate-cv.mjs --md <path> --output <pdf-path>
 *
 * Example:
 *   node generate-cv.mjs --md temp/cv-monzo.md \
 *     --output output/cv-mohammed-monzo-2026-05-13.pdf
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { chromium } from 'playwright';

// ── Parse args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const mdPath  = flag('md');
const outArg  = flag('output');

if (!mdPath || !outArg) {
  console.error('Usage: node generate-cv.mjs --md <path> --output <pdf-path>');
  process.exit(1);
}
if (!existsSync(resolve(mdPath))) {
  console.error(`Markdown file not found: ${mdPath}`);
  process.exit(1);
}

const md = readFileSync(resolve(mdPath), 'utf-8');
const output = resolve(outArg);
mkdirSync(dirname(output), { recursive: true });

// ── ATS normalisation ──────────────────────────────────────────────
function ats(text) {
  return text
    .replace(/[—]/g, '-')
    .replace(/[–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[…]/g, '...')
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ');
}

// ── Inline markdown (bold, italic, links) ──────────────────────────
function inline(text) {
  let t = ats(text);
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3');
  return t;
}

// ── Markdown → HTML body ───────────────────────────────────────────
function mdToHtml(src) {
  const lines = src.split('\n');
  let html = '';
  let inList = false;

  const closeList = () => { if (inList) { html += '</ul>\n'; inList = false; } };

  for (let raw of lines) {
    const line = raw.replace(/\r$/, '');

    if (/^---\s*$/.test(line)) { closeList(); html += '<hr/>\n'; continue; }
    if (/^\s*$/.test(line))    { closeList(); continue; }

    if (line.startsWith('# ')) {
      closeList(); html += `<h1>${inline(line.slice(2))}</h1>\n`; continue;
    }
    if (line.startsWith('## ')) {
      closeList(); html += `<h2>${inline(line.slice(3))}</h2>\n`; continue;
    }
    if (line.startsWith('### ')) {
      closeList(); html += `<h3>${inline(line.slice(4))}</h3>\n`; continue;
    }
    if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `<li>${inline(line.slice(2))}</li>\n`;
      continue;
    }
    // plain paragraph
    closeList();
    html += `<p>${inline(line)}</p>\n`;
  }
  closeList();
  return html;
}

const bodyHtml = mdToHtml(md);

// ── Full HTML doc ──────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CV — Your Name</title>
<style>
  @page { size: A4; margin: 0.55in; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #1a1a1a;
    margin: 0;
  }
  h1 {
    font-size: 21pt;
    font-weight: 700;
    margin: 0 0 2px 0;
    letter-spacing: -0.5px;
  }
  /* the line right after h1 (subtitle) */
  h1 + p {
    font-size: 9.5pt;
    color: #444;
    margin: 0 0 6px 0;
    font-weight: 600;
  }
  h2 {
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #0891b2;
    margin: 16px 0 6px 0;
    padding-bottom: 2px;
    border-bottom: 1.5px solid #0891b2;
  }
  h3 {
    font-size: 10.5pt;
    font-weight: 700;
    margin: 10px 0 1px 0;
  }
  p { margin: 2px 0; }
  ul { margin: 4px 0 8px 0; padding-left: 18px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 8px 0; }
  a { color: #0891b2; text-decoration: none; }
  strong { font-weight: 700; }
  em { font-style: italic; color: #555; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

// ── Render ─────────────────────────────────────────────────────────
async function main() {
  console.log(`Rendering CV: ${mdPath} -> ${output}`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    margin: { top: '0.55in', right: '0.55in', bottom: '0.55in', left: '0.55in' },
  });
  await browser.close();
  console.log(`✓ CV PDF: ${output}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
