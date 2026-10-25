import { describe, expect, it, vi } from 'vitest';
import oracledb from 'oracledb';
import { runPhase2StationRacks } from '../src/scripts/netwin-migration/phase2-station-internal-plant.js';
import { parseCliArgs } from '../src/scripts/normalize-netwin-phase2-contained-resources.js';
import {
  deterministicUuid,
  netwinInternalRackId,
  netwinInternalSubrackId,
  netwinLocationId,
  netwinRelationshipId,
  NEXUS_NETWIN_NAMESPACE,
} from '../src/scripts/netwin-migration/identity.js';
import type { MigrationContext } from '../src/scripts/netwin-migration/context.js';
import type { CliOptions } from '../src/scripts/netwin-migration/types.js';

describe('normalize-netwin-phase2-contained-resources: parseCliArgs', () => {
  it('aplica defaults seguros quando nenhuma flag é passada', () => {
    const opts = parseCliArgs([], {});
    expect(opts.targetPrefix).toBe('NX_DEV16_');
    expect(opts.tenantId).toBe('vtal');
    expect(opts.batchSize).toBe(10000);
    expect(opts.apply).toBe(false);
    expect(opts.confirmed).toBe(false);
  });

  it('faz parse correto de argumentos customizados e flags de confirmação', () => {
    const opts = parseCliArgs([
      '--target-prefix',
      'NX_CUSTOM_',
      '--tenant-id',
      'tenant-abc',
      '--batch-size',
      '5000',
      '--apply',
      '--confirm-normalize-containment-places',
    ]);
    expect(opts.targetPrefix).toBe('NX_CUSTOM_');
    expect(opts.tenantId).toBe('tenant-abc');
    expect(opts.batchSize).toBe(5000);
    expect(opts.apply).toBe(true);
    expect(opts.confirmed).toBe(true);
  });

  it('limita batchSize dentro dos limites aceitáveis (100 a 50000)', () => {
    expect(parseCliArgs(['--batch-size', '10']).batchSize).toBe(100);
    expect(parseCliArgs(['--batch-size', '999999']).batchSize).toBe(50000);
  });
});

describe('phase2-station-internal-plant: regra canônica de place_id', () => {
  it('gera Rack raiz com place_id do Site e Subrack contido com place_id null e place_type null', async () => {
    const rackSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:Netwin Rack');
    const subrackSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:Netwin Shelf');
    const siteId = netwinLocationId(555);

    const capturedResources: Array<Record<string, unknown>> = [];
    const capturedRelationships: Array<Record<string, unknown>> = [];

    // Mock do source (Netwin)
    const mockSource = {
      execute: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('NETWIN.LOCATION')) {
          // Primeira página retorna [555], segunda retorna vazio para encerrar o loop
          const lastIdMatch = sql.match(/:lastId/);
          if (lastIdMatch) {
            return { rows: [{ ID: 555 }] };
          }
          return { rows: [{ ID: 555 }] };
        }
        if (sql.includes('ISP_INS_BASTIDOR')) {
          return {
            rows: [
              {
                ID_BD_BASTIDOR: 10,
                ID_BD_PI: 555,
                NOME: 'Bastidor 01',
                CODIGO: 'BST01',
                ID_BD_TIPO_BASTIDOR: null,
                ESTADO_CICLO_VIDA: 1,
                ESTADO_OPERACIONAL: 1,
                FIADA: '1',
                POSICAO: 'A',
                TIPO_SIGLA: 'RACK',
                TIPO_NOME: 'Netwin Rack',
              },
            ],
          };
        }
        if (sql.includes('ISP_INS_SUBBASTIDOR')) {
          return {
            rows: [
              {
                ID_BD_SUBBASTIDOR: 20,
                ID_BD_BASTIDOR: 10,
                NOME: 'Shelf 01',
                CODIGO: 'SHF01',
                CODIGOSB: 'SHF01',
                ID_BD_TIPO_SUBBASTIDOR: null,
                ESTADO_CICLO_VIDA: 1,
                ESTADO_OPERACIONAL: 1,
                POSICAO: '1',
                TIPO_SIGLA: 'SHELF',
                TIPO_NOME: 'Netwin Shelf',
              },
            ],
          };
        }
        return { rows: [] };
      }),
      close: vi.fn(),
    };

    // Controla término de páginas do cursor de LOCATION
    let locationPageCount = 0;
    mockSource.execute = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('NETWIN.LOCATION')) {
        if (locationPageCount === 0) {
          locationPageCount++;
          return { rows: [{ ID: 555 }] };
        }
        return { rows: [] };
      }
      if (sql.includes('ISP_INS_BASTIDOR')) {
        return {
          rows: [
            {
              ID_BD_BASTIDOR: 10,
              ID_BD_PI: 555,
              NOME: 'Bastidor 01',
              CODIGO: 'BST01',
              ID_BD_TIPO_BASTIDOR: null,
              ESTADO_CICLO_VIDA: 1,
              ESTADO_OPERACIONAL: 1,
              FIADA: '1',
              POSICAO: 'A',
              TIPO_SIGLA: 'RACK',
              TIPO_NOME: 'Netwin Rack',
            },
          ],
        };
      }
      if (sql.includes('ISP_INS_SUBBASTIDOR')) {
        return {
          rows: [
            {
              ID_BD_SUBBASTIDOR: 20,
              ID_BD_BASTIDOR: 10,
              NOME: 'Shelf 01',
              CODIGO: 'SHF01',
              CODIGOSB: 'SHF01',
              ID_BD_TIPO_SUBBASTIDOR: null,
              ESTADO_CICLO_VIDA: 1,
              ESTADO_OPERACIONAL: 1,
              POSICAO: '1',
              TIPO_SIGLA: 'SHELF',
              TIPO_NOME: 'Netwin Shelf',
            },
          ],
        };
      }
      return { rows: [] };
    });

    // Mock do target (Nexus Destination)
    const mockTarget = {
      execute: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('resource_specification')) {
          return { rows: [{ ID: rackSpecId }, { ID: subrackSpecId }] };
        }
        if (sql.includes('geographic_site')) {
          return { rows: [{ ID: siteId }] };
        }
        if (sql.includes('MERGE INTO') && sql.includes('resource_physical')) {
          return { rowsAffected: 2 };
        }
        if (sql.includes('MERGE INTO') && sql.includes('resource_relationship')) {
          return { rowsAffected: 1 };
        }
        return { rows: [] };
      }),
      executeMany: vi.fn().mockImplementation(async (sql: string, data: unknown[][]) => {
        if (sql.includes('resource_physical')) {
          // Deserializa os dados inseridos
          // columns: id, tenant_id, name, resource_specification_id, status, status_code, place_id, place_type, ...
          for (const row of data) {
            capturedResources.push({
              id: row[0],
              tenant_id: row[1],
              name: row[2],
              resource_specification_id: row[3],
              status: row[4],
              status_code: row[5],
              place_id: row[6],
              place_type: row[7],
            });
          }
        }
        if (sql.includes('resource_relationship')) {
          // columns: id, resource_from_id, resource_to_id, relationship_type
          for (const row of data) {
            capturedRelationships.push({
              id: row[0],
              resource_from_id: row[1],
              resource_to_id: row[2],
              relationship_type: row[3],
            });
          }
        }
        return { batchErrors: [] };
      }),
      close: vi.fn(),
    };

    const options: CliOptions = {
      phase: '2d',
      targetPrefix: 'TEST_',
      tenantId: 'vtal',
      ownerPartyId: 'party-vtal',
      batchSize: 100,
      scope: { full: true },
      apply: true,
      resume: false,
      maxRecords: 10,
    };

    const ctx: MigrationContext = {
      options,
      t: (table: string) => `TEST_${table}`,
      getSourceConnection: async () => mockSource as unknown as oracledb.Connection,
      getTargetConnection: async () => mockTarget as unknown as oracledb.Connection,
      getTargetReadConnection: async () => mockTarget as unknown as oracledb.Connection,
      close: async () => {},
    };

    const stats = await runPhase2StationRacks(ctx);

    expect(stats.racks).toBe(1);
    expect(stats.subracks).toBe(1);

    // Valida recursos gerados
    expect(capturedResources).toHaveLength(2);

    const rack = capturedResources.find((r) => r.id === netwinInternalRackId(10));
    const subrack = capturedResources.find((r) => r.id === netwinInternalSubrackId(20));

    expect(rack).toBeDefined();
    expect(subrack).toBeDefined();

    // REGRA DE OURO:
    // O Bastidor (nó raiz físico) deve ter place_id preenchido com o Site da Sala/Estação
    expect(rack?.place_id).toBe(siteId);
    expect(rack?.place_type).toBe('GeographicSite');

    // O Subrack (recurso contido) deve ter place_id = null e place_type = null
    expect(subrack?.place_id).toBeNull();
    expect(subrack?.place_type).toBeNull();

    // Relação de contenção
    expect(capturedRelationships).toHaveLength(1);
    expect(capturedRelationships[0]).toEqual({
      id: netwinRelationshipId(String(rack?.id), String(subrack?.id), 'containsAsChild'),
      resource_from_id: rack?.id,
      resource_to_id: subrack?.id,
      relationship_type: 'containsAsChild',
    });
  });
});
