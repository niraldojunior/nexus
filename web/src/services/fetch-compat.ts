const API_PATH_PREFIXES = ['/v1', '/tmf-api'] as const;

type FetchLike = typeof globalThis.fetch;

let installed = false;

export const installApiFetchRewrite = (): void => {
  if (installed) return;
  if (typeof globalThis.fetch !== 'function') return;

  const originalFetch = globalThis.fetch.bind(globalThis) as FetchLike;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rewritten = rewriteApiRequest(input, init);
    return await originalFetch(rewritten.input, rewritten.init);
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
