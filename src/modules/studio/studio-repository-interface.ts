type Awaitable<T> = T | Promise<T>;

import type { StudioAuditEntry, StudioDomain, StudioVersion, StudioWorkspace } from './domain.js';

export type StudioTenantScope = {
  tenantId: string;
};

export interface IStudioRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  getWorkspace(tenantId: string, domain: StudioDomain): Awaitable<StudioWorkspace | undefined>;
  upsertWorkspace(workspace: StudioWorkspace): Awaitable<StudioWorkspace>;

  getVersion(id: string, scope?: StudioTenantScope): Awaitable<StudioVersion | undefined>;
  insertVersion(version: StudioVersion): Awaitable<StudioVersion>;
  /**
   * Atualiza uma versão; quando `expectedChecksum` é informado, aplica compare-and-swap atômico.
   * Retorna `undefined` se outro escritor alterou o draft desde a leitura do chamador.
   */
  updateVersion(
    version: StudioVersion,
    expectedChecksum?: string,
  ): Awaitable<StudioVersion | undefined>;
  listVersions(
    tenantId: string,
    domain: StudioDomain,
    query?: { limit?: number; offset?: number },
  ): Awaitable<StudioVersion[]>;
  /** Maior `versionNumber` já usado pelo workspace (0 se nunca houve versão) — base do próximo sequencial. */
  getMaxVersionNumber(tenantId: string, domain: StudioDomain): Awaitable<number>;

  appendAudit(entry: StudioAuditEntry): Awaitable<void>;
  listAudit(
    tenantId: string,
    domain: StudioDomain,
    query?: { limit?: number; offset?: number },
  ): Awaitable<StudioAuditEntry[]>;
}
