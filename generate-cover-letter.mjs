#!/usr/bin/env node

/**
 * generate-cover-letter.mjs — Generate cover letter PDF from text
 *
 * Reads a cover letter text/markdown file, renders to a clean ATS-friendly
 * HTML page, and converts to PDF using Playwright (same dependency as
 * generate-pdf.mjs).
 *
 * Usage:
 *   node generate-cover-letter.mjs --text <path> --output <pdf-path>
 *   node generate-cover-letter.mjs --inline "Dear team..." --output <pdf-path>
 *
 * Examples:
 *   node generate-cover-letter.mjs \
 *     --text temp/cover-marshmallow.txt \
 *     --output output/cover-letter-mohammed-marshmallow-2026-05-13.pdf
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { chromium } from 'playwright';

// ── Parse args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const textPath  = flag('text');
const inline    = flag('inline');
const outputArg = flag('output');

if ((!textPath && !inline) || !outputArg) {
  console.error('Usage: node generate-cover-letter.mjs --text <path> --output <pdf-path>');
  console.error('   or: node generate-cover-letter.mjs --inline "text" --output <pdf-path>');
  process.exit(1);
}

let body;
if (textPath) {
  if (!existsSync(resolve(textPath))) {
    console.error(`Text file not found: ${textPath}`);
    process.exit(1);
  }
  body = readFileSync(resolve(textPath), 'utf-8');
} else {
  body = inline;
}

const output = resolve(outputArg);
mkdirSync(dirname(output), { recursive: true });

// ── Normalise text → HTML ──────────────────────────────────────────
// Split body into paragraphs on blank lines; keep single newlines as <br/>
function bodyToHtml(text) {
  // Normalise smart quotes → ASCII
  text = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—/g, '—')
    .replace(/–/g, '-')
    .replace(/ /g, ' ');

  const paragraphs = text.trim().split(/\n\s*\n/);
  return paragraphs.map(p => `<p>${p.trim().replace(/\n/g, '<br/>')}</p>`).join('\n');
}

const htmlBody = bodyToHtml(body);

// ── HTML template ──────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cover Letter — Your Name</title>
  <style>
    @page { size: A4; margin: 0.7in; }
    body {
      font-family: 'Helvetica Neue', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
      max-width: 100%;
    }
    .header {
      margin-bottom: 28px;
      padding-bottom: 14px;
      border-bottom: 2px solid #0891b2;
    }
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header .subtitle {
      font-size: 10pt;
      color: #555;
      margin-bottom: 8px;
    }
    .header .contact {
      font-size: 9.5pt;
      color: #333;
    }
    .header .contact a {
      color: #0891b2;
      text-decoration: none;
    }
    .body p {
      margin: 0 0 14px 0;
      text-align: justify;
    }
    .body p:last-child {
      margin-bottom: 0;
    }
    .date {
      font-size: 10pt;
      color: #555;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your Name</h1>
    <div class="subtitle">MSc Data Science (Distinction) | Python • SQL • Machine Learning • Power BI</div>
    <div class="contact">
      Cardiff, United Kingdom &nbsp;|&nbsp;
      +44 0000 000000 &nbsp;|&nbsp;
      <a href="mailto:you@example.com">you@example.com</a> &nbsp;|&nbsp;
      <a href="https://www.linkedin.com/in/your-profile/">LinkedIn</a> &nbsp;|&nbsp;
      <a href="https://github.com/your-username">GitHub</a>
    </div>
  </div>

  <div class="date">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>

  <div class="body">
    ${htmlBody}
  </div>
</body>
</html>`;

// ── Render to PDF ──────────────────────────────────────────────────
async function main() {
  console.log('Rendering cover letter to PDF...');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.setContent(html, { waitUntil: 'networkidle' });

  await page.pdf({
    path: output,
    format: 'A4',
    margin: { top: '0.7in', right: '0.7in', bottom: '0.7in', left: '0.7in' },
    printBackground: true,
  });

  await browser.close();
  console.log(`✓ Cover letter PDF: ${output}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
