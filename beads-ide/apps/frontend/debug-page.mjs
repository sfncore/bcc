import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture ALL console messages and network requests
const logs = [];
const networkErrors = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', req => networkErrors.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`));
page.on('response', res => {
  if (res.status() >= 400) {
    networkErrors.push(`${res.status()} ${res.url()}`);
  }
});

await page.goto('http://127.0.0.1:5173/beads', { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(3000);

// Capture all network requests to /api
const apiRequests = await page.evaluate(async () => {
  // Test each API endpoint
  const endpoints = ['/api/beads', '/api/health', '/api/config', '/api/formulas', '/api/workspace'];
  const results = [];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 200); }
      results.push({ endpoint: ep, status: res.status, ok: parsed?.ok, count: parsed?.beads?.length ?? parsed?.count ?? parsed?.formulas?.length ?? '-' });
    } catch(e) {
      results.push({ endpoint: ep, status: 'FAIL', error: e.message });
    }
  }
  return results;
});

console.log('=== API Endpoints ===');
for (const r of apiRequests) console.log(`  ${r.endpoint}: ${r.status} ok=${r.ok} count=${r.count}`);

console.log('\n=== Console Logs ===');
for (const l of logs) console.log(`  ${l.slice(0, 200)}`);

console.log('\n=== Network Errors ===');
for (const e of networkErrors) console.log(`  ${e}`);

await page.screenshot({ path: '/tmp/beads-debug.png', fullPage: true });
console.log('\nScreenshot: /tmp/beads-debug.png');

await browser.close();
