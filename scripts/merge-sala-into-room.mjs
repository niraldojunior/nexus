#!/usr/bin/env node
/**
 * Unifica os tipos duplicados de "sala" no catálogo Geo — o combo de tipo de
 * local mostrava 3 linhas para o mesmo conceito: "Sala" (code ROOM, bootstrap
 * canônico em BOOTSTRAP_SPECIFICATIONS, src/modules/geo/service.ts, com
 * containment já correto: pai CO/POP/FLOOR, filho CAGE), "Sala" de novo (code
 * SALA, ad-hoc, criada por uma carga anterior sem containment) e "Sala
 * Técnica" (code TECHNICAL_ROOM, ad-hoc, também sem containment e sem sites).
 *
 * "Room"/"Sala" (ROOM) é a canônica escolhida como sobrevivente: é a única
 * bootstrap-protected e a única com containment de verdade — os sites de SALA
 * amostrados têm todos como pai um site "Central Office" (CO), que já está em
 * ROOM.allowedParentSpecIds, então repontar não quebra containment.
 *
 * O que este script faz, para cada spec duplicada (SALA, TECHNICAL_ROOM), nesta ordem:
 *   1. Reponta o siteSpecificationId dos sites dela para "Room" (ROOM).
 *   2. Confirma 0 sites restantes na duplicada.
 *   3. Aposenta (lifecycleStatus=Retired) a duplicada.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/merge-sala-into-room.mjs            # dry-run
 *   node scripts/merge-sala-into-room.mjs --apply    # executa
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const APPLY = process.argv.includes('--apply');

const DUPLICATE_CODES = ['SALA', 'TECHNICAL_ROOM'];

// Mesma armadilha do merge Estação→Central Office (scripts/merge-estacao-into-central-office.mjs):
// sites antigos podem ter characteristics no formato pré-governança (`{ group: '_origin', name }`
// / tag `seed` sem prefixo), e qualquer PATCH nesses sites falha com
// GEO_SITE_CHARACTERISTIC_UNDEFINED porque o characteristic completo viaja junto no corpo.
// Achata para o formato atual antes de gravar.
function normalizeLegacyCharacteristic(characteristic) {
  let changed = false;
  const next = (characteristic ?? []).map((c) => {
    if (c.name === 'seed') {
      changed = true;
      return { name: '_origin.seed', value: c.value, valueType: c.valueType };
    }
    if (c.group === '_origin' && !c.name.startsWith('_origin.')) {
      changed = true;
      return { name: `_origin.${c.name}`, value: c.value, valueType: c.valueType };
    }
    return c;
  });
  return { changed, characteristic: next };
}

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

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');

  const specs = await api('GET', '/v1/geo/site-specifications');
  const room = specs.find(
    (s) => s.code === 'ROOM' && s.category === 'SubSite' && s.lifecycleStatus === 'Active',
  );
  if (!room) throw new Error('spec "Room" (code ROOM) ativa não encontrada — bootstrap não rodou?');
  console.log(`Room (canônica): ${room.id}`);

  const duplicates = specs.filter(
    (s) => DUPLICATE_CODES.includes(s.code) && s.lifecycleStatus === 'Active' && s.id !== room.id,
  );
  if (duplicates.length === 0) {
    console.log('Nenhuma spec duplicada (SALA/TECHNICAL_ROOM) ativa encontrada — nada para migrar.');
    return;
  }

  for (const dup of duplicates) {
    console.log(`\n--- ${dup.name} (${dup.code}) — ${dup.id} ---`);
    const sites = await api('GET', `/v1/geo/sites?siteSpecificationId=${dup.id}`);
    console.log(`[1/2] ${sites.length} site(s) usando "${dup.name}".`);
    let done = 0;
    let legacyFixed = 0;
    for (const site of sites) {
      const { changed, characteristic } = normalizeLegacyCharacteristic(site.characteristic);
      if (changed) legacyFixed++;
      if (APPLY) {
        await api('PATCH', `/v1/geo/sites/${site.id}`, {
          siteSpecificationId: room.id,
          ...(changed ? { characteristic } : {}),
        });
      }
      done++;
      if (done % 200 === 0 || done === sites.length) {
        console.log(`  ${APPLY ? 'repontados' : 'seriam repontados'}: ${done}/${sites.length}`);
      }
    }
    if (legacyFixed > 0) {
      console.log(
        `  ${legacyFixed} site(s) tinham characteristics no formato antigo (achatado no mesmo PATCH).`,
      );
    }

    console.log(`[2/2] Aposentando "${dup.name}"…`);
    if (APPLY) {
      const remaining = await api('GET', `/v1/geo/sites?siteSpecificationId=${dup.id}`);
      if (remaining.length > 0) {
        throw new Error(
          `abortando: ainda há ${remaining.length} site(s) apontando para "${dup.name}" — repontagem incompleta.`,
        );
      }
      await api('DELETE', `/v1/geo/site-specifications/${dup.id}`);
      console.log(`  "${dup.name}" aposentada (lifecycleStatus=Retired).`);
    } else {
      console.log('  (dry-run — seria aposentada aqui, após confirmar 0 sites restantes)');
    }
  }

  console.log('\n=== fim ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
