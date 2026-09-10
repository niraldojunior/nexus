import { expect, test } from '@playwright/test';
import { authenticateRegressionPage } from './auth.js';

test('nexus web app loads and basic backend smoke passes', async ({ page, request }) => {
  const health = await request.get('http://127.0.0.1:4001/health');
  expect(health.ok()).toBeTruthy();
  await authenticateRegressionPage(page, request);

  await page.goto('/');
  await expect(
    page.getByRole('main').getByRole('textbox', { name: /Pergunte sobre Locais/ }),
  ).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Mapa' }).click();
  await page.getByRole('button', { name: 'Abrir hierarquia' }).click();
  await expect(page.getByRole('tab', { name: 'Hierarquia', selected: true })).toBeVisible();
});
