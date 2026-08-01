import { expect, test } from '@playwright/test';

test('frontend rewrites API calls to /api in the browser runtime', async ({ page }) => {
  const seenUrls: string[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    seenUrls.push(new URL(request.url()).pathname + new URL(request.url()).search);

    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/v1/research/sessions') {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === '/api/v1/resource/workspace') {
      await route.fulfill({
        json: {
          items: [],
          resourceSpecificationOptions: [],
          resourceCategories: [],
          resourceTypes: [],
          physicalResources: [],
          logicalResources: [],
          manufacturerOptions: [],
        },
      });
      return;
    }

    if (pathname === '/api/tmf-api/resourceCatalogManagement/v4/resourceCategory') {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === '/api/tmf-api/resourceCatalogManagement/v4/resourceType') {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === '/api/tmf-api/resourceCatalogManagement/v4/resourceSpecification') {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === '/api/tmf-api/resourceInventoryManagement/v4/resource') {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === '/api/tmf-api/partyManagement/v4/party') {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === '/api/tmf-api/partyRoleManagement/v4/partyRole') {
      await route.fulfill({ json: [] });
      return;
    }

    await route.fulfill({ json: [] });
  });

  await page.goto('/');

  await expect(page.getByText('Nenhuma conversa ainda')).toBeVisible();

  // "Recursos" apenas abre as categorias na navegação; a página só carrega ao escolher uma.
  await page.getByRole('navigation').getByRole('button', { name: 'Recursos' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Acesso', exact: true }).click();
  // O catálogo é stubado vazio acima, então o título cai no code da categoria em vez do
  // nome amigável ("Equipamentos de Acesso") que a app resolveria com dados reais.
  await expect(page.getByRole('heading', { name: 'Equipment.Access' })).toBeVisible();

  expect(seenUrls).toContain('/api/v1/research/sessions');
  expect(seenUrls).toContain(
    '/api/v1/resource/workspace?tab=PhysicalResource&limit=20&offset=0&category=Equipment.Access',
  );
});
