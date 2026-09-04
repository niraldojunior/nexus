import { buildHref } from '../../shared/tmf/index.js';
import type { StudioAuditEntry, StudioDomain, StudioVersion, StudioWorkspace } from './domain.js';
import type { IStudioRepository, StudioTenantScope } from './studio-repository-interface.js';

const workspaceKey = (tenantId: string, domain: StudioDomain): string => `${tenantId}::${domain}`;

/** Implementação em memória — usada por testes unitários e composição sem banco. */
export class StudioRepository implements IStudioRepository {
  private readonly workspaces = new Map<string, StudioWorkspace>();
  private readonly versions = new Map<string, StudioVersion>();
  private readonly audit: StudioAuditEntry[] = [];

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return Promise.resolve(fn());
  }

  public getWorkspace(tenantId: string, domain: StudioDomain): StudioWorkspace | undefined {
    const workspace = this.workspaces.get(workspaceKey(tenantId, domain));
    return workspace ? { ...workspace } : undefined;
  }

  public upsertWorkspace(workspace: StudioWorkspace): StudioWorkspace {
    const stored: StudioWorkspace = {
      ...workspace,
      href: buildHref('studioWorkspace', workspace.id),
    };
    this.workspaces.set(workspaceKey(workspace.tenantId, workspace.domain), stored);
    return { ...stored };
  }

  public getVersion(id: string, scope?: StudioTenantScope): StudioVersion | undefined {
    const version = this.versions.get(id);
    if (!version) return undefined;
    if (scope?.tenantId && version.tenantId !== scope.tenantId) return undefined;
    return version;
  }

  public insertVersion(version: StudioVersion): StudioVersion {
    const stored: StudioVersion = { ...version, href: buildHref('studioVersion', version.id) };
    this.versions.set(version.id, stored);
    return stored;
  }

  public async updateVersion(
    version: StudioVersion,
    expectedChecksum?: string,
  ): Promise<StudioVersion | undefined> {
    const existing = this.versions.get(version.id);
    if (!existing) throw new Error(`studio version not found: ${version.id}`);
    if (expectedChecksum !== undefined && existing.checksum !== expectedChecksum) return undefined;
    const stored: StudioVersion = { ...existing, ...version };
    this.versions.set(version.id, stored);
    return stored;
  }

  public listVersions(
    tenantId: string,
    domain: StudioDomain,
    query?: { limit?: number; offset?: number },
  ): StudioVersion[] {
    const all = [...this.versions.values()]
      .filter((version) => version.tenantId === tenantId && version.domain === domain)
      .sort((a, b) => b.versionNumber - a.versionNumber);
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? all.length;
    return all.slice(offset, offset + limit);
  }

  public getMaxVersionNumber(tenantId: string, domain: StudioDomain): number {
    return [...this.versions.values()]
      .filter((version) => version.tenantId === tenantId && version.domain === domain)
      .reduce((max, version) => Math.max(max, version.versionNumber), 0);
  }

  public appendAudit(entry: StudioAuditEntry): void {
    this.audit.push(entry);
  }

  public listAudit(
    tenantId: string,
    domain: StudioDomain,
    query?: { limit?: number; offset?: number },
  ): StudioAuditEntry[] {
    const all = this.audit
      .filter((entry) => entry.tenantId === tenantId && entry.domain === domain)
      .sort((a, b) => (a.eventTime < b.eventTime ? 1 : -1));
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? all.length;
    return all.slice(offset, offset + limit);
  }
}
