import { clearSession, getToken } from './session';

const API_PATH_PREFIXES = ['/v1', '/tmf-api'] as const;

type FetchLike = typeof globalThis.fetch;

let installed = false;

const pathnameOf = (input: RequestInfo | URL): string => {
  try {
    if (typeof input === 'string' || input instanceof URL) {
      return new URL(String(input), window.location.origin).pathname;
    }
    if (input instanceof Request) return new URL(input.url, window.location.origin).pathname;
  } catch {
    // ignore
  }
  return '';
};

export const installApiFetchRewrite = (): void => {
  if (installed) return;
  if (typeof globalThis.fetch !== 'function') return;

  const originalFetch = globalThis.fetch.bind(globalThis) as FetchLike;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rewritten = rewriteApiRequest(input, init);
    const response = await originalFetch(rewritten.input, rewritten.init);
    // Sessão expirada/revogada: o backend responde 401 numa rota de API. Limpa a sessão para
    // o App voltar ao login (subscribeSession). Não age no /auth/login (falha de credencial é
    // tratada na própria tela) nem quando já não há token (evita loop de notificação).
    if (response.status === 401 && getToken()) {
      const pathname = pathnameOf(input);
      const isApi = API_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
      if (isApi && !pathname.endsWith('/auth/login')) clearSession();
    }
    return response;
  }) as FetchLike;

  installed = true;
};

export const resetApiFetchRewriteForTesting = (): void => {
  installed = false;
};

const rewriteApiRequest = (
  input: RequestInfo | URL,
  _init?: RequestInit,
): { input: RequestInfo | URL; init?: RequestInit } => {
  if (typeof input === 'string' || input instanceof URL) {
    const url = new URL(String(input), window.location.origin);
    const pathname = rewriteApiPath(url.pathname);
    if (pathname === url.pathname) {
      return { input, init: _init };
    }

    url.pathname = pathname;
    return { input: `${url.pathname}${url.search}${url.hash}`, init: _init };
  }

  if (input instanceof Request) {
    const url = new URL(input.url, window.location.origin);
    const pathname = rewriteApiPath(url.pathname);
    if (pathname === url.pathname) {
      return { input, init: _init };
    }

    url.pathname = pathname;
    return { input: new Request(`${url.pathname}${url.search}${url.hash}`, input), init: _init };
  }

  return { input, init: _init };
};

const rewriteApiPath = (pathname: string): string => {
  for (const prefix of API_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return `/api${pathname}`;
    }
  }

  return pathname;
};
