import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import {
  merge,
  netwinOriginCharacteristics,
  reconcileCatalogCharacteristics,
  type MigrationCharacteristic,
} from '../netwin-migration-kit.js';
import { deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import type { PhaseStats } from './types.js';

export type ResourceTypeItem = {
  code: string;
  name: string;
  description?: string;
  mapPresence?: boolean;
  geometryKind?: 'POINT' | 'LINE' | 'POLYGON';
  resourceTypeCharacteristic?: MigrationCharacteristic[];
};

const instanceCharacteristic = (name: string, description: string): MigrationCharacteristic => ({
  name,
  description,
  value: '',
  valueType: 'string',
  characteristicLevel: 'instance',
});

const EQUIPMENT_INSTANCE_CHARACTERISTICS = [
  instanceCharacteristic('substatus', 'Estado operacional detalhado informado pela origem.'),
];

const SPLITTER_INSTANCE_CHARACTERISTICS = [
  instanceCharacteristic('sourceCardType', 'Tipo da placa de splitter informado pela origem.'),
  instanceCharacteristic('sourceCardSigla', 'Sigla do tipo da placa de splitter.'),
  instanceCharacteristic('slotNumber', 'Posição do slot informada pela origem.'),
  instanceCharacteristic('positionUf', 'Posição física superior informada pela origem.'),
  instanceCharacteristic('splitRatio', 'Razão de divisão efetiva do splitter.'),
];

const PORT_INSTANCE_CHARACTERISTICS = [
  instanceCharacteristic('sourcePortType', 'Tipo de porta física informado pela origem.'),
  instanceCharacteristic('portId', 'Identificador funcional da porta informado pela origem.'),
  instanceCharacteristic('coding', 'Codificação física da porta.'),
  instanceCharacteristic('occupancy', 'Ocupação informada pela origem.'),
  instanceCharacteristic('circuit', 'Circuito associado informado pela origem.'),
  instanceCharacteristic('bandwidth', 'Capacidade de banda informada pela origem.'),
];

export type ResourceCatalogLoadSummary = {
  catalogCode: string;
  catalogName: string;
  groupCount: number;
  resourceTypeNodeCount: number;
  referencedResourceTypeCount: number;
  resourceSpecificationCount: number;
};

export const formatResourceCatalogLoadSummary = (
  tenantId: string,
  summary: ResourceCatalogLoadSummary,
): string =>
  [
    'Modelagem de Recursos disponível no Studio:',
    `tenant=${tenantId}`,
    `catalogo=${summary.catalogCode} (${summary.catalogName})`,
    `grupos=${summary.groupCount}`,
    `folhas=${summary.resourceTypeNodeCount}`,
    `tiposReferenciados=${summary.referencedResourceTypeCount}`,
    `especificacoes=${summary.resourceSpecificationCount}`,
    'Acesse o Studio com uma sessão do mesmo tenant para visualizar esta árvore.',
  ].join(' | ');

export const CANONICAL_RESOURCE_TYPES: ResourceTypeItem[] = [
  // Equipamentos Ópticos de Acesso / Planta Externa
  {
    code: 'category:CDOE',
    name: 'CDOE',
    description: 'Caixa de Distribuição Óptica Externa',
    mapPresence: true,
    geometryKind: 'POINT',
    resourceTypeCharacteristic: EQUIPMENT_INSTANCE_CHARACTERISTICS,
  },
  {
    code: 'category:CDOI',
    name: 'CDOI',
    description: 'Caixa de Distribuição Óptica Interna',
    mapPresence: true,
    geometryKind: 'POINT',
    resourceTypeCharacteristic: EQUIPMENT_INSTANCE_CHARACTERISTICS,
  },
  {
    code: 'SpliceClosure',
    name: 'Caixa de Emenda Óptica',
    description: 'CEO / CEOS de fusão óptica',
    mapPresence: true,
    geometryKind: 'POINT',
    resourceTypeCharacteristic: EQUIPMENT_INSTANCE_CHARACTERISTICS,
  },
  {
    code: 'OpticalNode',
    name: 'Nó Óptico',
    description: 'Nó óptico de transição ou terminação',
    mapPresence: true,
    geometryKind: 'POINT',
    resourceTypeCharacteristic: EQUIPMENT_INSTANCE_CHARACTERISTICS,
  },
  {
    code: 'Splitter',
    name: 'Splitter Óptico',
    description: 'Divisor óptico passivo (1xN ou 2xN)',
    mapPresence: true,
    geometryKind: 'POINT',
    resourceTypeCharacteristic: SPLITTER_INSTANCE_CHARACTERISTICS,
  },
  {
    code: 'DIO',
    name: 'Distribuidor Interno Óptico',
    description: 'Bastidor ou bandeja óptica (ODF)',
    mapPresence: true,
    geometryKind: 'POINT',
  },
  {
    code: 'CTO',
    name: 'Caixa de Terminação Óptica',
    description: 'Terminação óptica de cliente / rede',
    mapPresence: true,
    geometryKind: 'POINT',
  },
  { code: 'OLT', name: 'OLT', description: 'Terminal de Linha Óptica' },
  { code: 'ONT', name: 'ONT', description: 'Terminal de Rede Óptica' },
  { code: 'Card', name: 'Card / Module', description: 'Placa ou módulo de equipamento' },
  {
    code: 'Port',
    name: 'Port',
    description: 'Porta física de equipamento ou caixa óptica',
    resourceTypeCharacteristic: PORT_INSTANCE_CHARACTERISTICS,
  },
  { code: 'PONPort', name: 'Porta PON', description: 'Porta PON de equipamento de acesso' },
  { code: 'ONTPort', name: 'Porta ONT', description: 'Porta da ONT de cliente' },
  { code: 'Frame', name: 'Frame', description: 'Bastidor de planta interna' },
  { code: 'Shelf', name: 'Shelf', description: 'Prateleira ou chassi de equipamento' },
  { code: 'Slot', name: 'Slot', description: 'Posição física de módulo ou placa' },

  // Cabos Ópticos
  {
    code: 'BackboneCable',
    name: 'Cabo Backbone',
    description: 'Cabo tronco / transporte (>= 96 FO)',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'DistributionCable',
    name: 'Cabo de Distribuição',
    description: 'Cabo de distribuição (12 a 72 FO)',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'DropCable',
    name: 'Cabo Drop',
    description: 'Cabo drop de atendimento ao assinante (< 12 FO)',
    mapPresence: true,
    geometryKind: 'LINE',
  },

  // Infraestrutura Civil e Vias
  {
    code: 'Pole',
    name: 'Poste',
    description: 'Poste da rede aérea',
    mapPresence: true,
    geometryKind: 'POINT',
  },
  {
    code: 'Manhole',
    name: 'Caixa Subterrânea',
    description: 'Caixa de passagem ou câmara subterrânea',
    mapPresence: true,
    geometryKind: 'POINT',
  },
  {
    code: 'Duct',
    name: 'Duto Subterrâneo',
    description: 'Duto ou duto canalizado para cabos',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'AerialSpan',
    name: 'Lance Aéreo',
    description: 'Trecho aéreo de sustentação de cabos',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'BuriedSpan',
    name: 'Lance Enterrado',
    description: 'Trecho diretamente enterrado de cabos',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'InnerSpan',
    name: 'Lance Interno',
    description: 'Trecho interno em esteiramento ou tubulação',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'OtherSpan',
    name: 'Lance (Outro)',
    description: 'Outro tipo de via de infraestrutura',
    mapPresence: true,
    geometryKind: 'LINE',
  },
  {
    code: 'Tower',
    name: 'Torre',
    description: 'Torre de telecomunicações',
    mapPresence: true,
    geometryKind: 'POINT',
  },
  {
    code: 'Pedestal',
    name: 'Pedestal',
    description: 'Armário baixo de calçada para distribuição',
    mapPresence: true,
    geometryKind: 'POINT',
  },
  {
    code: 'RisingTube',
    name: 'Tubo de Subida',
    description: 'Tubo de subida lateral de poste ou parede',
  },
  {
    code: 'CableTunnel',
    name: 'Túnel de Cabos',
    description: 'Galeria ou túnel de cabos de central',
  },
  { code: 'IronPipe', name: 'Tubo de Ferro', description: 'Tubulação metálica de proteção' },
  {
    code: 'SupportBracket',
    name: 'Suporte / Braço',
    description: 'Braço ou suporte de fixação em poste',
  },

  // Equipamentos de Transporte e Core
  { code: 'Router', name: 'Router', description: 'Roteador de borda ou core' },
  { code: 'Switch', name: 'Switch', description: 'Switch de agregação' },
  { code: 'Rack', name: 'Rack', description: 'Bastidor ou rack de equipamentos' },
];

export async function runPhase1ResourceSpecs(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log(
    '\n=== Fase 1.D: Tipos e Especificações de Recursos (Studio / Resource Management) ===',
  );

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();

  try {
    const resourceTypeIdByCode = new Map<string, string>();

    // 1. Carrega ResourceTypes pré-existentes do tenant para reutilizar IDs
    if (target) {
      const existingTypes = await target.execute<{ ID: string; CODE: string; TENANT_ID: string }>(
        `SELECT id, code, tenant_id
           FROM ${ctx.t('tmf_resource_type')}
          WHERE tenant_id IN (:1, 'default')
          ORDER BY CASE WHEN tenant_id = 'default' THEN 0 ELSE 1 END, id`,
        [ctx.options.tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const sharedTypeCodes = new Set<string>();
      for (const row of existingTypes.rows ?? []) {
        // ResourceType é vocabulário canônico compartilhado. Quando o bootstrap já
        // oferece um tipo em `default` (Port/Splitter inclusive), a specification e
        // o nó Studio do tenant devem referenciar exatamente esse ID, nunca um clone.
        if (!resourceTypeIdByCode.has(row.CODE) || row.TENANT_ID === 'default') {
          resourceTypeIdByCode.set(row.CODE, row.ID);
        }
        if (row.TENANT_ID === 'default') sharedTypeCodes.add(row.CODE);
      }

      // Só materializa um tipo tenant-local quando ainda não existe vocabulário
      // canônico compartilhado para o code. Specifications e catálogo seguem tenant-scoped.
      for (const rt of CANONICAL_RESOURCE_TYPES) {
        let typeId = resourceTypeIdByCode.get(rt.code);
        if (!typeId) {
          typeId = deterministicUuid(
            NEXUS_NETWIN_NAMESPACE,
            `RESOURCE_TYPE:${ctx.options.tenantId}:${rt.code}`,
          );
          resourceTypeIdByCode.set(rt.code, typeId);
        }

        // Tipos compartilhados (`default`) são autoridade de vocabulário e não podem ganhar uma
        // cópia tenant-local. Ainda assim, suas definitions precisam ser reconciliadas para que
        // Port e Splitter usados nas specifications do tenant recebam o contrato da Fase 2.C.
        if (!sharedTypeCodes.has(rt.code)) {
          await merge(target, ctx.t, 'tmf_resource_type', ['tenant_id', 'code'], {
            id: typeId,
            tenant_id: ctx.options.tenantId,
            code: rt.code,
            name: rt.name,
            status: 'active',
            description: rt.description ?? null,
            map_presence: rt.mapPresence ? 1 : 0,
            ...(rt.geometryKind ? { geometry_kind: rt.geometryKind } : {}),
          });
        }
        if (rt.resourceTypeCharacteristic) {
          await reconcileCatalogCharacteristics(
            target,
            ctx.t,
            'tmf_resource_type',
            typeId,
            rt.resourceTypeCharacteristic,
          );
        }
        stats.loaded++;
      }
    }

    // 2. Especificações de Splitters (razões de divisão)
    for (const ratio of [2, 4, 8, 16, 32, 64]) {
      const specName = `Splitter 1:${ratio}`;
      const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:Splitter:1x${ratio}`);
      const splitterTypeId = resourceTypeIdByCode.get('Splitter')!;

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_specification', ['id'], {
          id: specId,
          tenant_id: ctx.options.tenantId,
          name: specName,
          resource_type_id: splitterTypeId,
          description: `Divisor óptico balanceado 1 para ${ratio}`,
        });
        // Aditivo (não MERGE do array inteiro): reexecutar a Fase 1 não pode apagar
        // characteristics de specification que alguém tenha acrescentado pelo Studio.
        await reconcileCatalogCharacteristics(target, ctx.t, 'tmf_resource_specification', specId, [
          ...netwinOriginCharacteristics('RESOURCE_SPECIFICATION', specId),
          { name: 'splitRatio', value: `1:${ratio}`, valueType: 'string' },
          { name: 'inputPorts', value: 1, valueType: 'integer' },
          { name: 'outputPorts', value: ratio, valueType: 'integer' },
        ]);
      }
      stats.loaded++;
    }

    // 3. Especificações Base de Equipamentos e Infraestrutura
    const baseSpecs: Array<{ name: string; typeCode: string }> = [
      { name: 'Netwin CDOE', typeCode: 'category:CDOE' },
      { name: 'Netwin CDOI', typeCode: 'category:CDOI' },
      { name: 'Netwin CEO', typeCode: 'SpliceClosure' },
      { name: 'Netwin CEOS', typeCode: 'SpliceClosure' },
      { name: 'Netwin Optical Node', typeCode: 'OpticalNode' },
      { name: 'Netwin Pole', typeCode: 'Pole' },
      { name: 'Netwin Manhole', typeCode: 'Manhole' },
      { name: 'Netwin Manhole MS', typeCode: 'Manhole' },
      { name: 'Netwin Manhole MQ', typeCode: 'Manhole' },
      { name: 'Netwin Manhole MX', typeCode: 'Manhole' },
      { name: 'Netwin Duct', typeCode: 'Duct' },
      { name: 'Netwin Aerial Span', typeCode: 'AerialSpan' },
      { name: 'Netwin Buried Span', typeCode: 'BuriedSpan' },
      { name: 'Netwin Inner Span', typeCode: 'InnerSpan' },
      { name: 'Netwin Optical Frame', typeCode: 'DIO' },
      { name: 'Netwin Rack', typeCode: 'Rack' },
      { name: 'Netwin Frame', typeCode: 'Frame' },
      { name: 'Netwin Shelf', typeCode: 'Shelf' },
      { name: 'Netwin Slot', typeCode: 'Slot' },
      { name: 'Netwin OLT', typeCode: 'OLT' },
      { name: 'Netwin Card', typeCode: 'Card' },
      { name: 'Netwin Port', typeCode: 'Port' },
      { name: 'Netwin PON Port', typeCode: 'PONPort' },
      { name: 'Netwin Tower', typeCode: 'Tower' },
      { name: 'Netwin Pedestal', typeCode: 'Pedestal' },
    ];

    for (const b of baseSpecs) {
      const typeId = resourceTypeIdByCode.get(b.typeCode);
      if (!typeId) continue;
      const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${b.name}`);

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_specification', ['id'], {
          id: specId,
          tenant_id: ctx.options.tenantId,
          name: b.name,
          resource_type_id: typeId,
          description: `Especificação padrão importada do Netwin (${b.name})`,
        });
        await reconcileCatalogCharacteristics(
          target,
          ctx.t,
          'tmf_resource_specification',
          specId,
          netwinOriginCharacteristics('RESOURCE_SPECIFICATION', specId),
        );
      }
      stats.loaded++;
    }

    // 4. Modelos Reais de Cabos de NETWIN.REC_CAT_CABOS
    console.log('Consultando modelos de cabos em NETWIN...');
    const cableModels = await source.execute<{
      ID: number;
      NOME: string | null;
      CAPACIDADE: number | null;
    }>(
      `SELECT ID, NOME, CAPACIDADE FROM NETWIN.REC_CAT_CABOS WHERE NOME IS NOT NULL ORDER BY ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const models = cableModels.rows ?? [];
    console.log(`Modelos de cabos encontrados: ${models.length}`);

    for (const cm of models) {
      const nome = (cm.NOME ?? `Cabo ${cm.ID}`).trim();
      const cap = Number(cm.CAPACIDADE ?? 0);
      const typeCode = cap >= 96 ? 'BackboneCable' : cap >= 12 ? 'DistributionCable' : 'DropCable';
      const typeId = resourceTypeIdByCode.get(typeCode)!;
      const specId = deterministicUuid(
        NEXUS_NETWIN_NAMESPACE,
        `RESOURCE_SPEC:CABLE_MODEL:${cm.ID}`,
      );

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_specification', ['id'], {
          id: specId,
          tenant_id: ctx.options.tenantId,
          name: nome,
          resource_type_id: typeId,
          description: `Modelo de cabo Netwin ${nome} (${cap} FO)`,
        });
        await reconcileCatalogCharacteristics(target, ctx.t, 'tmf_resource_specification', specId, [
          ...netwinOriginCharacteristics('REC_CAT_CABOS', cm.ID),
          { name: 'fiberCount', value: cap, valueType: 'integer' },
        ]);
      }
      stats.loaded++;
    }

    // 5. Carga de Catálogo e Árvore de Nós no Studio (tmf_resource_catalog & tmf_resource_catalog_node)
    if (target) {
      console.log('Garantindo Catálogo de Recursos e Árvore do Studio...');

      // Resolve o catálogo padrão do tenant
      let catalogId: string | null = null;
      const catRes = await target.execute<{ ID: string }>(
        `SELECT id FROM ${ctx.t('tmf_resource_catalog')} WHERE tenant_id = :1 AND is_default = 1 FETCH FIRST 1 ROWS ONLY`,
        [ctx.options.tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      catalogId = catRes.rows?.[0]?.ID ?? null;

      if (!catalogId) {
        const anyCat = await target.execute<{ ID: string }>(
          `SELECT id FROM ${ctx.t('tmf_resource_catalog')} WHERE tenant_id = :1 FETCH FIRST 1 ROWS ONLY`,
          [ctx.options.tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        catalogId = anyCat.rows?.[0]?.ID ?? null;
      }

      if (!catalogId) {
        catalogId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `CATALOG:${ctx.options.tenantId}`);
        await merge(target, ctx.t, 'tmf_resource_catalog', ['id'], {
          id: catalogId,
          tenant_id: ctx.options.tenantId,
          code: 'default-catalog',
          name: 'Catálogo de Recursos',
          description: 'Catálogo principal de recursos de rede',
          status: 'active',
          is_default: 1,
          sort_order: 0,
        });
      }

      // Mapeamento de nós ativos existentes para não violar a constraint única
      const existingNodes = await target.execute<{
        ID: string;
        CODE: string;
        RESOURCE_TYPE_ID: string | null;
      }>(
        `SELECT id, code, resource_type_id FROM ${ctx.t('tmf_resource_catalog_node')} WHERE tenant_id = :1 AND catalog_id = :2`,
        [ctx.options.tenantId, catalogId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const existingNodeIdByCode = new Map<string, string>();
      const existingNodeIdByTypeId = new Map<string, string>();
      for (const row of existingNodes.rows ?? []) {
        if (row.CODE) existingNodeIdByCode.set(row.CODE, row.ID);
        if (row.RESOURCE_TYPE_ID) existingNodeIdByTypeId.set(row.RESOURCE_TYPE_ID, row.ID);
      }

      // Estrutura hierárquica de grupos do Studio
      const catalogHierarchy: Array<{
        groupCode: string;
        groupName: string;
        sortOrder: number;
        types: string[];
      }> = [
        {
          groupCode: 'grp-equipamentos-opticos',
          groupName: 'Equipamentos Ópticos e Acesso',
          sortOrder: 10,
          types: [
            'category:CDOE',
            'category:CDOI',
            'SpliceClosure',
            'OpticalNode',
            'Splitter',
            'DIO',
            'CTO',
            'OLT',
            'ONT',
            'Card',
            'Port',
            'PONPort',
            'ONTPort',
          ],
        },
        {
          groupCode: 'grp-cabos-opticos',
          groupName: 'Cabos Ópticos',
          sortOrder: 20,
          types: ['BackboneCable', 'DistributionCable', 'DropCable'],
        },
        {
          groupCode: 'grp-infraestrutura-civil',
          groupName: 'Infraestrutura Civil e Vias',
          sortOrder: 30,
          types: [
            'Pole',
            'Manhole',
            'Duct',
            'AerialSpan',
            'BuriedSpan',
            'InnerSpan',
            'OtherSpan',
            'Tower',
            'Pedestal',
            'RisingTube',
            'CableTunnel',
            'IronPipe',
            'SupportBracket',
          ],
        },
        {
          groupCode: 'grp-equipamentos-core',
          groupName: 'Equipamentos de Transporte e Core',
          sortOrder: 40,
          types: ['Router', 'Switch', 'Rack', 'Frame', 'Shelf', 'Slot'],
        },
      ];

      for (const grp of catalogHierarchy) {
        const grpNodeId =
          existingNodeIdByCode.get(grp.groupCode) ??
          deterministicUuid(
            NEXUS_NETWIN_NAMESPACE,
            `CATALOG_NODE:${ctx.options.tenantId}:${catalogId}:${grp.groupCode}`,
          );

        await merge(target, ctx.t, 'tmf_resource_catalog_node', ['id'], {
          id: grpNodeId,
          tenant_id: ctx.options.tenantId,
          catalog_id: catalogId,
          parent_node_id: null,
          code: grp.groupCode,
          name: grp.groupName,
          kind: 'GROUP',
          resource_type_id: null,
          status: 'active',
          sort_order: grp.sortOrder,
        });

        let leafIndex = 0;
        for (const typeCode of grp.types) {
          const typeId = resourceTypeIdByCode.get(typeCode);
          if (!typeId) continue;

          const typeDef = CANONICAL_RESOURCE_TYPES.find((t) => t.code === typeCode);
          const typeName = typeDef?.name ?? typeCode;

          // Se já houver nó para este typeId, reaproveita seu ID para respeitar unicidade
          const leafNodeId =
            existingNodeIdByTypeId.get(typeId) ??
            existingNodeIdByCode.get(typeCode) ??
            deterministicUuid(
              NEXUS_NETWIN_NAMESPACE,
              `CATALOG_NODE:${ctx.options.tenantId}:${catalogId}:${typeCode}`,
            );

          await merge(target, ctx.t, 'tmf_resource_catalog_node', ['id'], {
            id: leafNodeId,
            tenant_id: ctx.options.tenantId,
            catalog_id: catalogId,
            parent_node_id: grpNodeId,
            code: typeCode,
            name: typeName,
            kind: 'RESOURCE_TYPE',
            resource_type_id: typeId,
            status: 'active',
            sort_order: leafIndex * 10,
          });
          leafIndex++;
        }
      }

      await target.execute('COMMIT');

      const catalogSummary = await target.execute<{
        CATALOG_CODE: string;
        CATALOG_NAME: string;
        GROUP_COUNT: number;
        RESOURCE_TYPE_NODE_COUNT: number;
        REFERENCED_RESOURCE_TYPE_COUNT: number;
        RESOURCE_SPECIFICATION_COUNT: number;
      }>(
        `SELECT c.code AS catalog_code,
                c.name AS catalog_name,
                COUNT(CASE WHEN n.kind = 'GROUP' AND n.status = 'active' THEN 1 END) AS group_count,
                COUNT(CASE WHEN n.kind = 'RESOURCE_TYPE' AND n.status = 'active' THEN 1 END) AS resource_type_node_count,
                COUNT(DISTINCT CASE WHEN n.kind = 'RESOURCE_TYPE' AND n.status = 'active' THEN n.resource_type_id END) AS referenced_resource_type_count,
                (SELECT COUNT(*)
                   FROM ${ctx.t('tmf_resource_specification')} s
                  WHERE s.tenant_id = :tenantId) AS resource_specification_count
           FROM ${ctx.t('tmf_resource_catalog')} c
           LEFT JOIN ${ctx.t('tmf_resource_catalog_node')} n
             ON n.catalog_id = c.id
            AND n.tenant_id = c.tenant_id
          WHERE c.id = :catalogId
            AND c.tenant_id = :tenantId
          GROUP BY c.code, c.name`,
        { catalogId, tenantId: ctx.options.tenantId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = catalogSummary.rows?.[0];
      if (row) {
        console.log(
          formatResourceCatalogLoadSummary(ctx.options.tenantId, {
            catalogCode: row.CATALOG_CODE,
            catalogName: row.CATALOG_NAME,
            groupCount: Number(row.GROUP_COUNT),
            resourceTypeNodeCount: Number(row.RESOURCE_TYPE_NODE_COUNT),
            referencedResourceTypeCount: Number(row.REFERENCED_RESOURCE_TYPE_COUNT),
            resourceSpecificationCount: Number(row.RESOURCE_SPECIFICATION_COUNT),
          }),
        );
      }
    }

    console.log(
      `Fase 1.D concluída: ${stats.loaded} ResourceTypes e ResourceSpecifications cadastrados.`,
    );
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
