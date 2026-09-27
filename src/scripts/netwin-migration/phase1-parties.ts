import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { merge } from '../netwin-migration-kit.js';
import { netwinPartyId, netwinPartyRoleId, deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import type { PhaseStats } from './types.js';

const CANONICAL_PARTY_ROLES = [
  { key: 'manufacturer', roleName: 'manufacturer', label: 'Fabricante', description: 'Quem fabrica o recurso/equipamento' },
  { key: 'supplier', roleName: 'supplier', label: 'Fornecedor', description: 'Quem fornece comercialmente recurso/material' },
  { key: 'maintainer', roleName: 'maintainer', label: 'Mantenedor', description: 'Responsável pela manutenção' },
  { key: 'infrastructure_owner', roleName: 'infrastructure_owner', label: 'Proprietário', description: 'Dono jurídico/econômico da infraestrutura' },
  { key: 'operator', roleName: 'operator', label: 'Operador', description: 'Quem opera tecnicamente a infraestrutura' },
  { key: 'system_integrator', roleName: 'system_integrator', label: 'Integrador', description: 'Empresa responsável por integração/implantação' },
  { key: 'partner', roleName: 'partner', label: 'Parceiro', description: 'Relação ampla de parceria' },
  { key: 'service_provider', roleName: 'service_provider', label: 'Prestador de Serviço', description: 'Organização que presta um serviço operacional' },
  { key: 'tenant', roleName: 'tenant', label: 'Tenant / ISP', description: 'Operadora ou ISP cliente de atacado' },
];

export async function runPhase1Parties(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 1.A & 1.B: Papéis e Organizações (Studio / Party Management) ===');

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();

  try {
    const roleTypeIdMap = new Map<string, string>();

    // 1. Carga de Papéis Canônicos em party_role_type
    if (target) {
      for (const role of CANONICAL_PARTY_ROLES) {
        const roleTypeId = deterministicUuid(
          NEXUS_NETWIN_NAMESPACE,
          `ROLE_TYPE:${ctx.options.tenantId}:${role.key}`,
        );
        await target.execute(
          `MERGE INTO ${ctx.t('party_role_type')} target
           USING (SELECT :1 AS tenant_id, :2 AS type_key FROM DUAL) src
           ON (target.tenant_id = src.tenant_id AND target.type_key = src.type_key)
           WHEN MATCHED THEN
             UPDATE SET role_name = :3, label = :4, description = :5, active = 1, updated_at = CURRENT_TIMESTAMP
           WHEN NOT MATCHED THEN
             INSERT (id, tenant_id, type_key, role_name, label, description, active, created_at, updated_at)
             VALUES (:6, :7, :8, :9, :10, :11, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            ctx.options.tenantId,
            role.key,
            role.roleName,
            role.label,
            role.description,
            roleTypeId,
            ctx.options.tenantId,
            role.key,
            role.roleName,
            role.label,
            role.description,
          ],
          { autoCommit: false },
        );
      }

      // Carrega mapeamento de IDs de PartyRoleType para vincular em tmf_party_role
      const roleTypeRes = await target.execute<{ ID: string; TYPE_KEY: string; ROLE_NAME: string }>(
        `SELECT id, type_key, role_name FROM ${ctx.t('party_role_type')} WHERE tenant_id = :1`,
        [ctx.options.tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const row of roleTypeRes.rows ?? []) {
        roleTypeIdMap.set(row.TYPE_KEY.toLowerCase(), row.ID);
        roleTypeIdMap.set(row.ROLE_NAME.toLowerCase(), row.ID);
      }
      console.log(`Papéis cadastrados/atualizados em party_role_type: ${CANONICAL_PARTY_ROLES.length}`);

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

      const ownerRoleId = roleTypeIdMap.get('infrastructure_owner');
      await merge(target, ctx.t, 'tmf_party_role', ['id'], {
        id: `role-${ownerId}-owner`,
        tenant_id: ctx.options.tenantId,
        party_id: ownerId,
        role_type_id: ownerRoleId ?? null,
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

    const mfgRoleId = roleTypeIdMap.get('manufacturer');

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

        // Upsert PartyRole (Manufacturer) com vínculo ao role_type_id
        await merge(target, ctx.t, 'tmf_party_role', ['id'], {
          id: roleId,
          tenant_id: ctx.options.tenantId,
          party_id: partyId,
          role_type_id: mfgRoleId ?? null,
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
