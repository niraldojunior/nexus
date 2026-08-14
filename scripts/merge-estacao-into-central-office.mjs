#!/usr/bin/env node
/**
 * Repara a duplicidade de tipo "Estação" × "Central Office" no catálogo Geo.
 *
 * Origem do problema: `estacoes_carregar.mjs`/`load-estacoes-netwin.mjs` criavam,
 * via `ensureSpec('Estação', 'Site')`, uma GeographicSiteSpecification própria
 * (code `ESTACAO`) em vez de reusar a spec canônica do bootstrap da app
 * (`Central Office`, code `CO` — ver `BOOTSTRAP_SPECIFICATIONS` em
 * src/modules/geo/service.ts). Resultado: 664 sites reais carregados sob
 * "Estação" e zero sob "Central Office", a spec que era pra ser a única. Estação
 * e Central Office são o mesmo conceito (AGENTS.md §5, glossário §5) — não deve
 * haver duas linhas de catálogo para ele.
 *
 * O que este script faz, nesta ordem (a ordem importa — ver comentários inline):
 *   1. Repõe o siteSpecificationId dos sites de "Estação" para "Central Office".
 *   2. Declara "Sala" como filho permitido de "Central Office" (soma à lista
 *      existente — Floor/Room do bootstrap continuam permitidos).
 *   3. Troca o allowedParentSpecIds de "Sala" para ["Central Office"] — as ~3446
 *      Salas already penduradas nesses sites ficam com containment consistente.
 *   4. Aposenta (lifecycleStatus=Retired) a spec "Estação", agora sem sites.
 *
 * Passos 2–4 só rodam se a spec "Sala"/"Estação" existirem — em bases onde só
 * `estacoes_carregar.mjs --fast` rodou (sem a legada `load-estacoes-netwin.mjs`),
 * pode não haver "Sala" nenhuma; o script pula o que não se aplica.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/merge-estacao-into-central-office.mjs            # dry-run
 *   node scripts/merge-estacao-into-central-office.mjs --apply    # executa
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const APPLY = process.argv.includes('--apply');

// Alguns sites (as 7 estações legadas de Niterói e o nó órfão "SEM ESTAÇÃO"
// de load-recursos-netwin.mjs) ainda carregam characteristics no formato antigo
// pré-governança de 01/08 — `{ group: '_origin', name: '<campo>' }` e uma tag
// `seed` sem prefixo. `normalizeSiteCharacteristics` (service.ts) só isenta de
// declaração na spec quem começa com `_origin.`; qualquer PATCH nesses sites
// (mesmo só trocando siteSpecificationId, já que characteristic viaja junto
// como `current.characteristic`) esbarra em GEO_SITE_CHARACTERISTIC_UNDEFINED.
// Achata para o formato atual antes de gravar — mesma transformação que
// `estacoes_carregar.mjs` já faz ao reconhecer o formato legado.
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
  const co = specs.find((s) => s.category === 'Site' && s.name === 'Central Office');
  const estacao = specs.find((s) => s.category === 'Site' && s.name === 'Estação');
  const sala = specs.find((s) => s.category === 'SubSite' && s.name === 'Sala');

  if (!co) throw new Error('spec "Central Office" não encontrada — bootstrap não rodou?');
  if (!estacao) {
    console.log('Nenhuma spec "Estação" encontrada — nada para migrar.');
    return;
  }
  console.log(`Central Office: ${co.id}`);
  console.log(`Estação:        ${estacao.id} (será aposentada)`);
  if (sala) console.log(`Sala:           ${sala.id}`);

  // 1) Reponta os sites de "Estação" para "Central Office".
  const sites = await api('GET', `/v1/geo/sites?siteSpecificationId=${estacao.id}`);
  console.log(`\n[1/4] ${sites.length} site(s) usando "Estação".`);
  let done = 0;
  let legacyFixed = 0;
  for (const site of sites) {
    const { changed, characteristic } = normalizeLegacyCharacteristic(site.characteristic);
    if (changed) legacyFixed++;
    if (APPLY) {
      await api('PATCH', `/v1/geo/sites/${site.id}`, {
        siteSpecificationId: co.id,
        ...(changed ? { characteristic } : {}),
      });
    }
    done++;
    if (done % 100 === 0 || done === sites.length) {
      console.log(`  ${APPLY ? 'repontados' : 'seriam repontados'}: ${done}/${sites.length}`);
    }
  }
  if (legacyFixed > 0) {
    console.log(
      `  ${legacyFixed} site(s) tinham characteristics no formato antigo (_origin.* achatado no mesmo PATCH).`,
    );
  }

  // 2) "Central Office" passa a aceitar "Sala" como filho (soma, não substitui).
  if (sala) {
    const coFresh = await api('GET', `/v1/geo/site-specifications/${co.id}`);
    const childIds = new Set(coFresh.allowedChildSpecIds ?? []);
    if (!childIds.has(sala.id)) {
      childIds.add(sala.id);
      console.log(`\n[2/4] Central Office ganha "Sala" como filho permitido.`);
      if (APPLY) {
        await api('PATCH', `/v1/geo/site-specifications/${co.id}`, {
          allowedChildSpecIds: [...childIds],
        });
      }
    } else {
      console.log('\n[2/4] Central Office já aceita "Sala" como filho — nada a fazer.');
    }

    // 3) "Sala" passa a apontar para "Central Office" como pai (troca, não soma —
    // "Estação" está sendo aposentada, não faz sentido continuar como pai válido).
    const salaFresh = await api('GET', `/v1/geo/site-specifications/${sala.id}`);
    const parentIds = new Set(salaFresh.allowedParentSpecIds ?? []);
    if (!parentIds.has(co.id) || parentIds.has(estacao.id)) {
      console.log('[3/4] Sala passa a ter Central Office (só) como pai permitido.');
      if (APPLY) {
        await api('PATCH', `/v1/geo/site-specifications/${sala.id}`, {
          allowedParentSpecIds: [co.id],
        });
      }
    } else {
      console.log('[3/4] Sala já aponta só para Central Office — nada a fazer.');
    }
  } else {
    console.log('\n[2/4] Spec "Sala" não encontrada — pulando containment.');
    console.log('[3/4] Spec "Sala" não encontrada — pulando containment.');
  }

  // 4) Aposenta "Estação" — só depois que nenhum site mais aponta pra ela.
  console.log('\n[4/4] Aposentando spec "Estação"…');
  if (APPLY) {
    const remaining = await api('GET', `/v1/geo/sites?siteSpecificationId=${estacao.id}`);
    if (remaining.length > 0) {
      throw new Error(
        `abortando: ainda há ${remaining.length} site(s) apontando para "Estação" — repontagem incompleta.`,
      );
    }
    await api('DELETE', `/v1/geo/site-specifications/${estacao.id}`);
    console.log('  "Estação" aposentada (lifecycleStatus=Retired).');
  } else {
    console.log('  (dry-run — seria aposentada aqui, após confirmar 0 sites restantes)');
  }

  console.log('\n=== fim ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
