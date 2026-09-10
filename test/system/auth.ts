import { expect, type APIRequestContext, type Page } from '@playwright/test';

const REGRESSION_ADMIN_EMAIL = 'playwright-admin@nexus.test';
const REGRESSION_ADMIN_PASSWORD = 'playwright-admin-password';

type LoginPayload = {
  token: string;
  user: Record<string, unknown>;
};

/**
 * Autentica a SPA com o admin semeado exclusivamente pelo backend Playwright.
 * O script é instalado antes de page.goto(), para que useSession enxergue a sessão
 * já na primeira renderização em vez de mostrar LoginPage.
 */
export async function authenticateRegressionPage(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  const response = await request.post('http://127.0.0.1:4001/v1/auth/login', {
    data: {
      email: REGRESSION_ADMIN_EMAIL,
      password: REGRESSION_ADMIN_PASSWORD,
    },
  });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as LoginPayload;
  expect(session.token).toBeTruthy();

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('authToken', token);
      localStorage.setItem('authUser', JSON.stringify(user));
    },
    session,
  );
}
