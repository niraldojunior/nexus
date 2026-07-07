import { expect, test } from '@playwright/test';

test('nexus web app loads and basic backend smoke passes', async ({ page, request }) => {
  const health = await request.get('http://127.0.0.1:4001/health');
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Por onde Começamos?' })).toBeVisible();
  await page.getByRole('button', { name: 'Locais' }).click();
  await expect(page.getByText('Hierarquia de sites')).toBeVisible();
});
