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

export type GeoProject = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  status: GeoProjectStatus;
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
};

export type UpdateGeoProjectInput = {
  name?: string;
  description?: string | null;
  iconDataUrl?: string | null;
  status?: GeoProjectStatus;
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

const PROJECT_SELECT = `
  SELECT p.id, p.tenant_id AS tenantId, p.name, p.description,
         p.icon_data_url AS iconDataUrl, p.status, p.created_by AS createdBy,
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
`;

const toProject = (row: ProjectRow): GeoProject => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  description: row.description,
  iconDataUrl: row.iconDataUrl,
  status: row.status,
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

  async list(tenantId: string): Promise<GeoProject[]> {
    const rows = await this.db.all<ProjectRow>(
      `${PROJECT_SELECT} WHERE p.tenant_id = ? AND p.archived_at IS NULL ORDER BY p.updated_at DESC`,
      [tenantId],
    );
    return rows.map(toProject);
  }

  async get(tenantId: string, id: string): Promise<GeoProject | null> {
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
          (id, tenant_id, name, description, icon_data_url, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        input.name,
        input.description ?? null,
        input.iconDataUrl ?? null,
        input.status ?? 'planned',
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
          SET name = ?, description = ?, icon_data_url = ?, status = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.name !== undefined ? patch.name : existing.name,
        patch.description !== undefined ? patch.description : existing.description,
        patch.iconDataUrl !== undefined ? patch.iconDataUrl : existing.iconDataUrl,
        patch.status !== undefined ? patch.status : existing.status,
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

  async listSiteLinksPage(
    tenantId: string,
    projectId: string,
    limit: number,
    offset: number,
  ): Promise<GeoProjectSiteLink[]> {
    const rows = await this.db.all<ProjectSiteLinkRow>(
      `SELECT ps.site_id AS siteId, ps.note, ps.geonet_address_id AS geonetAddressId
         FROM geo_project_site ps JOIN geo_project p ON p.id = ps.project_id
        WHERE p.tenant_id = ? AND ps.project_id = ?
        ORDER BY ps.position LIMIT ? OFFSET ?`,
      [tenantId, projectId, limit, offset],
    );
    return rows;
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
