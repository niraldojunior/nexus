#!/usr/bin/env node
/**
 * Reparo de consistência geográfica da massa de testes (Geo ↔ Resource ↔ Service).
 *
 * Re-execuções antigas do seed deixaram quatro defeitos encadeados no inventário:
 *
 *   1. Sites duplicados — 7 CO/POP reais viraram 16 linhas, sendo 9 cópias
 *      `terminated` sem location e sem address (invisíveis no mapa e na árvore).
 *   2. CFS/RFS ancorados nessas cópias mortas — o serviço aponta para um site
 *      que não existe visualmente ("recurso associado a site que não acho no mapa").
 *   3. Recursos sem site — `locateEquipment()` sobrescrevia o `place` (que era o
 *      Site) por uma GeographicLocation privada com endereço fabricado por jitter,
 *      quebrando o vínculo Geo↔Resource e gerando endereços órfãos.
 *   4. Tipagem única — todo site usa a spec "Ponto de instalação", então CO e POP
 *      renderizam no mapa como se fossem ponto de instalação de cliente.
 *
 * O reparo respeita a tríade e o cânone:
 *
 *   · C2 (Rack é a fronteira Geo↔Resource) — Portas e CPE ficam DENTRO do CO/POP,
 *     então `place` = GeographicSite do CO/POP.
 *   · C4 (Home Passed não é Service) — ONT é CPE na casa do assinante, então cada
 *     uma ganha o seu próprio site "Ponto de instalação" (Home Connected), montado
 *     sobre a Location/Address que já existiam.
 *   · C6 (soft-delete) — as cópias duplicadas continuam `terminated`, apenas param
 *     de ser referenciadas. Nada de inventário é excluído fisicamente; a purga
 *     final atinge só andaimes Geo fabricados que ficaram sem nenhuma referência.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/repair-geo-consistency.mjs            # dry-run: só mostra o plano
 *   node scripts/repair-geo-consistency.mjs --apply    # executa
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 *   DATABASE_URL_DEV — lido de .env; usado só na purga de andaimes órfãos.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Specs de site por papel. Hoje tudo cai em "Ponto de instalação"; CO e POP
// ganham spec própria para que siteKindFromSpec() os classifique como CO/POP.
const SPEC_CO = 'Estação (CO)';
const SPEC_POP = 'POP';
const SPEC_PI = 'Ponto de instalação';

// Tipos de recurso que moram dentro do CO/POP (do rack para dentro, C2).
const INSIDE_SITE_TYPES = new Set(['Port', 'CPE', 'Card', 'Shelf', 'OLT', 'Rack']);

const summary = {
  specsCriadas: [],
  sitesRetipados: [],
  sitesAtivados: [],
  servicosRepontados: [],
  sitesPiCriados: [],
  recursosReancorados: [],
  andaimesPurgados: { locations: 0, addresses: 0 },
  avisos: [],
};

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

// ---------------------------------------------------------------- snapshot --

async function snapshot() {
  const [sites, specs, addresses, locations, serviceWs, resourceWs] = await Promise.all([
    api('GET', '/v1/geo/sites'),
    api('GET', '/v1/geo/site-specifications'),
    api('GET', '/v1/geo/addresses'),
    api('GET', '/v1/geo/locations'),
    api('GET', '/v1/service/workspace?tab=ResourceFacingService&limit=1&offset=0'),
    api('GET', '/v1/resource/workspace?tab=PhysicalResource&limit=1&offset=0'),
  ]);

  return {
    sites,
    specs,
    addresses,
    locations,
    cfs: serviceWs.customerFacingServices ?? [],
    rfs: serviceWs.resourceFacingServices ?? [],
    resources: resourceWs.physicalResources ?? [],
    addressByLocationId: new Map(
      addresses.filter((a) => a.geographicLocationId).map((a) => [a.geographicLocationId, a]),
    ),
  };
}

// Escolhe, entre os homônimos, o site canônico: o que não está terminado e tem
// coordenada. Os demais viram fantasmas a serem repontados.
function resolveCanonicalSites(sites) {
  const byName = new Map();
  for (const site of sites) {
    if (!byName.has(site.name)) byName.set(site.name, []);
    byName.get(site.name).push(site);
  }

  const canonicalByName = new Map();
  const ghostToCanonical = new Map();

  for (const [name, group] of byName) {
    const canonical =
      group.find((s) => s.status !== 'terminated' && s.place?.id) ??
      group.find((s) => s.status !== 'terminated') ??
      group[0];
    canonicalByName.set(name, canonical);
    for (const site of group) {
      if (site.id !== canonical.id) ghostToCanonical.set(site.id, canonical);
    }
  }

  return { canonicalByName, ghostToCanonical };
}

// ------------------------------------------------------------------- passos --

// Passo 1: dar spec própria a CO e POP, para o mapa parar de pintar tudo como PI.
async function retypeSites(state) {
  const specByName = new Map(state.specs.map((s) => [s.name, s]));

  const ensureSpec = async (name) => {
    const found = specByName.get(name);
    if (found) return found.id;
    summary.specsCriadas.push(name);
    const created = APPLY
      ? await api('POST', '/v1/geo/site-specifications', { name, category: 'Site' })
      : { id: `<nova:${name}>`, name };
    specByName.set(name, created);
    return created.id;
  };

  const specIdFor = async (siteName) => {
    if (siteName.startsWith('CO ')) return ensureSpec(SPEC_CO);
    if (siteName.startsWith('POP ')) return ensureSpec(SPEC_POP);
    return null;
  };

  for (const site of state.sites) {
    if (site.status === 'terminated') continue;
    const targetSpecId = await specIdFor(site.name);
    if (!targetSpecId || site.siteSpecificationId === targetSpecId) continue;
    summary.sitesRetipados.push(`${site.name} → ${site.name.startsWith('CO ') ? SPEC_CO : SPEC_POP}`);
    if (APPLY) await api('PATCH', `/v1/geo/sites/${site.id}`, { siteSpecificationId: targetSpecId });
  }

  return specByName;
}

// Passo 2: um site que hospeda serviço ativo não pode continuar `planned`.
async function activateServedSites(state, servedSiteIds) {
  for (const site of state.sites) {
    if (site.status !== 'planned' || !servedSiteIds.has(site.id)) continue;
    summary.sitesAtivados.push(site.name);
    if (APPLY) await api('PATCH', `/v1/geo/sites/${site.id}`, { status: 'active' });
  }
}

// Passo 3: repontar o `place` de CFS/RFS que aponta para um duplicado terminado.
async function repointServices(state, ghostToCanonical) {
  for (const service of [...state.cfs, ...state.rfs]) {
    const places = service.place ?? [];
    if (!places.some((p) => ghostToCanonical.has(p.id))) continue;

    const repointed = places.map((p) => {
      const canonical = ghostToCanonical.get(p.id);
      return canonical ? { id: canonical.id, '@referredType': 'GeographicSite', role: p.role } : p;
    });

    summary.servicosRepontados.push(`${service['@type']} ${service.name}`);
    if (APPLY) {
      await api('PATCH', `/tmf-api/serviceInventoryManagement/v4/service/${service.id}`, { place: repointed });
    }
  }
}

// Passo 4: reancorar cada recurso no lugar onde ele fisicamente está.
async function reanchorResources(state, siteForResource, specByName) {
  const piSpecId = specByName.get(SPEC_PI)?.id;
  if (!piSpecId) {
    summary.avisos.push(`Spec "${SPEC_PI}" não encontrada — ONTs não foram reancoradas.`);
    return;
  }

  for (const resource of state.resources) {
    // Já ancorado num GeographicSite? Então alguém decidiu onde ele mora — e o
    // site do RFS não é uma fonte confiável para revisar isso: numa rede GPON o
    // RFS aponta para a casa do assinante, mas a porta da OLT mora na sala
    // técnica do CO. O reparo só age sobre a forma quebrada (Location sem site
    // dono, ou nenhum local).
    if (resource.place?.['@referredType'] === 'GeographicSite') continue;

    const site = siteForResource.get(resource.id);
    if (!site) {
      if (resource.place?.id) continue; // planta externa com coordenada própria; não mexe
      summary.avisos.push(`Recurso "${resource.name}" sem serviço e sem local — deixado como está.`);
      continue;
    }

    const insideSite = INSIDE_SITE_TYPES.has(resource.resourceType);

    if (insideSite) {
      // Do rack para dentro: o lugar do recurso é o próprio CO/POP (C2).
      if (resource.place?.id === site.id) continue;
      summary.recursosReancorados.push(`${resource.name} (${resource.resourceType}) → site ${site.name}`);
      if (APPLY) {
        await api('PATCH', `/tmf-api/resourceInventoryManagement/v4/resource/${resource.id}`, {
          placeId: site.id,
          placeType: 'GeographicSite',
        });
      }
      continue;
    }

    // CPE do assinante (ONT): vira Home Connected com site "Ponto de instalação"
    // próprio, reaproveitando a Location e o Address que já existem.
    const locationId = resource.place?.['@referredType'] === 'GeographicLocation' ? resource.place.id : null;
    if (!locationId) {
      summary.avisos.push(`ONT "${resource.name}" sem coordenada própria — deixada no site ${site.name}.`);
      continue;
    }
    const address = state.addressByLocationId.get(locationId);
    const piName = `PI ${resource.name}`;

    summary.sitesPiCriados.push(piName);
    summary.recursosReancorados.push(`${resource.name} (ONT) → site ${piName}`);
    if (APPLY) {
      const piSite = await api('POST', '/v1/geo/sites', {
        name: piName,
        siteSpecificationId: piSpecId,
        placeId: locationId,
        ...(address ? { addressId: address.id } : {}),
        status: 'active',
      });
      await api('PATCH', `/tmf-api/resourceInventoryManagement/v4/resource/${resource.id}`, {
        placeId: piSite.id,
        placeType: 'GeographicSite',
      });
    }
  }

}

// Passo 5: apagar os andaimes Geo fabricados que ficaram sem nenhuma referência.
// São Location/Address inventados pelo jitter do seed — não são inventário (não
// há Resource nem Service neles), então C6 não se aplica. A checagem de
// referência é refeita no banco antes do DELETE.
async function purgeOrphanScaffolding() {
  const env = readFileSync(path.join(ROOT, '.env'), 'utf8');
  const match = /^DATABASE_URL_DEV=(.+)$/m.exec(env);
  if (!match) {
    summary.avisos.push('DATABASE_URL_DEV não encontrada em .env — purga de andaimes pulada.');
    return;
  }

  // Uma Location/Address de Geo só existe para ser referenciada por um site, um
  // endereço ou um recurso. A que não é referenciada por ninguém é andaime morto:
  // sobra de seed interrompido ou de recurso reancorado. A varredura é sobre o
  // estado atual, então o passo é idempotente e seguro de repetir.
  const orphanLocations = `
    SELECT l.id FROM tmf_geographic_location l
     WHERE NOT EXISTS (SELECT 1 FROM tmf_geographic_site s WHERE s.geographic_location_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM tmf_geographic_address a WHERE a.geographic_location_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM tmf_physical_resource r WHERE r.place_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM tmf_logical_resource r WHERE r.place_id = l.id)`;
  const orphanAddresses = `
    SELECT a.id FROM tmf_geographic_address a
     WHERE NOT EXISTS (SELECT 1 FROM tmf_geographic_site s WHERE s.geographic_address_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM tmf_physical_resource r WHERE r.place_id = a.id)`;

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // Endereços primeiro: apagar a Location antes deixaria o endereço apontando
    // para o vazio, e é o endereço que segura a referência à Location.
    const addrIds = (await client.query(orphanAddresses)).rows.map((r) => r.id);
    if (APPLY && addrIds.length) {
      await client.query(`DELETE FROM tmf_geographic_address WHERE id = ANY($1::text[])`, [addrIds]);
    }
    const locIds = (await client.query(orphanLocations)).rows.map((r) => r.id);
    if (APPLY && locIds.length) {
      await client.query(`DELETE FROM tmf_geographic_location WHERE id = ANY($1::text[])`, [locIds]);
    }
    summary.andaimesPurgados = { locations: locIds.length, addresses: addrIds.length };
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------- run --

async function main() {
  console.log(`Nexus geo repair — ${APPLY ? 'APLICANDO' : 'DRY-RUN (use --apply para gravar)'}\n`);

  const state = await snapshot();
  const { canonicalByName, ghostToCanonical } = resolveCanonicalSites(state.sites);

  console.log(`Sites: ${state.sites.length} linhas → ${canonicalByName.size} canônicos, ${ghostToCanonical.size} duplicados.`);
  console.log(`Serviços: ${state.cfs.length} CFS + ${state.rfs.length} RFS. Recursos: ${state.resources.length}.\n`);

  // Mapa recurso → site canônico, derivado do RFS que o suporta (supportingResource).
  const siteById = new Map(state.sites.map((s) => [s.id, s]));
  const siteForResource = new Map();
  const servedSiteIds = new Set();
  for (const rfs of state.rfs) {
    const placeRef = (rfs.place ?? [])[0];
    if (!placeRef) continue;
    const site = ghostToCanonical.get(placeRef.id) ?? siteById.get(placeRef.id);
    if (!site) continue;
    servedSiteIds.add(site.id);
    for (const resource of rfs.supportingResource ?? []) siteForResource.set(resource.id, site);
  }

  const specByName = await retypeSites(state);
  await activateServedSites(state, servedSiteIds);
  await repointServices(state, ghostToCanonical);
  await reanchorResources(state, siteForResource, specByName);
  await purgeOrphanScaffolding();

  const line = (label, list) =>
    console.log(`${label.padEnd(28)} ${Array.isArray(list) ? list.length : list}`);

  console.log('--- Resumo ---');
  line('Specs criadas', summary.specsCriadas);
  line('Sites retipados (CO/POP)', summary.sitesRetipados);
  line('Sites planned → active', summary.sitesAtivados);
  line('CFS/RFS repontados', summary.servicosRepontados);
  line('Sites PI criados (ONT)', summary.sitesPiCriados);
  line('Recursos reancorados', summary.recursosReancorados);
  line('Andaimes purgados', `${summary.andaimesPurgados.locations} locations / ${summary.andaimesPurgados.addresses} addresses`);

  if (summary.avisos.length) {
    console.log('\nAvisos:');
    for (const aviso of summary.avisos) console.log(`  · ${aviso}`);
  }
  if (!APPLY) console.log('\nNada foi gravado. Re-execute com --apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
