import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { merge } from '../netwin-migration-kit.js';
import { deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import type { PhaseStats } from './types.js';

export type ResourceTypeItem = {
  code: string;
  name: string;
  description?: string;
};

export const CANONICAL_RESOURCE_TYPES: ResourceTypeItem[] = [
  // Equipamentos Ópticos de Acesso / Planta Externa
  { code: 'category:CDOE', name: 'CDOE', description: 'Caixa de Distribuição Óptica Externa' },
  { code: 'category:CDOI', name: 'CDOI', description: 'Caixa de Distribuição Óptica Interna' },
  { code: 'SpliceClosure', name: 'Caixa de Emenda Óptica', description: 'CEO / CEOS de fusão óptica' },
  { code: 'OpticalNode', name: 'Nó Óptico', description: 'Nó óptico de transição ou terminação' },
  { code: 'Splitter', name: 'Splitter Óptico', description: 'Divisor óptico passivo (1xN ou 2xN)' },
  { code: 'DIO', name: 'Distribuidor Interno Óptico', description: 'Bastidor ou bandeja óptica (ODF)' },
  { code: 'CTO', name: 'Caixa de Terminação Óptica', description: 'Terminação óptica de cliente / rede' },

  // Cabos Ópticos
  { code: 'BackboneCable', name: 'Cabo Backbone', description: 'Cabo tronco / transporte (>= 96 FO)' },
  { code: 'DistributionCable', name: 'Cabo de Distribuição', description: 'Cabo de distribuição (12 a 72 FO)' },
  { code: 'DropCable', name: 'Cabo Drop', description: 'Cabo drop de atendimento ao assinante (< 12 FO)' },

  // Infraestrutura Civil e Vias
  { code: 'Pole', name: 'Poste', description: 'Poste da rede aérea' },
  { code: 'Manhole', name: 'Caixa Subterrânea', description: 'Caixa de passagem ou câmara subterrânea' },
  { code: 'Duct', name: 'Duto Subterrâneo', description: 'Duto ou duto canalizado para cabos' },
  { code: 'AerialSpan', name: 'Lance Aéreo', description: 'Trecho aéreo de sustentação de cabos' },
  { code: 'BuriedSpan', name: 'Lance Enterrado', description: 'Trecho diretamente enterrado de cabos' },
  { code: 'InnerSpan', name: 'Lance Interno', description: 'Trecho interno em esteiramento ou tubulação' },
  { code: 'OtherSpan', name: 'Lance (Outro)', description: 'Outro tipo de via de infraestrutura' },
  { code: 'Tower', name: 'Torre', description: 'Torre de telecomunicações' },
  { code: 'Pedestal', name: 'Pedestal', description: 'Armário baixo de calçada para distribuição' },
  { code: 'RisingTube', name: 'Tubo de Subida', description: 'Tubo de subida lateral de poste ou parede' },
  { code: 'CableTunnel', name: 'Túnel de Cabos', description: 'Galeria ou túnel de cabos de central' },
  { code: 'IronPipe', name: 'Tubo de Ferro', description: 'Tubulação metálica de proteção' },
  { code: 'SupportBracket', name: 'Suporte / Braço', description: 'Braço ou suporte de fixação em poste' },
];

export async function runPhase1ResourceSpecs(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 1.D: Tipos e Especificações de Recursos (Studio / Resource Management) ===');

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();

  try {
    const resourceTypeIdByCode = new Map<string, string>();

    // 1. Cadastra todos os ResourceTypes canônicos
    for (const rt of CANONICAL_RESOURCE_TYPES) {
      const typeId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_TYPE:${ctx.options.tenantId}:${rt.code}`);
      resourceTypeIdByCode.set(rt.code, typeId);

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_type', ['tenant_id', 'code'], {
          id: typeId,
          tenant_id: ctx.options.tenantId,
          code: rt.code,
          name: rt.name,
          status: 'active',
          description: rt.description ?? null,
        });
      }
      stats.loaded++;
    }

    // 2. Especificações de Splitters (razões de divisão)
    for (const ratio of [2, 4, 8, 16, 32, 64]) {
      const specName = `Splitter 1:${ratio}`;
      const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:Splitter:1x${ratio}`);
      const splitterTypeId = resourceTypeIdByCode.get('Splitter')!;

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_specification', ['tenant_id', 'name'], {
          id: specId,
          tenant_id: ctx.options.tenantId,
          name: specName,
          resource_type_id: splitterTypeId,
          description: `Divisor óptico balanceado 1 para ${ratio}`,
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { name: 'splitRatio', value: `1:${ratio}`, valueType: 'string' },
            { name: 'inputPorts', value: 1, valueType: 'number' },
            { name: 'outputPorts', value: ratio, valueType: 'number' },
          ]),
        });
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
      { name: 'Netwin Tower', typeCode: 'Tower' },
      { name: 'Netwin Pedestal', typeCode: 'Pedestal' },
    ];

    for (const b of baseSpecs) {
      const typeId = resourceTypeIdByCode.get(b.typeCode);
      if (!typeId) continue;
      const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${b.name}`);

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_specification', ['tenant_id', 'name'], {
          id: specId,
          tenant_id: ctx.options.tenantId,
          name: b.name,
          resource_type_id: typeId,
          description: `Especificação padrão importada do Netwin (${b.name})`,
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
          ]),
        });
      }
      stats.loaded++;
    }

    // 4. Modelos Reais de Cabos de NETWIN.CABLE_MODEL / REC_CAT_CABOS
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
      const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:CABLE_MODEL:${cm.ID}`);

      if (target) {
        await merge(target, ctx.t, 'tmf_resource_specification', ['tenant_id', 'name'], {
          id: specId,
          tenant_id: ctx.options.tenantId,
          name: nome,
          resource_type_id: typeId,
          description: `Modelo de cabo Netwin ${nome} (${cap} FO)`,
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(cm.ID), valueType: 'string' },
            { name: 'fiberCount', value: cap, valueType: 'number' },
          ]),
        });
      }
      stats.loaded++;
    }

    if (target) {
      await target.execute('COMMIT');
    }

    console.log(`Fase 1.D concluída: ${stats.loaded} ResourceTypes e ResourceSpecifications cadastrados.`);
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
