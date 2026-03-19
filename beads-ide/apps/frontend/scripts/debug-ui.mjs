/**
 * UI Debug Tool — Playwright-based browser inspection for development.
 *
 * Usage:
 *   node scripts/debug-ui.mjs                    # Screenshot landing page
 *   node scripts/debug-ui.mjs /beads             # Screenshot /beads
 *   node scripts/debug-ui.mjs /formula/epic-review  # Screenshot a formula page
 *   node scripts/debug-ui.mjs --watch /beads     # Watch mode: screenshot every 3s
 *   node scripts/debug-ui.mjs --all              # Screenshot all known routes
 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = '/tmp/beads-ide-debug';
const args = process.argv.slice(2);

const watch = args.includes('--watch');
const all = args.includes('--all');
const route = args.find(a => a.startsWith('/')) || '/';

// Ensure screenshot dir exists
import { mkdirSync } from 'fs';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function debugPage(page, path, label) {
  const url = `${BASE}${path}`;
  const safeName = label || path.replace(/\//g, '_').replace(/^_/, '') || 'landing';
  const screenshotPath = `${SCREENSHOT_DIR}/${safeName}.png`;

  // Collect errors
  const errors = [];
  const warnings = [];
  const networkErrors = [];
  const apiCalls = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  page.on('requestfailed', req => networkErrors.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`));
  page.on('response', res => {
    const url = res.url();
    if (url.includes('/api/')) {
      apiCalls.push({ url: url.replace(BASE, ''), status: res.status() });
    }
    if (res.status() >= 400) {
      networkErrors.push(`${res.status()} ${url.replace(BASE, '')}`);
    }
  });

  await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Get visible text
  const bodyText = await page.evaluate(() => document.body.innerText);

  // Get DOM structure summary
  const domSummary = await page.evaluate(() => {
    const main = document.querySelector('main') || document.querySelector('#root');
    if (!main) return 'No main/root element';
    const elements = main.querySelectorAll('*');
    const counts = {};
    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      counts[tag] = (counts[tag] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => `${tag}:${count}`)
      .join(' ');
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`PAGE: ${path}`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`DOM: ${domSummary}`);
  console.log(`Text (first 300): ${bodyText.slice(0, 300).replace(/\n/g, ' | ')}`);

  if (apiCalls.length > 0) {
    console.log(`\nAPI calls:`);
    for (const c of apiCalls) console.log(`  ${c.status} ${c.url}`);
  }
  if (errors.length > 0) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors) console.log(`  ${e.slice(0, 200)}`);
  }
  if (networkErrors.length > 0) {
    console.log(`\nNETWORK ERRORS:`);
    for (const e of networkErrors) console.log(`  ${e}`);
  }
  if (warnings.length > 0) {
    console.log(`\nWarnings: ${warnings.length}`);
  }

  return { errors, networkErrors, bodyText };
}

async function main() {
  const browser = await chromium.launch();

  try {
    if (all) {
      const routes = ['/', '/beads', '/formula/epic-review', '/results/test'];
      for (const r of routes) {
        const page = await browser.newPage();
        await debugPage(page, r);
        await page.close();
      }
    } else if (watch) {
      console.log(`Watching ${route} (Ctrl+C to stop)...`);
      const page = await browser.newPage();
      while (true) {
        await debugPage(page, route, 'watch');
        await new Promise(r => setTimeout(r, 3000));
      }
    } else {
      const page = await browser.newPage();
      await debugPage(page, route);
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
