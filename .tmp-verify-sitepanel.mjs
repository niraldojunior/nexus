import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const shotsDir = path.resolve(
  'C:/Users/VT158145/AppData/Local/Temp/claude/c--Users-VT158145-workspace-nexus/0db06650-23cb-493a-9ad8-881c8e4663b3/scratchpad/shots',
);
fs.mkdirSync(shotsDir, { recursive: true });

const envText = fs.readFileSync('.env', 'utf8');
const getEnv = (key) => {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
const ADMIN_EMAIL = getEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = getEnv('ADMIN_PASSWORD');

let shotIndex = 0;
async function shot(page, name) {
  shotIndex += 1;
  const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('screenshot:', file);
}

const consoleErrors = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('http://127.0.0.1:5200/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await shot(page, 'landing');

  // Login if the login form is present. The dev backend is serialized and under load from the
  // integration suite right now, so wait for the request to actually finish instead of a fixed delay.
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.count()) {
    await emailInput.fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await emailInput.waitFor({ state: 'hidden', timeout: 90000 });
    await shot(page, 'after-login');
  }

  // Navigate to Geo module in-app (clicking the sidebar item) rather than a full reload, which
  // avoids re-triggering the login redirect while the backend is busy.
  await page.getByText('Locais', { exact: true }).first().click({ timeout: 60000 });
  await page.getByText('Hierarquia', { exact: true }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, 'geo-page');

  // Expand RJ (has Niterói GPON seed data per project memory) and drill toward a site.
  await page.getByText('RJ', { exact: true }).click({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, 'rj-expanded');

  await page.getByText('Niterói', { exact: true }).click({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await shot(page, 'niteroi-expanded');

  await page.getByText('Estações', { exact: true }).click({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await shot(page, 'estacoes-expanded');

  await page.getByText('Icaraí (ICI)', { exact: true }).click({ timeout: 60000 });
  await page.getByText('Visão Geral', { exact: true }).first().waitFor({ timeout: 60000 });
  await page.getByText('STATUS', { exact: true }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, 'site-panel-overview');

  for (const tab of ['Sub-locais', 'Recursos', 'Histórico']) {
    await page.getByText(tab, { exact: true }).first().click({ timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, `site-panel-${tab.toLowerCase().replace(/[^a-z]/g, '')}`);
  }

  console.log('CONSOLE_ERRORS_SO_FAR:', JSON.stringify(consoleErrors, null, 2));

  await browser.close();
})().catch((err) => {
  console.error('SCRIPT_FAILED', err);
  process.exit(1);
});
