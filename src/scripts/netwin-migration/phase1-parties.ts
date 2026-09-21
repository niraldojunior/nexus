import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { merge } from '../netwin-migration-kit.js';
import { netwinPartyId, netwinPartyRoleId } from './identity.js';
import type { PhaseStats } from './types.js';

const CANONICAL_PARTY_ROLES = [
  { name: 'Manufacturer', description: 'Fabricante de equipamentos e cabos' },
  { name: 'InfrastructureOwner', description: 'Proprietário da infraestrutura física' },
  { name: 'Tenant', description: 'Operadora ou ISP cliente atacado' },
  { name: 'Maintainer', description: 'Empresa mantenedora / empreiteira de campo' },
];

export async function runPhase1Parties(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 1.A & 1.B: Papéis e Organizações (Studio / Party Management) ===');

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();

  try {
    // 1. Carga de Papéis Canônicos em tmf_party_role_type (se a tabela existir)
    if (target) {
      for (const role of CANONICAL_PARTY_ROLES) {
        try {
          await target.execute(
            `MERGE INTO ${ctx.t('party_role_type')} target
             USING (SELECT :1 code, :2 name, :3 description FROM DUAL) source
             ON (target.code = source.code)
             WHEN NOT MATCHED THEN
               INSERT (id, code, name, description, status)
               VALUES (SYS_GUID(), source.code, source.name, source.description, 'active')`,
            [role.name, role.name, role.description],
            { autoCommit: false },
          );
        } catch {
          // party_role_type pode ser opcional dependendo do schema semente
        }
      }

      // Garante a organização dona da infraestrutura (V.tal)
      const ownerId = ctx.options.ownerPartyId;
      await merge(target, ctx.t, 'tmf_party', ['id'], {
        id: ownerId,
        tenant_id: ctx.options.tenantId,
        name: 'V.tal - Rede Neutra Telecomunicações S.A.',
        party_type: 'Organization',
        status: 'active',
        characteristics: JSON.stringify([
          { group: '_origin', name: 'system', value: 'Nexus', valueType: 'string' },
          { group: '_origin', name: 'entity', value: 'TenantOwner', valueType: 'string' },
        ]),
      });

      await merge(target, ctx.t, 'tmf_party_role', ['id'], {
        id: `role-${ownerId}-owner`,
        tenant_id: ctx.options.tenantId,
        party_id: ownerId,
        name: 'InfrastructureOwner',
        status: 'active',
        characteristics: '[]',
      });
      stats.loaded++;
    }

    // 2. Extração de Fabricantes de NETWIN.MANUFACTURER
    const rows = await source.execute<{
      ID: number;
      NAME: string;
      ACRONYM: string | null;
      DESCRIPTION: string | null;
    }>(
      `SELECT ID, NAME, ACRONYM, DESCRIPTION FROM NETWIN.MANUFACTURER ORDER BY ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const manufacturers = rows.rows ?? [];
    console.log(`Fabricantes encontrados em NETWIN.MANUFACTURER: ${manufacturers.length}`);

    for (const m of manufacturers) {
      if (!m.NAME || !m.NAME.trim()) {
        stats.skipped++;
        continue;
      }

      const partyId = netwinPartyId(m.ID);
      const roleId = netwinPartyRoleId(partyId, 'Manufacturer');
      const partyName = m.NAME.trim();

      if (target) {
        // Upsert Organization
        await merge(target, ctx.t, 'tmf_party', ['id'], {
          id: partyId,
          tenant_id: ctx.options.tenantId,
          name: partyName,
          party_type: 'Organization',
          status: 'active',
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'MANUFACTURER', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(m.ID), valueType: 'string' },
            ...(m.ACRONYM ? [{ group: '_origin', name: 'acronym', value: m.ACRONYM, valueType: 'string' }] : []),
          ]),
        });

        // Upsert PartyRole (Manufacturer)
        await merge(target, ctx.t, 'tmf_party_role', ['id'], {
          id: roleId,
          tenant_id: ctx.options.tenantId,
          party_id: partyId,
          name: 'Manufacturer',
          status: 'active',
          characteristics: '[]',
        });
      }

      stats.loaded++;
    }

    if (target) {
      await target.execute('COMMIT');
    }

    console.log(`Fase 1.A & 1.B concluída: ${stats.loaded} organizações/papéis processados.`);
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
