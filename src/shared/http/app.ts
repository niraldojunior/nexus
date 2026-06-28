import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { forbiddenError, unauthorizedError } from '../errors/http-errors.js';
import type { Logger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import { GeoRepository, GeoService } from '../../modules/geo/index.js';

type AppDependencies = {
  config: AppConfig;
  logger: Logger;
};

export const createApp = ({ config, logger }: AppDependencies) => {
  const repository = new InMemoryEntityRepository();
  const geoRepository = new GeoRepository();
  const geoService = new GeoService(geoRepository);

  const server = createServer((request, response) => {
    void routeRequest({ request, response, config, logger, repository, geoService }).catch((error: unknown) =>
      handleError({ error, logger, response }),
    );
  });

  return {
    start: async (): Promise<number> => {
      const port = await new Promise<number>((resolve) => {
        server.listen(config.port, () => {
          const address = server.address();
          const resolvedPort = typeof address === 'object' && address ? address.port : config.port;
          logger.info({ port: config.port, appName: config.appName }, 'server started');
          resolve(resolvedPort);
        });
      });
      return port;
    },
    stop: async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

type RouteDependencies = AppDependencies & {
  request: IncomingMessage;
  response: ServerResponse;
  repository: InMemoryEntityRepository;
  geoService: GeoService;
};

const routeRequest = async ({
  request,
  response,
  config,
  geoService,
  logger,
  repository,
}: RouteDependencies): Promise<void> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      appName: config.appName,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/app')) {
    sendHtml(response, buildLegacyUiNoticeHtml(config.appName));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/bootstrap') {
    ensureAuthorized(request, config);
    const count = repository.count();
    sendJson(response, 200, { status: 'ready', entities: count });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/bootstrap/entities') {
    ensureAuthorized(request, config);
    const body = await readBody(request);
    const label = typeof body.label === 'string' ? body.label : 'untitled';
    const entity = repository.create({ label });
    logger.info({ entityId: entity.id }, 'bootstrap entity created');
    sendJson(response, 201, entity);
    return;
  }

  if (url.pathname.startsWith('/v1/geo/')) {
    await routeGeoRequest({ request, response, config, geoService, url });
    return;
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const routeGeoRequest = async ({
  request,
  response,
  config,
  geoService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  geoService: GeoService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);
  if (request.method === 'GET' && url.pathname === '/v1/geo/locations')
    return sendJson(response, 200, geoService.listLocations());
  if (request.method === 'POST' && url.pathname === '/v1/geo/locations') {
    const body = await readBody(request);
    const location = geoService.createLocation(body as {
      geometryType: 'Point' | 'LineString' | 'Polygon';
      geometry:
        | { type: 'Point'; coordinates: [number, number] }
        | { type: 'LineString'; coordinates: Array<[number, number]> }
        | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };
      spatialRef?: string;
      accuracy?: string;
      referencePoint?: string;
      validFor?: { startDateTime?: string; endDateTime?: string };
    });
    return sendJson(response, 201, location);
  }
  if (request.method === 'GET' && url.pathname === '/v1/geo/addresses')
    return sendJson(response, 200, geoService.listAddresses());
  if (request.method === 'POST' && url.pathname === '/v1/geo/addresses') {
    const body = await readBody(request);
    const address = geoService.createAddress(body as {
      street: string;
      streetNr?: string;
      city?: string;
      stateOrProvince?: string;
      postcode?: string;
      country?: string;
      geographicLocationId?: string;
    });
    return sendJson(response, 201, address);
  }
  if (request.method === 'GET' && url.pathname === '/v1/geo/site-specifications')
    return sendJson(response, 200, geoService.listSpecs());
  if (request.method === 'POST' && url.pathname === '/v1/geo/site-specifications') {
    const body = await readBody(request);
    const spec = geoService.createSpec(body as {
      name: string;
      category: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
      allowedParentSpecIds?: string[];
      allowedChildSpecIds?: string[];
    });
    return sendJson(response, 201, spec);
  }
  if (request.method === 'GET' && url.pathname === '/v1/geo/sites')
    return sendJson(response, 200, geoService.listSites());
  if (request.method === 'POST' && url.pathname === '/v1/geo/sites') {
    const body = await readBody(request);
    const site = geoService.createSite(body as {
      name: string;
      siteSpecificationId: string;
      placeId?: string;
      addressId?: string;
      parentSiteId?: string;
      relatedParty?: Array<{ id: string; role?: string }>;
    });
    return sendJson(response, 201, site);
  }
  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const ensureAuthorized = (request: IncomingMessage, config: AppConfig): void => {
  if (!config.authEnabled) return;
  const header = request.headers.authorization;
  if (!header) throw unauthorizedError();
  if (header !== `Bearer ${config.authToken}`) throw forbiddenError();
};

const readBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AppError('invalid JSON payload', { code: 'INVALID_JSON', statusCode: 400 });
  }
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const sendHtml = (response: ServerResponse, html: string): void => {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
};

const buildLegacyUiNoticeHtml = (appName: string): string => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(appName)} - Nexus</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #e5e7eb; color: #1f2328; }
      main { max-width: 720px; margin: 10vh auto; background: #fff; border: 1px solid #d8dce2; border-radius: 18px; padding: 32px; box-shadow: 0 1px 2px rgba(24,25,25,.08),0 6px 18px rgba(24,25,25,.06); }
      h1 { margin-top: 0; font-size: 32px; }
      a { color: #0f766e; font-weight: 700; }
      p { line-height: 1.6; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Interface migrada para Vite</h1>
      <p>A interface grÃ¡fica principal agora vive em <code>web/</code>.</p>
      <p>Use <code>npm run start</code> para abrir a nova camada web ou <code>npm run web:dev</code> para desenvolvimento.</p>
      <p>O backend continua disponÃ­vel para APIs e rotas de negÃ³cio. A UI antiga foi descontinuada nesta entrada.</p>
      <p><a href="/">Recarregar</a></p>
    </main>
  </body>
</html>`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

const handleError = ({
  error,
  logger,
  response,
}: {
  error: unknown;
  logger: Logger;
  response: ServerResponse;
}): void => {
  if (error instanceof AppError) {
    logger.warn({ code: error.code, message: error.message }, 'request rejected');
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
    });
    return;
  }

  logger.error({ error }, 'unexpected error');
  sendJson(response, 500, {
    error: 'INTERNAL_SERVER_ERROR',
    message: 'unexpected error',
  });
};

