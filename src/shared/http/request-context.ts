import {
  createHash,
  createHmac,
  createPublicKey,
  createVerify,
  timingSafeEqual,
  type JsonWebKey as NodeJsonWebKey,
} from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AppError } from '../errors/app-error.js';
import type { AppConfig } from '../config/env.js';
import { createCanonicalId } from '../utils/canonical-id.js';

export type RequestContext = {
  actorSub: string;
  tenantId: string;
  roles: string[];
  traceId: string;
  sourceIp?: string;
};

export const GEO_ADMIN_ROLES = [
  'inventory.reader',
  'inventory.editor',
  'catalog.admin',
  'platform.admin',
  'migration.job',
] as const;

const LEGACY_ACTOR_SUB = 'legacy-auth-token';
const DEFAULT_TENANT_ID = 'default';

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtPayload = {
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  tenantId?: string;
  tenant_id?: string;
  tid?: string;
  roles?: string[] | string;
  permissions?: string[] | string;
  scope?: string;
};

type JsonWebKeySet = {
  keys?: NodeJsonWebKey[];
};

const jwksCache = new Map<string, { expiresAt: number; keys: NodeJsonWebKey[] }>();

export const buildRequestContext = async (
  request: IncomingMessage,
  config: AppConfig,
): Promise<RequestContext> => {
  const base = buildBaseContext(request);

  if (!config.authEnabled) {
    return {
      ...base,
      actorSub: headerString(request, 'x-actor-sub') ?? 'system',
      tenantId: headerString(request, 'x-tenant-id') ?? DEFAULT_TENANT_ID,
      roles: parseRoles(headerString(request, 'x-roles')) ?? [...GEO_ADMIN_ROLES],
    };
  }

  const header = request.headers.authorization;
  if (!header) {
    throw new AppError('authorization required', { code: 'AUTH_REQUIRED', statusCode: 401 });
  }

  const token = extractBearerToken(header);
  if (!token) {
    throw new AppError('invalid authorization scheme', { code: 'AUTH_INVALID', statusCode: 401 });
  }

  if (token === config.authToken) {
    return {
      ...base,
      actorSub: headerString(request, 'x-actor-sub') ?? LEGACY_ACTOR_SUB,
      tenantId: headerString(request, 'x-tenant-id') ?? DEFAULT_TENANT_ID,
      roles: parseRoles(headerString(request, 'x-roles')) ?? [...GEO_ADMIN_ROLES],
    };
  }

  const payload = await verifyJwt(token, config);
  const tenantId =
    payload.tenantId ?? payload.tenant_id ?? payload.tid ?? headerString(request, 'x-tenant-id');
  if (!payload.sub) {
    throw new AppError('JWT sub claim required', {
      code: 'AUTH_JWT_SUB_REQUIRED',
      statusCode: 403,
    });
  }
  if (!tenantId) {
    throw new AppError('tenant claim required', { code: 'AUTH_TENANT_REQUIRED', statusCode: 403 });
  }

  return {
    ...base,
    actorSub: payload.sub,
    tenantId,
    roles: extractPayloadRoles(payload),
  };
};

export const ensureAuthorized = (request: IncomingMessage, config: AppConfig): void => {
  if (!config.authEnabled) return;
  const header = request.headers.authorization;
  if (!header) {
    throw new AppError('authorization required', { code: 'AUTH_REQUIRED', statusCode: 401 });
  }
  const token = extractBearerToken(header);
  if (!token) {
    throw new AppError('invalid authorization scheme', { code: 'AUTH_INVALID', statusCode: 401 });
  }
  if (token === config.authToken) return;
  if (looksLikeJwt(token) && (config.authJwtSecret || config.authJwksUrl || config.authJwksJson))
    return;
  throw new AppError('forbidden', { code: 'AUTH_FORBIDDEN', statusCode: 403 });
};

const buildBaseContext = (
  request: IncomingMessage,
): Pick<RequestContext, 'traceId' | 'sourceIp'> => {
  const traceId =
    headerString(request, 'x-trace-id') ??
    headerString(request, 'x-request-id') ??
    createCanonicalId();
  const sourceIp =
    headerString(request, 'x-forwarded-for')?.split(',')[0]?.trim() ?? request.socket.remoteAddress;
  return {
    traceId,
    ...(sourceIp ? { sourceIp } : {}),
  };
};

const extractBearerToken = (header: string): string | undefined => {
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
};

const looksLikeJwt = (token: string): boolean => token.split('.').length === 3;

const verifyJwt = async (token: string, config: AppConfig): Promise<JwtPayload> => {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new AppError('malformed JWT', { code: 'AUTH_JWT_INVALID', statusCode: 403 });
  }

  const header = parseJwtPart<JwtHeader>(encodedHeader);
  const payload = parseJwtPart<JwtPayload>(encodedPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlDecode(encodedSignature);

  if (header.alg === 'HS256' && config.authJwtSecret) {
    const expected = createHmac('sha256', config.authJwtSecret).update(signingInput).digest();
    if (!timingSafeEqualBuffer(signature, expected)) {
      throw new AppError('JWT signature invalid', {
        code: 'AUTH_JWT_SIGNATURE_INVALID',
        statusCode: 403,
      });
    }
  } else if (header.alg === 'RS256' && (config.authJwksUrl || config.authJwksJson)) {
    const jwk = await findJwk(header, config);
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    if (!verifier.verify(publicKey, signature)) {
      throw new AppError('JWT signature invalid', {
        code: 'AUTH_JWT_SIGNATURE_INVALID',
        statusCode: 403,
      });
    }
  } else {
    throw new AppError('JWT verifier not configured', {
      code: 'AUTH_JWT_VERIFIER_NOT_CONFIGURED',
      statusCode: 403,
    });
  }

  validateJwtClaims(payload, config);
  return payload;
};

const validateJwtClaims = (payload: JwtPayload, config: AppConfig): void => {
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp <= now) {
    throw new AppError('JWT expired', { code: 'AUTH_JWT_EXPIRED', statusCode: 403 });
  }
  if (payload.nbf !== undefined && payload.nbf > now) {
    throw new AppError('JWT not yet valid', { code: 'AUTH_JWT_NOT_YET_VALID', statusCode: 403 });
  }
  if (config.authJwtIssuer && payload.iss !== config.authJwtIssuer) {
    throw new AppError('JWT issuer invalid', { code: 'AUTH_JWT_ISSUER_INVALID', statusCode: 403 });
  }
  if (config.authJwtAudience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!audiences.includes(config.authJwtAudience)) {
      throw new AppError('JWT audience invalid', {
        code: 'AUTH_JWT_AUDIENCE_INVALID',
        statusCode: 403,
      });
    }
  }
};

const findJwk = async (header: JwtHeader, config: AppConfig): Promise<NodeJsonWebKey> => {
  const keys = config.authJwksJson
    ? parseJwksJson(config.authJwksJson)
    : await fetchJwks(config.authJwksUrl as string);
  const key = keys.find((item) => {
    const candidate = item as NodeJsonWebKey & { kid?: string; alg?: string; use?: string };
    if (header.kid && candidate.kid !== header.kid) return false;
    if (candidate.alg && candidate.alg !== header.alg) return false;
    return !candidate.use || candidate.use === 'sig';
  });
  if (!key) {
    throw new AppError('JWT key not found', { code: 'AUTH_JWT_KEY_NOT_FOUND', statusCode: 403 });
  }
  return key;
};

const fetchJwks = async (url: string): Promise<NodeJsonWebKey[]> => {
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError('JWKS fetch failed', { code: 'AUTH_JWKS_FETCH_FAILED', statusCode: 403 });
  }
  const body = (await response.json()) as JsonWebKeySet;
  const keys = body.keys ?? [];
  jwksCache.set(url, { keys, expiresAt: Date.now() + 5 * 60 * 1000 });
  return keys;
};

const parseJwksJson = (value: string): NodeJsonWebKey[] => {
  try {
    const parsed = JSON.parse(value) as JsonWebKeySet | NodeJsonWebKey[];
    return Array.isArray(parsed) ? parsed : (parsed.keys ?? []);
  } catch {
    throw new AppError('JWKS JSON invalid', { code: 'AUTH_JWKS_JSON_INVALID', statusCode: 403 });
  }
};

const parseJwtPart = <T>(value: string): T => {
  try {
    return JSON.parse(base64UrlDecode(value).toString('utf8')) as T;
  } catch {
    throw new AppError('malformed JWT', { code: 'AUTH_JWT_INVALID', statusCode: 403 });
  }
};

const extractPayloadRoles = (payload: JwtPayload): string[] => {
  const roles = [
    ...normalizeRoleClaim(payload.roles),
    ...normalizeRoleClaim(payload.permissions),
    ...normalizeRoleClaim(payload.scope),
  ];
  return [...new Set(roles)];
};

const parseRoles = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const roles = value
    .split(/[,\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return roles.length > 0 ? [...new Set(roles)] : undefined;
};

const normalizeRoleClaim = (value: string[] | string | undefined): string[] => {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return parseRoles(value) ?? [];
};

const headerString = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const base64UrlDecode = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const timingSafeEqualBuffer = (left: Buffer, right: Buffer): boolean => {
  if (left.length !== right.length) {
    const leftHash = createHash('sha256').update(left).digest();
    const rightHash = createHash('sha256').update(right).digest();
    return leftHash.length === rightHash.length && leftHash.equals(rightHash) && false;
  }
  return timingSafeEqual(left, right);
};
