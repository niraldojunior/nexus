# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend-api-rewrite.spec.ts >> frontend rewrites API calls to /api in the browser runtime
- Location: test\system\frontend-api-rewrite.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Nenhuma conversa ainda')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Nenhuma conversa ainda')

```

```yaml
- text: Nexus
- heading "Inteligência de rede de nova geração." [level=1]
- paragraph: Inventário de Redes da V.tal — Geosite, Logradouros, Geonet e Viabilidade unificados sob arquitetura modular, API-first e padrão TM Forum.
- text: TM Forum API-first Escala nacional Holding V.tal · Tecto · nio internet E-mail funcional
- textbox "E-mail funcional":
    - /placeholder: voce@vtal.com
- text: Senha
- textbox "Senha":
    - /placeholder: ••••••••••••
- button "Entrar"
- text: Conexão segura · V.tal Nexus
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  |
  3  | test('frontend rewrites API calls to /api in the browser runtime', async ({ page }) => {
  4  |   const seenUrls: string[] = [];
  5  |
  6  |   await page.route('**/api/**', async (route) => {
  7  |     const request = route.request();
  8  |     seenUrls.push(new URL(request.url()).pathname + new URL(request.url()).search);
  9  |
  10 |     const pathname = new URL(request.url()).pathname;
  11 |
  12 |     if (pathname === '/api/v1/research/sessions') {
  13 |       await route.fulfill({ json: [] });
  14 |       return;
  15 |     }
  16 |
  17 |     if (pathname === '/api/v1/resource/workspace') {
  18 |       await route.fulfill({
  19 |         json: {
  20 |           items: [],
  21 |           resourceSpecificationOptions: [],
  22 |           resourceCategories: [],
  23 |           resourceTypes: [],
  24 |           physicalResources: [],
  25 |           logicalResources: [],
  26 |           manufacturerOptions: [],
  27 |         },
  28 |       });
  29 |       return;
  30 |     }
  31 |
  32 |     if (pathname === '/api/tmf-api/resourceCatalogManagement/v4/resourceCategory') {
  33 |       await route.fulfill({ json: [] });
  34 |       return;
  35 |     }
  36 |
  37 |     if (pathname === '/api/tmf-api/resourceCatalogManagement/v4/resourceType') {
  38 |       await route.fulfill({ json: [] });
  39 |       return;
  40 |     }
  41 |
  42 |     if (pathname === '/api/tmf-api/resourceCatalogManagement/v4/resourceSpecification') {
  43 |       await route.fulfill({ json: [] });
  44 |       return;
  45 |     }
  46 |
  47 |     if (pathname === '/api/tmf-api/resourceInventoryManagement/v4/resource') {
  48 |       await route.fulfill({ json: [] });
  49 |       return;
  50 |     }
  51 |
  52 |     if (pathname === '/api/tmf-api/partyManagement/v4/party') {
  53 |       await route.fulfill({ json: [] });
  54 |       return;
  55 |     }
  56 |
  57 |     if (pathname === '/api/tmf-api/partyRoleManagement/v4/partyRole') {
  58 |       await route.fulfill({ json: [] });
  59 |       return;
  60 |     }
  61 |
  62 |     await route.fulfill({ json: [] });
  63 |   });
  64 |
  65 |   await page.goto('/');
  66 |
> 67 |   await expect(page.getByText('Nenhuma conversa ainda')).toBeVisible();
     |                                                          ^ Error: expect(locator).toBeVisible() failed
  68 |
  69 |   // "Recursos" apenas abre as categorias na navegação; a página só carrega ao escolher uma.
  70 |   await page.getByRole('navigation').getByRole('button', { name: 'Recursos' }).click();
  71 |   await page.getByRole('navigation').getByRole('button', { name: 'Acesso', exact: true }).click();
  72 |   // O catálogo é stubado vazio acima, então o título cai no code da categoria em vez do
  73 |   // nome amigável ("Equipamentos de Acesso") que a app resolveria com dados reais.
  74 |   await expect(page.getByRole('heading', { name: 'Equipment.Access' })).toBeVisible();
  75 |
  76 |   expect(seenUrls).toContain('/api/v1/research/sessions');
  77 |   expect(seenUrls).toContain(
  78 |     '/api/v1/resource/workspace?tab=PhysicalResource&limit=20&offset=0&category=Equipment.Access',
  79 |   );
  80 | });
  81 |
```
