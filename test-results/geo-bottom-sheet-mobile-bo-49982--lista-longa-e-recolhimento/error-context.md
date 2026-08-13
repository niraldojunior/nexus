# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: geo-bottom-sheet-mobile.spec.ts >> bottom sheet mobile transfere o gesto entre expansão, lista longa e recolhimento
- Location: test\system\geo-bottom-sheet-mobile.spec.ts:124:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Abrir barra lateral' })

```

# Page snapshot

```yaml
- generic [ref=e5]:
    - generic [ref=e6]:
        - img [ref=e7]
        - generic [ref=e16]: Nexus
    - generic [ref=e17]:
        - generic [ref=e18]:
            - generic [ref=e19]: E-mail funcional
            - generic [ref=e20]:
                - img [ref=e21]
                - textbox "E-mail funcional" [ref=e24]:
                    - /placeholder: voce@vtal.com
        - generic [ref=e25]:
            - generic [ref=e26]: Senha
            - generic [ref=e27]:
                - img [ref=e28]
                - textbox "Senha" [ref=e31]:
                    - /placeholder: ••••••••••••
        - button "Entrar" [ref=e32] [cursor=pointer]:
            - text: Entrar
            - img [ref=e33]
    - generic [ref=e35]:
        - img [ref=e36]
        - generic [ref=e39]: Conexão segura · V.tal Nexus
```

# Test source

```ts
  31  |   childCount: 30,
  32  |   geometry: { type: 'Point', coordinates: [-43.1, -22.9] },
  33  | };
  34  |
  35  | const subSites = Array.from({ length: 30 }, (_, index) => ({
  36  |   id: `site:sub-${index + 1}`,
  37  |   kind: 'site',
  38  |   label: `Sub-local ${String(index + 1).padStart(2, '0')}`,
  39  |   sublabel: 'Sala',
  40  |   refId: `sub-${index + 1}`,
  41  |   referredType: 'GeographicSite',
  42  |   siteCategory: 'SubSite',
  43  |   status: 'active',
  44  |   hasChildren: false,
  45  | }));
  46  |
  47  | async function installGeoFixtures(page: Page) {
  48  |   await page.route('**/api/v1/geo/**', async (route) => {
  49  |     const url = new URL(route.request().url());
  50  |     const path = url.pathname;
  51  |
  52  |     if (path === '/api/v1/geo/sites') {
  53  |       await route.fulfill({ json: [site] });
  54  |       return;
  55  |     }
  56  |     if (path === '/api/v1/geo/site-specifications') {
  57  |       await route.fulfill({
  58  |         json: [
  59  |           {
  60  |             '@type': 'GeographicSiteSpecification',
  61  |             id: 'spec-1',
  62  |             href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/spec-1',
  63  |             name: 'Central',
  64  |             category: 'Site',
  65  |             allowedParentSpecIds: [],
  66  |             allowedChildSpecIds: [],
  67  |           },
  68  |         ],
  69  |       });
  70  |       return;
  71  |     }
  72  |     if (path === '/api/v1/geo/tree/roots') {
  73  |       await route.fulfill({ json: [{ ...siteNode, parentId: null }] });
  74  |       return;
  75  |     }
  76  |     if (path === '/api/v1/geo/tree/children') {
  77  |       const nodeId = url.searchParams.get('nodeId');
  78  |       await route.fulfill({
  79  |         json: {
  80  |           nodeId,
  81  |           nodes: nodeId === siteNode.id ? subSites : [],
  82  |           total: nodeId === siteNode.id ? subSites.length : 0,
  83  |           offset: 0,
  84  |           limit: 500,
  85  |         },
  86  |       });
  87  |       return;
  88  |     }
  89  |     if (path === '/api/v1/geo/tree/path') {
  90  |       await route.fulfill({ json: { nodeId: siteNode.id, path: [siteNode.id] } });
  91  |       return;
  92  |     }
  93  |     if (path.endsWith('/events')) {
  94  |       await route.fulfill({ json: [] });
  95  |       return;
  96  |     }
  97  |
  98  |     await route.fulfill({ json: [] });
  99  |   });
  100 | }
  101 |
  102 | async function verticalTouchDrag(cdp: CDPSession, x: number, fromY: number, toY: number) {
  103 |   await cdp.send('Input.dispatchTouchEvent', {
  104 |     type: 'touchStart',
  105 |     touchPoints: [{ x, y: fromY, radiusX: 6, radiusY: 6, force: 1 }],
  106 |   });
  107 |   for (let step = 1; step <= 8; step += 1) {
  108 |     await cdp.send('Input.dispatchTouchEvent', {
  109 |       type: 'touchMove',
  110 |       touchPoints: [
  111 |         {
  112 |           x,
  113 |           y: fromY + ((toY - fromY) * step) / 8,
  114 |           radiusX: 6,
  115 |           radiusY: 6,
  116 |           force: 1,
  117 |         },
  118 |       ],
  119 |     });
  120 |   }
  121 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  122 | }
  123 |
  124 | test('bottom sheet mobile transfere o gesto entre expansão, lista longa e recolhimento', async ({
  125 |   context,
  126 |   page,
  127 | }) => {
  128 |   const cdp = await context.newCDPSession(page);
  129 |   await installGeoFixtures(page);
  130 |   await page.goto('/');
> 131 |   await page.getByRole('button', { name: 'Abrir barra lateral' }).click();
      |                                                                   ^ Error: locator.click: Test timeout of 30000ms exceeded.
  132 |   await page.getByRole('navigation').getByRole('button', { name: 'Locais', exact: true }).click();
  133 |
  134 |   await page.locator(`button[title="${site.name} · Central"]`).click();
  135 |   const sheet = page.getByTestId('bottom-sheet');
  136 |   const content = page.getByTestId('bottom-sheet-content');
  137 |   await expect(sheet).toBeVisible();
  138 |   await expect
  139 |     .poll(() => sheet.evaluate((element) => element.getBoundingClientRect().height))
  140 |     .toBeGreaterThan(400);
  141 |   expect(await sheet.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
  142 |     410,
  143 |   );
  144 |
  145 |   await sheet.getByRole('button', { name: /Sub-locais/ }).click();
  146 |   await expect(sheet.getByText('Sub-local 30')).toBeVisible();
  147 |
  148 |   // mid (48vh) → full (92vh) exige 371px; o restante do mesmo swipe deve rolar a lista.
  149 |   await verticalTouchDrag(cdp, 195, 790, 340);
  150 |   await expect
  151 |     .poll(() => sheet.evaluate((element) => element.getBoundingClientRect().height))
  152 |     .toBeGreaterThan(760);
  153 |   const overflowScroll = await content.evaluate((element) => element.scrollTop);
  154 |   expect(overflowScroll).toBeGreaterThan(0);
  155 |
  156 |   await verticalTouchDrag(cdp, 195, 700, 350);
  157 |   const scrolledDown = await content.evaluate((element) => element.scrollTop);
  158 |   expect(scrolledDown).toBeGreaterThan(overflowScroll);
  159 |
  160 |   await verticalTouchDrag(cdp, 195, 350, 500);
  161 |   const scrolledBack = await content.evaluate((element) => element.scrollTop);
  162 |   expect(scrolledBack).toBeLessThan(scrolledDown);
  163 |   expect(await sheet.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
  164 |     760,
  165 |   );
  166 |
  167 |   await content.evaluate((element) => {
  168 |     element.scrollTop = 0;
  169 |   });
  170 |   await verticalTouchDrag(cdp, 195, 350, 430);
  171 |   await expect
  172 |     .poll(() => sheet.evaluate((element) => element.getBoundingClientRect().height))
  173 |     .toBeLessThan(500);
  174 | });
  175 |
```
