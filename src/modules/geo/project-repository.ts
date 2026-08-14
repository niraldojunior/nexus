// Projetos de trabalho da página Locais (REQ-MOD01-015), estilo "Salvos" do Google Maps. Como
// GeoSearchHistoryRepository e GeoTreeService, é uma projeção de plataforma que fala com o
// DatabaseClient direto — projeto não é entidade TMF, não passa pelo IGeoRepository nem pelo
// GeoService. Compartilhado por tenant (C8): qualquer usuário do tenant vê e edita os mesmos
// projetos, sem filtro por usuário.

import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';

export type GeoProject = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  createdBy: string | null;
  // Locais ainda ativos do projeto (exclui os já soft-terminados) — o número exibido
  // abaixo do nome na lista de projetos.
  siteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateGeoProjectInput = {
  name: string;
  description?: string | null;
  iconDataUrl?: string | null;
};

export type UpdateGeoProjectInput = {
  name?: string;
  description?: string | null;
  iconDataUrl?: string | null;
};

type ProjectRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  createdBy: string | null;
  siteCount: number | string;
  createdAt: string;
  updatedAt: string;
};

const PROJECT_SELECT = `
  SELECT p.id, p.tenant_id AS tenantId, p.name, p.description,
         p.icon_data_url AS iconDataUrl, p.created_by AS createdBy,
         p.created_at AS createdAt, p.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM geo_project_site ps
            JOIN tmf_geographic_site s ON s.id = ps.site_id
           WHERE ps.project_id = p.id AND s.status NOT IN ('Retired', 'terminated')) AS siteCount
    FROM geo_project p
`;

const toProject = (row: ProjectRow): GeoProject => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  description: row.description,
  iconDataUrl: row.iconDataUrl,
  createdBy: row.createdBy,
  siteCount: Number(row.siteCount) || 0,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class GeoProjectRepository {
  constructor(private db: DatabaseClient) {}

  async list(tenantId: string): Promise<GeoProject[]> {
    const rows = await this.db.all<ProjectRow>(
      `${PROJECT_SELECT} WHERE p.tenant_id = ? ORDER BY p.updated_at DESC`,
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

  async create(
    tenantId: string,
    actorSub: string,
    input: CreateGeoProjectInput,
  ): Promise<GeoProject> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO geo_project
          (id, tenant_id, name, description, icon_data_url, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        input.name,
        input.description ?? null,
        input.iconDataUrl ?? null,
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
          SET name = ?, description = ?, icon_data_url = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.name !== undefined ? patch.name : existing.name,
        patch.description !== undefined ? patch.description : existing.description,
        patch.iconDataUrl !== undefined ? patch.iconDataUrl : existing.iconDataUrl,
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

  async linkSite(projectId: string, siteId: string): Promise<void> {
    const row = await this.db.get<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM geo_project_site WHERE project_id = ?`,
      [projectId],
    );
    const position = (row?.maxPos ?? -1) + 1;
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO geo_project_site (project_id, site_id, position, created_at) VALUES (?, ?, ?, ?)`,
      [projectId, siteId, position, now],
    );
    await this.db.run(`UPDATE geo_project SET updated_at = ? WHERE id = ?`, [now, projectId]);
  }

  async unlinkSite(projectId: string, siteId: string): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM geo_project_site WHERE project_id = ? AND site_id = ?`,
      [projectId, siteId],
    );
    return result.changes > 0;
  }
}
