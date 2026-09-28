import { describe, expect, it } from 'vitest';
import {
  deterministicUuid,
  netwinCableId,
  netwinInternalCardId,
  netwinInternalEquipmentId,
  netwinInternalPhysicalPortId,
  netwinInternalRackId,
  netwinInternalSlotId,
  netwinInternalSubrackId,
  netwinEquipmentId,
  netwinLocationId,
  netwinPartyId,
  netwinRouteId,
  NEXUS_NETWIN_NAMESPACE,
} from '../src/scripts/netwin-migration/identity.js';
import {
  neighborhoodLocationIdQuery,
  parseAddressString,
} from '../src/scripts/netwin-migration/phase2-locations.js';
import {
  chunksOf,
  fullTableIdQuery,
  namedInBinds,
  resourceIdsByInfranodesQuery,
  resourceIdsByStructuredInfranodeQuery,
  scopedInfranodeIdQuery,
} from '../src/scripts/netwin-migration/source-batches.js';
import {
  isCompatiblePortSpecification,
  parseSplitterRatio,
  resolveCanonicalCdoParents,
} from '../src/scripts/netwin-migration/phase2-internal-plant.js';
import { isStationPlantDiscoveryBlocked } from '../src/scripts/netwin-migration/phase2-station-internal-plant.js';
import { CANONICAL_SITE_SPECS } from '../src/scripts/netwin-migration/phase1-site-specs.js';
import {
  CANONICAL_RESOURCE_TYPES,
  formatResourceCatalogLoadSummary,
} from '../src/scripts/netwin-migration/phase1-resource-specs.js';
import {
  enqueueNativeRelationships,
  NATIVE_MAPPING_VERSION,
  nativeScopeKey,
  reconcileNativeRelationships,
  summarizeNativeRelationships,
} from '../src/scripts/netwin-migration/checkpoint.js';
import { assertReadOnlySourceSql } from '../src/scripts/netwin-migration/context.js';
import { bulkMergeRows, mergeSql } from '../src/scripts/netwin-migration-kit.js';
import { parseCliArgs } from '../src/scripts/netwin-migration/index.js';
import {
  assertReconciliationInvocation,
  parseReconciliationOptions,
  selectIdentityColumns,
} from '../src/scripts/reconcile-netwin-tenant.js';
import {
  assertPhase2cContainmentRepairInvocation,
  classifyPhase2cContainment,
  parsePhase2cContainmentRepairOptions,
  parsePhase2cPortProvenance,
} from '../src/scripts/reconcile-netwin-phase2c-containment.js';
import type { ResourceTypeItem } from '../src/scripts/netwin-migration/phase1-resource-specs.js';

function sharedTypeIdByCode(
  rows: Array<{ id: string; code: string; tenantId: string }>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!result.has(row.code) || row.tenantId === 'default') result.set(row.code, row.id);
  }
  return result;
}

const canonicalType = (code: string): ResourceTypeItem | undefined =>
  CANONICAL_RESOURCE_TYPES.find((resourceType) => resourceType.code === code);

describe('netwin-migration: identity & deterministic UUIDs', () => {
  const UUID_V5_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('gera UUIDs v5 válidos no padrão RFC 4122', () => {
    const id = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'TEST:123');
    expect(id).toMatch(UUID_V5_REGEX);
  });

  it('é 100% determinístico para o mesmo input', () => {
    const id1 = netwinLocationId(475412);
    const id2 = netwinLocationId(475412);
    expect(id1).toBe(id2);
  });

  it('garante isolamento por namespace mesmo quando o ID numérico é idêntico', () => {
    const locId = netwinLocationId(100);
    const eqId = netwinEquipmentId(100);
    const cableId = netwinCableId(100);
    const routeId = netwinRouteId(100);
    const partyId = netwinPartyId(100);
    const internalIds = [
      netwinInternalRackId(100),
      netwinInternalSubrackId(100),
      netwinInternalEquipmentId(100),
      netwinInternalCardId(100),
      netwinInternalSlotId(100),
      netwinInternalPhysicalPortId(100),
    ];

    const ids = new Set([locId, eqId, cableId, routeId, partyId, ...internalIds]);
    expect(ids.size).toBe(11);
  });
});

describe('netwin-migration: Fase 2.C CDO canônica', () => {
  it('reutiliza a CDO OSP canônica como pai de portas ISP', () => {
    const result = resolveCanonicalCdoParents([
      {
        ID_BD_EQUIPAMENTO: 15,
        ID_BD_EQUIPAMENTO_OSP: 42,
        ID_BD_LOCAL: 99,
        ID_BD_TIPO_NE: 271,
      },
    ]);

    expect(result.rejectedEquipmentIds).toEqual(new Set());
    expect(result.parents.get(15)).toMatchObject({
      ispEquipmentId: 15,
      ospEquipmentId: 42,
      resourceId: netwinEquipmentId(42),
    });
  });

  it('rejeita ponte ISP→OSP ambígua em vez de criar uma CDO duplicada', () => {
    const result = resolveCanonicalCdoParents([
      { ID_BD_EQUIPAMENTO: 15, ID_BD_EQUIPAMENTO_OSP: 42, ID_BD_LOCAL: 99, ID_BD_TIPO_NE: 271 },
      { ID_BD_EQUIPAMENTO: 15, ID_BD_EQUIPAMENTO_OSP: 43, ID_BD_LOCAL: 99, ID_BD_TIPO_NE: 271 },
    ]);

    expect(result.parents.has(15)).toBe(false);
    expect(result.rejectedEquipmentIds).toEqual(new Set([15]));
  });

  it('faz o parse correto de razão de divisão de splitters ópticos', () => {
    expect(
      parseSplitterRatio(
        'SPLITTER 1:8 NC - SC/APC (CONECTORIZADO)',
        'SPLITTER 1:8 NC - SC/APC',
        'SPLITTER 1:8',
      ),
    ).toBe(8);
    expect(parseSplitterRatio('SPLITTER 1:2', 'SPLITTER 1:2', 'SPLITTER 1:2')).toBe(2);
    expect(parseSplitterRatio('SPLITTER 1:16', 'SPL 1:16', '1:16')).toBe(16);
    expect(parseSplitterRatio('SPLITTER 1:32', 'SPL 1:32', '1:32')).toBe(32);
    expect(parseSplitterRatio('SPLITTER 1:64', 'SPL 1:64', '1:64')).toBe(64);
    expect(parseSplitterRatio('SPLITTER 1:4', 'SPL 1:4', '1:4')).toBe(4);
    expect(parseSplitterRatio('SPLITTER 1X8', 'SPL 1X8', '1X8')).toBe(8);
    expect(parseSplitterRatio('DESCONHECIDO', null, null)).toBe(8); // fallback
  });

  it('aceita Netwin Port associado a ResourceType compartilhado ou tenant-local', () => {
    expect(
      isCompatiblePortSpecification({ tenantId: 'vtal', resourceTypeCode: 'Port' }, 'vtal'),
    ).toBe(true);
    expect(
      isCompatiblePortSpecification({ tenantId: 'default', resourceTypeCode: 'Port' }, 'vtal'),
    ).toBe(false);
    expect(
      isCompatiblePortSpecification({ tenantId: 'vtal', resourceTypeCode: 'Splitter' }, 'vtal'),
    ).toBe(false);
    expect(isCompatiblePortSpecification(undefined, 'vtal')).toBe(false);
  });
});

describe('netwin-migration: Fase 2.A por bairro', () => {
  it('pagina somente PI_ID da view geográfica antes de hidratar NETWIN.LOCATION', () => {
    const query = neighborhoodLocationIdQuery([
      'NETWIN.LIMPASTRING(infranode.BAIRRO) = :bairro',
      'NETWIN.LIMPASTRING(infranode.BADDR_MUNICIPIO) = :municipio',
    ]);

    expect(query).toContain('SELECT DISTINCT infranode.PI_ID');
    expect(query).toContain('FROM NETWINOI.DL_INFRANODE infranode');
    expect(query).toContain('infranode.PI_ID > :lastId');
    expect(query).toContain('ORDER BY infranode.PI_ID');
    expect(query).toContain('WHERE ROWNUM <= :batchSize');
    expect(query).not.toContain('NETWIN.LOCATION');
  });
});

describe('netwin-migration: seleção e hidratação em lote', () => {
  it('descobre IDs estruturados sem JOIN, endereço, WKT ou agregação', () => {
    const query = scopedInfranodeIdQuery([
      'NETWIN.LIMPASTRING(infranode.BADDR_MUNICIPIO) = :municipio',
    ]);

    expect(query).toContain('SELECT DISTINCT infranode.PI_ID');
    expect(query).toContain('ORDER BY infranode.PI_ID');
    expect(query).not.toMatch(/NETWIN\.LOCATION|ADDRESS|WKT|GROUP BY|LIKE/i);
  });

  it('pagina a carga full somente pela chave da tabela', () => {
    const query = fullTableIdQuery('NETWIN.OSP_EQUIPMENT');
    expect(query).toContain('FROM NETWIN.OSP_EQUIPMENT');
    expect(query).toContain('WHERE ID > :lastId');
    expect(query).toContain('ORDER BY ID');
    expect(query).not.toMatch(/WKT|ADDRESS|GROUP BY/i);
  });

  it('seleciona equipamentos de bairro pelo índice estruturado antes da hidratação', () => {
    const query = resourceIdsByStructuredInfranodeQuery('NETWIN.OSP_EQUIPMENT', 'INFRANODE_ID', [
      'NETWIN.LIMPASTRING(infranode.BAIRRO) = :bairro',
    ]);
    expect(query).toContain('JOIN NETWINOI.DL_INFRANODE infranode');
    expect(query).toContain('resource.INFRANODE_ID');
    expect(query).toContain('SELECT resource.ID');
    expect(query).not.toMatch(/WKT|ADDRESS|GROUP BY|LIKE/i);
  });

  it('pagina recursos por âncoras EXCHANGE em blocos sem hidratar geometria', () => {
    const query = resourceIdsByInfranodesQuery('NETWIN.OSP_CABLE', 'EXCHANGE_ID');
    expect(query).toContain('FROM NETWIN.OSP_CABLE source_resource');
    expect(query).toContain('source_resource.EXCHANGE_ID IN (__INFRANODE_IDS__)');
    expect(query).toContain('source_resource.ID > :lastId');
    expect(query).toContain('ORDER BY source_resource.ID');
    expect(query).not.toMatch(/WKT|ADDRESS|GROUP BY|LIKE/i);
  });

  it('mantém binds nomeados e chunks abaixo do limite Oracle', () => {
    const ids = Array.from({ length: 1_801 }, (_, index) => index + 1);
    const chunks = chunksOf(ids);
    expect(chunks.map((chunk) => chunk.length)).toEqual([900, 900, 1]);
    expect(namedInBinds([12, 34], 'location')).toEqual({
      clause: ':location0, :location1',
      binds: { location0: 12, location1: 34 },
    });
  });
});

describe('netwin-migration: address parsing', () => {
  it('faz o parse correto de endereço padrão Netwin', () => {
    const raw = 'RUA ATAULPHO COUTINHO, 80, BLOCO 1, BARRA DA TIJUCA, RIO DE JANEIRO - RJ 22793520';
    const parsed = parseAddressString(raw);
    expect(parsed).toEqual({
      street: 'RUA ATAULPHO COUTINHO',
      streetNr: '80',
      locality: 'BARRA DA TIJUCA',
      city: 'RIO DE JANEIRO',
      stateOrProvince: 'RJ',
      postcode: '22793520',
    });
  });

  it('retorna null para endereço vazio', () => {
    expect(parseAddressString('')).toBeNull();
    expect(parseAddressString(null)).toBeNull();
  });
});

describe('netwin-migration: gate da Fase 2.D', () => {
  it('bloqueia a finalização enquanto restarem contratos de planta interna', () => {
    expect(
      isStationPlantDiscoveryBlocked({ unresolvedContracts: ['Contrato ISP pendente'] } as never),
    ).toBe(true);
    expect(isStationPlantDiscoveryBlocked({ unresolvedContracts: [] } as never)).toBe(false);
  });
});

describe('netwin-migration: CLI', () => {
  it('aceita a execução independente das Fases 2.C e 2.D', () => {
    expect(parseCliArgs(['--phase', '2c', '--municipio', 'Niterói']).phase).toBe('2c');
    expect(parseCliArgs(['--phase', '2d', '--municipio', 'Niterói']).phase).toBe('2d');
  });

  it('aceita bairro somente quando associado a município ou UF', () => {
    expect(
      parseCliArgs(['--phase', '2', '--municipio', 'Niterói', '--bairro', 'Icaraí']).scope,
    ).toMatchObject({ municipio: 'Niterói', bairro: 'Icaraí', full: false });
    expect(() => parseCliArgs(['--phase', '2', '--bairro', 'Icaraí'])).toThrow(/bairro exige/i);
    expect(() => parseCliArgs(['--phase', '2', '--full', '--bairro', 'Icaraí'])).toThrow(
      /não pode ser combinado/i,
    );
  });

  it('rejeita fases desconhecidas', () => {
    expect(() => parseCliArgs(['--phase', 'inside-plant', '--full'])).toThrow(/Fase inválida/);
  });

  it('mantém default até que o contexto exija tenant explícito em APPLY', () => {
    expect(parseCliArgs(['--phase', '1']).tenantId).toBe('default');
    expect(parseCliArgs(['--phase', '1', '--tenant-id', 'vtal', '--apply']).tenantId).toBe('vtal');
  });

  it('exige APPLY e identificador para retomar job persistido', () => {
    expect(() => parseCliArgs(['--phase', '2', '--full', '--resume'])).toThrow(/--apply/i);
    expect(() => parseCliArgs(['--phase', '2', '--full', '--apply', '--resume'])).toThrow(
      /--job-id/i,
    );
    expect(() => parseCliArgs(['--phase', '2', '--full', '--job-id', 'job-1'])).toThrow(/--apply/i);
    expect(
      parseCliArgs(['--phase', '2', '--full', '--apply', '--resume', '--job-id', 'job-1']),
    ).toMatchObject({ apply: true, resume: true, jobId: 'job-1' });
  });
});

describe('netwin-migration: checkpoint nativo', () => {
  it('normaliza a chave de escopo persistida e mantém versão explícita', () => {
    expect(NATIVE_MAPPING_VERSION).toMatch(/^netwin-native-phase2-v\d+$/);
    expect(
      nativeScopeKey({
        options: {
          scope: { full: false, uf: 'rj', municipio: 'Niterói', bairro: 'Icaraí' },
        },
      } as never),
    ).toBe('uf:RJ|municipio:NITEROI|bairro:ICARAI');
    expect(nativeScopeKey({ options: { scope: { full: true } } } as never)).toBe('full');
  });
});

describe('netwin-migration: relações topológicas pendentes', () => {
  const t = (table: string) => `NX_TEST_${table.toUpperCase()}`;
  const ctx = {
    options: { jobId: 'job-1', tenantId: 'vtal' },
    t,
  } as never;

  it('enfileira relações por INSERT estrito em chunks, sem reconciliar o lote', async () => {
    const calls: Array<{ sql: string; binds: unknown[][]; options: unknown }> = [];
    const target = {
      executeMany: async (sql: string, binds: unknown[][], options: unknown) => {
        calls.push({ sql, binds, options });
        return { rowsAffected: binds.length };
      },
      execute: async () => {
        throw new Error('não deveria reconciliar durante o lote');
      },
    };
    const relationships = [
      {
        resource_from_id: 'equipment-a',
        resource_to_id: 'cable-a',
        relationship_type: 'connectedTo',
      },
      {
        resource_from_id: 'cable-a',
        resource_to_id: 'route-a',
        relationship_type: 'supportedBy',
      },
      {
        resource_from_id: 'cable-b',
        resource_to_id: 'route-b',
        relationship_type: 'supportedBy',
      },
    ];

    await expect(enqueueNativeRelationships(target as never, ctx, relationships, 2)).resolves.toBe(
      3,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toContain('INSERT INTO NX_TEST_NETWIN_MIG_NATIVE_RELATIONSHIP');
    expect(calls[0]?.sql).not.toContain('MERGE');
    expect(calls[0]?.sql).toContain('created_at');
    expect(calls[0]?.binds).toHaveLength(2);
    expect(calls[1]?.binds).toHaveLength(1);
    expect(calls[0]?.binds[0]?.slice(0, 4)).toEqual([
      'job-1',
      'equipment-a',
      'cable-a',
      'connectedTo',
    ]);
    expect(calls[0]?.binds[0]?.[4]).toBeInstanceOf(Date);
    expect(calls[0]?.binds[0]?.[4]).toBe(calls[1]?.binds[0]?.[4]);
    expect(calls[0]?.options).toEqual({ autoCommit: false });
  });

  it('propaga falha da fila sem tolerar duplicidade silenciosamente', async () => {
    const duplicate = new Error('ORA-00001: unique constraint violated');
    const target = {
      executeMany: async () => {
        throw duplicate;
      },
    };

    await expect(
      enqueueNativeRelationships(
        target as never,
        ctx,
        [
          {
            resource_from_id: 'equipment-a',
            resource_to_id: 'cable-a',
            relationship_type: 'connectedTo',
          },
        ],
        1000,
      ),
    ).rejects.toBe(duplicate);
  });

  it('não tenta enfileirar relação sem job persistido', async () => {
    const target = {
      executeMany: async () => {
        throw new Error('não deveria persistir');
      },
    };
    await expect(
      enqueueNativeRelationships(
        target as never,
        { options: { tenantId: 'vtal' }, t } as never,
        [
          {
            resource_from_id: 'equipment-a',
            resource_to_id: 'cable-a',
            relationship_type: 'connectedTo',
          },
        ],
        1000,
      ),
    ).resolves.toBe(0);
  });

  it('reconcilia somente os extremos físicos existentes no tenant do job', async () => {
    let sql = '';
    const target = {
      execute: async (value: string) => {
        sql = value;
        return { rowsAffected: 2 };
      },
    };
    await expect(reconcileNativeRelationships(target as never, ctx)).resolves.toBe(2);
    expect(sql).toContain('pending.job_id = :jobId');
    expect(sql).toContain('source_resource.tenant_id = :tenantId');
    expect(sql).toContain('target_resource.tenant_id = :tenantId');
  });

  it('resume filas preexistentes e resume pendências por extremo ausente', async () => {
    let sql = '';
    const target = {
      execute: async (value: string) => {
        sql = value;
        return {
          rows: [
            {
              TOTAL: 12,
              ELIGIBLE: 7,
              MISSING_SOURCE: 2,
              MISSING_TARGET: 1,
              MISSING_BOTH: 2,
            },
          ],
        };
      },
    };

    await expect(summarizeNativeRelationships(target as never, ctx)).resolves.toEqual({
      total: 12,
      eligible: 7,
      missingSource: 2,
      missingTarget: 1,
      missingBoth: 2,
    });
    expect(sql).toContain('pending.job_id = :jobId');
    expect(sql).toContain('LEFT JOIN NX_TEST_TMF_PHYSICAL_RESOURCE source_resource');
    expect(sql).toContain('LEFT JOIN NX_TEST_TMF_PHYSICAL_RESOURCE target_resource');
    expect(sql).toContain('source_resource.tenant_id = :tenantId');
    expect(sql).toContain('target_resource.tenant_id = :tenantId');
  });
});

describe('netwin-migration: tenant safety', () => {
  it('exige flags conjuntas para escrever a reconciliação target-only', () => {
    expect(() =>
      assertReconciliationInvocation(parseReconciliationOptions(['--apply']), 'NX_DEV1_'),
    ).toThrow(/confirm-netwin-tenant-reconciliation/i);
    expect(() =>
      assertReconciliationInvocation(
        parseReconciliationOptions(['--confirm-netwin-tenant-reconciliation']),
        'NX_DEV1_',
      ),
    ).toThrow(/exige --apply/i);
  });

  it('aceita o reparo confirmado apenas no namespace NX_DEV1_', () => {
    expect(() =>
      assertReconciliationInvocation(
        parseReconciliationOptions(['--apply', '--confirm-netwin-tenant-reconciliation']),
        'NX_DEV1_',
      ),
    ).not.toThrow();
    expect(() =>
      assertReconciliationInvocation(
        parseReconciliationOptions(['--apply', '--confirm-netwin-tenant-reconciliation']),
        'NEXUS_DEV_',
      ),
    ).toThrow(/só pode operar/i);
  });

  it('seleciona chave de colisão por id, PK ou UNIQUE sem tenant', () => {
    expect(selectIdentityColumns(['id', 'tenant_id'], [])).toEqual(['id']);
    expect(
      selectIdentityColumns(
        ['tenant_id', 'tile_z', 'tile_x'],
        [
          {
            constraintName: 'PK_TILE',
            constraintType: 'P',
            columns: ['tenant_id', 'tile_z', 'tile_x'],
          },
        ],
      ),
    ).toEqual(['tile_z', 'tile_x']);
    expect(selectIdentityColumns(['tenant_id'], [])).toEqual([]);
  });
});

describe('netwin-migration: reparo target-only da Fase 2.C', () => {
  const characteristics = JSON.stringify([
    { group: '_origin', name: 'parentOspEquipmentId', value: '42', valueType: 'string' },
    { group: '_origin', name: 'parentIspEquipmentId', value: '15', valueType: 'string' },
  ]);

  it('exige prefixo, tenant e confirmação explícita para escrita', () => {
    expect(() =>
      assertPhase2cContainmentRepairInvocation(
        parsePhase2cContainmentRepairOptions(['--tenant-id', 'vtal', '--apply']),
        'NX_DEV1_',
      ),
    ).toThrow(/confirm-netwin-phase2c-containment-repair/i);
    expect(() =>
      assertPhase2cContainmentRepairInvocation(
        parsePhase2cContainmentRepairOptions([
          '--tenant-id',
          'default',
          '--apply',
          '--confirm-netwin-phase2c-containment-repair',
        ]),
        'NX_DEV1_',
      ),
    ).toThrow(/--tenant-id vtal/i);
    expect(() =>
      assertPhase2cContainmentRepairInvocation(
        parsePhase2cContainmentRepairOptions([
          '--tenant-id',
          'vtal',
          '--apply',
          '--confirm-netwin-phase2c-containment-repair',
        ]),
        'NX_DEV2_',
      ),
    ).toThrow(/só pode operar/i);
  });

  it('reconhece somente a proveniência explícita da Fase 2.C', () => {
    expect(parsePhase2cPortProvenance(characteristics)).toMatchObject({
      kind: 'valid',
      provenance: { parentOspEquipmentId: 42, parentIspEquipmentId: 15 },
    });
    expect(
      parsePhase2cPortProvenance(JSON.stringify([{ name: 'parentOspEquipmentId', value: 'x' }])),
    ).toEqual({ kind: 'invalid' });
    expect(
      parsePhase2cPortProvenance(JSON.stringify([{ name: 'sourcePortType', value: 'Adapter' }])),
    ).toEqual({
      kind: 'absent',
    });
  });

  it('repara apenas o par legada→canônica e preserva a contenção canônica', () => {
    const canonicalParentId = netwinEquipmentId(42);
    const legacyParentId = netwinInternalEquipmentId(15);
    expect(
      classifyPhase2cContainment({
        portId: 'port-1',
        characteristics,
        parentIds: [legacyParentId, canonicalParentId],
        canonicalParentIsTenantOwned: true,
      }),
    ).toMatchObject({ status: 'repairable', canonicalParentId, legacyParentId });
    expect(
      classifyPhase2cContainment({
        portId: 'port-1',
        characteristics,
        parentIds: [canonicalParentId],
        canonicalParentIsTenantOwned: true,
      }),
    ).toMatchObject({ status: 'already-canonical', canonicalParentId, legacyParentId });
  });

  it('reprova pais canônicos inválidos e pais inesperados', () => {
    const canonicalParentId = netwinEquipmentId(42);
    expect(
      classifyPhase2cContainment({
        portId: 'port-1',
        characteristics,
        parentIds: [canonicalParentId],
        canonicalParentIsTenantOwned: false,
      }).status,
    ).toBe('canonical-parent-invalid');
    expect(
      classifyPhase2cContainment({
        portId: 'port-1',
        characteristics,
        parentIds: [canonicalParentId, 'unrelated-parent'],
        canonicalParentIsTenantOwned: true,
      }).status,
    ).toBe('unexpected-parent');
  });
});

describe('netwin-migration: Oracle MERGE em lote', () => {
  const t = (table: string) => `NX_TEST_${table.toUpperCase()}`;

  it('gera MERGE sem UPDATE quando todas as colunas compõem a chave', () => {
    const sql = mergeSql(
      t,
      'tmf_resource_relationship',
      ['resource_from_id', 'resource_to_id', 'relationship_type'],
      ['resource_from_id', 'resource_to_id', 'relationship_type'],
    );

    expect(sql).not.toContain('WHEN MATCHED THEN UPDATE');
    expect(sql).toContain('WHEN NOT MATCHED THEN INSERT');
  });

  it('divide executeMany em lotes e preserva a ordem declarada dos binds', async () => {
    const calls: Array<{ sql: string; binds: unknown[][] }> = [];
    const connection = {
      executeMany: async (sql: string, binds: unknown[][]) => {
        calls.push({ sql, binds });
        return { rowsAffected: binds.length };
      },
    };
    const rows = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];

    await bulkMergeRows(
      connection as never,
      t,
      'tmf_physical_resource',
      ['id'],
      ['id', 'name'],
      rows,
      2,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.binds).toEqual([
      ['a', 'A'],
      ['b', 'B'],
    ]);
    expect(calls[1]?.binds).toEqual([['c', 'C']]);
    expect(calls[0]?.sql).toContain('WHEN MATCHED THEN UPDATE');
  });

  it('não abre executeMany para lista vazia', async () => {
    const connection = {
      executeMany: async () => {
        throw new Error('não deveria executar');
      },
    };
    await expect(
      bulkMergeRows(connection as never, t, 'tmf_physical_resource', ['id'], ['id'], []),
    ).resolves.toBe(0);
  });
});

describe('netwin-migration: source DR read-only guard', () => {
  it('aceita SELECT e CTEs somente de leitura', () => {
    expect(() => assertReadOnlySourceSql('SELECT 1 FROM dual')).not.toThrow();
    expect(() =>
      assertReadOnlySourceSql(
        '/* descoberta */\nWITH source_rows AS (SELECT 1 FROM dual) SELECT * FROM source_rows',
      ),
    ).not.toThrow();
  });

  it('bloqueia DML, DDL e consultas com bloqueio', () => {
    for (const sql of [
      'INSERT INTO netwin.location (id) VALUES (1)',
      "UPDATE netwin.location SET name = 'x'",
      'SELECT * FROM netwin.location FOR UPDATE',
      'ALTER TABLE netwin.location ADD sample_column NUMBER',
    ]) {
      expect(() => assertReadOnlySourceSql(sql)).toThrow(/bloqueada/i);
    }
  });
});

describe('netwin-migration: phase 1 canonical catalogs', () => {
  it('contém as especificações canônicas de site com categoria e papel funcional (C11)', () => {
    const co = CANONICAL_SITE_SPECS.find((s) => s.code === 'CENTRAL_OFFICE');
    expect(co).toBeDefined();
    expect(co?.category).toBe('Site');
    expect(co?.siteRole).toBe('network');

    const room = CANONICAL_SITE_SPECS.find((s) => s.code === 'ROOM');
    expect(room?.category).toBe('SubSite');
    expect(room?.siteRole).toBe('network');
  });

  it('contém os tipos canônicos de recursos para equipamentos, cabos e civil', () => {
    const codes = new Set(CANONICAL_RESOURCE_TYPES.map((r) => r.code));
    expect(codes.has('category:CDOE')).toBe(true);
    expect(codes.has('SpliceClosure')).toBe(true);
    expect(codes.has('BackboneCable')).toBe(true);
    expect(codes.has('Pole')).toBe(true);
    expect(codes.has('Manhole')).toBe(true);
    expect(codes.has('Port')).toBe(true);
    expect(codes.has('Splitter')).toBe(true);
  });

  it('prioriza o ResourceType compartilhado para Port e Splitter', () => {
    const resolved = sharedTypeIdByCode([
      { id: 'vtal-port', code: 'Port', tenantId: 'vtal' },
      { id: 'rt-port', code: 'Port', tenantId: 'default' },
      { id: 'vtal-splitter', code: 'Splitter', tenantId: 'vtal' },
      { id: 'rt-splitter', code: 'Splitter', tenantId: 'default' },
    ]);
    expect(resolved.get('Port')).toBe('rt-port');
    expect(resolved.get('Splitter')).toBe('rt-splitter');
    expect(canonicalType('Port')?.name).toBe('Port');
    expect(canonicalType('Splitter')?.name).toBe('Splitter Óptico');
  });

  it('resume a árvore do tenant e orienta a sessão correta do Studio', () => {
    expect(
      formatResourceCatalogLoadSummary('vtal', {
        catalogCode: 'default-catalog',
        catalogName: 'Catálogo de Recursos',
        groupCount: 4,
        resourceTypeNodeCount: 35,
        referencedResourceTypeCount: 35,
        resourceSpecificationCount: 42,
      }),
    ).toContain('tenant=vtal');
    expect(
      formatResourceCatalogLoadSummary('vtal', {
        catalogCode: 'default-catalog',
        catalogName: 'Catálogo de Recursos',
        groupCount: 4,
        resourceTypeNodeCount: 35,
        referencedResourceTypeCount: 35,
        resourceSpecificationCount: 42,
      }),
    ).toContain('mesmo tenant');
  });
});
