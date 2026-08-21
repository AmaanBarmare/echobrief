#!/usr/bin/env node
/**
 * Renders brand/src/guidelines.html to brand/EchoBrief-Brand-Guidelines.pdf
 * using headless Chrome. Requires Google Chrome installed.
 *
 *   node brand/src/build-pdf.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = resolve(here, 'guidelines.html');
const out = resolve(here, '..', 'EchoBrief-Brand-Guidelines.pdf');

const candidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = candidates.find(existsSync);
if (!chrome) {
  console.error('Google Chrome not found. Install it, or add its path to candidates[].');
  process.exit(1);
}

execFileSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--virtual-time-budget=20000',   // let the webfonts land before printing
  `--print-to-pdf=${out}`,
  `file://${html}`,
], { stdio: 'inherit' });

console.log(`Wrote ${out}`);
