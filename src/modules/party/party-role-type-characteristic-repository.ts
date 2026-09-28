// Catálogo de quais características cada "tipo de party" (identificado por `roleName`, ex.
// "manufacturer") aceita — metadado de modelagem para a aba "Características Gerais" do Studio ->
// Partes (issue #220). Como GeoProjectRepository.ensureStatusCatalog/listStatusCatalog, é uma
// projeção de plataforma que fala direto com o DatabaseClient: não é entidade TMF, não passa pelo
// IPartyRepository nem pelo PartyService. Governado via PartiesStudioAdapter (publish/discard);
// a API direta (create/update/deactivate) segue existindo para o editor mutar dentro de um draft.

import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';

export type PartyRoleTypeCharacteristicValueType =
  'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'list' | 'json';

export type PartyRoleTypeCharacteristic = {
  id: string;
  tenantId: string;
  roleName: string;
  roleTypeId?: string | null;
  name: string;
  group: string | null;
  description: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string[] | null;
  /** Chave estável de um conjunto publicado em Studio -> Dados de Referência; alternativa a `allowedValues`. */
  referenceDataSetKey: string | null;
  sortOrder: number;
  mandatory: boolean;
  defaultValue: string | null;
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
  referenceDataSetKey?: string | null;
  sortOrder?: number;
  mandatory?: boolean;
  defaultValue?: string | null;
};

export type UpdatePartyRoleTypeCharacteristicInput = {
  name?: string;
  group?: string | null;
  description?: string | null;
  valueType?: PartyRoleTypeCharacteristicValueType;
  allowedValues?: string[] | null;
  referenceDataSetKey?: string | null;
  sortOrder?: number;
  mandatory?: boolean;
  defaultValue?: string | null;
  active?: boolean;
};

type CharacteristicRow = {
  id: string;
  tenantId: string;
  roleName: string;
  roleTypeId: string | null;
  name: string;
  group: string | null;
  description: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string | null;
  referenceDataSetKey: string | null;
  sortOrder: number;
  mandatory: unknown;
  defaultValue: string | null;
  active: unknown;
  createdAt: string;
  updatedAt: string;
};

const CHARACTERISTIC_SELECT = `
  SELECT id, tenant_id AS tenantId, role_name AS roleName,
         role_type_id AS roleTypeId, name,
         characteristic_group AS "group", description, value_type AS valueType,
         allowed_values AS allowedValues, reference_data_set_key AS referenceDataSetKey,
         sort_order AS sortOrder,
         CASE WHEN mandatory = 1 THEN 1 ELSE 0 END AS mandatory,
         default_value AS defaultValue,
         CASE WHEN active = 1 THEN 1 ELSE 0 END AS active,
         created_at AS createdAt, updated_at AS updatedAt
    FROM party_role_type_characteristic`;

const toCharacteristic = (row: CharacteristicRow): PartyRoleTypeCharacteristic => ({
  ...row,
  roleTypeId: row.roleTypeId ?? null,
  mandatory: Number(row.mandatory) === 1,
  defaultValue: row.defaultValue ?? null,
  active: Number(row.active) === 1,
  allowedValues: row.allowedValues ? (JSON.parse(row.allowedValues) as string[]) : null,
  referenceDataSetKey: row.referenceDataSetKey ?? null,
});

// Não é um "IPartyRepository" — sem classe Oracle separada (padrão GeoProjectRepository): SQL
// portável com placeholders `?`, booleans como INTEGER 0/1, sem ON CONFLICT/upsert nativo.
export class PartyRoleTypeCharacteristicRepository {
  constructor(private db: DatabaseClient) {}

  /** Lista characteristics por `roleTypeId` (UUID do party_role_type). */
  async list(tenantId: string, roleTypeId: string): Promise<PartyRoleTypeCharacteristic[]> {
    const rows = await this.db.all<CharacteristicRow>(
      `${CHARACTERISTIC_SELECT} WHERE tenant_id = ? AND role_type_id = ? ORDER BY sort_order, name`,
      [tenantId, roleTypeId],
    );
    if (rows.length > 0) return rows.map(toCharacteristic);
    // Fallback legado: ambientes com dados anteriores à migração V22 (role_type_id ainda NULL).
    const fallbackRows = await this.db.all<CharacteristicRow>(
      `${CHARACTERISTIC_SELECT} WHERE tenant_id = ? AND role_type_id IS NULL
         AND role_name = (SELECT role_name FROM party_role_type WHERE id = ? AND tenant_id = ?)
       ORDER BY sort_order, name`,
      [tenantId, roleTypeId, tenantId],
    );
    return fallbackRows.map(toCharacteristic);
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
    roleTypeId: string,
    input: CreatePartyRoleTypeCharacteristicInput,
    roleName?: string | null,
  ): Promise<PartyRoleTypeCharacteristic> {
    const id = createCanonicalId();
    const now = new Date().toISOString();
    let resolvedRoleName = roleName ?? null;
    let resolvedRoleTypeId: string | null = roleTypeId;

    if (!resolvedRoleName) {
      const typeRow = await this.db.get<{ id: string; roleName: string }>(
        `SELECT id, role_name AS roleName FROM party_role_type WHERE id = ? AND tenant_id = ?`,
        [roleTypeId, tenantId],
      );
      if (typeRow) {
        resolvedRoleName = typeRow.roleName;
        resolvedRoleTypeId = typeRow.id;
      } else {
        // Fallback: se roleTypeId for uma string de roleName (ex: 'manufacturer')
        const byRoleName = await this.db.get<{ id: string; roleName: string }>(
          `SELECT id, role_name AS roleName FROM party_role_type WHERE role_name = ? AND tenant_id = ?`,
          [roleTypeId, tenantId],
        );
        if (byRoleName) {
          resolvedRoleTypeId = byRoleName.id;
          resolvedRoleName = byRoleName.roleName;
        } else {
          resolvedRoleName = roleTypeId;
        }
      }
    }

    await this.db.run(
      `INSERT INTO party_role_type_characteristic
          (id, tenant_id, role_name, role_type_id, name, characteristic_group, description, value_type,
           allowed_values, reference_data_set_key, sort_order, mandatory, default_value, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        resolvedRoleName,
        resolvedRoleTypeId,
        input.name,
        input.group ?? null,
        input.description ?? null,
        input.valueType,
        input.allowedValues ? JSON.stringify(input.allowedValues) : null,
        input.referenceDataSetKey ?? null,
        input.sortOrder ?? 100,
        input.mandatory ? 1 : 0,
        input.defaultValue ?? null,
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
    const nextReferenceDataSetKey =
      patch.referenceDataSetKey !== undefined
        ? patch.referenceDataSetKey
        : current.referenceDataSetKey;
    const nextMandatory = patch.mandatory !== undefined ? patch.mandatory : current.mandatory;
    const nextDefaultValue =
      patch.defaultValue !== undefined ? patch.defaultValue : current.defaultValue;
    await this.db.run(
      `UPDATE party_role_type_characteristic
          SET name = ?, characteristic_group = ?, description = ?, value_type = ?,
              allowed_values = ?, reference_data_set_key = ?, sort_order = ?, mandatory = ?, default_value = ?, active = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.name ?? current.name,
        patch.group !== undefined ? patch.group : current.group,
        patch.description !== undefined ? patch.description : current.description,
        patch.valueType ?? current.valueType,
        nextAllowedValues ? JSON.stringify(nextAllowedValues) : null,
        nextReferenceDataSetKey ?? null,
        patch.sortOrder ?? current.sortOrder,
        nextMandatory ? 1 : 0,
        nextDefaultValue ?? null,
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
        WHERE tenant_id = ? AND (role_name = ? OR role_type_id IN (SELECT id FROM party_role_type WHERE role_name = ? AND tenant_id = ?)) AND name = ?`,
      [tenantId, 'manufacturer', 'manufacturer', tenantId, 'cnpj'],
    );
    if (existing) return;
    const manufacturerType = await this.db.get<{ id: string }>(
      `SELECT id FROM party_role_type WHERE tenant_id = ? AND role_name = ?`,
      [tenantId, 'manufacturer'],
    );
    await this.create(
      tenantId,
      manufacturerType?.id ?? 'manufacturer',
      {
        name: 'cnpj',
        valueType: 'string',
        description: 'CNPJ do fornecedor.',
        sortOrder: 10,
      },
      'manufacturer',
    );
  }
}
