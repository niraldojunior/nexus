#!/usr/bin/env node
/**
 * Seed de infraestrutura pública na instância Nexus DEMO — Energia (ANEEL SIGEL).
 *
 * Baixa subestações e linhas de transmissão reais do serviço ArcGIS público do SIGEL, restringe a
 * UFs (default RJ+SP) e grava subestações, linhas e sistemas isolados no modelo que o Nexus já tem:
 * `GeographicSiteSpecification` + `ResourceType` + `ResourceSpecification` no catálogo, e
 * `GeographicLocation` / `GeographicSite` / `PhysicalResource` nas instâncias. Nada de modelo paralelo,
 * nada de coluna nova: atributos da fonte e UF entram como `characteristic` de instância (C1), e a
 * procedência como `_origin.*` (C5).
 *
 * Uso:
 *   npm run seed-demo-infra -- --limit 20                  # ensaio (dry-run), não grava
 *   npm run seed-demo-infra -- --apply --states RJ,SP      # carga real
 *   npm run seed-demo-infra -- --apply --build-features    # carga + índice de tiles do mapa
 *
 * Escreve por SQL direto (padrão dos loaders do repo) e não pelo `ResourceService`: o guarda
 * `assertOriginWriteAllowed` rejeita `_origin.*` sem `MIGRATION_ROLE`, e `_origin` é requisito da
 * entrega. A única exceção é a fase 5, que publica o catálogo do Studio GEO pelo serviço de domínio
 * para herdar a validação do adapter.
 *
 * Ambiente: `ORACLE_CONNECTION_STRING`, `ORACLE_USER`, `ORACLE_PASSWORD` e `ORACLE_OBJECT_PREFIX`
 * (ex.: `NX_DEMO_`) no `.env`. Oracle-only (C10).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import {
  bulkMergeRows,
  configureOracleClient,
  makeTablePrefixer,
  type TablePrefixer,
} from '../../src/scripts/netwin-migration-kit.js';
import { loadConfig } from '../../src/shared/config/env.js';
import { createDatabaseClient } from '../../src/shared/persistence/database-factory.js';
import { createNexusRuntime } from '../../src/shared/runtime/nexus-runtime.js';
import { parseCliArgs, type CliOptions } from './cli.js';
import {
  ISOLATED_SYSTEM_LAYER_ID,
  SUBSTATION_LAYER_ID,
  TRANSMISSION_LINE_LAYER_ID,
  countFeatures,
  fetchLayerFeatures,
} from './aneel.js';
import {
  IBGE_GAS_PIPELINE_LAYER,
  IBGE_RAIL_SEGMENT_LAYER,
  IBGE_RAIL_STATION_LAYER,
  countIbgeFeatures,
  fetchIbgeFeatures,
} from './ibge.js';
import { enrichGasPipelines, fetchAnpGasAuthorizations } from './anp.js';
import {
  ANP_BLOCK_LAYER,
  ANP_FIELD_LAYER,
  ANP_GAS_PROCESSING_LAYER,
  ANP_LIQUID_TERMINAL_LAYER,
  ANP_LNG_TERMINAL_LAYER,
  ANP_REFINERY_LAYER,
  ANP_WELL_LAYER,
  countAnpFeatures,
  fetchAnpFeatures,
} from './anp-geo.js';
import {
  ANP_BLOCK_SPEC,
  ANP_FIELD_SPEC,
  ANP_GAS_PROCESSING_SPEC,
  ANP_LIQUID_TERMINAL_SPEC,
  ANP_LNG_TERMINAL_SPEC,
  ANP_REFINERY_SPEC,
  ANP_WELL_SPEC,
  OIL_BLOCK_RESOURCE_TYPE_CODE,
  OIL_FIELD_RESOURCE_TYPE_CODE,
  OIL_GAS_PROCESSING_RESOURCE_TYPE_CODE,
  OIL_GAS_PROCESSING_SITE_SPEC_CODE,
  OIL_LIQUID_TERMINAL_RESOURCE_TYPE_CODE,
  OIL_LIQUID_TERMINAL_SITE_SPEC_CODE,
  OIL_LNG_TERMINAL_RESOURCE_TYPE_CODE,
  OIL_LNG_TERMINAL_SITE_SPEC_CODE,
  OIL_PIPELINE_RESOURCE_TYPE_CODE,
  OIL_REFINERY_RESOURCE_TYPE_CODE,
  OIL_REFINERY_SITE_SPEC_CODE,
  OIL_WELL_RESOURCE_TYPE_CODE,
  OIL_WELL_SITE_SPEC_CODE,
  mapAnpPointSite,
  mapAnpPolygons,
  mapOilPipeline,
  type AnpPointSpec,
} from './anp-oil.js';
import {
  DEMO_INFRA_NAMESPACE,
  GAS_PIPELINE_RESOURCE_TYPE_CODE,
  ISOLATED_SYSTEM_RESOURCE_TYPE_CODE,
  ISOLATED_SYSTEM_SITE_SPEC_CODE,
  RAIL_SEGMENT_RESOURCE_TYPE_CODE,
  RAIL_STATION_RESOURCE_TYPE_CODE,
  RAIL_STATION_SITE_SPEC_CODE,
  SUBSTATION_RESOURCE_TYPE_CODE,
  SUBSTATION_SITE_SPEC_CODE,
  TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
  bboxForStates,
  dedupeById,
  mapGasPipeline,
  mapIsolatedSystem,
  mapRailSegment,
  mapRailStation,
  mapSubstation,
  mapTransmissionLine,
  type Domain,
  type MappedLine,
  type MappedPointSite,
  type MappedPolygon,
  type MappedSubstation,
  type SigelFeature,
} from './mapper.js';
import {
  LOCATION_COLUMNS,
  RESOURCE_COLUMNS,
  SITE_COLUMNS,
  ensureCatalogGroup,
  ensureResourceSpec,
  ensureResourceTypeForMap,
  ensureSiteSpec,
  existingIds,
  lineResourceRows,
  pointSiteRows,
  polygonResourceRows,
  resolveTenant,
  type LoadPlan,
  type ResourceTypeDef as BaseResourceTypeDef,
  type SiteSpecDef as BaseSiteSpecDef,
} from './oracle-load.js';
import { publishDomainLayers } from './studio-geo.js';

loadEnv();
oracledb.fetchAsString = [oracledb.CLOB];
// No-op quando `ORACLE_CLIENT_LIB_DIR` não está definido (modo Thin); obrigatório nas máquinas que
// dependem do Instant Client, igual aos demais scripts Oracle do repo.
configureOracleClient();

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

type ResourceTypeDef = BaseResourceTypeDef & { domain: Domain };

type SiteSpecDef = BaseSiteSpecDef & { domain: Domain };

const SITE_SPECS: SiteSpecDef[] = [
  {
    code: SUBSTATION_SITE_SPEC_CODE,
    name: 'Subestação de Energia',
    description: 'Subestação de transmissão de energia elétrica (ANEEL SIGEL).',
    domain: 'energy',
  },
  {
    code: ISOLATED_SYSTEM_SITE_SPEC_CODE,
    name: 'Sistema Isolado de Energia',
    description: 'Sistema isolado de energia elétrica (ANEEL SIGEL/ONS).',
    domain: 'energy',
  },
  {
    code: RAIL_STATION_SITE_SPEC_CODE,
    name: 'Estação Ferroviária',
    description: 'Estação ferroviária ou metroviária (IBGE BCIM).',
    domain: 'rail',
  },
  {
    code: OIL_REFINERY_SITE_SPEC_CODE,
    name: 'Refinaria',
    description: 'Refinaria de petróleo (ANP).',
    domain: 'oil',
  },
  {
    code: OIL_GAS_PROCESSING_SITE_SPEC_CODE,
    name: 'UPGN',
    description: 'Unidade de Processamento de Gás Natural (ANP).',
    domain: 'oil',
  },
  {
    code: OIL_LIQUID_TERMINAL_SITE_SPEC_CODE,
    name: 'Terminal de Líquidos',
    description: 'Terminal autorizado de petróleo e derivados (ANP).',
    domain: 'oil',
  },
  {
    code: OIL_LNG_TERMINAL_SITE_SPEC_CODE,
    name: 'Terminal de GNL',
    description: 'Terminal de gás natural liquefeito (ANP).',
    domain: 'oil',
  },
  {
    code: OIL_WELL_SITE_SPEC_CODE,
    name: 'Poço de Petróleo e Gás',
    description: 'Poço de petróleo e gás natural (ANP).',
    domain: 'oil',
  },
];

const RESOURCE_TYPES: ResourceTypeDef[] = [
  {
    code: SUBSTATION_RESOURCE_TYPE_CODE,
    name: 'Subestação de Energia',
    description: 'Subestação de transmissão de energia elétrica (ANEEL SIGEL).',
    geometryKind: 'POINT',
    domain: 'energy',
  },
  {
    code: ISOLATED_SYSTEM_RESOURCE_TYPE_CODE,
    name: 'Sistema Isolado de Energia',
    description: 'Sistema isolado de energia elétrica (ANEEL SIGEL/ONS).',
    geometryKind: 'POINT',
    domain: 'energy',
  },
  {
    code: TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
    name: 'Linha de Transmissão',
    description: 'Linha de transmissão de energia elétrica (ANEEL SIGEL).',
    geometryKind: 'LINE',
    domain: 'energy',
  },
  {
    code: GAS_PIPELINE_RESOURCE_TYPE_CODE,
    name: 'Gasoduto',
    description: 'Trecho de duto de gás e derivados (IBGE BC250).',
    geometryKind: 'LINE',
    domain: 'gas',
  },
  {
    code: RAIL_SEGMENT_RESOURCE_TYPE_CODE,
    name: 'Trecho Ferroviário',
    description: 'Trecho de via férrea (IBGE BC250).',
    geometryKind: 'LINE',
    domain: 'rail',
  },
  {
    code: RAIL_STATION_RESOURCE_TYPE_CODE,
    name: 'Estação Ferroviária',
    description: 'Estação ferroviária ou metroviária (IBGE BCIM).',
    geometryKind: 'POINT',
    domain: 'rail',
  },
  {
    code: OIL_REFINERY_RESOURCE_TYPE_CODE,
    name: 'Refinaria',
    description: 'Refinaria de petróleo (ANP).',
    geometryKind: 'POINT',
    domain: 'oil',
  },
  {
    code: OIL_GAS_PROCESSING_RESOURCE_TYPE_CODE,
    name: 'UPGN',
    description: 'Unidade de Processamento de Gás Natural (ANP).',
    geometryKind: 'POINT',
    domain: 'oil',
  },
  {
    code: OIL_LIQUID_TERMINAL_RESOURCE_TYPE_CODE,
    name: 'Terminal de Líquidos',
    description: 'Terminal autorizado de petróleo e derivados (ANP).',
    geometryKind: 'POINT',
    domain: 'oil',
  },
  {
    code: OIL_LNG_TERMINAL_RESOURCE_TYPE_CODE,
    name: 'Terminal de GNL',
    description: 'Terminal de gás natural liquefeito (ANP).',
    geometryKind: 'POINT',
    domain: 'oil',
  },
  {
    code: OIL_WELL_RESOURCE_TYPE_CODE,
    name: 'Poço de Petróleo e Gás',
    description: 'Poço de petróleo e gás natural (ANP).',
    geometryKind: 'POINT',
    domain: 'oil',
  },
  {
    code: OIL_PIPELINE_RESOURCE_TYPE_CODE,
    name: 'Oleoduto',
    description: 'Trecho de oleoduto ou poliduto (IBGE BC250).',
    geometryKind: 'LINE',
    domain: 'oil',
  },
  {
    code: OIL_FIELD_RESOURCE_TYPE_CODE,
    name: 'Campo de Produção',
    description: 'Campo de produção de petróleo e gás (ANP).',
    geometryKind: 'POLYGON',
    domain: 'oil',
  },
  {
    code: OIL_BLOCK_RESOURCE_TYPE_CODE,
    name: 'Bloco Exploratório',
    description: 'Bloco exploratório de petróleo e gás (ANP).',
    geometryKind: 'POLYGON',
    domain: 'oil',
  },
];

/** Grupo do catálogo de recursos por domínio — faz a árvore aparecer no Inventário. */
const CATALOG_GROUPS: Record<Domain, { code: string; name: string; sortOrder: number }> = {
  energy: { code: 'grp-energia', name: 'Energia', sortOrder: 100 },
  gas: { code: 'grp-gas', name: 'Gás', sortOrder: 110 },
  rail: { code: 'grp-ferrovia', name: 'Ferrovia', sortOrder: 120 },
  oil: { code: 'grp-oleo-gas', name: 'Óleo e Gás', sortOrder: 130 },
};

/** Uma árvore por domínio no catálogo de recursos — faz os grupos aparecerem no Inventário. */
async function ensureCatalogNodes(
  conn: Connection,
  t: TablePrefixer,
  resourceTypeIdByCode: Map<string, string>,
  tenantId: string,
  domains: readonly Domain[],
): Promise<void> {
  for (const domain of domains) {
    const types = RESOURCE_TYPES.filter((type) => type.domain === domain).flatMap((definition) => {
      const resourceTypeId = resourceTypeIdByCode.get(definition.code);
      return resourceTypeId
        ? [{ code: definition.code, name: definition.name, resourceTypeId }]
        : [];
    });
    await ensureCatalogGroup(
      conn,
      t,
      tenantId,
      DEMO_INFRA_NAMESPACE,
      CATALOG_GROUPS[domain],
      types,
    );
  }
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

async function runSeed(options: CliOptions): Promise<void> {
  const prefix = process.env.ORACLE_OBJECT_PREFIX;
  const connectString = process.env.ORACLE_CONNECTION_STRING;
  const user = process.env.ORACLE_USER;
  const password = process.env.ORACLE_PASSWORD;

  console.log('[0] Pré-flight');
  if (!prefix) {
    throw new Error('ORACLE_OBJECT_PREFIX obrigatório (ex.: NX_DEMO_).');
  }
  if (!connectString || !user || !password) {
    throw new Error('ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD são obrigatórios.');
  }
  console.log(`    modo: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`    namespace: ${prefix}`);
  console.log(
    `    UFs: ${options.states.join(', ')}${options.limit ? ` · limite: ${options.limit}` : ''}`,
  );
  console.log(`    domínios: ${options.domains.join(', ')}`);

  const t = makeTablePrefixer(prefix);
  const bbox = bboxForStates(options.states);

  const pool = await oracledb.createPool({ connectString, user, password, poolMin: 1, poolMax: 2 });
  let conn: Connection | null = null;
  // Resolvido dentro do `try`, mas usado pelas fases 5 e 6, que rodam depois de a conexão fechar.
  let tenantId = '';

  try {
    conn = await pool.getConnection();

    // Também falha cedo se a party dona não existir em `party`.
    const resolved = await resolveTenant(conn, t, options);
    tenantId = resolved.tenantId;
    const { ownerPartyId } = resolved;
    const source = options.tenantId ? '--tenant-id' : `${prefix}environment`;
    console.log(`    tenant: ${tenantId} · owner party: ${ownerPartyId} (de ${source})`);

    // --- [1] Catálogo -------------------------------------------------------
    console.log('[1] Catálogo');
    const siteSpecIdByCode = new Map<string, string>();
    const wants = (domain: Domain): boolean => options.domains.includes(domain);
    const siteSpecs = SITE_SPECS.filter((definition) => wants(definition.domain));
    const resourceTypes = RESOURCE_TYPES.filter((definition) => wants(definition.domain));
    for (const definition of siteSpecs) {
      siteSpecIdByCode.set(
        definition.code,
        await ensureSiteSpec(conn, t, definition, DEMO_INFRA_NAMESPACE),
      );
    }
    const resourceTypeIdByCode = new Map<string, string>();
    const resourceSpecIdByCode = new Map<string, string>();
    for (const definition of resourceTypes) {
      const typeId = await ensureResourceTypeForMap(
        conn,
        t,
        definition,
        tenantId,
        DEMO_INFRA_NAMESPACE,
      );
      resourceTypeIdByCode.set(definition.code, typeId);
      resourceSpecIdByCode.set(
        definition.code,
        await ensureResourceSpec(conn, t, definition, typeId, tenantId, DEMO_INFRA_NAMESPACE),
      );
    }
    await ensureCatalogNodes(conn, t, resourceTypeIdByCode, tenantId, options.domains);

    const catalogSummary =
      `${siteSpecs.length} site specs · ${resourceTypes.length} resource types · ` +
      `${resourceTypes.length} specifications · árvores ${options.domains.join('+')}`;
    if (options.apply) {
      await conn.execute('COMMIT');
      console.log(`    ${catalogSummary}`);
    } else {
      await conn.execute('ROLLBACK');
      console.log(`    ${catalogSummary} (não gravado)`);
    }

    // --- [2] Extração -------------------------------------------------------
    console.log('[2] Extração');
    const limitOption = options.limit === undefined ? {} : { limit: options.limit };
    const energy = wants('energy');

    const fetchAneel = async (label: string, layerId: number): Promise<SigelFeature[]> => {
      if (!energy) return [];
      console.log(`    Fetching ANEEL ${label}...`);
      const count = await countFeatures({ layerId, bbox });
      const features = await fetchLayerFeatures({ layerId, bbox, ...limitOption });
      console.log(`    Found: ${features.length} (envelope: ${count})`);
      return features;
    };
    const fetchIbge = async (
      label: string,
      typeName: string,
      domain: Domain,
    ): Promise<SigelFeature[]> => {
      if (!wants(domain)) return [];
      console.log(`    Fetching IBGE ${label}...`);
      const count = await countIbgeFeatures(typeName);
      const features = await fetchIbgeFeatures({ typeName, ...limitOption });
      console.log(`    Found: ${features.length} (nacional: ${count})`);
      return features;
    };

    const fetchAnp = async (
      label: string,
      typeName: string,
      sortBy: string,
    ): Promise<SigelFeature[]> => {
      if (!wants('oil')) return [];
      console.log(`    Fetching ANP ${label}...`);
      const count = await countAnpFeatures(typeName);
      const features = await fetchAnpFeatures({ typeName, sortBy, ...limitOption });
      console.log(`    Found: ${features.length} (nacional: ${count})`);
      return features;
    };

    const substationFeatures = await fetchAneel('substations', SUBSTATION_LAYER_ID);
    const isolatedSystemFeatures = await fetchAneel('isolated systems', ISOLATED_SYSTEM_LAYER_ID);
    const lineFeatures = await fetchAneel('transmission lines', TRANSMISSION_LINE_LAYER_ID);
    const gasFeatures = await fetchIbge('gas pipelines', IBGE_GAS_PIPELINE_LAYER, 'gas');
    const railSegmentFeatures = await fetchIbge('rail segments', IBGE_RAIL_SEGMENT_LAYER, 'rail');
    const railStationFeatures = await fetchIbge('rail stations', IBGE_RAIL_STATION_LAYER, 'rail');

    const oilPipelineFeatures = await fetchIbge('oil pipelines', IBGE_GAS_PIPELINE_LAYER, 'oil');
    const refineryFeatures = await fetchAnp('refinarias', ANP_REFINERY_LAYER, 'SIGLA');
    const gasProcessingFeatures = await fetchAnp('UPGN', ANP_GAS_PROCESSING_LAYER, 'NOME');
    const liquidTerminalFeatures = await fetchAnp(
      'terminais de líquidos',
      ANP_LIQUID_TERMINAL_LAYER,
      'SIMP',
    );
    const lngTerminalFeatures = await fetchAnp('terminais de GNL', ANP_LNG_TERMINAL_LAYER, 'NOME');
    const fieldFeatures = await fetchAnp('campos de produção', ANP_FIELD_LAYER, 'COD_CAMPO');
    const blockFeatures = await fetchAnp('blocos exploratórios', ANP_BLOCK_LAYER, 'COD_BLOCO');
    const wellFeatures = await fetchAnp('poços', ANP_WELL_LAYER, 'CADASTRO');

    // --- [3] Mapeamento -----------------------------------------------------
    console.log('[3] Mapeamento');
    const substations: MappedSubstation[] = [];
    let substationsSkipped = 0;
    for (const feature of substationFeatures) {
      try {
        const mapped = mapSubstation(feature, options.states);
        if (mapped) substations.push(mapped);
        else substationsSkipped += 1;
      } catch (error) {
        // Erro por registro nunca aborta a carga — ver requisito de logs da entrega.
        console.warn(`    ! subestação OID ${String(feature.properties.OID)}: ${String(error)}`);
        substationsSkipped += 1;
      }
    }

    const isolatedSystems: MappedPointSite[] = [];
    let isolatedSystemsSkipped = 0;
    for (const feature of isolatedSystemFeatures) {
      try {
        const mapped = mapIsolatedSystem(feature, options.states);
        if (mapped) isolatedSystems.push(mapped);
        else isolatedSystemsSkipped += 1;
      } catch (error) {
        console.warn(
          `    ! sistema isolado OID ${String(feature.properties.OID)}: ${String(error)}`,
        );
        isolatedSystemsSkipped += 1;
      }
    }

    const lines: MappedLine[] = [];
    let linesSkipped = 0;
    for (const feature of lineFeatures) {
      try {
        const mapped = mapTransmissionLine(feature, options.states);
        if (mapped.length === 0) linesSkipped += 1;
        else lines.push(...mapped);
      } catch (error) {
        console.warn(`    ! linha OID ${String(feature.properties.OID)}: ${String(error)}`);
        linesSkipped += 1;
      }
    }

    // Gás e ferrovia: mesmo laço tolerante a erro por registro.
    const mapLinear = (
      features: SigelFeature[],
      map: (feature: SigelFeature, states: readonly string[]) => MappedLine[],
      label: string,
    ): { items: MappedLine[]; skipped: number } => {
      const items: MappedLine[] = [];
      let skipped = 0;
      for (const feature of features) {
        try {
          const mapped = map(feature, options.states);
          if (mapped.length === 0) skipped += 1;
          else items.push(...mapped);
        } catch (error) {
          console.warn(`    ! ${label} ${String(feature.properties.OID)}: ${String(error)}`);
          skipped += 1;
        }
      }
      return { items, skipped };
    };
    const gas = mapLinear(gasFeatures, mapGasPipeline, 'gasoduto');
    const railSegments = mapLinear(railSegmentFeatures, mapRailSegment, 'trecho ferroviário');

    const railStations: MappedPointSite[] = [];
    let railStationsSkipped = 0;
    for (const feature of railStationFeatures) {
      try {
        const mapped = mapRailStation(feature, options.states);
        if (mapped) railStations.push(mapped);
        else railStationsSkipped += 1;
      } catch (error) {
        console.warn(
          `    ! estação ferroviária ${String(feature.properties.OID)}: ${String(error)}`,
        );
        railStationsSkipped += 1;
      }
    }

    // Óleo e gás: mesmo laço tolerante a erro por registro.
    const mapAnpPoints = (
      features: SigelFeature[],
      spec: AnpPointSpec,
      label: string,
    ): { items: MappedPointSite[]; skipped: number } => {
      const items: MappedPointSite[] = [];
      let skipped = 0;
      for (const feature of features) {
        try {
          const mapped = mapAnpPointSite(feature, options.states, spec);
          if (mapped) items.push(mapped);
          else skipped += 1;
        } catch (error) {
          console.warn(`    ! ${label}: ${String(error)}`);
          skipped += 1;
        }
      }
      return { items: dedupeById(items), skipped };
    };
    const mapAnpPolygonSet = (
      features: SigelFeature[],
      spec: Parameters<typeof mapAnpPolygons>[2],
      label: string,
    ): { items: MappedPolygon[]; skipped: number } => {
      const items: MappedPolygon[] = [];
      let skipped = 0;
      for (const feature of features) {
        try {
          const mapped = mapAnpPolygons(feature, options.states, spec);
          if (mapped.length === 0) skipped += 1;
          else items.push(...mapped);
        } catch (error) {
          console.warn(`    ! ${label}: ${String(error)}`);
          skipped += 1;
        }
      }
      return { items: dedupeById(items), skipped };
    };
    const oilPipelines = mapLinear(oilPipelineFeatures, mapOilPipeline, 'oleoduto');
    const refineries = mapAnpPoints(refineryFeatures, ANP_REFINERY_SPEC, 'refinaria');
    const gasProcessing = mapAnpPoints(gasProcessingFeatures, ANP_GAS_PROCESSING_SPEC, 'UPGN');
    const liquidTerminals = mapAnpPoints(
      liquidTerminalFeatures,
      ANP_LIQUID_TERMINAL_SPEC,
      'terminal de líquidos',
    );
    const lngTerminals = mapAnpPoints(
      lngTerminalFeatures,
      ANP_LNG_TERMINAL_SPEC,
      'terminal de GNL',
    );
    const wells = mapAnpPoints(wellFeatures, ANP_WELL_SPEC, 'poço');
    const fields = mapAnpPolygonSet(fieldFeatures, ANP_FIELD_SPEC, 'campo');
    const blocks = mapAnpPolygonSet(blockFeatures, ANP_BLOCK_SPEC, 'bloco');
    const uniqueOilPipelines = dedupeById(oilPipelines.items);

    const uniqueSubstations = dedupeById(substations);
    const uniqueIsolatedSystems = dedupeById(isolatedSystems);
    const uniqueLines = dedupeById(lines);
    let uniqueGas = dedupeById(gas.items);
    if (wants('gas') && uniqueGas.length > 0) {
      try {
        console.log('    Fetching ANP autorizações de gás natural...');
        const enrichment = enrichGasPipelines(uniqueGas, await fetchAnpGasAuthorizations());
        uniqueGas = enrichment.lines;
        const r = enrichment.report;
        console.log(
          `    ANP: ${r.authorizations} autorizações (${r.pipelineAuthorizations} de duto) · enriquecidos: ${r.enriched} · sem correspondência: ${r.noMatch} · ambíguos: ${r.ambiguous} · campos em conflito: ${r.conflictingFields}`,
        );
      } catch (error) {
        // Enriquecimento é opcional: sem a ANP o gasoduto segue só com atributos do IBGE.
        console.warn(`    ! ANP indisponível, gasodutos sem enriquecimento: ${String(error)}`);
      }
    }
    const uniqueRailSegments = dedupeById(railSegments.items);
    const uniqueRailStations = dedupeById(railStations);
    const countVertices = (items: readonly MappedLine[]): number =>
      items.reduce((total, line) => total + line.line.coordinates.length, 0);
    if (energy) {
      console.log(
        `    Subestações no escopo: ${uniqueSubstations.length} (fora: ${substationsSkipped})`,
      );
      console.log(
        `    Sistemas isolados no escopo: ${uniqueIsolatedSystems.length} (fora: ${isolatedSystemsSkipped})`,
      );
      console.log(
        `    Linhas no escopo: ${uniqueLines.length} (fora: ${linesSkipped}) · ${countVertices(uniqueLines)} vértices preservados`,
      );
    }
    if (wants('gas')) {
      console.log(
        `    Gasodutos no escopo: ${uniqueGas.length} (fora: ${gas.skipped}) · ${countVertices(uniqueGas)} vértices preservados`,
      );
    }
    if (wants('rail')) {
      console.log(
        `    Trechos ferroviários no escopo: ${uniqueRailSegments.length} (fora: ${railSegments.skipped}) · ${countVertices(uniqueRailSegments)} vértices preservados`,
      );
      console.log(
        `    Estações ferroviárias no escopo: ${uniqueRailStations.length} (fora: ${railStationsSkipped})`,
      );
    }

    if (wants('oil')) {
      const report = (label: string, kept: number, skipped: number): void =>
        console.log(`    ${label} no escopo: ${kept} (fora: ${skipped})`);
      report('Refinarias', refineries.items.length, refineries.skipped);
      report('UPGN', gasProcessing.items.length, gasProcessing.skipped);
      report('Terminais de líquidos', liquidTerminals.items.length, liquidTerminals.skipped);
      report('Terminais de GNL', lngTerminals.items.length, lngTerminals.skipped);
      report('Oleodutos', uniqueOilPipelines.length, oilPipelines.skipped);
      report('Campos de produção', fields.items.length, fields.skipped);
      report('Blocos exploratórios', blocks.items.length, blocks.skipped);
      report('Poços', wells.items.length, wells.skipped);
    }

    // --- [4] Carga ----------------------------------------------------------
    console.log('[4] Carga');
    const substationPlan = pointSiteRows(uniqueSubstations, {
      tenantId,
      ownerPartyId,
      siteSpecId: siteSpecIdByCode.get(SUBSTATION_SITE_SPEC_CODE) ?? '',
      resourceSpecId: resourceSpecIdByCode.get(SUBSTATION_RESOURCE_TYPE_CODE) ?? '',
    });
    const isolatedSystemPlan = pointSiteRows(uniqueIsolatedSystems, {
      tenantId,
      ownerPartyId,
      siteSpecId: siteSpecIdByCode.get(ISOLATED_SYSTEM_SITE_SPEC_CODE) ?? '',
      resourceSpecId: resourceSpecIdByCode.get(ISOLATED_SYSTEM_RESOURCE_TYPE_CODE) ?? '',
    });
    const linePlanFor = (items: readonly MappedLine[], typeCode: string): LoadPlan =>
      lineResourceRows(items, {
        tenantId,
        ownerPartyId,
        resourceSpecId: resourceSpecIdByCode.get(typeCode) ?? '',
      });
    const linePlan = linePlanFor(uniqueLines, TRANSMISSION_LINE_RESOURCE_TYPE_CODE);
    const gasPlan = linePlanFor(uniqueGas, GAS_PIPELINE_RESOURCE_TYPE_CODE);
    const railSegmentPlan = linePlanFor(uniqueRailSegments, RAIL_SEGMENT_RESOURCE_TYPE_CODE);
    const railStationPlan = pointSiteRows(uniqueRailStations, {
      tenantId,
      ownerPartyId,
      siteSpecId: siteSpecIdByCode.get(RAIL_STATION_SITE_SPEC_CODE) ?? '',
      resourceSpecId: resourceSpecIdByCode.get(RAIL_STATION_RESOURCE_TYPE_CODE) ?? '',
    });

    const pointPlanFor = (
      items: readonly MappedPointSite[],
      siteSpecCode: string,
      typeCode: string,
    ): LoadPlan =>
      pointSiteRows(items, {
        tenantId,
        ownerPartyId,
        siteSpecId: siteSpecIdByCode.get(siteSpecCode) ?? '',
        resourceSpecId: resourceSpecIdByCode.get(typeCode) ?? '',
      });
    const polygonPlanFor = (items: readonly MappedPolygon[], typeCode: string): LoadPlan =>
      polygonResourceRows(items, {
        tenantId,
        ownerPartyId,
        resourceSpecId: resourceSpecIdByCode.get(typeCode) ?? '',
      });
    const oilPlans = [
      pointPlanFor(refineries.items, OIL_REFINERY_SITE_SPEC_CODE, OIL_REFINERY_RESOURCE_TYPE_CODE),
      pointPlanFor(
        gasProcessing.items,
        OIL_GAS_PROCESSING_SITE_SPEC_CODE,
        OIL_GAS_PROCESSING_RESOURCE_TYPE_CODE,
      ),
      pointPlanFor(
        liquidTerminals.items,
        OIL_LIQUID_TERMINAL_SITE_SPEC_CODE,
        OIL_LIQUID_TERMINAL_RESOURCE_TYPE_CODE,
      ),
      pointPlanFor(
        lngTerminals.items,
        OIL_LNG_TERMINAL_SITE_SPEC_CODE,
        OIL_LNG_TERMINAL_RESOURCE_TYPE_CODE,
      ),
      pointPlanFor(wells.items, OIL_WELL_SITE_SPEC_CODE, OIL_WELL_RESOURCE_TYPE_CODE),
      linePlanFor(uniqueOilPipelines, OIL_PIPELINE_RESOURCE_TYPE_CODE),
      polygonPlanFor(fields.items, OIL_FIELD_RESOURCE_TYPE_CODE),
      polygonPlanFor(blocks.items, OIL_BLOCK_RESOURCE_TYPE_CODE),
    ];

    const plans = [
      ...oilPlans,
      substationPlan,
      isolatedSystemPlan,
      linePlan,
      gasPlan,
      railSegmentPlan,
      railStationPlan,
    ];
    const locations = plans.flatMap((plan) => plan.locations);
    const sites = plans.flatMap((plan) => plan.sites);
    const resources = plans.flatMap((plan) => plan.resources);

    const alreadyThere = await existingIds(
      conn,
      t,
      'resource_physical',
      resources.map((row) => String(row.id)),
    );
    const updated = alreadyThere.size;
    const imported = resources.length - updated;

    if (options.apply) {
      // Ordem obrigatória: Location antes de Site (FK geographic_location_id) e Site antes de
      // Resource (place_id). `bulkMergeRows` particiona o lote por largura de bind, o que mantém a
      // geometria curta no caminho VARCHAR2 (bind CLOB custa ~400x).
      await bulkMergeRows(
        conn,
        t,
        'geographic_location',
        ['id'],
        LOCATION_COLUMNS,
        locations,
        BATCH_SIZE,
      );
      console.log(`    Locations: ${locations.length}`);
      await bulkMergeRows(conn, t, 'geographic_site', ['id'], SITE_COLUMNS, sites, BATCH_SIZE);
      console.log(`    Sites: ${sites.length}`);
      await bulkMergeRows(
        conn,
        t,
        'resource_physical',
        ['id'],
        RESOURCE_COLUMNS,
        resources,
        BATCH_SIZE,
      );
      await conn.execute('COMMIT');
      console.log(`    Imported: ${imported}`);
      console.log(`    Updated: ${updated}`);
    } else {
      console.log(
        `    (dry-run) ${locations.length} locations · ${sites.length} sites · ${resources.length} recursos`,
      );
      console.log(`    Imported: ${imported} (previsto) · Updated: ${updated} (previsto)`);
    }
  } finally {
    if (conn) {
      try {
        if (!options.apply) await conn.execute('ROLLBACK');
      } catch {
        // Rollback de cortesia no dry-run; a conexão pode já ter sido encerrada pelo erro acima.
      }
      await conn.close();
    }
    await pool.close(5);
  }

  // --- [5] Studio GEO -------------------------------------------------------
  console.log('[5] Studio GEO');
  if (options.apply) {
    // As fases 1–4 já commitaram. Uma falha aqui não invalida a carga: ela só deixa o mapa sem as
    // camadas, e o remédio é republicar — por isso vira aviso acionável em vez de derrubar o run.
    try {
      await publishLayers(tenantId, options.domains);
    } catch (error) {
      console.warn(`    ! publicação do catálogo GEO falhou: ${String(error)}`);
      console.warn(
        '      Os dados foram gravados, mas o mapa só desenha depois de publicar as camadas ' +
          'ENERGIA no Studio → GEO (ou reexecutar o seed com --apply).',
      );
      process.exitCode = 1;
    }
  } else {
    console.log('    (dry-run) publicação do catálogo GEO não executada');
  }

  // --- [6] Índice do mapa ---------------------------------------------------
  console.log('[6] Índice do mapa');
  // Sem `--uf/--city`: aqueles filtros dependem do endereço da Location, e a fonte não tem
  // endereço — um rebuild escopado deixaria tudo de fora.
  const indexCommand = `node scripts/build-map-features.mjs --environment ${prefix} --apply --tenant ${tenantId}`;
  if (options.apply && options.buildFeatures) {
    await runIndexer(tenantId, prefix);
  } else {
    console.log(`    pendente — rode: ${indexCommand}`);
  }

  console.log('Done.');
}

/**
 * Publica as camadas ENERGIA pelo `studioService` do runtime.
 *
 * Único trecho que sobe o runtime completo. `DATABASE_AUTO_SCHEMA:'false'` porque o seed não é o
 * lugar de criar schema — a DEMO já está provisionada.
 */
async function publishLayers(tenantId: string, domains: readonly Domain[]): Promise<void> {
  const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
  const db = createDatabaseClient(config.database);
  await db.initialize();
  try {
    const runtime = await createNexusRuntime(db);
    const result = await publishDomainLayers(
      runtime.studioService,
      {
        actorSub: 'seed-demo-infra',
        tenantId,
        // O adapter consulta Resource/Geo por conta própria durante o publish; `studio.admin`
        // sozinho não satisfaz o papel de leitura daqueles serviços.
        roles: ['studio.admin', 'platform.admin'],
        traceId: 'seed-demo-infra',
      },
      domains,
    );
    console.log(
      `    Published: ${domains.join(' + ')} · versão ${result.versionNumber} · ${result.nodeCount} nós`,
    );
  } finally {
    await db.close();
  }
}

/** Dispara o indexador existente em vez de reimplementar a geração de tiles. */
async function runIndexer(tenantId: string, environment: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/build-map-features.mjs',
        '--environment',
        environment,
        '--apply',
        '--tenant',
        tenantId,
      ],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`build-map-features saiu com código ${code}.`)),
    );
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSeed(parseCliArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  });
}

export { runSeed };
