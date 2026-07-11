import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
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
  public constructor(private readonly db: PostgresDatabase) {
    this.seedManufacturerParties();
  }

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }

  private seedManufacturerParties(): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const name of MANUFACTURER_BOOTSTRAP) {
        const slug = slugify(name);
        const partyId = `party-${slug}`;
        const roleId = `party-role-${slug}-manufacturer`;
        this.db.run(
          `INSERT INTO tmf_party
           (id, href, name, party_type, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           href = excluded.href,
           name = excluded.name,
           party_type = excluded.party_type,
           status = excluded.status,
           valid_for_start = excluded.valid_for_start,
           valid_for_end = excluded.valid_for_end,
           characteristics = excluded.characteristics,
           updated_at = excluded.updated_at`,
          [
            partyId,
            `/tmf-api/partyManagement/v4/party/${partyId}`,
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
        this.db.run(
          `INSERT INTO tmf_party_role
           (id, href, name, party_id, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           href = excluded.href,
           name = excluded.name,
           party_id = excluded.party_id,
           status = excluded.status,
           valid_for_start = excluded.valid_for_start,
           valid_for_end = excluded.valid_for_end,
           characteristics = excluded.characteristics,
           updated_at = excluded.updated_at`,
          [
            roleId,
            `/tmf-api/partyRoleManagement/v4/partyRole/${roleId}`,
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

  public upsertParty(party: Party): Party {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_party
       (id, href, name, party_type, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       party_type = excluded.party_type,
       status = excluded.status,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        party.id,
        party.href,
        party.name,
        party.partyType,
        party.status,
        party.validFor?.startDateTime ?? null,
        party.validFor?.endDateTime ?? null,
        JSON.stringify(party.partyCharacteristic),
        now,
        now,
      ],
    );

    return this.getParty(party.id) ?? party;
  }

  public getParty(id: string): Party | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      party_type: 'Organization' | 'Individual';
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
    }>(
      `SELECT id, href, name, party_type, status, valid_for_start, valid_for_end, characteristics
       FROM tmf_party
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapParty(row) : undefined;
  }

  public listParties(query?: PartyQuery): Party[] {
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

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const limitClause = hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '';
    const offsetClause = hasOffset ? 'OFFSET ?' : '';

    const sql = [
      'SELECT id, href, name, party_type, status, valid_for_start, valid_for_end, characteristics FROM tmf_party',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name ASC, id ASC',
      limitClause,
      offsetClause,
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<{
      id: string;
      href: string;
      name: string;
      party_type: 'Organization' | 'Individual';
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
    }>(sql, params);

    return rows.map((row) => this.mapParty(row)).filter((party) => filterPartyDocument(party, query?.document));
  }

  public upsertPartyRole(role: PartyRole): PartyRole {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_party_role
       (id, href, name, party_id, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       party_id = excluded.party_id,
       status = excluded.status,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        role.id,
        role.href,
        role.name,
        role.partyId,
        role.status,
        role.validFor?.startDateTime ?? null,
        role.validFor?.endDateTime ?? null,
        JSON.stringify(role.partyRoleCharacteristic),
        now,
        now,
      ],
    );

    return this.getPartyRole(role.id) ?? role;
  }

  public getPartyRole(id: string): PartyRole | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      party_id: string;
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
      party_href: string;
      party_name: string;
      party_type: 'Organization' | 'Individual';
    }>(
      `SELECT role.id, role.href, role.name, role.party_id, role.status, role.valid_for_start, role.valid_for_end, role.characteristics,
              party.href AS party_href, party.name AS party_name, party.party_type AS party_type
       FROM tmf_party_role role
       INNER JOIN tmf_party party ON party.id = role.party_id
       WHERE role.id = ?`,
      [id],
    );

    return row ? this.mapRole(row) : undefined;
  }

  public listPartyRoles(query?: PartyRoleQuery): PartyRole[] {
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

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const limitClause = hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '';
    const offsetClause = hasOffset ? 'OFFSET ?' : '';

    const sql = [
      'SELECT role.id, role.href, role.name, role.party_id, role.status, role.valid_for_start, role.valid_for_end, role.characteristics,',
      '       party.href AS party_href, party.name AS party_name, party.party_type AS party_type',
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

    const rows = this.db.all<{
      id: string;
      href: string;
      name: string;
      party_id: string;
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
      party_href: string;
      party_name: string;
      party_type: 'Organization' | 'Individual';
    }>(sql, params);

    return rows.map((row) => this.mapRole(row));
  }

  public upsertPartyRelationship(relationship: PartyRelationship): PartyRelationship {
    this.db.run(
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

  public deletePartyRelationship(partyFromId: string, partyToId: string, relationshipType: string): boolean {
    const result = this.db.run(
      `DELETE FROM tmf_party_relationship
       WHERE party_from_id = ? AND party_to_id = ? AND relationship_type = ?`,
      [partyFromId, partyToId, relationshipType],
    );
    return result.changes > 0;
  }

  public listPartyRelationships(partyId: string): PartyRelationship[] {
    const rows = this.db.all<{
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
    href: string;
    name: string;
    party_type: 'Organization' | 'Individual';
    status: 'active' | 'inactive' | 'terminated';
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
  }): Party {
    const party: Party = {
      '@type': row.party_type,
      id: row.id,
      href: row.href,
      name: row.name,
      partyType: row.party_type,
      status: row.status,
      partyCharacteristic: JSON.parse(row.characteristics || '[]') as Party['partyCharacteristic'],
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
    href: string;
    name: string;
    party_id: string;
    status: 'active' | 'inactive' | 'terminated';
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
    party_href: string;
    party_name: string;
    party_type: 'Organization' | 'Individual';
  }): PartyRole {
    const role: PartyRole = {
      '@type': 'PartyRole',
      id: row.id,
      href: row.href,
      name: row.name,
      status: row.status,
      partyId: row.party_id,
      party: {
        id: row.party_id,
        '@referredType': row.party_type,
        href: row.party_href,
        name: row.party_name,
      },
      partyRoleCharacteristic: JSON.parse(row.characteristics || '[]') as PartyRole['partyRoleCharacteristic'],
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
