# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nexus-smoke.spec.ts >> nexus web app loads and basic backend smoke passes
- Location: test\system\nexus-smoke.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Hierarquia de sites')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Hierarquia de sites')

```

```yaml
- complementary:
  - button "Nexus"
  - button "Expandir barra lateral":
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
    - button "Serviços":
      - img
      - text: Serviços
    - button "Ordens":
      - img
      - text: Ordens
  - text: "N"
- main:
  - main:
    - complementary:
      - textbox "Pesquisar local, recurso ou endereço"
      - button "Pesquisar":
        - img
      - heading "Hierarquia" [level=2]
      - button "Árvore" [pressed]:
        - img
      - button "Combos":
        - img
      - button "Atualizar":
        - img
      - button "Tipos de local":
        - img
      - button "Recolher":
        - img
      - text: Carregando hierarquia…
    - region "Map"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('nexus web app loads and basic backend smoke passes', async ({ page, request }) => {
  4  |   const health = await request.get('http://127.0.0.1:4001/health');
  5  |   expect(health.ok()).toBeTruthy();
  6  | 
  7  |   await page.goto('/');
  8  |   await expect(page.getByRole('main').getByRole('textbox', { name: /Pergunte sobre Locais/ })).toBeVisible();
  9  |   await page.getByRole('navigation').getByRole('button', { name: 'Locais' }).click();
> 10 |   await expect(page.getByText('Hierarquia de sites')).toBeVisible();
     |                                                       ^ Error: expect(locator).toBeVisible() failed
  11 | });
  12 | 
```