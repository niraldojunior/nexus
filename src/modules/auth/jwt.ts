import { createHmac } from 'node:crypto';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';

// Emissor de JWT HS256. Espelha exatamente o verificador de
// `src/shared/http/request-context.ts` (mesmo base64url, mesmo HMAC-SHA256), então os
// tokens emitidos aqui passam pela verificação já existente sem nenhuma ponte. Os claims
// são os mesmos que o Apigee injetaria (`sub`, `tenant_id`, `roles`, `exp`), de modo que
// trocar este emissor local pelo Apigee no futuro não toca o lado resource-server.

const base64UrlEncode = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

export type AccessTokenSubject = {
  sub: string;
  tenantId: string;
  roles: string[];
  tokenVersion: number;
};

export type SignedAccessToken = {
  token: string;
  /** Época (segundos) de expiração — o cliente usa para saber quando renovar/deslogar. */
  expiresAt: number;
};

export function signAccessToken(
  subject: AccessTokenSubject,
  secret: string,
  ttlSeconds: number,
): SignedAccessToken {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: subject.sub,
    tenant_id: subject.tenantId,
    roles: subject.roles,
    jti: createCanonicalId(),
    // `tv` (token version) é conferido contra o banco no requireUser: incrementar a versão
    // do usuário invalida todo token já emitido (logout global / desativação de conta).
    tv: subject.tokenVersion,
    iat,
    exp,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;
  const signature = base64UrlEncode(createHmac('sha256', secret).update(signingInput).digest());
  return { token: `${signingInput}.${signature}`, expiresAt: exp };
}
