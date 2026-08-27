// Projetos de trabalho da página Locais (REQ-MOD01-015), estilo "Salvos" do Google Maps. Como
// GeoSearchHistoryRepository e GeoTreeService, é uma projeção de plataforma que fala com o
// DatabaseClient direto — projeto não é entidade TMF, não passa pelo IGeoRepository nem pelo
// GeoService. Compartilhado por tenant (C8): qualquer usuário do tenant vê e edita os mesmos
// projetos, sem filtro por usuário.

import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';

// Mesmo vocabulário de GeoStatus (web/src/services/geoApi.ts) — o projeto é a unidade de
// estado do REQ-MOD01-015: mudar o status do projeto cascateia (best-effort) para cada Site
// vinculado via GeoService.transitionSite (ver /v1/geo/projects/:id em app.ts). Um local de
// projeto não tem status próprio editável, só herda este valor.
export type GeoProjectStatus = 'planned' | 'active' | 'suspended' | 'terminated' | 'cancelled';
export type GeoProjectStatusBehavior = 'planning' | 'execution' | 'suspended' | 'close-release';

export type GeoProjectStatusCatalogItem = {
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  behavior: GeoProjectStatusBehavior;
};

export type GeoProject = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  status: GeoProjectStatus;
  statusCode: string;
  statusName: string;
  statusBehavior: GeoProjectStatusBehavior;
  createdBy: string | null;
  // Total de locais vinculados ao projeto, ativos ou não — com o status herdado do projeto,
  // um projeto Terminado tem todos os Sites Retired; filtrar por status faria a lista mostrar
  // N locais e o contador dizer "0 locais".
  siteCount: number;
  resourceCount: number;
  infrastructureCount: number;
  areaCount: number;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateGeoProjectInput = {
  name: string;
  description?: string | null;
  iconDataUrl?: string | null;
  status?: GeoProjectStatus;
  statusCode?: string;
};

export type UpdateGeoProjectInput = {
  name?: string;
  description?: string | null;
  iconDataUrl?: string | null;
  status?: GeoProjectStatus;
  statusCode?: string;
};

// Observação de trabalho e endereço GEONET de um local, por dentro do vínculo com o
// projeto (não é atributo do Site — ver nota em schema.ts sobre geo_project_site).
export type GeoProjectSiteLink = {
  siteId: string;
  note: string | null;
  geonetAddressId: string | null;
};

export type GeoProjectResourceLink = {
  id: string;
  resourceId: string;
  resourceKind: 'PhysicalResource' | 'LogicalResource';
  originKind: 'created' | 'linked';
  position: number;
  linkedAt: string;
  detachedAt: string | null;
  detachedReason: string | null;
};

/** Referência leve usada pelo autocomplete do Projeto antes da hidratação pelo GeoTreeService. */
export type GeoProjectSearchItem = {
  id: string;
  kind: 'site' | 'resource';
  label: string;
  rank: number;
};
export type GeoProjectSearchScope = 'all' | 'sites' | 'infrastructure' | 'resources';

export type UpdateGeoProjectSiteLinkInput = {
  note?: string | null;
};

// Mancha de agrupamento espacial dos locais de um Projeto (REQ-MOD01-017), gerada por
// scripts/build-project-areas.mjs — ver src/modules/geo/project-area-grid.ts para o algoritmo.
// A geometria em si vive em tmf_geographic_location (Polygon, TMF675); esta forma é a junção
// pronta para o mapa (id da Location + geometria + classificação), sem o chamador precisar
// saber que a mancha é uma Location por baixo.
export type GeoProjectArea = {
  id: string;
  kind: 'concentration' | 'dispersion';
  siteCount: number;
  resourceCount: number;
  geometry: import('./domain.js').GeoJSONPolygon;
  siteIds: string[];
  centroid: [number, number] | null;
  areaKm2: number | null;
  generatedAt: string;
};

export type CreateProjectAreaInput = {
  locationId: string;
  kind: 'concentration' | 'dispersion';
  siteCount: number;
  siteIds: string[];
  centroid: [number, number];
  areaKm2: number;
};

// Location (Polygon) que o chamador (scripts/build-project-areas.mjs) já monta pronta para
// gravação — mesma forma que build-gpon-coverage.mjs monta para tmf_geographic_location.
export type CreateProjectAreaLocationInput = {
  id: string;
  href: string;
  geometry: string;
  characteristics: string;
};

type ProjectRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  status: GeoProjectStatus;
  statusCode: string;
  statusName: string;
  statusBehavior: GeoProjectStatusBehavior;
  createdBy: string | null;
  siteCount: number | string;
  resourceCount: number | string;
  infrastructureCount: number | string;
  areaCount: number | string;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectSiteLinkRow = {
  siteId: string;
  note: string | null;
  geonetAddressId: string | null;
};

const PROJECT_STATUS_DEFAULTS: ReadonlyArray<GeoProjectStatusCatalogItem> = [
  { code: '1', name: 'Projeto criado', sortOrder: 1, active: true, behavior: 'planning' },
  { code: '11', name: 'Projeto em planejamento', sortOrder: 11, active: true, behavior: 'planning' },
  { code: '12', name: 'Obra em execução', sortOrder: 12, active: true, behavior: 'execution' },
  { code: '13', name: 'Obra concluída', sortOrder: 13, active: true, behavior: 'execution' },
  { code: '14', name: 'Enviado ao SAP', sortOrder: 14, active: true, behavior: 'execution' },
  { code: '15', name: 'Erro de conciliação', sortOrder: 15, active: true, behavior: 'suspended' },
  { code: '16', name: 'Conciliado com o SAP', sortOrder: 16, active: true, behavior: 'execution' },
  { code: '17', name: 'Projeto encerrado', sortOrder: 17, active: true, behavior: 'close-release' },
  { code: '18', name: 'Projeto em quantificação', sortOrder: 18, active: true, behavior: 'planning' },
  { code: '19', name: 'Projeto enviado para orçamento CRE', sortOrder: 19, active: true, behavior: 'planning' },
  { code: '20', name: 'Projeto aguardando verba', sortOrder: 20, active: true, behavior: 'planning' },
  { code: '21', name: 'Projeto em contratação', sortOrder: 21, active: true, behavior: 'planning' },
  { code: '22', name: 'Projeto em execução', sortOrder: 22, active: true, behavior: 'execution' },
  { code: '23', name: 'Projeto paralisado', sortOrder: 23, active: true, behavior: 'suspended' },
  { code: '25', name: 'Projeto conciliado físico-contábil', sortOrder: 25, active: true, behavior: 'execution' },
  { code: 'legacy-cancelled', name: 'Cancelado (legado)', sortOrder: 99_999, active: false, behavior: 'close-release' },
];

const PROJECT_SELECT = `
  SELECT p.id, p.tenant_id AS tenantId, p.name, p.description,
         p.icon_data_url AS iconDataUrl, p.status, p.status_code AS statusCode,
         COALESCE(sc.name, p.status) AS statusName,
         COALESCE(sc.behavior, 'planning') AS statusBehavior, p.created_by AS createdBy,
         p.created_at AS createdAt, p.updated_at AS updatedAt,
         p.archived_at AS archivedAt, p.archived_by AS archivedBy,
         (SELECT COUNT(*) FROM geo_project_site ps WHERE ps.project_id = p.id) AS siteCount,
         (SELECT COUNT(*) FROM geo_project_resource pr WHERE pr.project_id = p.id AND pr.detached_at IS NULL) AS resourceCount,
         (SELECT COUNT(*) FROM geo_project_resource pr
            JOIN tmf_physical_resource r ON r.id = pr.resource_id
            JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
           WHERE pr.project_id = p.id AND pr.detached_at IS NULL AND rs.category = 'Infrastructure.Passive') AS infrastructureCount,
         (SELECT COUNT(*) FROM geo_project_area pa WHERE pa.project_id = p.id) AS areaCount
    FROM geo_project p
    LEFT JOIN geo_project_status_catalog sc
      ON sc.tenant_id = p.tenant_id AND sc.code = p.status_code
`;

const toProject = (row: ProjectRow): GeoProject => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  description: row.description,
  iconDataUrl: row.iconDataUrl,
  status: row.status,
  statusCode: row.statusCode ?? (row.status === 'active' ? '22' : row.status === 'suspended' ? '23' : row.status === 'terminated' ? '17' : row.status === 'cancelled' ? 'legacy-cancelled' : '11'),
  statusName: row.statusName,
  statusBehavior: row.statusBehavior,
  createdBy: row.createdBy,
  siteCount: Number(row.siteCount) || 0,
  resourceCount: Number(row.resourceCount) || 0,
  infrastructureCount: Number(row.infrastructureCount) || 0,
  areaCount: Number(row.areaCount) || 0,
  archivedAt: row.archivedAt,
  archivedBy: row.archivedBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class GeoProjectRepository {
  constructor(private db: DatabaseClient) {}

  private async ensureStatusCatalog(tenantId: string): Promise<void> {
    for (const item of PROJECT_STATUS_DEFAULTS) {
      // ON CONFLICT é específico de Postgres/SQLite. O runtime corporativo usa Oracle,
      // portanto o bootstrap precisa ser simples e portável.
      const existing = await this.db.get<{ code: string }>(
        `SELECT code FROM geo_project_status_catalog WHERE tenant_id = ? AND code = ?`,
        [tenantId, item.code],
      );
      if (!existing) {
        await this.db.run(
          `INSERT INTO geo_project_status_catalog (tenant_id, code, name, sort_order, active, behavior)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [tenantId, item.code, item.name, item.sortOrder, item.active ? 1 : 0, item.behavior],
        );
      }
    }
  }

  async listStatusCatalog(tenantId: string): Promise<GeoProjectStatusCatalogItem[]> {
    await this.ensureStatusCatalog(tenantId);
    const rows = await this.db.all<GeoProjectStatusCatalogItem & { active: unknown }>(
      `SELECT code, name, sort_order AS sortOrder,
              CASE WHEN active = 1 THEN 1 ELSE 0 END AS active, behavior
         FROM geo_project_status_catalog WHERE tenant_id = ? ORDER BY sort_order, code`,
      [tenantId],
    );
    return rows.map((row) => ({ ...row, active: Number(row.active) === 1 }));
  }

  async getStatusCatalogItem(tenantId: string, code: string): Promise<GeoProjectStatusCatalogItem | null> {
    await this.ensureStatusCatalog(tenantId);
    const row = await this.db.get<GeoProjectStatusCatalogItem & { active: unknown }>(
      `SELECT code, name, sort_order AS sortOrder,
              CASE WHEN active = 1 THEN 1 ELSE 0 END AS active, behavior
         FROM geo_project_status_catalog WHERE tenant_id = ? AND code = ?`,
      [tenantId, code],
    );
    return row ? { ...row, active: Number(row.active) === 1 } : null;
  }

  // Código é gerado pelo backend, nunca pelo usuário: numérico incremental, um acima do maior
  // código numérico já cadastrado (o catálogo tem entradas legadas não-numéricas, ex.
  // "legacy-cancelled", que ficam de fora do cálculo).
  private async nextStatusCode(tenantId: string): Promise<string> {
    const rows = await this.db.all<{ code: string }>(
      `SELECT code FROM geo_project_status_catalog WHERE tenant_id = ?`,
      [tenantId],
    );
    const highest = rows.reduce((max, row) => {
      const value = Number(row.code);
      return Number.isInteger(value) && value > max ? value : max;
    }, 0);
    return String(highest + 1);
  }

  async createStatusCatalogItem(
    tenantId: string,
    item: Omit<GeoProjectStatusCatalogItem, 'code'>,
  ): Promise<GeoProjectStatusCatalogItem> {
    await this.ensureStatusCatalog(tenantId);
    const code = await this.nextStatusCode(tenantId);
    await this.db.run(
      `INSERT INTO geo_project_status_catalog (tenant_id, code, name, sort_order, active, behavior)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, code, item.name, item.sortOrder, item.active ? 1 : 0, item.behavior],
    );
    return (await this.getStatusCatalogItem(tenantId, code))!;
  }

  async updateStatusCatalogItem(
    tenantId: string,
    code: string,
    patch: Partial<Omit<GeoProjectStatusCatalogItem, 'code'>>,
  ): Promise<GeoProjectStatusCatalogItem | null> {
    const current = await this.getStatusCatalogItem(tenantId, code);
    if (!current) return null;
    await this.db.run(
      `UPDATE geo_project_status_catalog SET name = ?, sort_order = ?, active = ?, behavior = ?
        WHERE tenant_id = ? AND code = ?`,
      [
        patch.name ?? current.name,
        patch.sortOrder ?? current.sortOrder,
        (patch.active ?? current.active) ? 1 : 0,
        patch.behavior ?? current.behavior,
        tenantId,
        code,
      ],
    );
    return await this.getStatusCatalogItem(tenantId, code);
  }

  async list(tenantId: string): Promise<GeoProject[]> {
    await this.ensureStatusCatalog(tenantId);
    const rows = await this.db.all<ProjectRow>(
      `${PROJECT_SELECT} WHERE p.tenant_id = ? AND p.archived_at IS NULL ORDER BY p.updated_at DESC`,
      [tenantId],
    );
    return rows.map(toProject);
  }

  async get(tenantId: string, id: string): Promise<GeoProject | null> {
    await this.ensureStatusCatalog(tenantId);
    const row = await this.db.get<ProjectRow>(
      `${PROJECT_SELECT} WHERE p.tenant_id = ? AND p.id = ?`,
      [tenantId, id],
    );
    return row ? toProject(row) : null;
  }

  async archive(tenantId: string, id: string, actorSub: string): Promise<GeoProject | null> {
    await this.db.run(
      `UPDATE geo_project SET archived_at = ?, archived_by = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ? AND archived_at IS NULL`,
      [new Date().toISOString(), actorSub, new Date().toISOString(), tenantId, id],
    );
    return this.get(tenantId, id);
  }

  async create(
    tenantId: string,
    actorSub: string,
    input: CreateGeoProjectInput,
  ): Promise<GeoProject> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO geo_project
          (id, tenant_id, name, description, icon_data_url, status, status_code, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        input.name,
        input.description ?? null,
        input.iconDataUrl ?? null,
        input.status ?? 'planned',
        input.statusCode ?? '1',
        actorSub,
        now,
        now,
      ],
    );
    return (await this.get(tenantId, id))!;
  }

  async update(
    tenantId: string,
    id: string,
    patch: UpdateGeoProjectInput,
  ): Promise<GeoProject | null> {
    const existing = await this.get(tenantId, id);
    if (!existing) return null;
    await this.db.run(
      `UPDATE geo_project
          SET name = ?, description = ?, icon_data_url = ?, status = ?, status_code = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.name !== undefined ? patch.name : existing.name,
        patch.description !== undefined ? patch.description : existing.description,
        patch.iconDataUrl !== undefined ? patch.iconDataUrl : existing.iconDataUrl,
        patch.status !== undefined ? patch.status : existing.status,
        patch.statusCode !== undefined ? patch.statusCode : existing.statusCode,
        new Date().toISOString(),
        tenantId,
        id,
      ],
    );
    return await this.get(tenantId, id);
  }

  // Apaga as linhas de plataforma (projeto + vínculos) e devolve os ids dos Sites que
  // pertenciam a ele — quem chama é responsável por soft-terminar cada um via GeoService
  // (C6: aqui não se decide o destino do Site, só se descobre quais existem).
  async remove(tenantId: string, id: string): Promise<string[]> {
    const siteIds = await this.listSiteIds(tenantId, id);
    await this.db.run(`DELETE FROM geo_project_site WHERE project_id = ?`, [id]);
    await this.db.run(`DELETE FROM geo_project WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
    return siteIds;
  }

  async listSiteIds(tenantId: string, projectId: string): Promise<string[]> {
    const rows = await this.db.all<{ siteId: string }>(
      `SELECT ps.site_id AS siteId
         FROM geo_project_site ps
         JOIN geo_project p ON p.id = ps.project_id
        WHERE p.tenant_id = ? AND ps.project_id = ?
        ORDER BY ps.position`,
      [tenantId, projectId],
    );
    return rows.map((row) => row.siteId);
  }

  // Checagem de pertinência de UM site — usada pelo PATCH/DELETE de
  // /v1/geo/projects/:id/sites/:siteId, que antes chamava listSiteIds (lista inteira, sem
  // LIMIT) só para fazer `.includes(siteId)`. Um SELECT 1 LIMIT 1 substitui o fetch de até
  // dezenas de milhares de ids por uma checagem O(1) via índice.
  async hasSiteLink(tenantId: string, projectId: string, siteId: string): Promise<boolean> {
    const row = await this.db.get<{ one: number }>(
      `SELECT 1 AS one
         FROM geo_project_site ps
         JOIN geo_project p ON p.id = ps.project_id
        WHERE p.tenant_id = ? AND ps.project_id = ? AND ps.site_id = ?
        LIMIT 1`,
      [tenantId, projectId, siteId],
    );
    return Boolean(row);
  }

  async listResourceLinks(
    tenantId: string,
    projectId: string,
    options: { limit?: number; offset?: number; includeDetached?: boolean } = {},
  ): Promise<GeoProjectResourceLink[]> {
    const rows = await this.db.all<GeoProjectResourceLink>(
      `SELECT pr.id, pr.resource_id AS resourceId, pr.resource_kind AS resourceKind,
              pr.origin_kind AS originKind, pr.position, pr.linked_at AS linkedAt,
              pr.detached_at AS detachedAt, pr.detached_reason AS detachedReason
         FROM geo_project_resource pr JOIN geo_project p ON p.id = pr.project_id
        WHERE p.tenant_id = ? AND pr.project_id = ? ${options.includeDetached ? '' : 'AND pr.detached_at IS NULL'}
        ORDER BY pr.position LIMIT ? OFFSET ?`,
      [tenantId, projectId, options.limit ?? 50, options.offset ?? 0],
    );
    return rows;
  }

  /**
   * Busca restrita aos vínculos do Projeto. A consulta deliberadamente devolve apenas IDs e
   * rótulos: o endpoint hidrata só as poucas sugestões finais, em vez de carregar todos os
   * Sites/Resources do projeto e filtrar em memória.
   */
  async searchItems(
    tenantId: string,
    projectId: string,
    term: string,
    limit = 20,
    scope: GeoProjectSearchScope = 'all',
  ): Promise<GeoProjectSearchItem[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];
    // A API pede uma linha extra para informar `hasMore`, sem jamais entregar mais de 20
    // sugestões ao autocomplete.
    const cappedLimit = Math.min(Math.max(limit, 1), 21);
    const prefix = `${trimmed}%`;
    const contains = `%${trimmed}%`;

    const sites = scope === 'infrastructure' || scope === 'resources' ? [] : await this.db.all<GeoProjectSearchItem>(
      `SELECT s.id, 'site' AS kind, s.name AS label,
              CASE WHEN LOWER(s.name) LIKE LOWER(?) THEN 0 ELSE 1 END AS rank
         FROM geo_project_site ps
         JOIN geo_project p ON p.id = ps.project_id
         JOIN tmf_geographic_site s ON s.id = ps.site_id
        WHERE p.tenant_id = ? AND ps.project_id = ? AND LOWER(s.name) LIKE LOWER(?)
        ORDER BY rank, s.name
        LIMIT ?`,
      [prefix, tenantId, projectId, contains, cappedLimit],
    );

    const resources = scope === 'sites' ? [] : await this.db.all<GeoProjectSearchItem>(
      `SELECT * FROM (
         SELECT r.id, 'resource' AS kind, r.name AS label,
                CASE WHEN LOWER(r.name) LIKE LOWER(?) THEN 0
                     WHEN LOWER(COALESCE(r.resource_type, '')) LIKE LOWER(?) THEN 1
                     WHEN LOWER(COALESCE(rs.name, '')) LIKE LOWER(?) THEN 1 ELSE 2 END AS rank
           FROM geo_project_resource pr
           JOIN geo_project p ON p.id = pr.project_id
           JOIN tmf_physical_resource r ON r.id = pr.resource_id
           LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
          WHERE p.tenant_id = ? AND pr.project_id = ? AND pr.detached_at IS NULL
            AND pr.resource_kind = 'PhysicalResource'
            ${scope === 'infrastructure' ? "AND rs.category = 'Infrastructure.Passive'" : ''}
            AND (LOWER(r.name) LIKE LOWER(?) OR LOWER(COALESCE(r.resource_type, '')) LIKE LOWER(?) OR LOWER(COALESCE(rs.name, '')) LIKE LOWER(?))
         ${scope === 'infrastructure' ? '' : `UNION ALL
         SELECT r.id, 'resource' AS kind, r.name AS label,
                CASE WHEN LOWER(r.name) LIKE LOWER(?) THEN 0
                     WHEN LOWER(COALESCE(r.resource_type, '')) LIKE LOWER(?) THEN 1
                     WHEN LOWER(COALESCE(rs.name, '')) LIKE LOWER(?) THEN 1 ELSE 2 END AS rank
           FROM geo_project_resource pr
           JOIN geo_project p ON p.id = pr.project_id
           JOIN tmf_logical_resource r ON r.id = pr.resource_id
           LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
          WHERE p.tenant_id = ? AND pr.project_id = ? AND pr.detached_at IS NULL
            AND pr.resource_kind = 'LogicalResource'
            AND (LOWER(r.name) LIKE LOWER(?) OR LOWER(COALESCE(r.resource_type, '')) LIKE LOWER(?) OR LOWER(COALESCE(rs.name, '')) LIKE LOWER(?))`}
       ) AS matches
       ORDER BY rank, label
       LIMIT ?`,
      [
        prefix, prefix, prefix, tenantId, projectId, contains, contains, contains,
        ...(scope === 'infrastructure' ? [] : [prefix, prefix, prefix, tenantId, projectId, contains, contains, contains]),
        cappedLimit,
      ],
    );

    return [...sites, ...resources]
      .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label))
      .slice(0, cappedLimit);
  }

  async findOpenProjectByResourceId(
    tenantId: string,
    resourceId: string,
  ): Promise<{ projectId: string; projectName: string } | null> {
    return (await this.db.get<{ projectId: string; projectName: string }>(
      `SELECT p.id AS projectId, p.name AS projectName
         FROM geo_project_resource pr JOIN geo_project p ON p.id = pr.project_id
        WHERE p.tenant_id = ? AND pr.resource_id = ? AND pr.detached_at IS NULL
          AND p.status NOT IN ('terminated', 'cancelled') AND p.archived_at IS NULL`,
      [tenantId, resourceId],
    )) ?? null;
  }

  async linkResource(
    projectId: string,
    resourceId: string,
    resourceKind: 'PhysicalResource' | 'LogicalResource',
    originKind: 'created' | 'linked',
    actorSub: string,
  ): Promise<GeoProjectResourceLink> {
    const now = new Date().toISOString();
    const max = await this.db.get<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM geo_project_resource WHERE project_id = ?`, [projectId],
    );
    const link: GeoProjectResourceLink = { id: randomUUID(), resourceId, resourceKind, originKind, position: (max?.maxPos ?? -1) + 1, linkedAt: now, detachedAt: null, detachedReason: null };
    await this.db.run(
      `INSERT INTO geo_project_resource (id, project_id, resource_id, resource_kind, origin_kind, position, linked_at, linked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [link.id, projectId, resourceId, resourceKind, originKind, link.position, now, actorSub],
    );
    await this.db.run(`UPDATE geo_project SET updated_at = ? WHERE id = ?`, [now, projectId]);
    return link;
  }

  async detachResource(projectId: string, resourceId: string, actorSub: string, reason: string): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE geo_project_resource SET detached_at = ?, detached_by = ?, detached_reason = ?
        WHERE project_id = ? AND resource_id = ? AND detached_at IS NULL`,
      [new Date().toISOString(), actorSub, reason, projectId, resourceId],
    );
    return result.changes > 0;
  }

  // Reverso de listSiteIds: dado um Site, qual Projeto o originou (se algum) — usado pela
  // Origem do painel unificado de Local (REQ-MOD01-016). O vínculo permanece mesmo depois
  // do projeto terminar (Fase 2), então isto continua respondendo mesmo com o Site já
  // liberado (Active, fora da árvore-exclusão) — Origem é histórico, não estado atual.
  async findProjectBySiteId(
    tenantId: string,
    siteId: string,
  ): Promise<{ projectId: string; projectName: string } | null> {
    const row = await this.db.get<{ projectId: string; projectName: string }>(
      `SELECT p.id AS projectId, p.name AS projectName
         FROM geo_project_site ps
         JOIN geo_project p ON p.id = ps.project_id
        WHERE p.tenant_id = ? AND ps.site_id = ?`,
      [tenantId, siteId],
    );
    return row ?? null;
  }

  async linkSite(
    projectId: string,
    siteId: string,
    options: { geonetAddressId?: string | null } = {},
  ): Promise<void> {
    const row = await this.db.get<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM geo_project_site WHERE project_id = ?`,
      [projectId],
    );
    const position = (row?.maxPos ?? -1) + 1;
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO geo_project_site (project_id, site_id, position, geonet_address_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, siteId, position, options.geonetAddressId ?? null, now],
    );
    await this.db.run(`UPDATE geo_project SET updated_at = ? WHERE id = ?`, [now, projectId]);
  }

  // Locais do projeto com a anotação de trabalho e o endereço GEONET de origem (ver
  // schema.ts) — usado por GET /v1/geo/projects/:id/sites para casar com os nós de árvore
  // vindos de GeoTreeService.sitesByIds.
  async listSiteLinks(tenantId: string, projectId: string): Promise<GeoProjectSiteLink[]> {
    const rows = await this.db.all<ProjectSiteLinkRow>(
      `SELECT ps.site_id AS siteId, ps.note, ps.geonet_address_id AS geonetAddressId
         FROM geo_project_site ps
         JOIN geo_project p ON p.id = ps.project_id
        WHERE p.tenant_id = ? AND ps.project_id = ?
        ORDER BY ps.position`,
      [tenantId, projectId],
    );
    return rows;
  }

  async updateSiteLink(
    projectId: string,
    siteId: string,
    patch: UpdateGeoProjectSiteLinkInput,
  ): Promise<void> {
    if (patch.note === undefined) return;
    await this.db.run(`UPDATE geo_project_site SET note = ? WHERE project_id = ? AND site_id = ?`, [
      patch.note,
      projectId,
      siteId,
    ]);
  }

  async unlinkSite(projectId: string, siteId: string): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM geo_project_site WHERE project_id = ? AND site_id = ?`,
      [projectId, siteId],
    );
    return result.changes > 0;
  }

  // Manchas de concentração/dispersão do projeto (REQ-MOD01-017), geradas por
  // scripts/build-project-areas.mjs. A geometria vem de tmf_geographic_location; o resto do
  // relatório (siteIds de amostra, centroide, área) fica em colunas próprias de
  // geo_project_area — mesma extensão de plataforma que geo_project_site.note, não
  // characteristic TMF (C1 não se aplica).
  async listAreas(tenantId: string, projectId: string): Promise<GeoProjectArea[]> {
    const rows = await this.db.all<{
      locationId: string;
      kind: 'concentration' | 'dispersion';
      siteCount: number;
      resourceCount: number;
      siteIds: string | null;
      centroidLng: number | null;
      centroidLat: number | null;
      areaKm2: number | null;
      generatedAt: string;
      geometry: string | null;
    }>(
      `SELECT pa.location_id AS locationId, pa.kind, pa.site_count AS siteCount,
              (SELECT COUNT(*) FROM geo_project_area_resource par
                WHERE par.project_id = pa.project_id AND par.location_id = pa.location_id) AS resourceCount,
              pa.site_ids AS siteIds, pa.centroid_lng AS centroidLng,
              pa.centroid_lat AS centroidLat, pa.area_km2 AS areaKm2,
              pa.generated_at AS generatedAt, l.geometry
         FROM geo_project_area pa
         JOIN geo_project p ON p.id = pa.project_id
         JOIN tmf_geographic_location l ON l.id = pa.location_id
        WHERE p.tenant_id = ? AND pa.project_id = ?
        ORDER BY pa.position`,
      [tenantId, projectId],
    );

    return rows
      .map((row) => {
        const geometry = parseAreaGeometry(row.geometry);
        if (!geometry) return null;
        const centroid =
          row.centroidLng !== null && row.centroidLat !== null
            ? ([Number(row.centroidLng), Number(row.centroidLat)] as [number, number])
            : null;
        return {
          id: row.locationId,
          kind: row.kind,
          siteCount: Number(row.siteCount) || 0,
          resourceCount: Number(row.resourceCount) || 0,
          geometry,
          siteIds: parseSiteIds(row.siteIds),
          centroid,
          areaKm2: row.areaKm2 !== null ? Number(row.areaKm2) : null,
          generatedAt: row.generatedAt,
        } satisfies GeoProjectArea;
      })
      .filter((area): area is GeoProjectArea => area !== null);
  }

  // SUBSTITUI a geração anterior do projeto (idempotente por escopo, como
  // build-gpon-coverage.mjs): apaga os vínculos e as Locations `PROJECT:<projectId>` antigas
  // antes de gravar as novas. Usado pelo script de geração (que fala direto com o loader-db
  // via SQL equivalente, para bulkInsert em massa) e disponível ao chamador HTTP na mesma forma.
  async replaceAreas(
    tenantId: string,
    projectId: string,
    locations: CreateProjectAreaLocationInput[],
    areas: CreateProjectAreaInput[],
  ): Promise<void> {
    const project = await this.get(tenantId, projectId);
    if (!project) return;

    const existing = await this.db.all<{ locationId: string }>(
      `SELECT location_id AS locationId FROM geo_project_area WHERE project_id = ?`,
      [projectId],
    );
    if (existing.length > 0) {
      await this.db.run(`DELETE FROM geo_project_area WHERE project_id = ?`, [projectId]);
      for (const row of existing) {
        await this.db.run(`DELETE FROM tmf_geographic_location WHERE id = ?`, [row.locationId]);
      }
    }

    for (const location of locations) {
      await this.db.run(
        `INSERT INTO tmf_geographic_location
            (id, href, geometry_type, geometry, spatial_ref, reference_point, characteristics)
         VALUES (?, ?, 'Polygon', ?, 'EPSG:4326', ?, ?)`,
        [
          location.id,
          location.href,
          location.geometry,
          `PROJECT:${projectId}`,
          location.characteristics,
        ],
      );
    }
    for (const [position, area] of areas.entries()) {
      await this.db.run(
        `INSERT INTO geo_project_area
            (project_id, location_id, kind, site_count, site_ids, centroid_lng, centroid_lat, area_km2, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          area.locationId,
          area.kind,
          area.siteCount,
          JSON.stringify(area.siteIds),
          area.centroid[0],
          area.centroid[1],
          area.areaKm2,
          position,
        ],
      );
    }
    await this.db.run(`UPDATE geo_project SET updated_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      projectId,
    ]);
  }
}

function parseAreaGeometry(raw: string | null): import('./domain.js').GeoJSONPolygon | null {
  if (!raw) return null;
  try {
    const geometry = JSON.parse(raw);
    return geometry?.type === 'Polygon' ? geometry : null;
  } catch {
    return null;
  }
}

function parseSiteIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
