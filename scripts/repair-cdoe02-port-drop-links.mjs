#!/usr/bin/env node
/**
 * Repara as conexões físicas do piloto CDOE-02-ICARAI para o modelo da issue #177:
 *
 *   Porta FO.O.n → connectedTo → CaboDrop → connectedTo → ONT
 *
 * O script parte das conexões legadas CDOE → CaboDrop e encontra a porta sem depender de
 * posição de array: percorre CaboDrop → ONT e correlaciona o ONT com um RFS cujo
 * `supportingResource` contém, de modo unívoco, o ONT e uma Porta com `role=access`.
 *
 * É dry-run por padrão. Só grava com `--apply`; em cada reparo cria/confirma a conexão da porta
 * antes de remover a conexão legada da CDOE. Correlações ambíguas nunca são escolhidas.
 *
 * Uso:
 *   node scripts/repair-cdoe02-port-drop-links.mjs
 *   node scripts/repair-cdoe02-port-drop-links.mjs --apply
 *
 * Variáveis: NEXUS_API (http://127.0.0.1:4001), NEXUS_TOKEN (change-me).
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const APPLY = process.argv.includes('--apply');
const CDOE_NAME = 'CDOE-02-ICARAI';

async function api(method, pathname, body) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function resourceById(id) {
  return await api('GET', `/tmf-api/resourceInventoryManagement/v4/resource/${id}`);
}

async function relationships(resourceId) {
  return await api('GET', `/tmf-api/resourceInventoryManagement/v4/resource/${resourceId}/relationships`);
}

const hasRelationship = (items, id, relationshipType) =>
  (items ?? []).some((item) => item.id === id && item.relationshipType === relationshipType);

async function ensurePortDropLink(portId, dropId) {
  const existing = await relationships(portId);
  if (hasRelationship(existing, dropId, 'connectedTo')) return 'already-correct';
  if (!APPLY) return 'would-link';
  await api('POST', `/tmf-api/resourceInventoryManagement/v4/resource/${portId}/relationships`, {
    id: dropId,
    relationshipType: 'connectedTo',
    '@referredType': 'Resource',
  });
  const confirmed = await relationships(portId);
  if (!hasRelationship(confirmed, dropId, 'connectedTo')) {
    throw new Error(`Aresta Porta ${portId} → drop ${dropId} não foi confirmada.`);
  }
  return 'linked';
}

async function removeLegacyLink(cdoeId, dropId) {
  if (!APPLY) return 'would-remove';
  await api(
    'DELETE',
    `/tmf-api/resourceInventoryManagement/v4/resource/${cdoeId}/relationships/${dropId}/connectedTo`,
  );
  const remaining = await relationships(cdoeId);
  if (hasRelationship(remaining, dropId, 'connectedTo')) {
    throw new Error(`Aresta legada CDOE ${cdoeId} → drop ${dropId} continua presente.`);
  }
  return 'removed';
}

const connectedOntIds = async (dropId) => {
  const direct = await relationships(dropId);
  const candidates = (direct ?? []).filter((item) => item.relationshipType === 'connectedTo');
  const resources = await Promise.all(candidates.map(async (item) => await resourceById(item.id)));
  return resources.filter((item) => item.resourceType === 'ONT').map((item) => item.id);
};

const portIdsForOnt = (services, ontId) => {
  const candidates = services.filter((service) => {
    if (service['@type'] !== 'ResourceFacingService') return false;
    const resources = service.supportingResource ?? [];
    return resources.some((resource) => resource.id === ontId);
  });
  return [...new Set(candidates.flatMap((service) =>
    (service.supportingResource ?? [])
      .filter((resource) => resource.role === 'access' && resource['@referredType'] === 'PhysicalResource')
      .map((resource) => resource.id),
  ))];
};

async function main() {
  console.log(`repair-cdoe02-port-drop-links: apply=${APPLY} base=${BASE}`);
  const resources = await api(
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource?name=${encodeURIComponent(CDOE_NAME)}`,
  );
  const cdoe = (resources ?? []).find((resource) => resource.name === CDOE_NAME);
  if (!cdoe) throw new Error(`${CDOE_NAME} não encontrada.`);

  const services = await api('GET', '/tmf-api/serviceInventoryManagement/v4/service');
  const legacy = (await relationships(cdoe.id)).filter(
    (relationship) => relationship.relationshipType === 'connectedTo',
  );
  const report = { linked: 0, alreadyCorrect: 0, removed: 0, ambiguous: 0, notFound: 0, ignored: 0 };

  for (const relationship of legacy) {
    const drop = await resourceById(relationship.id);
    if (drop.resourceType !== 'DropCable') {
      report.ignored++;
      continue;
    }
    const onts = await connectedOntIds(drop.id);
    const ports = [...new Set((await Promise.all(onts.map(async (ontId) => portIdsForOnt(services, ontId)))).flat())];
    if (ports.length !== 1) {
      const kind = ports.length === 0 ? 'notFound' : 'ambiguous';
      report[kind]++;
      console.log(`  ! ${drop.name}: ${ports.length === 0 ? 'nenhuma' : ports.length} porta(s) correlacionada(s); preservada.`);
      continue;
    }

    const [portId] = ports;
    const port = await resourceById(portId);
    if (port.resourceType !== 'Port') {
      report.notFound++;
      console.log(`  ! ${drop.name}: RFS aponta ${portId}, que não é uma Porta; preservada.`);
      continue;
    }
    const linkResult = await ensurePortDropLink(port.id, drop.id);
    if (linkResult === 'already-correct') report.alreadyCorrect++;
    else if (linkResult === 'linked') report.linked++;
    const removeResult = await removeLegacyLink(cdoe.id, drop.id);
    if (removeResult === 'removed') report.removed++;
    console.log(`  ${drop.name}: ${port.name} — ${linkResult}; ${removeResult}.`);
  }

  console.log('== Relatório ==');
  console.log(`Criadas: ${report.linked}; já corretas: ${report.alreadyCorrect}; legadas removidas: ${report.removed}.`);
  console.log(`Ambíguas: ${report.ambiguous}; não encontradas: ${report.notFound}; ignoradas: ${report.ignored}.`);
  if (!APPLY) console.log('Nenhuma alteração foi feita. Revise o relatório e rode com --apply para gravar.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
