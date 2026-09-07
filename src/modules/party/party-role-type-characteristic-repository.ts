// Catálogo de quais características cada "tipo de party" (identificado por `roleName`, ex.
// "manufacturer") aceita — metadado de modelagem para a aba "Características Gerais" do Studio ->
// Partes (issue #220). Como GeoProjectRepository.ensureStatusCatalog/listStatusCatalog, é uma
// projeção de plataforma que fala direto com o DatabaseClient: não é entidade TMF, não passa pelo
// IPartyRepository nem pelo PartyService, e não usa o fluxo de draft/publish do Studio — o domínio
// 'parties' só tem o adapter no-op, então esse catálogo persiste direto via API (achado 4 do plano).

import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';

export type PartyRoleTypeCharacteristicValueType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'list'
  | 'json';

export type PartyRoleTypeCharacteristic = {
  id: string;
  tenantId: string;
  roleName: string;
  name: string;
  group: string | null;
  description: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string[] | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyRoleTypeCharacteristicInput = {
  name: string;
  group?: string | null;
  description?: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues?: string[] | null;
  sortOrder?: number;
};

export type UpdatePartyRoleTypeCharacteristicInput = {
  name?: string;
  group?: string | null;
  description?: string | null;
  valueType?: PartyRoleTypeCharacteristicValueType;
  allowedValues?: string[] | null;
  sortOrder?: number;
  active?: boolean;
};

type CharacteristicRow = {
  id: string;
  tenantId: string;
  roleName: string;
  name: string;
  group: string | null;
  description: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string | null;
  sortOrder: number;
  active: unknown;
  createdAt: string;
  updatedAt: string;
};

const CHARACTERISTIC_SELECT = `
  SELECT id, tenant_id AS tenantId, role_name AS roleName, name,
         characteristic_group AS "group", description, value_type AS valueType,
         allowed_values AS allowedValues, sort_order AS sortOrder,
         CASE WHEN active = 1 THEN 1 ELSE 0 END AS active,
         created_at AS createdAt, updated_at AS updatedAt
    FROM party_role_type_characteristic`;

const toCharacteristic = (row: CharacteristicRow): PartyRoleTypeCharacteristic => ({
  ...row,
  active: Number(row.active) === 1,
  allowedValues: row.allowedValues ? (JSON.parse(row.allowedValues) as string[]) : null,
});

// Não é um "IPartyRepository" — sem classe Oracle separada (padrão GeoProjectRepository): SQL
// portável com placeholders `?`, booleans como INTEGER 0/1, sem ON CONFLICT/upsert nativo.
export class PartyRoleTypeCharacteristicRepository {
  constructor(private db: DatabaseClient) {}

  async list(tenantId: string, roleName: string): Promise<PartyRoleTypeCharacteristic[]> {
    const rows = await this.db.all<CharacteristicRow>(
      `${CHARACTERISTIC_SELECT} WHERE tenant_id = ? AND role_name = ? ORDER BY sort_order, name`,
      [tenantId, roleName],
    );
    return rows.map(toCharacteristic);
  }

  async get(tenantId: string, id: string): Promise<PartyRoleTypeCharacteristic | null> {
    const row = await this.db.get<CharacteristicRow>(
      `${CHARACTERISTIC_SELECT} WHERE tenant_id = ? AND id = ?`,
      [tenantId, id],
    );
    return row ? toCharacteristic(row) : null;
  }

  async create(
    tenantId: string,
    roleName: string,
    input: CreatePartyRoleTypeCharacteristicInput,
  ): Promise<PartyRoleTypeCharacteristic> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO party_role_type_characteristic
          (id, tenant_id, role_name, name, characteristic_group, description, value_type,
           allowed_values, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        roleName,
        input.name,
        input.group ?? null,
        input.description ?? null,
        input.valueType,
        input.allowedValues ? JSON.stringify(input.allowedValues) : null,
        input.sortOrder ?? 100,
        1,
        now,
        now,
      ],
    );
    return (await this.get(tenantId, id))!;
  }

  async update(
    tenantId: string,
    id: string,
    patch: UpdatePartyRoleTypeCharacteristicInput,
  ): Promise<PartyRoleTypeCharacteristic | null> {
    const current = await this.get(tenantId, id);
    if (!current) return null;
    const nextAllowedValues =
      patch.allowedValues !== undefined ? patch.allowedValues : current.allowedValues;
    await this.db.run(
      `UPDATE party_role_type_characteristic
          SET name = ?, characteristic_group = ?, description = ?, value_type = ?,
              allowed_values = ?, sort_order = ?, active = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.name ?? current.name,
        patch.group !== undefined ? patch.group : current.group,
        patch.description !== undefined ? patch.description : current.description,
        patch.valueType ?? current.valueType,
        nextAllowedValues ? JSON.stringify(nextAllowedValues) : null,
        patch.sortOrder ?? current.sortOrder,
        (patch.active ?? current.active) ? 1 : 0,
        new Date().toISOString(),
        tenantId,
        id,
      ],
    );
    return this.get(tenantId, id);
  }

  // Soft-delete (C6) — nunca DELETE físico. Não é implementado como update() com active:false
  // apenas para ficar simétrico à rota HTTP DELETE, que também não remove fisicamente a linha.
  async deactivate(tenantId: string, id: string): Promise<PartyRoleTypeCharacteristic | null> {
    return this.update(tenantId, id, { active: false });
  }

  // Seed idempotente: hoje `cnpj` é gravado livre em `tmf_party_role.characteristics` sem estar
  // declarado em catálogo algum (ver ConfigurationPage.tsx). Garante que a aba "Características
  // Gerais" do tipo `manufacturer` não comece vazia de forma enganosa, sem migrar nenhum valor de
  // fornecedor já cadastrado — só declara a característica no catálogo.
  async ensureManufacturerCnpjSeed(tenantId: string): Promise<void> {
    const existing = await this.db.get<{ id: string }>(
      `SELECT id FROM party_role_type_characteristic
        WHERE tenant_id = ? AND role_name = ? AND name = ?`,
      [tenantId, 'manufacturer', 'cnpj'],
    );
    if (existing) return;
    await this.create(tenantId, 'manufacturer', {
      name: 'cnpj',
      valueType: 'string',
      description: 'CNPJ do fornecedor.',
      sortOrder: 10,
    });
  }
}
