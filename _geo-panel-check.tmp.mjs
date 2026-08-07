import { chromium } from 'playwright';

const SP = 'C:/Users/VT158145/AppData/Local/Temp/claude/c--Users-VT158145-workspace-nexus/b8cb02c2-61a6-4269-a27a-9d68ad293c8a/scratchpad';
const consoleMessages = [];
const pageErrors = [];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await context.newPage();

page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => pageErrors.push(err.stack || err.message));
page.on('requestfailed', (req) => consoleMessages.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
page.on('response', (res) => { if (res.status() >= 400) consoleMessages.push(`[http ${res.status()}] ${res.url()}`); });

await page.goto('http://127.0.0.1:5200', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);

await page.getByText('Locais', { exact: true }).first().click({ timeout: 10000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SP}/02-geo-page.png` });

const search = page.locator('#geo-search-input');
await search.click();
await search.fill('Icaraí');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SP}/03-search-results.png` });

const firstResult = page.getByText('Icaraí (ICI)', { exact: false }).first();
const clicked = await firstResult.click({ timeout: 8000 }).then(() => true).catch((e) => { consoleMessages.push('result click failed: ' + e.message); return false; });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SP}/04-after-click.png` });

const bodyAfter = await page.locator('body').innerText();
const panelOpened = bodyAfter.includes('Visão geral') || bodyAfter.includes('Sub-locais') || bodyAfter.includes('Sistema de origem');
console.log('---RESULT---');
console.log('clicked result:', clicked);
console.log('panel opened (Visão geral/Sub-locais present):', panelOpened);
console.log('sistema de origem present:', bodyAfter.includes('Sistema de origem'));

await browser.close();

console.log('---CONSOLE MESSAGES---');
console.log(consoleMessages.join('\n'));
console.log('---PAGE ERRORS---');
console.log(pageErrors.join('\n---\n') || '(none)');
