// Módulo de autenticação local (IdP de laboratório). Emite JWTs HS256 com os mesmos claims
// que o verificador em `shared/http/request-context.ts` consome — e que o Apigee injetaria
// em produção (ver docs/3-system-design/security.md §2).
export { AuthService } from './service.js';
export type { AuthServiceOptions, AuthUserRepository, LoginResult } from './service.js';
export {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
} from './password.js';
export { signAccessToken } from './jwt.js';
export type { AccessTokenSubject, SignedAccessToken } from './jwt.js';
