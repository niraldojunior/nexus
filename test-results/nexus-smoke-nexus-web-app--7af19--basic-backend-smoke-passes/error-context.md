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

Locator: getByRole('main').getByRole('textbox', { name: /Pergunte sobre Locais/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('main').getByRole('textbox', { name: /Pergunte sobre Locais/ })

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
  3  | test('nexus web app loads and basic backend smoke passes', async ({ page, request }) => {
  4  |   const health = await request.get('http://127.0.0.1:4001/health');
  5  |   expect(health.ok()).toBeTruthy();
  6  |
  7  |   await page.goto('/');
> 8  |   await expect(page.getByRole('main').getByRole('textbox', { name: /Pergunte sobre Locais/ })).toBeVisible();
     |                                                                                                ^ Error: expect(locator).toBeVisible() failed
  9  |   await page.getByRole('navigation').getByRole('button', { name: 'Locais' }).click();
  10 |   await expect(page.getByRole('heading', { name: 'Hierarquia' })).toBeVisible();
  11 | });
  12 |
```
