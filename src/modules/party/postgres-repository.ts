import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { buildHref } from '../../shared/tmf/index.js';
import type { Party, PartyQuery, PartyRelationship, PartyRole, PartyRoleQuery } from './domain.js';
import type { IPartyRepository } from './party-repository-interface.js';

const MANUFACTURER_BOOTSTRAP = [
  'VANTIVA',
  'BLU-CASTLE',
  'DATACOM',
  'HUAWEI',
  'ZTE',
  'SAGEMCOM',
  'NOKIA',
  'TELLESCOM',
  'ARCADYAN',
] as const;

export class PostgresPartyRepository implements IPartyRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.db.transaction(async () => await fn());
  }

  public initialize(): Promise<void> {
    return this.seedManufacturerParties();
  }

  private async seedManufacturerParties(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.transaction(async () => {
      for (const name of MANUFACTURER_BOOTSTRAP) {
        const slug = slugify(name);
        const partyId = `party-${slug}`;
        const roleId = `party-role-${slug}-manufacturer`;
        await this.db.run(
          `INSERT INTO tmf_party
           (id, name, party_type, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           party_type = excluded.party_type,
           status = excluded.status,
           valid_for_start = excluded.valid_for_start,
           valid_for_end = excluded.valid_for_end,
           characteristics = excluded.characteristics,
           updated_at = excluded.updated_at`,
          [
            partyId,
            name,
            'Organization',
            'active',
            null,
            null,
            '[]',
            now,
            now,
          ],
        );
        await this.db.run(
          `INSERT INTO tmf_party_role
           (id, name, party_id, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           party_id = excluded.party_id,
           status = excluded.status,
           valid_for_start = excluded.valid_for_start,
           valid_for_end = excluded.valid_for_end,
           characteristics = excluded.characteristics,
           updated_at = excluded.updated_at`,
          [
            roleId,
            'manufacturer',
            partyId,
            'active',
            null,
            null,
            '[]',
            now,
            now,
          ],
        );
      }
    });
  }

  public async upsertParty(party: Party): Promise<Party> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_party
       (id, name, party_type, status, valid_for_start, valid_for_end, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       party_type = excluded.party_type,
       status = excluded.status,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        party.id,
        party.name,
        party.partyType,
        party.status,
        party.validFor?.startDateTime ?? null,
        party.validFor?.endDateTime ?? null,
        JSON.stringify(party.partyCharacteristic),
        party.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getParty(party.id)) ?? party;
  }

  // Cross-tenant de propósito — ver nota em party-repository-interface.ts.
  public async getParty(id: string): Promise<Party | undefined> {
    const row = await this.db.get<{
      id: string;
      name: string;
      party_type: 'Organization' | 'Individual';
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
      tenant_id: string;
    }>(
      `SELECT id, name, party_type, status, valid_for_start, valid_for_end, characteristics, tenant_id
       FROM tmf_party
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapParty(row) : undefined;
  }

  public async listParties(query?: PartyQuery): Promise<Party[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.partyType) {
      conditions.push('party_type = ?');
      params.push(query.partyType);
    }
    if (query?.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const limitClause = hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '';
    const offsetClause = hasOffset ? 'OFFSET ?' : '';

    const sql = [
      'SELECT id, name, party_type, status, valid_for_start, valid_for_end, characteristics, tenant_id FROM tmf_party',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name ASC, id ASC',
      limitClause,
      offsetClause,
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = await this.db.all<{
      id: string;
      name: string;
      party_type: 'Organization' | 'Individual';
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
      tenant_id: string;
    }>(sql, params);

    return rows
      .map((row) => this.mapParty(row))
      .filter((party) => filterPartyDocument(party, query?.document));
  }

  public async upsertPartyRole(role: PartyRole): Promise<PartyRole> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_party_role
       (id, name, party_id, status, valid_for_start, valid_for_end, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       party_id = excluded.party_id,
       status = excluded.status,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        role.id,
        role.name,
        role.partyId,
        role.status,
        role.validFor?.startDateTime ?? null,
        role.validFor?.endDateTime ?? null,
        JSON.stringify(role.partyRoleCharacteristic),
        role.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getPartyRole(role.id)) ?? role;
  }

  // Cross-tenant de propósito — ver nota em party-repository-interface.ts.
  public async getPartyRole(id: string): Promise<PartyRole | undefined> {
    const row = await this.db.get<{
      id: string;
      name: string;
      party_id: string;
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
      tenant_id: string;
      party_name: string;
      party_type: 'Organization' | 'Individual';
    }>(
      `SELECT role.id, role.name, role.party_id, role.status, role.valid_for_start, role.valid_for_end, role.characteristics, role.tenant_id,
              party.name AS party_name, party.party_type AS party_type
       FROM tmf_party_role role
       INNER JOIN tmf_party party ON party.id = role.party_id
       WHERE role.id = ?`,
      [id],
    );

    return row ? this.mapRole(row) : undefined;
  }

  public async listPartyRoles(query?: PartyRoleQuery): Promise<PartyRole[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.partyId) {
      conditions.push('role.party_id = ?');
      params.push(query.partyId);
    }
    if (query?.name) {
      conditions.push('LOWER(role.name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.status) {
      conditions.push('role.status = ?');
      params.push(query.status);
    }
    if (query?.tenantId) {
      conditions.push('role.tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const limitClause = hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '';
    const offsetClause = hasOffset ? 'OFFSET ?' : '';

    const sql = [
      'SELECT role.id, role.name, role.party_id, role.status, role.valid_for_start, role.valid_for_end, role.characteristics, role.tenant_id,',
      '       party.name AS party_name, party.party_type AS party_type',
      'FROM tmf_party_role role',
      'INNER JOIN tmf_party party ON party.id = role.party_id',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY role.name ASC, role.id ASC',
      limitClause,
      offsetClause,
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = await this.db.all<{
      id: string;
      name: string;
      party_id: string;
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
      tenant_id: string;
      party_name: string;
      party_type: 'Organization' | 'Individual';
    }>(sql, params);

    return rows.map((row) => this.mapRole(row));
  }

  public async upsertPartyRelationship(
    relationship: PartyRelationship,
  ): Promise<PartyRelationship> {
    await this.db.run(
      `INSERT INTO tmf_party_relationship
       (party_from_id, party_to_id, relationship_type, valid_for_start, valid_for_end)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(party_from_id, party_to_id, relationship_type) DO UPDATE SET
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end`,
      [
        relationship.partyFromId,
        relationship.partyToId,
        relationship.relationshipType,
        relationship.validFor?.startDateTime ?? null,
        relationship.validFor?.endDateTime ?? null,
      ],
    );

    return relationship;
  }

  public async deletePartyRelationship(
    partyFromId: string,
    partyToId: string,
    relationshipType: string,
  ): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM tmf_party_relationship
       WHERE party_from_id = ? AND party_to_id = ? AND relationship_type = ?`,
      [partyFromId, partyToId, relationshipType],
    );
    return result.changes > 0;
  }

  public async listPartyRelationships(partyId: string): Promise<PartyRelationship[]> {
    const rows = await this.db.all<{
      party_from_id: string;
      party_to_id: string;
      relationship_type: string;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
    }>(
      `SELECT party_from_id, party_to_id, relationship_type, valid_for_start, valid_for_end
       FROM tmf_party_relationship
       WHERE party_from_id = ?
       ORDER BY relationship_type, party_to_id`,
      [partyId],
    );

    return rows.map((row) => ({
      partyFromId: row.party_from_id,
      partyToId: row.party_to_id,
      relationshipType: row.relationship_type,
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
        : {}),
    }));
  }

  private mapParty(row: {
    id: string;
    name: string;
    party_type: 'Organization' | 'Individual';
    status: 'active' | 'inactive' | 'terminated';
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
    tenant_id?: string;
  }): Party {
    const party: Party = {
      '@type': row.party_type,
      id: row.id,
      href: buildHref('party', row.id),
      name: row.name,
      partyType: row.party_type,
      status: row.status,
      partyCharacteristic: JSON.parse(row.characteristics || '[]') as Party['partyCharacteristic'],
      tenantId: row.tenant_id ?? 'default',
    };

    if (row.valid_for_start || row.valid_for_end) {
      party.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }

    return party;
  }

  private mapRole(row: {
    id: string;
    name: string;
    party_id: string;
    status: 'active' | 'inactive' | 'terminated';
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
    tenant_id?: string;
    party_name: string;
    party_type: 'Organization' | 'Individual';
  }): PartyRole {
    const role: PartyRole = {
      '@type': 'PartyRole',
      id: row.id,
      href: buildHref('partyRole', row.id),
      name: row.name,
      status: row.status,
      partyId: row.party_id,
      party: {
        id: row.party_id,
        '@referredType': row.party_type,
        href: buildHref('party', row.party_id),
        name: row.party_name,
      },
      partyRoleCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as PartyRole['partyRoleCharacteristic'],
      tenantId: row.tenant_id ?? 'default',
    };

    if (row.valid_for_start || row.valid_for_end) {
      role.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }

    return role;
  }
}

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const filterPartyDocument = (party: Party, document?: string): boolean => {
  if (!document) return true;
  const needle = document.toLowerCase();
  return party.partyCharacteristic.some((item) => {
    const name = item.name.toLowerCase();
    if (!['document', 'documentnumber', 'cpf', 'cnpj', 'taxid', 'taxidentifier'].includes(name)) {
      return false;
    }
    return String(item.value).toLowerCase().includes(needle);
  });
};
