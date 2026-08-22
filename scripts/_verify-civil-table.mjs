import { chromium } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

const outDir = 'C:/Users/VT158145/AppData/Local/Temp/claude/c--Users-VT158145-workspace-nexus/c7ca0b3a-d267-4dd4-96f3-8871fb7a68ff/scratchpad';

async function main() {
  const loginRes = await fetch('http://127.0.0.1:4001/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  const session = await loginRes.json();

  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://127.0.0.1:5200/');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
  }, { token: session.token, user: session.user });
  await page.goto('http://127.0.0.1:5200/');
  await page.waitForTimeout(1200);

  await page.getByRole('navigation').getByRole('button', { name: /Configura/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole('main').getByRole('button', { name: 'Infraestrutura Civil', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/6-catalogo-civil-sem-categoria.png` });

  await page.getByRole('main').getByRole('button', { name: 'Recursos de Rede', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/7-catalogo-rede-com-categoria.png` });

  console.log('console errors:', errors);
  await browser.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
