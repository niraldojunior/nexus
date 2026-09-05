#!/usr/bin/env node
/**
 * Reorganiza o Catálogo Mestre V.tal Nexus priorizando os nós originais existentes,
 * eliminando duplicatas criadas indevidamente e organizando a hierarquia master solicitada.
 *
 * Uso:
 *   node scripts/reorganize-and-deduplicate-catalog.mjs              # dry-run
 *   node scripts/reorganize-and-deduplicate-catalog.mjs --apply      # aplica alterações
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');
const TENANT_ID = 'vtal';
const CATALOG_CODE = 'nexus-master-resource-catalog';

/**
 * Mapeamento da árvore canônica solicitada pelo usuário.
 * Para cada nó folha ou grupo, definimos:
 * - code: código canônico do grupo / nó
 * - name: nome canônico
 * - kind: 'GROUP' | 'RESOURCE_TYPE'
 * - parentCode: código do nó pai
 * - sortOrder: ordem entre irmãos
 * - matchTypes: códigos de ResourceType que este nó representa (para encontrar o nó original correspondente)
 * - matchKeywords: palavras-chave no nome ou código antigo para reaproveitar nós existentes
 */
const CANONICAL_TREE = [
  // ==========================================
  // 1. INFRAESTRUTURA PASSIVA (RAIZ)
  // ==========================================
  {
    code: 'infra_passiva',
    name: 'Infraestrutura Passiva',
    kind: 'GROUP',
    parentCode: null,
    sortOrder: 0,
    matchKeywords: ['infraestrutura passiva', 'infra passiva', 'passive', 'infraestrutura'],
  },

  // 1.1 Infraestrutura Aérea
  {
    code: 'infra_aerea',
    name: 'Infraestrutura Aérea',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 0,
    matchKeywords: ['infraestrutura aérea', 'infra aérea', 'aérea', 'aerea', 'aerial'],
  },
  {
    name: 'Poste',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Pole'],
    parentCode: 'infra_aerea',
    sortOrder: 0,
    matchKeywords: ['poste', 'pole'],
  },
  {
    name: 'Torre',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Tower'],
    parentCode: 'infra_aerea',
    sortOrder: 1,
    matchKeywords: ['torre', 'tower'],
  },
  {
    name: 'Mastro',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Mast'],
    parentCode: 'infra_aerea',
    sortOrder: 2,
    matchKeywords: ['mastro', 'mast'],
  },

  // 1.2 Infraestrutura Subterrânea
  {
    code: 'infra_subterranea',
    name: 'Infraestrutura Subterrânea',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 1,
    matchKeywords: ['infraestrutura subterrânea', 'subterrânea', 'subterranea', 'underground', 'civil'],
  },
  {
    name: 'Duto',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Duct'],
    parentCode: 'infra_subterranea',
    sortOrder: 0,
    matchKeywords: ['duto', 'duct'],
  },
  {
    name: 'Subduto',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Subduct'],
    parentCode: 'infra_subterranea',
    sortOrder: 1,
    matchKeywords: ['subduto', 'subduct'],
  },
  {
    name: 'Caixa de Passagem',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Manhole'],
    parentCode: 'infra_subterranea',
    sortOrder: 2,
    matchKeywords: ['caixa de passagem', 'manhole', 'caixa passagem'],
  },
  {
    name: 'Câmara Subterrânea',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['UndergroundChamber'],
    parentCode: 'infra_subterranea',
    sortOrder: 3,
    matchKeywords: ['câmara subterrânea', 'camara subterranea', 'underground chamber'],
  },
  {
    name: 'Canaleta',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Trench'],
    parentCode: 'infra_subterranea',
    sortOrder: 4,
    matchKeywords: ['canaleta', 'trench'],
  },

  // 1.3 Estruturas Internas
  {
    code: 'estruturas_internas',
    name: 'Estruturas Internas',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 2,
    matchKeywords: ['estruturas internas', 'estrutura interna', 'internas', 'internal'],
  },
  {
    name: 'Rack',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Rack'],
    parentCode: 'estruturas_internas',
    sortOrder: 0,
    matchKeywords: ['rack'],
  },
  {
    name: 'Bastidor',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Frame'],
    parentCode: 'estruturas_internas',
    sortOrder: 1,
    matchKeywords: ['bastidor', 'frame'],
  },
  {
    name: 'Shelf',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Shelf'],
    parentCode: 'estruturas_internas',
    sortOrder: 2,
    matchKeywords: ['shelf'],
  },
  {
    name: 'Slot',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Slot'],
    parentCode: 'estruturas_internas',
    sortOrder: 3,
    matchKeywords: ['slot'],
  },

  // 1.4 Infraestrutura Óptica Compartilhada
  {
    code: 'infra_optica_compartilhada',
    name: 'Infraestrutura Óptica Compartilhada',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 3,
    matchKeywords: ['infraestrutura óptica compartilhada', 'óptica compartilhada', 'optica compartilhada', 'cables', 'cabos'],
  },
  {
    name: 'Cabo Óptico',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['OpticalCable', 'DistributionCable', 'BackboneCable', 'DropCable'],
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 0,
    matchKeywords: ['cabo óptico', 'cabo optico', 'cabo', 'cable'],
  },
  {
    name: 'Fibra Óptica',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Fiber'],
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 1,
    matchKeywords: ['fibra óptica', 'fibra optica', 'fibra', 'fiber'],
  },
  {
    name: 'Cordão Óptico',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['PatchCord', 'Jumper'],
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 2,
    matchKeywords: ['cordão óptico', 'cordao optico', 'cordão', 'patch cord', 'patchcord', 'jumper'],
  },
  {
    name: 'DIO / ODF',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['DIO'],
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 3,
    matchKeywords: ['dio', 'odf', 'distribuidor interno óptico'],
  },
  {
    name: 'CEO',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['SpliceClosure'],
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 4,
    matchKeywords: ['ceo', 'caixa de emenda', 'splice closure', 'emenda'],
  },
  {
    name: 'Conector Óptico',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['OpticalConnector'],
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 5,
    matchKeywords: ['conector óptico', 'conector optico', 'conector', 'connector'],
  },

  // ==========================================
  // 2. REDE DE TELECOM (RAIZ)
  // ==========================================
  {
    code: 'rede_telecom',
    name: 'Rede de Telecom',
    kind: 'GROUP',
    parentCode: null,
    sortOrder: 1,
    matchKeywords: ['rede de telecom', 'telecom', 'telecomunicações', 'telecomunicacoes'],
  },

  // 2.1 Rede de Acesso
  {
    code: 'rede_acesso',
    name: 'Rede de Acesso',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 0,
    matchKeywords: ['rede de acesso', 'acesso', 'access'],
  },
  // GPON
  {
    code: 'acesso_gpon',
    name: 'GPON',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 0,
    matchKeywords: ['gpon', 'gpon access'],
  },
  // GPON -> Equipamentos
  {
    code: 'gpon_equipamentos',
    name: 'Equipamentos',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 0,
    matchKeywords: ['equipamentos', 'equipment', 'equipamento'],
  },
  {
    name: 'OLT',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['OLT'],
    parentCode: 'gpon_equipamentos',
    sortOrder: 0,
    matchKeywords: ['olt'],
  },
  {
    name: 'ONT',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['ONT'],
    parentCode: 'gpon_equipamentos',
    sortOrder: 1,
    matchKeywords: ['ont'],
  },
  {
    name: 'ONU',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['ONU'],
    parentCode: 'gpon_equipamentos',
    sortOrder: 2,
    matchKeywords: ['onu'],
  },

  // GPON -> Distribuição
  {
    code: 'gpon_distribuicao',
    name: 'Distribuição',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 1,
    matchKeywords: ['distribuição', 'distribuicao', 'distribution'],
  },
  {
    name: 'CDO',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['CDO'],
    parentCode: 'gpon_distribuicao',
    sortOrder: 0,
    matchKeywords: ['cdo'],
  },
  {
    name: 'CTO',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['CTO'],
    parentCode: 'gpon_distribuicao',
    sortOrder: 1,
    matchKeywords: ['cto'],
  },
  {
    name: 'Splitter',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Splitter'],
    parentCode: 'gpon_distribuicao',
    sortOrder: 2,
    matchKeywords: ['splitter'],
  },

  // GPON -> Interfaces
  {
    code: 'gpon_interfaces',
    name: 'Interfaces',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 2,
    matchKeywords: ['interfaces', 'interface', 'portas', 'ports'],
  },
  {
    name: 'Porta PON',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['PONPort', 'Port'],
    parentCode: 'gpon_interfaces',
    sortOrder: 0,
    matchKeywords: ['porta pon', 'pon port', 'porta', 'port'],
  },
  {
    name: 'Porta ONT',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['ONTPort'],
    parentCode: 'gpon_interfaces',
    sortOrder: 1,
    matchKeywords: ['porta ont', 'ont port'],
  },

  // GPON -> Recursos Lógicos
  {
    code: 'gpon_recursos_logicos',
    name: 'Recursos Lógicos',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 3,
    matchKeywords: ['recursos lógicos', 'recursos logicos', 'lógico', 'logico', 'logical'],
  },
  {
    name: 'PON',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['PONLogical'],
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 0,
    matchKeywords: ['pon', 'pon logica'],
  },
  {
    name: 'ONT ID',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['ONTID'],
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 1,
    matchKeywords: ['ont id', 'ontid'],
  },
  {
    name: 'GEM Port',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['GEMPort'],
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 2,
    matchKeywords: ['gem port', 'gemport'],
  },
  {
    name: 'VLAN',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['VLAN', 'VLANGroup'],
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 3,
    matchKeywords: ['vlan', 'vlan group'],
  },

  // Outros Acessos
  {
    code: 'acesso_xgs_pon',
    name: 'XGS-PON',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 1,
    matchKeywords: ['xgs-pon', 'xgs pon', 'xgspon'],
  },
  {
    code: 'acesso_hfc',
    name: 'HFC',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 2,
    matchKeywords: ['hfc'],
  },
  {
    code: 'acesso_ethernet',
    name: 'Ethernet',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 3,
    matchKeywords: ['ethernet'],
  },
  {
    code: 'acesso_fwa',
    name: 'FWA',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 4,
    matchKeywords: ['fwa'],
  },

  // 2.2 Rede de Transporte
  {
    code: 'rede_transporte',
    name: 'Rede de Transporte',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 1,
    matchKeywords: ['rede de transporte', 'transporte', 'transport'],
  },
  {
    code: 'transporte_dwdm',
    name: 'DWDM',
    kind: 'GROUP',
    parentCode: 'rede_transporte',
    sortOrder: 0,
    matchKeywords: ['dwdm'],
  },
  {
    code: 'transporte_otn',
    name: 'OTN',
    kind: 'GROUP',
    parentCode: 'rede_transporte',
    sortOrder: 1,
    matchKeywords: ['otn'],
  },
  {
    code: 'transporte_sdh',
    name: 'SDH',
    kind: 'GROUP',
    parentCode: 'rede_transporte',
    sortOrder: 2,
    matchKeywords: ['sdh'],
  },

  // 2.3 Rede IP
  {
    code: 'rede_ip',
    name: 'Rede IP',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 2,
    matchKeywords: ['rede ip', 'ip', 'ipam', 'l3', 'l2'],
  },
  {
    code: 'ip_mpls',
    name: 'IP/MPLS',
    kind: 'GROUP',
    parentCode: 'rede_ip',
    sortOrder: 0,
    matchKeywords: ['ip/mpls', 'mpls', 'router', 'switch'],
  },
  {
    code: 'ip_bng',
    name: 'BNG',
    kind: 'GROUP',
    parentCode: 'rede_ip',
    sortOrder: 1,
    matchKeywords: ['bng'],
  },
  {
    code: 'ip_internet_edge',
    name: 'Internet Edge',
    kind: 'GROUP',
    parentCode: 'rede_ip',
    sortOrder: 2,
    matchKeywords: ['internet edge', 'edge'],
  },

  // 2.4 Rede Móvel
  {
    code: 'rede_movel',
    name: 'Rede Móvel',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 3,
    matchKeywords: ['rede móvel', 'rede movel', 'móvel', 'movel', 'mobile', 'cellular'],
  },
  {
    code: 'movel_4g_lte',
    name: '4G / LTE',
    kind: 'GROUP',
    parentCode: 'rede_movel',
    sortOrder: 0,
    matchKeywords: ['4g', 'lte', '4g / lte'],
  },
  {
    code: 'movel_5g',
    name: '5G',
    kind: 'GROUP',
    parentCode: 'rede_movel',
    sortOrder: 1,
    matchKeywords: ['5g'],
  },

  // 2.5 Energia & Facilities
  {
    code: 'energia_facilities',
    name: 'Energia & Facilities',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 4,
    matchKeywords: ['energia & facilities', 'energia', 'facilities', 'power', 'power supply'],
  },
  {
    name: 'UPS',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['UPS', 'PowerSupply'],
    parentCode: 'energia_facilities',
    sortOrder: 0,
    matchKeywords: ['ups', 'no-break', 'power supply'],
  },
  {
    name: 'Retificador',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Rectifier'],
    parentCode: 'energia_facilities',
    sortOrder: 1,
    matchKeywords: ['retificador', 'rectifier'],
  },
  {
    name: 'Banco de Baterias',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['BatteryBank'],
    parentCode: 'energia_facilities',
    sortOrder: 2,
    matchKeywords: ['banco de baterias', 'bateria', 'baterias', 'battery'],
  },
  {
    name: 'Gerador',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['Generator'],
    parentCode: 'energia_facilities',
    sortOrder: 3,
    matchKeywords: ['gerador', 'generator'],
  },
  {
    name: 'Ar-condicionado',
    kind: 'RESOURCE_TYPE',
    typeCodes: ['AirConditioning'],
    parentCode: 'energia_facilities',
    sortOrder: 4,
    matchKeywords: ['ar-condicionado', 'ar condicionado', 'climatização', 'hvac'],
  },
];

async function run() {
  const db = await openLoaderDb();
  console.log(`\n=== CONSOLIDAÇÃO, DEDUPLICAÇÃO E REORGANIZAÇÃO DO CATÁLOGO MESTRE ===`);
  console.log(`Modo: ${APPLY ? 'APPLY (Escrita no banco)' : 'DRY-RUN (Simulação)'}`);
  console.log(`Tenant: ${TENANT_ID}`);

  // 1. Obter catálogo
  const catalogRes = await db.query(
    `SELECT id, code, name FROM tmf_resource_catalog WHERE tenant_id = $1 AND code = $2`,
    [TENANT_ID, CATALOG_CODE],
  );
  const catalog = catalogRes.rows[0];
  if (!catalog) {
    throw new Error(`Catálogo ${CATALOG_CODE} não encontrado.`);
  }
  const catalogId = catalog.id;

  // 2. Obter todos os ResourceTypes
  const typesRes = await db.query(
    `SELECT id, code, name FROM tmf_resource_type WHERE tenant_id = $1`,
    [TENANT_ID],
  );
  const typeByCode = new Map(typesRes.rows.map((t) => [t.code, t]));

  // 3. Obter todos os nós atuais do catálogo
  const nodesRes = await db.query(
    `SELECT id, code, name, kind, parent_node_id, resource_type_id, status, sort_order
       FROM tmf_resource_catalog_node
      WHERE tenant_id = $1 AND catalog_id = $2`,
    [TENANT_ID, catalogId],
  );
  const currentNodes = nodesRes.rows;
  console.log(`Nós atuais encontrados no catálogo: ${currentNodes.length}`);

  // Separar nós originais de nós recém-criados pelo seed anterior (que usavam prefixos como leaf_ ou infra_ se criados novos)
  const isNewlyGeneratedLeaf = (node) => node.code.startsWith('leaf_');

  // Vamos classificar e associar os nós canônicos
  const assignedNodeIds = new Set();
  const groupNodeMap = new Map(); // canonicalGroupCode -> nodeId
  const nodesToUpdate = []; // { id, name, parentCode, sortOrder, kind, resourceTypeId }
  const nodesToDelete = []; // ids de nós duplicados a deletar
  const sobraNodeIds = [];

  const crypto = await import('node:crypto');
  const now = new Date().toISOString();

  // 3.1 Primeiro, resolver os GRUPOS
  console.log(`\n--- 1. Mapeando e Criando/Reaproveitando Grupos ---`);
  const canonicalGroups = CANONICAL_TREE.filter((item) => item.kind === 'GROUP');

  for (const groupDef of canonicalGroups) {
    // Tenta encontrar um nó existente que seja GROUP com mesmo código ou palavra-chave
    let existingGroup = currentNodes.find((n) =>
      !assignedNodeIds.has(n.id) &&
      n.kind === 'GROUP' &&
      (n.code === groupDef.code || groupDef.matchKeywords?.some((kw) => n.name.toLowerCase() === kw || n.code.toLowerCase().includes(kw)))
    );

    let groupId;
    if (existingGroup) {
      groupId = existingGroup.id;
      assignedNodeIds.add(groupId);
      console.log(`  (✓) Grupo reaproveitado: "${existingGroup.name}" (${existingGroup.code}) -> será "${groupDef.name}" (${groupDef.code})`);
    } else {
      groupId = crypto.randomUUID();
      console.log(`  (+) Novo grupo necessário: "${groupDef.name}" (code: ${groupDef.code})`);
      if (APPLY) {
        await db.query(
          `INSERT INTO tmf_resource_catalog_node
           (id, tenant_id, catalog_id, parent_node_id, code, name, kind, resource_type_id, status, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, null, $4, $5, 'GROUP', null, 'active', $6, $7, $8)`,
          [groupId, TENANT_ID, catalogId, groupDef.code, groupDef.name, groupDef.sortOrder, now, now],
        );
      }
    }
    groupNodeMap.set(groupDef.code, groupId);
    nodesToUpdate.push({
      id: groupId,
      name: groupDef.name,
      code: groupDef.code,
      parentCode: groupDef.parentCode,
      sortOrder: groupDef.sortOrder,
      kind: 'GROUP',
      resourceTypeId: null,
    });
  }

  // 3.2 Segundo, resolver as FOLHAS (RESOURCE_TYPE)
  console.log(`\n--- 2. Mapeando e Priorizando Nós de Recurso Originais ---`);
  const canonicalLeaves = CANONICAL_TREE.filter((item) => item.kind === 'RESOURCE_TYPE');

  for (const leafDef of canonicalLeaves) {
    // 1. Procurar nós originais existentes vinculados a algum dos typeCodes
    const targetTypeIds = (leafDef.typeCodes || [])
      .map((tc) => typeByCode.get(tc)?.id)
      .filter(Boolean);

    // Candidatos: nós que ainda não foram associados
    const candidates = currentNodes.filter((n) => !assignedNodeIds.has(n.id) && n.kind === 'RESOURCE_TYPE');

    // Prioridade 1: nó que já aponta para o resource_type_id correto e NÃO é leaf_* (é o original)
    let matchedNode = candidates.find((n) =>
      !isNewlyGeneratedLeaf(n) &&
      n.resource_type_id && targetTypeIds.includes(n.resource_type_id)
    );

    // Prioridade 2: nó que casa por nome ou código e NÃO é leaf_*
    if (!matchedNode) {
      matchedNode = candidates.find((n) =>
        !isNewlyGeneratedLeaf(n) &&
        leafDef.matchKeywords?.some((kw) =>
          n.name.toLowerCase() === kw ||
          n.name.toLowerCase().includes(kw) ||
          n.code.toLowerCase().includes(kw)
        )
      );
    }

    // Prioridade 3: nó leaf_* criado anteriormente se não houver original
    if (!matchedNode) {
      matchedNode = candidates.find((n) =>
        n.resource_type_id && targetTypeIds.includes(n.resource_type_id)
      );
    }

    // Prioridade 4: qualquer nó com código exato
    if (!matchedNode) {
      matchedNode = candidates.find((n) =>
        leafDef.matchKeywords?.some((kw) => n.code.toLowerCase() === kw)
      );
    }

    // Determinar o resource_type_id final
    const finalTypeId = targetTypeIds[0] || (matchedNode?.resource_type_id ?? null);

    if (matchedNode) {
      assignedNodeIds.add(matchedNode.id);
      console.log(`  (✓) Nó vinculado: "${matchedNode.name}" (code: ${matchedNode.code}, id: ${matchedNode.id}) -> "${leafDef.name}" sob ${leafDef.parentCode}`);
      nodesToUpdate.push({
        id: matchedNode.id,
        name: leafDef.name,
        code: matchedNode.code,
        parentCode: leafDef.parentCode,
        sortOrder: leafDef.sortOrder,
        kind: 'RESOURCE_TYPE',
        resourceTypeId: finalTypeId,
      });

      // Se houver DUPLICATAS para este mesmo tipo (ex: leaf_* criado pelo script anterior), marcar para DELETAR
      const duplicates = candidates.filter((n) =>
        n.id !== matchedNode.id &&
        isNewlyGeneratedLeaf(n) &&
        n.resource_type_id && targetTypeIds.includes(n.resource_type_id)
      );
      for (const dup of duplicates) {
        if (!nodesToDelete.includes(dup.id)) {
          console.log(`    🗑️ Deletando duplicata temporária: "${dup.name}" (code: ${dup.code}, id: ${dup.id})`);
          nodesToDelete.push(dup.id);
          assignedNodeIds.add(dup.id);
        }
      }
    } else {
      // Criar nó folha novo se de fato não existia
      const newLeafId = crypto.randomUUID();
      const code = `rt_${leafDef.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      console.log(`  (+) Criando nó folha novo: "${leafDef.name}" (${code}) sob ${leafDef.parentCode}`);
      if (APPLY) {
        await db.query(
          `INSERT INTO tmf_resource_catalog_node
           (id, tenant_id, catalog_id, parent_node_id, code, name, kind, resource_type_id, status, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, null, $4, $5, 'RESOURCE_TYPE', $6, 'active', $7, $8, $9)`,
          [newLeafId, TENANT_ID, catalogId, code, leafDef.name, finalTypeId, leafDef.sortOrder, now, now],
        );
      }
      assignedNodeIds.add(newLeafId);
      nodesToUpdate.push({
        id: newLeafId,
        name: leafDef.name,
        code,
        parentCode: leafDef.parentCode,
        sortOrder: leafDef.sortOrder,
        kind: 'RESOURCE_TYPE',
        resourceTypeId: finalTypeId,
      });
    }
  }

  // 3.3 Identificar os nós restantes e classificar como SOBRA ou DELETAR duplicata
  console.log(`\n--- 3. Analisando nós não alocados (Sobras e Duplicatas) ---`);
  const remainingNodes = currentNodes.filter((n) =>
    !assignedNodeIds.has(n.id) &&
    !nodesToDelete.includes(n.id) &&
    n.code !== 'sobra'
  );

  for (const rem of remainingNodes) {
    if (isNewlyGeneratedLeaf(rem)) {
      // É um nó recém-gerado com leaf_ que sobrou -> deletar
      console.log(`  🗑️ Deletando nó temporário não utilizado: "${rem.name}" (${rem.code})`);
      nodesToDelete.push(rem.id);
    } else {
      // É um nó original do catálogo que não coube na hierarquia canônica -> mover para SOBRA
      console.log(`  📦 Mantendo em 'Sobra': [${rem.kind}] "${rem.name}" (code: ${rem.code})`);
      sobraNodeIds.push(rem);
    }
  }

  // 3.4 Executar remoção das duplicatas temporárias
  if (nodesToDelete.length > 0) {
    console.log(`\n--- 4. Removendo ${nodesToDelete.length} nós duplicados ---`);
    if (APPLY) {
      for (const delId of nodesToDelete) {
        await db.query(`DELETE FROM tmf_resource_catalog_node WHERE id = $1`, [delId]);
      }
      console.log(`  (✓) Duplicatas removidas com sucesso.`);
    } else {
      console.log(`  [DRY-RUN] Deletaria ${nodesToDelete.length} nós.`);
    }
  }

  // 3.5 Criar ou obter o grupo SOBRA se houver sobras
  let sobraGroupId = null;
  if (sobraNodeIds.length > 0) {
    console.log(`\n--- 5. Configurando Grupo 'Sobra' para ${sobraNodeIds.length} nós ---`);
    let sobraGroup = currentNodes.find((n) => n.code === 'sobra');
    if (!sobraGroup) {
      sobraGroupId = crypto.randomUUID();
      console.log(`(+) Criando Grupo 'Sobra'`);
      if (APPLY) {
        await db.query(
          `INSERT INTO tmf_resource_catalog_node
           (id, tenant_id, catalog_id, parent_node_id, code, name, kind, resource_type_id, status, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, null, 'sobra', 'Sobra', 'GROUP', null, 'active', 99, $4, $5)`,
          [sobraGroupId, TENANT_ID, catalogId, now, now],
        );
      }
    } else {
      sobraGroupId = sobraGroup.id;
      // Garante que o grupo Sobra em si seja raiz
      if (APPLY) {
        await db.query(
          `UPDATE tmf_resource_catalog_node SET parent_node_id = null, sort_order = 99 WHERE id = $1`,
          [sobraGroupId],
        );
      }
    }
  }

  // 3.6 Aplicar as movimentações de hierarquia (parent_node_id e sort_order)
  console.log(`\n--- 6. Aplicando Estrutura Hierárquica e Ordenação ---`);
  for (const item of nodesToUpdate) {
    const parentId = item.parentCode ? groupNodeMap.get(item.parentCode) : null;
    console.log(`  🔗 [${item.kind}] "${item.name}" -> pai: ${item.parentCode || 'RAIZ'} (sort: ${item.sortOrder})`);
    if (APPLY) {
      await db.query(
        `UPDATE tmf_resource_catalog_node
            SET name = $1, parent_node_id = $2, sort_order = $3, resource_type_id = $4, status = 'active', updated_at = $5
          WHERE id = $6`,
        [item.name, parentId, item.sortOrder, item.resourceTypeId, now, item.id],
      );
    }
  }

  // 3.7 Mover os itens de sobra para o grupo Sobra
  if (sobraGroupId && sobraNodeIds.length > 0) {
    let sOrder = 0;
    for (const sNode of sobraNodeIds) {
      if (sNode.id === sobraGroupId || sNode.code === 'sobra') continue;
      console.log(`  📦 Movendo para 'Sobra': "${sNode.name}"`);
      if (APPLY) {
        await db.query(
          `UPDATE tmf_resource_catalog_node
              SET parent_node_id = $1, sort_order = $2, updated_at = $3
            WHERE id = $4`,
          [sobraGroupId, sOrder++, now, sNode.id],
        );
      }
    }
  }

  console.log(`\n=== CONSOLIDAÇÃO FINALIZADA COM SUCESSO! ===\n`);
  await db.close();
}

run().catch((err) => {
  console.error('\n[ERRO]', err);
  process.exit(1);
});
