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

Locator: getByRole('heading', { name: 'Recursos Físicos' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Recursos Físicos' })

```

```yaml
- complementary:
  - button "Nexus"
  - button "Recolher barra lateral":
    - img
  - navigation:
    - button "Nova Conversa":
      - img
      - text: Nova Conversa
  - navigation:
    - button "Conversas":
      - img
      - text: Conversas
    - button "Locais":
      - img
      - text: Locais
    - button "Recursos":
      - img
      - text: Recursos
    - button "Acesso"
    - button "Cliente"
    - button "Transporte"
    - button "Infraestrutura Passiva"
    - button "Cabos ISP"
    - button "Cabos OSP"
    - button "Endereçamento e IPAM"
    - button "Recursos L2"
    - button "Recursos L3"
    - button "Serviços":
      - img
      - text: Serviços
    - button "Ordens":
      - img
      - text: Ordens
  - text: Conversas recentes Nenhuma conversa ainda N Niraldo R. Operações de Rede
  - button "Configurações":
    - img
- main:
  - img
  - heading "Equipment.Access" [level=1]
  - paragraph: Inventário de ativos e infraestrutura física, com foco em ocupação, estado e contenção.
  - tablist "Visão do recurso":
    - tab "Inventário" [selected]
    - tab "Catálogo"
  - button "Criar recurso":
    - img
  - button "Excluir selecionados" [disabled]:
    - img
  - table:
    - rowgroup:
      - row "Selecionar página atual Nome Nome do Modelo Tipo do Recurso Local Status Detalhes":
        - columnheader "Selecionar página atual":
          - checkbox "Selecionar página atual"
        - columnheader "Nome"
        - columnheader "Nome do Modelo":
          - button "Nome do Modelo"
        - columnheader "Tipo do Recurso":
          - button "Tipo do Recurso"
        - columnheader "Local"
        - columnheader "Status":
          - button "Status"
        - columnheader "Detalhes"
    - rowgroup:
      - row "Nenhum registro encontrado.":
        - cell "Nenhum registro encontrado."
  - text: Nenhuma seleção ativa Página NaN de NaN
  - button "Anterior"
  - button "Próximo" [disabled]
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
  67 |   await expect(page.getByText('Nenhuma conversa ainda')).toBeVisible();
  68 | 
  69 |   await page.getByRole('navigation').getByRole('button', { name: 'Recursos' }).click();
> 70 |   await expect(page.getByRole('heading', { name: 'Recursos Físicos' })).toBeVisible();
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  71 | 
  72 |   expect(seenUrls).toContain('/api/v1/research/sessions');
  73 |   expect(seenUrls).toContain('/api/v1/resource/workspace?tab=PhysicalResource&limit=20&offset=0');
  74 | });
  75 | 
```