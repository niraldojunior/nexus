#!/usr/bin/env node
/**
 * Alinha e estrutura a árvore do Catálogo Mestre V.tal Nexus (tmf_resource_catalog_node)
 * e seus ResourceTypes (tmf_resource_type) de acordo com a hierarquia canônica de:
 *  - Infraestrutura Passiva (Aérea, Subterrânea, Estruturas Internas, Infraestrutura Óptica Compartilhada)
 *  - Rede de Telecom (Rede de Acesso, Transporte, IP, Móvel, Energia & Facilities)
 *
 * Nós pré-existentes que não se encaixarem na taxonomia padrão são preservados e
 * agrupados sob um nó "Sobra" para análise e curadoria humana.
 *
 * Uso:
 *   node scripts/seed-vtal-master-catalog.mjs              # dry-run
 *   node scripts/seed-vtal-master-catalog.mjs --apply      # aplica alterações
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');
const TENANT_ID = 'vtal';
const CATALOG_CODE = 'nexus-master-resource-catalog';

// ==============================================================================
// 1. Definição do Catálogo Canônico e Taxonomia
// ==============================================================================

/** Novos tipos de recurso a garantir em tmf_resource_type */
const REQUIRED_RESOURCE_TYPES = [
  // Infra Aérea
  { code: 'Pole', name: 'Poste', categoryCode: 'Infrastructure.Passive.Aerial' },
  { code: 'Tower', name: 'Torre', categoryCode: 'Infrastructure.Passive.Aerial' },
  { code: 'Mast', name: 'Mastro', categoryCode: 'Infrastructure.Passive.Aerial' },

  // Infra Subterrânea
  { code: 'Duct', name: 'Duto', categoryCode: 'Infrastructure.Passive.Underground' },
  { code: 'Subduct', name: 'Subduto', categoryCode: 'Infrastructure.Passive.Underground' },
  { code: 'Manhole', name: 'Caixa de Passagem', categoryCode: 'Infrastructure.Passive.Underground' },
  { code: 'UndergroundChamber', name: 'Câmara Subterrânea', categoryCode: 'Infrastructure.Passive.Underground' },
  { code: 'Trench', name: 'Canaleta', categoryCode: 'Infrastructure.Passive.Underground' },

  // Estruturas Internas
  { code: 'Rack', name: 'Rack', categoryCode: 'Infrastructure.Passive.Internal' },
  { code: 'Frame', name: 'Bastidor', categoryCode: 'Infrastructure.Passive.Internal' },
  { code: 'Shelf', name: 'Shelf', categoryCode: 'Infrastructure.Passive.Internal' },
  { code: 'Slot', name: 'Slot', categoryCode: 'Infrastructure.Passive.Internal' },

  // Infra Óptica Compartilhada
  { code: 'OpticalCable', name: 'Cabo Óptico', categoryCode: 'Infrastructure.Passive.Optical' },
  { code: 'Fiber', name: 'Fibra Óptica', categoryCode: 'Infrastructure.Passive.Optical' },
  { code: 'PatchCord', name: 'Cordão Óptico', categoryCode: 'Infrastructure.Passive.Optical' },
  { code: 'DIO', name: 'DIO / ODF', categoryCode: 'Infrastructure.Passive.Optical' },
  { code: 'SpliceClosure', name: 'CEO (Caixa de Emenda Óptica)', categoryCode: 'Infrastructure.Passive.Optical' },
  { code: 'OpticalConnector', name: 'Conector Óptico', categoryCode: 'Infrastructure.Passive.Optical' },

  // Rede de Acesso - GPON - Equipamentos
  { code: 'OLT', name: 'OLT', categoryCode: 'Telecom.Access.GPON.Equipment' },
  { code: 'ONT', name: 'ONT', categoryCode: 'Telecom.Access.GPON.Equipment' },
  { code: 'ONU', name: 'ONU', categoryCode: 'Telecom.Access.GPON.Equipment' },

  // Rede de Acesso - GPON - Distribuição
  { code: 'CDO', name: 'CDO', categoryCode: 'Telecom.Access.GPON.Distribution' },
  { code: 'CTO', name: 'CTO', categoryCode: 'Telecom.Access.GPON.Distribution' },
  { code: 'Splitter', name: 'Splitter', categoryCode: 'Telecom.Access.GPON.Distribution' },

  // Rede de Acesso - GPON - Interfaces
  { code: 'PONPort', name: 'Porta PON', categoryCode: 'Telecom.Access.GPON.Interface' },
  { code: 'ONTPort', name: 'Porta ONT', categoryCode: 'Telecom.Access.GPON.Interface' },

  // Rede de Acesso - GPON - Recursos Lógicos
  { code: 'PONLogical', name: 'PON', categoryCode: 'Logical.Telecom.Access.GPON' },
  { code: 'ONTID', name: 'ONT ID', categoryCode: 'Logical.Telecom.Access.GPON' },
  { code: 'GEMPort', name: 'GEM Port', categoryCode: 'Logical.Telecom.Access.GPON' },
  { code: 'VLAN', name: 'VLAN', categoryCode: 'Logical.Telecom.Access.GPON' },

  // Energia & Facilities
  { code: 'UPS', name: 'UPS (No-Break)', categoryCode: 'Telecom.EnergyFacilities' },
  { code: 'Rectifier', name: 'Retificador', categoryCode: 'Telecom.EnergyFacilities' },
  { code: 'BatteryBank', name: 'Banco de Baterias', categoryCode: 'Telecom.EnergyFacilities' },
  { code: 'Generator', name: 'Gerador', categoryCode: 'Telecom.EnergyFacilities' },
  { code: 'AirConditioning', name: 'Ar-condicionado', categoryCode: 'Telecom.EnergyFacilities' },
];

/**
 * Estrutura da árvore canônica solicitada:
 * kind: 'GROUP' | 'RESOURCE_TYPE'
 * parentPath: caminho até o pai usando 'code'
 */
const CANONICAL_TREE_NODES = [
  // ==========================================
  // 1. INFRAESTRUTURA PASSIVA (RAIZ)
  // ==========================================
  {
    code: 'infra_passiva',
    name: 'Infraestrutura Passiva',
    kind: 'GROUP',
    parentCode: null,
    sortOrder: 0,
  },
  // --- 1.1 Infraestrutura Aérea ---
  {
    code: 'infra_aerea',
    name: 'Infraestrutura Aérea',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 0,
  },
  {
    code: 'leaf_poste',
    name: 'Poste',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Pole',
    parentCode: 'infra_aerea',
    sortOrder: 0,
  },
  {
    code: 'leaf_torre',
    name: 'Torre',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Tower',
    parentCode: 'infra_aerea',
    sortOrder: 1,
  },
  {
    code: 'leaf_mastro',
    name: 'Mastro',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Mast',
    parentCode: 'infra_aerea',
    sortOrder: 2,
  },

  // --- 1.2 Infraestrutura Subterrânea ---
  {
    code: 'infra_subterranea',
    name: 'Infraestrutura Subterrânea',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 1,
  },
  {
    code: 'leaf_duto',
    name: 'Duto',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Duct',
    parentCode: 'infra_subterranea',
    sortOrder: 0,
  },
  {
    code: 'leaf_subduto',
    name: 'Subduto',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Subduct',
    parentCode: 'infra_subterranea',
    sortOrder: 1,
  },
  {
    code: 'leaf_caixa_passagem',
    name: 'Caixa de Passagem',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Manhole',
    parentCode: 'infra_subterranea',
    sortOrder: 2,
  },
  {
    code: 'leaf_camara_subterranea',
    name: 'Câmara Subterrânea',
    kind: 'RESOURCE_TYPE',
    typeCode: 'UndergroundChamber',
    parentCode: 'infra_subterranea',
    sortOrder: 3,
  },
  {
    code: 'leaf_canaleta',
    name: 'Canaleta',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Trench',
    parentCode: 'infra_subterranea',
    sortOrder: 4,
  },

  // --- 1.3 Estruturas Internas ---
  {
    code: 'estruturas_internas',
    name: 'Estruturas Internas',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 2,
  },
  {
    code: 'leaf_rack',
    name: 'Rack',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Rack',
    parentCode: 'estruturas_internas',
    sortOrder: 0,
  },
  {
    code: 'leaf_bastidor',
    name: 'Bastidor',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Frame',
    parentCode: 'estruturas_internas',
    sortOrder: 1,
  },
  {
    code: 'leaf_shelf',
    name: 'Shelf',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Shelf',
    parentCode: 'estruturas_internas',
    sortOrder: 2,
  },
  {
    code: 'leaf_slot',
    name: 'Slot',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Slot',
    parentCode: 'estruturas_internas',
    sortOrder: 3,
  },

  // --- 1.4 Infraestrutura Óptica Compartilhada ---
  {
    code: 'infra_optica_compartilhada',
    name: 'Infraestrutura Óptica Compartilhada',
    kind: 'GROUP',
    parentCode: 'infra_passiva',
    sortOrder: 3,
  },
  {
    code: 'leaf_cabo_optico',
    name: 'Cabo Óptico',
    kind: 'RESOURCE_TYPE',
    typeCode: 'OpticalCable',
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 0,
  },
  {
    code: 'leaf_fibra_optica',
    name: 'Fibra Óptica',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Fiber',
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 1,
  },
  {
    code: 'leaf_cordao_optico',
    name: 'Cordão Óptico',
    kind: 'RESOURCE_TYPE',
    typeCode: 'PatchCord',
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 2,
  },
  {
    code: 'leaf_dio_odf',
    name: 'DIO / ODF',
    kind: 'RESOURCE_TYPE',
    typeCode: 'DIO',
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 3,
  },
  {
    code: 'leaf_ceo',
    name: 'CEO',
    kind: 'RESOURCE_TYPE',
    typeCode: 'SpliceClosure',
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 4,
  },
  {
    code: 'leaf_conector_optico',
    name: 'Conector Óptico',
    kind: 'RESOURCE_TYPE',
    typeCode: 'OpticalConnector',
    parentCode: 'infra_optica_compartilhada',
    sortOrder: 5,
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
  },
  // --- 2.1 Rede de Acesso ---
  {
    code: 'rede_acesso',
    name: 'Rede de Acesso',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 0,
  },
  // GPON
  {
    code: 'acesso_gpon',
    name: 'GPON',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 0,
  },
  // GPON -> Equipamentos
  {
    code: 'gpon_equipamentos',
    name: 'Equipamentos',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 0,
  },
  {
    code: 'leaf_gpon_olt',
    name: 'OLT',
    kind: 'RESOURCE_TYPE',
    typeCode: 'OLT',
    parentCode: 'gpon_equipamentos',
    sortOrder: 0,
  },
  {
    code: 'leaf_gpon_ont',
    name: 'ONT',
    kind: 'RESOURCE_TYPE',
    typeCode: 'ONT',
    parentCode: 'gpon_equipamentos',
    sortOrder: 1,
  },
  {
    code: 'leaf_gpon_onu',
    name: 'ONU',
    kind: 'RESOURCE_TYPE',
    typeCode: 'ONU',
    parentCode: 'gpon_equipamentos',
    sortOrder: 2,
  },

  // GPON -> Distribuição
  {
    code: 'gpon_distribuicao',
    name: 'Distribuição',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 1,
  },
  {
    code: 'leaf_gpon_cdo',
    name: 'CDO',
    kind: 'RESOURCE_TYPE',
    typeCode: 'CDO',
    parentCode: 'gpon_distribuicao',
    sortOrder: 0,
  },
  {
    code: 'leaf_gpon_cto',
    name: 'CTO',
    kind: 'RESOURCE_TYPE',
    typeCode: 'CTO',
    parentCode: 'gpon_distribuicao',
    sortOrder: 1,
  },
  {
    code: 'leaf_gpon_splitter',
    name: 'Splitter',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Splitter',
    parentCode: 'gpon_distribuicao',
    sortOrder: 2,
  },

  // GPON -> Interfaces
  {
    code: 'gpon_interfaces',
    name: 'Interfaces',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 2,
  },
  {
    code: 'leaf_gpon_porta_pon',
    name: 'Porta PON',
    kind: 'RESOURCE_TYPE',
    typeCode: 'PONPort',
    parentCode: 'gpon_interfaces',
    sortOrder: 0,
  },
  {
    code: 'leaf_gpon_porta_ont',
    name: 'Porta ONT',
    kind: 'RESOURCE_TYPE',
    typeCode: 'ONTPort',
    parentCode: 'gpon_interfaces',
    sortOrder: 1,
  },

  // GPON -> Recursos Lógicos
  {
    code: 'gpon_recursos_logicos',
    name: 'Recursos Lógicos',
    kind: 'GROUP',
    parentCode: 'acesso_gpon',
    sortOrder: 3,
  },
  {
    code: 'leaf_gpon_pon_logico',
    name: 'PON',
    kind: 'RESOURCE_TYPE',
    typeCode: 'PONLogical',
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 0,
  },
  {
    code: 'leaf_gpon_ont_id',
    name: 'ONT ID',
    kind: 'RESOURCE_TYPE',
    typeCode: 'ONTID',
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 1,
  },
  {
    code: 'leaf_gpon_gem_port',
    name: 'GEM Port',
    kind: 'RESOURCE_TYPE',
    typeCode: 'GEMPort',
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 2,
  },
  {
    code: 'leaf_gpon_vlan',
    name: 'VLAN',
    kind: 'RESOURCE_TYPE',
    typeCode: 'VLAN',
    parentCode: 'gpon_recursos_logicos',
    sortOrder: 3,
  },

  // Outros Acessos (Grupos)
  {
    code: 'acesso_xgs_pon',
    name: 'XGS-PON',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 1,
  },
  {
    code: 'acesso_hfc',
    name: 'HFC',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 2,
  },
  {
    code: 'acesso_ethernet',
    name: 'Ethernet',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 3,
  },
  {
    code: 'acesso_fwa',
    name: 'FWA',
    kind: 'GROUP',
    parentCode: 'rede_acesso',
    sortOrder: 4,
  },

  // --- 2.2 Rede de Transporte ---
  {
    code: 'rede_transporte',
    name: 'Rede de Transporte',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 1,
  },
  {
    code: 'transporte_dwdm',
    name: 'DWDM',
    kind: 'GROUP',
    parentCode: 'rede_transporte',
    sortOrder: 0,
  },
  {
    code: 'transporte_otn',
    name: 'OTN',
    kind: 'GROUP',
    parentCode: 'rede_transporte',
    sortOrder: 1,
  },
  {
    code: 'transporte_sdh',
    name: 'SDH',
    kind: 'GROUP',
    parentCode: 'rede_transporte',
    sortOrder: 2,
  },

  // --- 2.3 Rede IP ---
  {
    code: 'rede_ip',
    name: 'Rede IP',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 2,
  },
  {
    code: 'ip_mpls',
    name: 'IP/MPLS',
    kind: 'GROUP',
    parentCode: 'rede_ip',
    sortOrder: 0,
  },
  {
    code: 'ip_bng',
    name: 'BNG',
    kind: 'GROUP',
    parentCode: 'rede_ip',
    sortOrder: 1,
  },
  {
    code: 'ip_internet_edge',
    name: 'Internet Edge',
    kind: 'GROUP',
    parentCode: 'rede_ip',
    sortOrder: 2,
  },

  // --- 2.4 Rede Móvel ---
  {
    code: 'rede_movel',
    name: 'Rede Móvel',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 3,
  },
  {
    code: 'movel_4g_lte',
    name: '4G / LTE',
    kind: 'GROUP',
    parentCode: 'rede_movel',
    sortOrder: 0,
  },
  {
    code: 'movel_5g',
    name: '5G',
    kind: 'GROUP',
    parentCode: 'rede_movel',
    sortOrder: 1,
  },

  // --- 2.5 Energia & Facilities ---
  {
    code: 'energia_facilities',
    name: 'Energia & Facilities',
    kind: 'GROUP',
    parentCode: 'rede_telecom',
    sortOrder: 4,
  },
  {
    code: 'leaf_ups',
    name: 'UPS',
    kind: 'RESOURCE_TYPE',
    typeCode: 'UPS',
    parentCode: 'energia_facilities',
    sortOrder: 0,
  },
  {
    code: 'leaf_retificador',
    name: 'Retificador',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Rectifier',
    parentCode: 'energia_facilities',
    sortOrder: 1,
  },
  {
    code: 'leaf_banco_baterias',
    name: 'Banco de Baterias',
    kind: 'RESOURCE_TYPE',
    typeCode: 'BatteryBank',
    parentCode: 'energia_facilities',
    sortOrder: 2,
  },
  {
    code: 'leaf_gerador',
    name: 'Gerador',
    kind: 'RESOURCE_TYPE',
    typeCode: 'Generator',
    parentCode: 'energia_facilities',
    sortOrder: 3,
  },
  {
    code: 'leaf_ar_condicionado',
    name: 'Ar-condicionado',
    kind: 'RESOURCE_TYPE',
    typeCode: 'AirConditioning',
    parentCode: 'energia_facilities',
    sortOrder: 4,
  },
];

// ==============================================================================
// 2. Execução do Script
// ==============================================================================

async function run() {
  const db = await openLoaderDb();
  console.log(`\n=== ALINHAMENTO DO CATÁLOGO MESTRE V.TAL NEXUS ===`);
  console.log(`Modo: ${APPLY ? 'APPLY (Escrita no banco)' : 'DRY-RUN (Apenas visualização)'}`);
  console.log(`Tenant: ${TENANT_ID}`);

  // 1. Obter ou criar o catálogo
  let catalogRes = await db.query(
    `SELECT id, code, name FROM tmf_resource_catalog WHERE tenant_id = $1 AND code = $2`,
    [TENANT_ID, CATALOG_CODE],
  );
  let catalogId = catalogRes.rows[0]?.id;

  if (!catalogId) {
    console.log(`\n(!) Catálogo ${CATALOG_CODE} não encontrado para tenant ${TENANT_ID}.`);
    if (APPLY) {
      const crypto = await import('node:crypto');
      catalogId = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.query(
        `INSERT INTO tmf_resource_catalog (id, tenant_id, code, name, description, status, is_default, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', 1, 0, $6, $7)`,
        [catalogId, TENANT_ID, CATALOG_CODE, 'Catálogo Mestre V.tal Nexus', 'Árvore de navegação governada.', now, now],
      );
      console.log(`(+) Catálogo criado com ID: ${catalogId}`);
    } else {
      console.log(`[DRY-RUN] Criaria o catálogo ${CATALOG_CODE}`);
      catalogId = 'dummy-catalog-id';
    }
  } else {
    console.log(`Catálogo encontrado: "${catalogRes.rows[0].name}" (${catalogId})`);
  }

  // 2. Obter e garantir ResourceTypes necessários
  const existingTypesRes = await db.query(
    `SELECT id, code, name FROM tmf_resource_type WHERE tenant_id = $1`,
    [TENANT_ID],
  );
  const typeMapByCode = new Map(existingTypesRes.rows.map((r) => [r.code, r.id]));

  console.log(`\n--- Garantindo ResourceTypes necessários (${REQUIRED_RESOURCE_TYPES.length} no catálogo) ---`);
  for (const rt of REQUIRED_RESOURCE_TYPES) {
    if (!typeMapByCode.has(rt.code)) {
      console.log(`(+) Criando ResourceType: ${rt.name} (${rt.code})`);
      if (APPLY) {
        const crypto = await import('node:crypto');
        const rtId = `rt-${rt.code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
        const now = new Date().toISOString();
        await db.query(
          `INSERT INTO tmf_resource_type (id, tenant_id, code, name, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', $5, $6)`,
          [rtId, TENANT_ID, rt.code, rt.name, now, now],
        );
        typeMapByCode.set(rt.code, rtId);
      }
    } else {
      console.log(`(✓) ResourceType já existente: ${rt.name} (${rt.code})`);
    }
  }

  // Se for cabo, mapear sinônimos legados
  const getTypeId = (code) => {
    if (typeMapByCode.has(code)) return typeMapByCode.get(code);
    if (code === 'OpticalCable') {
      return typeMapByCode.get('DistributionCable') || typeMapByCode.get('BackboneCable') || typeMapByCode.get('DropCable');
    }
    return null;
  };

  // 3. Buscar nós atuais da árvore
  const currentNodesRes = await db.query(
    `SELECT id, code, name, kind, parent_node_id, resource_type_id, status, sort_order
       FROM tmf_resource_catalog_node
      WHERE tenant_id = $1 AND catalog_id = $2`,
    [TENANT_ID, catalogId],
  );
  const currentNodes = currentNodesRes.rows;
  console.log(`\nNós atuais no catálogo: ${currentNodes.length}`);

  const nodeMapByCode = new Map(currentNodes.map((n) => [n.code, n]));
  const canonicalCodes = new Set(CANONICAL_TREE_NODES.map((n) => n.code));

  // 4. Identificar Sobras (nós existentes que não constam na nova árvore canônica)
  const sobraNodes = currentNodes.filter((n) => !canonicalCodes.has(n.code) && n.code !== 'sobra');
  console.log(`\n--- Identificação de Sobras: ${sobraNodes.length} nós existentes para mover para 'Sobra' ---`);
  for (const s of sobraNodes) {
    console.log(`  - [${s.kind}] ${s.name} (code: ${s.code}, id: ${s.id})`);
  }

  // 5. Estruturar/Atualizar nós canônicos
  console.log(`\n--- Estruturando ${CANONICAL_TREE_NODES.length} nós canônicos ---`);
  const crypto = await import('node:crypto');
  const codeToIdMap = new Map(currentNodes.map((n) => [n.code, n.id]));

  // Primeiro passo: garantir que todos os nós canônicos existam com ID
  for (const nodeDef of CANONICAL_TREE_NODES) {
    let existingNode = nodeMapByCode.get(nodeDef.code);
    const resourceTypeId = nodeDef.kind === 'RESOURCE_TYPE' ? getTypeId(nodeDef.typeCode) : null;

    if (!existingNode) {
      const newNodeId = crypto.randomUUID();
      codeToIdMap.set(nodeDef.code, newNodeId);
      console.log(`(+) Criar Nó: [${nodeDef.kind}] ${nodeDef.name} (code: ${nodeDef.code})`);
      if (APPLY) {
        const now = new Date().toISOString();
        await db.query(
          `INSERT INTO tmf_resource_catalog_node
           (id, tenant_id, catalog_id, parent_node_id, code, name, kind, resource_type_id, status, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, null, $4, $5, $6, $7, 'active', $8, $9, $10)`,
          [newNodeId, TENANT_ID, catalogId, nodeDef.code, nodeDef.name, nodeDef.kind, resourceTypeId, nodeDef.sortOrder, now, now],
        );
      }
    } else {
      codeToIdMap.set(nodeDef.code, existingNode.id);
      console.log(`(✓) Atualizar Nó: [${nodeDef.kind}] ${nodeDef.name} (code: ${nodeDef.code})`);
      if (APPLY) {
        const now = new Date().toISOString();
        await db.query(
          `UPDATE tmf_resource_catalog_node
              SET name = $1, kind = $2, resource_type_id = $3, status = 'active', sort_order = $4, updated_at = $5
            WHERE id = $6`,
          [nodeDef.name, nodeDef.kind, resourceTypeId, nodeDef.sortOrder, now, existingNode.id],
        );
      }
    }
  }

  // Segundo passo: amarrar relações pai/filho e ordenação dos nós canônicos
  console.log(`\n--- Vinculando hierarquia pai/filho dos nós canônicos ---`);
  for (const nodeDef of CANONICAL_TREE_NODES) {
    const nodeId = codeToIdMap.get(nodeDef.code);
    const parentNodeId = nodeDef.parentCode ? codeToIdMap.get(nodeDef.parentCode) : null;
    console.log(`  🔗 ${nodeDef.code} -> pai: ${nodeDef.parentCode || 'RAIZ'} (sort: ${nodeDef.sortOrder})`);
    if (APPLY) {
      await db.query(
        `UPDATE tmf_resource_catalog_node
            SET parent_node_id = $1, sort_order = $2
          WHERE id = $3`,
        [parentNodeId, nodeDef.sortOrder, nodeId],
      );
    }
  }

  // 6. Tratar o grupo 'Sobra' se houver nós excedentes
  if (sobraNodes.length > 0) {
    console.log(`\n--- Configurando Grupo 'Sobra' e movendo ${sobraNodes.length} itens ---`);
    let sobraGroup = nodeMapByCode.get('sobra');
    let sobraGroupId = sobraGroup?.id;
    if (!sobraGroupId) {
      sobraGroupId = crypto.randomUUID();
      console.log(`(+) Criando Grupo 'Sobra' (code: sobra, id: ${sobraGroupId})`);
      if (APPLY) {
        const now = new Date().toISOString();
        await db.query(
          `INSERT INTO tmf_resource_catalog_node
           (id, tenant_id, catalog_id, parent_node_id, code, name, kind, resource_type_id, status, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, null, 'sobra', 'Sobra', 'GROUP', null, 'active', 99, $4, $5)`,
          [sobraGroupId, TENANT_ID, catalogId, now, now],
        );
      }
    }

    // Mover nós sobressalentes que não são filhos de outro nó sobressalente para o grupo Sobra
    const sobraIds = new Set(sobraNodes.map((s) => s.id));
    let sOrder = 0;
    for (const sNode of sobraNodes) {
      // Se o pai dele não estiver nas sobras, move para a raiz de Sobra
      const parentIsSobra = sNode.parent_node_id && sobraIds.has(sNode.parent_node_id);
      if (!parentIsSobra) {
        console.log(`  📦 Movendo para 'Sobra': ${sNode.name} (${sNode.code})`);
        if (APPLY) {
          await db.query(
            `UPDATE tmf_resource_catalog_node
                SET parent_node_id = $1, sort_order = $2
              WHERE id = $3`,
            [sobraGroupId, sOrder++, sNode.id],
          );
        }
      }
    }
  }

  console.log(`\n=== CONCLUÍDO COM SUCESSO ===\n`);
  await db.close();
}

run().catch((err) => {
  console.error('\n[ERRO]', err);
  process.exit(1);
});
