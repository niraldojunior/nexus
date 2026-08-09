import { expect, test, type CDPSession, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const site = {
  '@type': 'GeographicSite',
  id: 'site-1',
  href: '/tmf-api/geographicSiteManagement/v4/geographicSite/site-1',
  name: 'Central Mobile Teste',
  status: 'active',
  siteSpecificationId: 'spec-1',
  siteSpecification: {
    id: 'spec-1',
    '@referredType': 'GeographicSiteSpecification',
  },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
};

const siteNode = {
  id: 'site:site-1',
  kind: 'site',
  label: site.name,
  sublabel: 'Central',
  refId: site.id,
  referredType: 'GeographicSite',
  siteCategory: 'Site',
  status: 'active',
  hasChildren: true,
  childCount: 30,
  geometry: { type: 'Point', coordinates: [-43.1, -22.9] },
};

const subSites = Array.from({ length: 30 }, (_, index) => ({
  id: `site:sub-${index + 1}`,
  kind: 'site',
  label: `Sub-local ${String(index + 1).padStart(2, '0')}`,
  sublabel: 'Sala',
  refId: `sub-${index + 1}`,
  referredType: 'GeographicSite',
  siteCategory: 'SubSite',
  status: 'active',
  hasChildren: false,
}));

async function installGeoFixtures(page: Page) {
  await page.route('**/api/v1/geo/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/v1/geo/sites') {
      await route.fulfill({ json: [site] });
      return;
    }
    if (path === '/api/v1/geo/site-specifications') {
      await route.fulfill({
        json: [
          {
            '@type': 'GeographicSiteSpecification',
            id: 'spec-1',
            href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/spec-1',
            name: 'Central',
            category: 'Site',
            allowedParentSpecIds: [],
            allowedChildSpecIds: [],
          },
        ],
      });
      return;
    }
    if (path === '/api/v1/geo/tree/roots') {
      await route.fulfill({ json: [{ ...siteNode, parentId: null }] });
      return;
    }
    if (path === '/api/v1/geo/tree/children') {
      const nodeId = url.searchParams.get('nodeId');
      await route.fulfill({
        json: {
          nodeId,
          nodes: nodeId === siteNode.id ? subSites : [],
          total: nodeId === siteNode.id ? subSites.length : 0,
          offset: 0,
          limit: 500,
        },
      });
      return;
    }
    if (path === '/api/v1/geo/tree/path') {
      await route.fulfill({ json: { nodeId: siteNode.id, path: [siteNode.id] } });
      return;
    }
    if (path.endsWith('/events')) {
      await route.fulfill({ json: [] });
      return;
    }

    await route.fulfill({ json: [] });
  });
}

async function verticalTouchDrag(cdp: CDPSession, x: number, fromY: number, toY: number) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: fromY, radiusX: 6, radiusY: 6, force: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x,
          y: fromY + ((toY - fromY) * step) / 8,
          radiusX: 6,
          radiusY: 6,
          force: 1,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('bottom sheet mobile transfere o gesto entre expansão, lista longa e recolhimento', async ({
  context,
  page,
}) => {
  const cdp = await context.newCDPSession(page);
  await installGeoFixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir barra lateral' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Locais', exact: true }).click();

  await page.locator(`button[title="${site.name} · Central"]`).click();
  const sheet = page.getByTestId('bottom-sheet');
  const content = page.getByTestId('bottom-sheet-content');
  await expect(sheet).toBeVisible();
  await expect
    .poll(() => sheet.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(400);
  expect(await sheet.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    410,
  );

  await sheet.getByRole('button', { name: /Sub-locais/ }).click();
  await expect(sheet.getByText('Sub-local 30')).toBeVisible();

  // mid (48vh) → full (92vh) exige 371px; o restante do mesmo swipe deve rolar a lista.
  await verticalTouchDrag(cdp, 195, 790, 340);
  await expect
    .poll(() => sheet.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(760);
  const overflowScroll = await content.evaluate((element) => element.scrollTop);
  expect(overflowScroll).toBeGreaterThan(0);

  await verticalTouchDrag(cdp, 195, 700, 350);
  const scrolledDown = await content.evaluate((element) => element.scrollTop);
  expect(scrolledDown).toBeGreaterThan(overflowScroll);

  await verticalTouchDrag(cdp, 195, 350, 500);
  const scrolledBack = await content.evaluate((element) => element.scrollTop);
  expect(scrolledBack).toBeLessThan(scrolledDown);
  expect(await sheet.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    760,
  );

  await content.evaluate((element) => {
    element.scrollTop = 0;
  });
  await verticalTouchDrag(cdp, 195, 350, 430);
  await expect
    .poll(() => sheet.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(500);
});
