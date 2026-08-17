// Projetos de trabalho da página Locais (REQ-MOD01-015). Toca o banco de verdade (Neon) porque
// GeoProjectRepository e a exclusão em GeoTreeService falam com o DatabaseClient direto — não há
// como exercitar a regra sem SQL real. Mesmo padrão de test/mcp-geo-workflow.spec.ts: schema por
// worker (ver test-utils.ts), truncado entre testes.

import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { createNexusRuntime, type NexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { createTestDatabase } from './test-utils.js';

const TENANT_ID = 'default';
const ACTOR = 'tester@vtal.com.br';

afterEach(() => {
  PostgresDatabase.resetForTesting();
});

const createFixture = async () => {
  const database = createTestDatabase('nexus-geo-project-');
  const db = PostgresDatabase.getInstance(database.databaseUrl);
  await db.initialize();
  const runtime = await createNexusRuntime(db);
  return { database, runtime };
};

const createSiteSpec = async (runtime: NexusRuntime) =>
  runtime.geoService.createSpec({ name: `Ponto de Instalação ${Date.now()}`, category: 'Site' });

test('GeoProjectRepository cria, atualiza e lista projetos do tenant', async () => {
  const fixture = await createFixture();
  try {
    const created = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Expansão Icaraí',
    });
    assert.equal(created.name, 'Expansão Icaraí');
    assert.equal(created.siteCount, 0);
    assert.equal(created.tenantId, TENANT_ID);
    assert.equal(created.createdBy, ACTOR);

    const updated = await fixture.runtime.geoProjectRepository.update(TENANT_ID, created.id, {
      description: 'Levantamento de campo do Q3',
    });
    assert.equal(updated?.description, 'Levantamento de campo do Q3');

    const list = await fixture.runtime.geoProjectRepository.list(TENANT_ID);
    assert.ok(list.some((project) => project.id === created.id));

    const missing = await fixture.runtime.geoProjectRepository.update('outro-tenant', created.id, {
      name: 'x',
    });
    assert.equal(missing, null, 'update não deve enxergar projeto de outro tenant');
  } finally {
    fixture.database.cleanup();
  }
});

test('siteCount conta todos os locais vinculados, mesmo Retired', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto com locais',
    });

    const siteA = await fixture.runtime.geoService.createSite({
      name: 'Local A',
      siteSpecificationId: spec.id,
    });
    const siteB = await fixture.runtime.geoService.createSite({
      name: 'Local B',
      siteSpecificationId: spec.id,
    });
    await fixture.runtime.geoProjectRepository.linkSite(project.id, siteA.id);
    await fixture.runtime.geoProjectRepository.linkSite(project.id, siteB.id);

    let reloaded = await fixture.runtime.geoProjectRepository.get(TENANT_ID, project.id);
    assert.equal(reloaded?.siteCount, 2);

    await fixture.runtime.geoService.transitionSite(siteB.id, {
      status: 'Retired',
      statusReason: 'teste',
    });

    // Com o status herdado do projeto (RF-010), um projeto Terminado tem todos os Sites
    // Retired — filtrar por status faria a lista mostrar N locais e o contador dizer "0
    // locais". siteCount conta o vínculo de plataforma, não o status do Site.
    reloaded = await fixture.runtime.geoProjectRepository.get(TENANT_ID, project.id);
    assert.equal(reloaded?.siteCount, 2, 'local Retired continua contando enquanto vinculado');
  } finally {
    fixture.database.cleanup();
  }
});

test('remove() apaga projeto e vínculos e devolve os ids dos sites, sem tocar o Site em si', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto a excluir',
    });
    const site = await fixture.runtime.geoService.createSite({
      name: 'Local a excluir',
      siteSpecificationId: spec.id,
    });
    await fixture.runtime.geoProjectRepository.linkSite(project.id, site.id);

    const siteIds = await fixture.runtime.geoProjectRepository.remove(TENANT_ID, project.id);
    assert.deepEqual(siteIds, [site.id]);

    const reloaded = await fixture.runtime.geoProjectRepository.get(TENANT_ID, project.id);
    assert.equal(reloaded, null);

    // C6: remove() só apaga as linhas de plataforma. Quem decide o soft-terminate do Site é
    // a rota HTTP, chamando GeoService.transitionSite ANTES de remove() (ver próximo teste).
    const stillExists = await fixture.runtime.geoService.getSite(site.id);
    assert.ok(stillExists);
    assert.equal(stillExists?.status, 'Planned');
  } finally {
    fixture.database.cleanup();
  }
});

test('soft-terminate antes de desvincular (mesma ordem da rota DELETE) deixa o Site Retired', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto',
    });
    const site = await fixture.runtime.geoService.createSite({
      name: 'Local do projeto',
      siteSpecificationId: spec.id,
    });
    await fixture.runtime.geoProjectRepository.linkSite(project.id, site.id);

    // Mesma sequência de src/shared/http/app.ts (DELETE /v1/geo/projects/:id): soft-terminate
    // (C6) primeiro, remove() depois — nunca a ordem inversa (ver comentário da rota).
    await fixture.runtime.geoService.transitionSite(site.id, {
      status: 'Retired',
      statusReason: 'Projeto de trabalho excluído',
    });
    await fixture.runtime.geoProjectRepository.remove(TENANT_ID, project.id);

    const terminated = await fixture.runtime.geoService.getSite(site.id);
    assert.equal(terminated?.status, 'Retired');
    const links = await fixture.runtime.geoProjectRepository.listSiteIds(TENANT_ID, project.id);
    assert.deepEqual(links, []);
  } finally {
    fixture.database.cleanup();
  }
});

// issue #58: excluir o projeto ONITEL (62 mil locais) não terminava — o laço um-a-um de
// transitionSite (12 idas ao banco por site) nunca fechava a requisição. transitionProjectSites
// substitui o laço por operações em conjunto; estes testes cobrem a régua nova em pequena escala.
test('transitionProjectSites encerra em massa vários locais de uma vez', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto em massa',
    });
    const sites = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        fixture.runtime.geoService.createSite({
          name: `Local em massa ${i}`,
          siteSpecificationId: spec.id,
        }),
      ),
    );
    for (const site of sites) await fixture.runtime.geoProjectRepository.linkSite(project.id, site.id);

    const result = await fixture.runtime.geoService.transitionProjectSites(
      project.id,
      sites.map((s) => s.id),
      'Retired',
      'Projeto de trabalho excluído',
    );
    assert.equal(result.updated, 5);
    assert.equal(result.skipped, 0);
    assert.deepEqual(result.blocked, []);

    for (const site of sites) {
      const reloaded = await fixture.runtime.geoService.getSite(site.id);
      assert.equal(reloaded?.status, 'Retired');
      // createSite já grava uma entrada (undefined→Planned); a transição em massa soma a
      // segunda (Planned→Retired) — duas ao todo, nenhuma duplicata.
      const history = await fixture.runtime.geoService.listSiteHistory(site.id);
      assert.equal(history.length, 2, 'criação + transição, sem duplicata');
      const transition = history.find((h) => h.toStatus === 'Retired');
      assert.equal(transition?.fromStatus, 'Planned');
    }
  } finally {
    fixture.database.cleanup();
  }
});

test('transitionProjectSites deixa de fora o local com relacionamento ativo (bloqueado)', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto com bloqueio',
    });
    const free = await fixture.runtime.geoService.createSite({
      name: 'Local livre',
      siteSpecificationId: spec.id,
    });
    const blocked = await fixture.runtime.geoService.createSite({
      name: 'Local com relacionamento',
      siteSpecificationId: spec.id,
    });
    const feeder = await fixture.runtime.geoService.createSite({
      name: 'Local alimentador',
      siteSpecificationId: spec.id,
    });
    await fixture.runtime.geoService.addSiteRelationship(blocked.id, feeder.id, 'fedBy');
    await fixture.runtime.geoProjectRepository.linkSite(project.id, free.id);
    await fixture.runtime.geoProjectRepository.linkSite(project.id, blocked.id);

    const result = await fixture.runtime.geoService.transitionProjectSites(
      project.id,
      [free.id, blocked.id],
      'Retired',
      'Projeto de trabalho excluído',
    );
    assert.equal(result.updated, 1);
    assert.deepEqual(result.blocked, [blocked.id]);

    assert.equal((await fixture.runtime.geoService.getSite(free.id))?.status, 'Retired');
    assert.equal((await fixture.runtime.geoService.getSite(blocked.id))?.status, 'Planned');
  } finally {
    fixture.database.cleanup();
  }
});

test('transitionProjectSites não duplica histórico ao rodar de novo sobre locais já encerrados', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto retomado',
    });
    const site = await fixture.runtime.geoService.createSite({
      name: 'Local retomado',
      siteSpecificationId: spec.id,
    });
    await fixture.runtime.geoProjectRepository.linkSite(project.id, site.id);

    await fixture.runtime.geoService.transitionProjectSites(
      project.id,
      [site.id],
      'Retired',
      'Projeto de trabalho excluído',
    );
    // Segunda tentativa (ex.: usuário clicou Excluir de novo após a requisição cair pela metade,
    // o cenário real do ONITEL/issue #58) — o site já está Retired: `skipped` conta que ele não
    // avançou nesta chamada (idempotente, não é erro), mas não soma histórico nem `updated`.
    const second = await fixture.runtime.geoService.transitionProjectSites(
      project.id,
      [site.id],
      'Retired',
      'Projeto de trabalho excluído',
    );
    assert.equal(second.updated, 0);
    assert.equal(second.skipped, 1);
    assert.deepEqual(second.blocked, []);

    // createSite (undefined→Planned) + a primeira transição (Planned→Retired) = 2; a segunda
    // tentativa não soma uma terceira porque o site já não está em SITE_STATUS_TRANSITIONS
    // de origem para Retired (allowedFromStatuses exclui quem já chegou ao alvo).
    const history = await fixture.runtime.geoService.listSiteHistory(site.id);
    assert.equal(history.length, 2);
  } finally {
    fixture.database.cleanup();
  }
});

test('DELETE /v1/geo/projects/:id via rota HTTP: local bloqueado mantém o projeto íntegro', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto HTTP',
    });
    const free = await fixture.runtime.geoService.createSite({
      name: 'Local livre HTTP',
      siteSpecificationId: spec.id,
    });
    const blocked = await fixture.runtime.geoService.createSite({
      name: 'Local bloqueado HTTP',
      siteSpecificationId: spec.id,
    });
    const feeder = await fixture.runtime.geoService.createSite({
      name: 'Local alimentador HTTP',
      siteSpecificationId: spec.id,
    });
    await fixture.runtime.geoService.addSiteRelationship(blocked.id, feeder.id, 'fedBy');
    await fixture.runtime.geoProjectRepository.linkSite(project.id, free.id);
    await fixture.runtime.geoProjectRepository.linkSite(project.id, blocked.id);

    // Mesma sequência da rota DELETE em app.ts, sem subir um servidor HTTP: lista os ids,
    // chama transitionProjectSites, só remove o projeto se nada ficou bloqueado.
    const siteIds = await fixture.runtime.geoProjectRepository.listSiteIds(TENANT_ID, project.id);
    const result = await fixture.runtime.geoService.transitionProjectSites(
      project.id,
      siteIds,
      'Retired',
      'Projeto de trabalho excluído',
    );
    assert.equal(result.blocked.length, 1);
    // Projeto NÃO é removido: a rota só chama remove() quando blocked.length === 0.
    const stillThere = await fixture.runtime.geoProjectRepository.get(TENANT_ID, project.id);
    assert.ok(stillThere, 'projeto deve continuar existindo com local bloqueado');
    const linksStillThere = await fixture.runtime.geoProjectRepository.listSiteIds(
      TENANT_ID,
      project.id,
    );
    assert.deepEqual(new Set(linksStillThere), new Set([free.id, blocked.id]));
  } finally {
    fixture.database.cleanup();
  }
});

test('site vinculado a um projeto some de roots() e de search(), mas continua acessível via sitesByIds()', async () => {
  const fixture = await createFixture();
  try {
    const spec = await createSiteSpec(fixture.runtime);
    const project = await fixture.runtime.geoProjectRepository.create(TENANT_ID, ACTOR, {
      name: 'Projeto oculto',
    });
    const marker = `ProjSite-${Date.now()}`;
    const site = await fixture.runtime.geoService.createSite({
      name: marker,
      siteSpecificationId: spec.id,
    });

    // Antes de vincular: aparece normalmente na árvore e na busca.
    const rootsBefore = await fixture.runtime.geoTreeService.roots();
    assert.ok(rootsBefore.some((node) => node.refId === site.id));
    const searchBefore = await fixture.runtime.geoTreeService.search(marker);
    assert.ok(searchBefore.some((node) => node.refId === site.id));

    await fixture.runtime.geoProjectRepository.linkSite(project.id, site.id);

    const rootsAfter = await fixture.runtime.geoTreeService.roots();
    assert.ok(
      !rootsAfter.some((node) => node.refId === site.id),
      'site vinculado a projeto não deve aparecer em roots()',
    );
    const searchAfter = await fixture.runtime.geoTreeService.search(marker);
    assert.ok(
      !searchAfter.some((node) => node.refId === site.id),
      'site vinculado a projeto não deve aparecer na busca',
    );

    const bySiteIds = await fixture.runtime.geoTreeService.sitesByIds([site.id]);
    assert.equal(bySiteIds.length, 1);
    assert.equal(bySiteIds[0]?.refId, site.id);
    assert.equal(bySiteIds[0]?.label, marker);

    // Desvinculado, volta a aparecer — a exclusão é dirigida pelo dado (RN-003), não por flag.
    await fixture.runtime.geoProjectRepository.unlinkSite(project.id, site.id);
    const rootsRestored = await fixture.runtime.geoTreeService.roots();
    assert.ok(rootsRestored.some((node) => node.refId === site.id));
  } finally {
    fixture.database.cleanup();
  }
});
