import { expect, test } from '@playwright/test';

// Regression for issue #166: Settings → "Infraestrutura Civil" and "Recursos de Rede" both 500'd
// on Oracle because `tenant_id` (C8) was declared in schema.ts but missing from these tables under
// NEXUS_DEV_ — the services always inject a tenant filter, so the SQL failed with ORA-00904 the
// moment either tab loaded. Fails on any 5xx response from the backend instead of only checking the
// UI settled, so a schema regression is caught even if the page renders an empty-but-not-broken state.
test('Settings → Infraestrutura Civil e Recursos de Rede carregam sem erro 5xx', async ({
  page,
}) => {
  const serverErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Preferências' }).click();

  await page.getByRole('button', { name: 'Infraestrutura Civil' }).click();
  await expect(page.getByRole('button', { name: 'Recursos de Rede' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Recursos de Rede' }).click();
  await page.waitForLoadState('networkidle');

  expect(serverErrors, `respostas 5xx inesperadas: ${serverErrors.join(', ')}`).toEqual([]);
});
