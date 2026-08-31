#!/usr/bin/env node
/**
 * Materializa portas de splitter (FO.I/FO.O) para as CDOEs do piloto Niterói/Icaraí
 * (issue #171 Fase 3, issue de rastreio #173).
 *
 * Por que só o piloto, e não a carga nacional Netwin:
 *   A carga nacional (`scripts/load-recursos-netwin.mjs`) agrupa todos os splitters sob
 *   uma única ResourceSpecification genérica "Splitter" — a razão de divisão real
 *   (coluna MODELO do CSV Netwin) nunca chega ao banco. Sem razão real não há como
 *   materializar porta sem inventar dado (C6/AGENTS.md). O piloto Icaraí é diferente:
 *   cada CDOE já carrega uma characteristic `capacidade` real (ver seed-gpon-niteroi.mjs)
 *   — é essa a única razão de divisão real disponível hoje, e é ela que este script usa.
 *   Carga nacional fica para depois, quando existir um importador direto do BD de DR do
 *   Netwin (issue futura do usuário) — este script não mexe em `load-recursos-netwin.mjs`.
 *
 * Achado de topologia: o splitter real do piloto (SPLITTER-1x8-ICARAI-01) não é
 * `containsAsChild` de nenhuma CDOE — ele fica no poste (`mountedOn`) e alimenta as 3
 * CDOEs via cabo secundário (`connectedTo`). Cada CDOE, por sua vez, vai direto ao cabo
 * drop, sem splitter próprio. Para a aba "Portas" ter o que mostrar (CTO → Splitter →
 * Porta, C2/C3), este script cria um splitter PRÓPRIO por CDOE — reaproveitando a
 * `capacidade` (razão) já existente em cada CDOE, nunca um valor inventado — e o liga a
 * ela via `containsAsChild`. O splitter pai da rede (o do poste) e sua cadeia
 * `mountedOn`/`connectedTo` para as 3 CDOEs continuam intactos; nada em
 * `seed-gpon-niteroi.mjs` é alterado.
 *
 * Idempotente: identifica splitter e portas por nome (`<CDOE> · Splitter`,
 * `<CDOE> · Splitter · FO.I`, `<CDOE> · Splitter · FO.O.<n>`) e só cria o que falta.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/load-cto-ports.mjs                 # dry-run — só relatório
 *   node scripts/load-cto-ports.mjs --apply         # grava
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const APPLY = process.argv.includes('--apply');

// Único escopo suportado nesta fase — ver cabeçalho. `--scope pilot` é aceito por
// simetria com outros scripts de carga, mas qualquer outro valor é rejeitado cedo.
const scopeArgIndex = process.argv.indexOf('--scope');
const scope = scopeArgIndex >= 0 ? process.argv[scopeArgIndex + 1] : 'pilot';
if (scope !== 'pilot') {
  console.error(`Escopo "${scope}" não suportado — só "pilot" existe nesta fase (ver cabeçalho).`);
  process.exit(1);
}

// Nome das CDOEs do piloto (seed-gpon-niteroi.mjs, RAMAIS) — casamento exato, não LIKE,
// para nunca varrer a base nacional por engano.
const PILOT_CDOE_NAMES = ['CDOE-01-ICARAI', 'CDOE-02-ICARAI', 'CDOE-03-ICARAI'];

const SPLITTER_SPEC_NAME_PREFIX = 'Splitter óptico 1:';
const PORT_SPEC_NAME = 'Porta de Splitter';

async function api(method, pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

/** Busca por nome é substring (ver postgres-repository.ts) — filtra o exato aqui. */
async function findResourceByExactName(name) {
  const results = await api('GET', `/tmf-api/resourceInventoryManagement/v4/resource?name=${encodeURIComponent(name)}`);
  return (results ?? []).find((r) => r.name === name) ?? null;
}

async function findResourceSpecByExactName(name) {
  const results = await api(
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification?name=${encodeURIComponent(name)}`,
  );
  return (results ?? []).find((s) => s.name === name) ?? null;
}

async function ensureResourceSpec(name, category, resourceType) {
  const found = await findResourceSpecByExactName(name);
  if (found) return found.id;
  const spec = await api('POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    name,
    category,
    resourceType,
  });
  report.specsCreated++;
  return spec.id;
}

async function ensureResource({ name, specId, placeId, placeType, serialNumber, characteristic = [] }) {
  const found = await findResourceByExactName(name);
  if (found) {
    report.resourcesReused++;
    return { id: found.id, '@type': found['@type'] ?? 'PhysicalResource' };
  }
  if (!APPLY) {
    report.resourcesToCreate.push(name);
    return { id: `dry-run:${name}`, '@type': 'PhysicalResource' };
  }
  const resource = await api('POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name,
    resourceSpecificationId: specId,
    placeId,
    placeType,
    ...(serialNumber ? { serialNumber } : {}),
    characteristic,
  });
  report.resourcesCreated++;
  return { id: resource.id, '@type': resource['@type'] };
}

/** Idempotente: o repositório faz upsert da aresta (resourceId, relatedId, tipo). */
async function link(fromRef, toRef, relationshipType) {
  if (!fromRef || !toRef) return;
  if (!APPLY) return; // dry-run: nada a ligar, os ids são placeholders
  if (fromRef.id.startsWith('dry-run:') || toRef.id.startsWith('dry-run:')) return;
  await api('POST', `/tmf-api/resourceInventoryManagement/v4/resource/${fromRef.id}/relationships`, {
    id: toRef.id,
    relationshipType,
    '@referredType': 'Resource',
  });
  report.linksCreated++;
}

const report = {
  cdoesInScope: 0,
  cdoesSkippedNoRatio: [],
  cdoesSkippedNotFound: [],
  specsCreated: 0,
  resourcesCreated: 0,
  resourcesReused: 0,
  resourcesToCreate: [],
  linksCreated: 0,
};

function ratioFromCharacteristic(cdoe) {
  const capacidade = (cdoe.characteristic ?? []).find((c) => c.name === 'capacidade');
  const n = capacidade ? Number(capacidade.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function processCdoe(name) {
  const cdoe = await findResourceByExactName(name);
  if (!cdoe) {
    report.cdoesSkippedNotFound.push(name);
    return;
  }
  const full = await api('GET', `/tmf-api/resourceInventoryManagement/v4/resource/${cdoe.id}`);
  const ratio = ratioFromCharacteristic(full);
  if (!ratio) {
    report.cdoesSkippedNoRatio.push(name);
    return;
  }
  report.cdoesInScope++;

  const placeId = full.place?.id;
  const placeType = full.place?.['@referredType'] ?? 'GeographicLocation';
  const cdoeRef = { id: cdoe.id, '@type': cdoe['@type'] ?? 'PhysicalResource' };

  const splitterSpecId = await ensureResourceSpec(
    `${SPLITTER_SPEC_NAME_PREFIX}${ratio}`,
    'Infrastructure.Passive',
    'Splitter',
  );
  const splitterName = `${name} · Splitter`;
  const splitter = await ensureResource({
    name: splitterName,
    specId: splitterSpecId,
    placeId,
    placeType,
    serialNumber: splitterName,
    characteristic: [{ name: 'razao', value: `1:${ratio}`, valueType: 'string' }],
  });
  await link(cdoeRef, splitter, 'containsAsChild');

  const portSpecId = await ensureResourceSpec(PORT_SPEC_NAME, 'Equipment.Access', 'Port');

  const portaIn = await ensureResource({
    name: `${splitterName} · FO.I`,
    specId: portSpecId,
    placeId,
    placeType,
    serialNumber: `${splitterName} · FO.I`,
    characteristic: [{ name: 'role', value: 'FO.I', valueType: 'string' }],
  });
  await link(splitter, portaIn, 'containsAsChild');

  for (let i = 1; i <= ratio; i++) {
    const portaOut = await ensureResource({
      name: `${splitterName} · FO.O.${i}`,
      specId: portSpecId,
      placeId,
      placeType,
      serialNumber: `${splitterName} · FO.O.${i}`,
      characteristic: [
        { name: 'role', value: 'FO.O', valueType: 'string' },
        { name: 'index', value: String(i), valueType: 'string' },
      ],
    });
    await link(splitter, portaOut, 'containsAsChild');
  }
}

async function main() {
  console.log(`load-cto-ports: escopo=${scope} apply=${APPLY} base=${BASE}`);
  for (const name of PILOT_CDOE_NAMES) {
    await processCdoe(name);
  }

  console.log('\n--- Relatório ---');
  console.log(`CDOEs no escopo com razão reconhecida: ${report.cdoesInScope}`);
  if (report.cdoesSkippedNotFound.length) {
    console.log(`CDOEs não encontradas (rode seed-gpon-niteroi.mjs primeiro): ${report.cdoesSkippedNotFound.join(', ')}`);
  }
  if (report.cdoesSkippedNoRatio.length) {
    console.log(`CDOEs sem razão reconhecida (characteristic "capacidade" ausente/inválida), portas NÃO criadas: ${report.cdoesSkippedNoRatio.join(', ')}`);
  }
  if (!APPLY) {
    console.log(`Dry-run — recursos que seriam criados (${report.resourcesToCreate.length}):`);
    for (const name of report.resourcesToCreate) console.log(`  + ${name}`);
    console.log('Recursos já existentes (reaproveitados): ' + report.resourcesReused);
    console.log('\nRode de novo com --apply para gravar.');
  } else {
    console.log(`Specs criadas: ${report.specsCreated}`);
    console.log(`Recursos criados: ${report.resourcesCreated}`);
    console.log(`Recursos reaproveitados (já existiam): ${report.resourcesReused}`);
    console.log(`Relações criadas/confirmadas: ${report.linksCreated}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
