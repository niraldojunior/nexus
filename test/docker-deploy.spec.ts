import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { loadConfig } from '../src/shared/config/env.js';

// Validações estáticas do ambiente Docker/VPS. Espelham o papel do
// test/vercel-config.spec.ts para a Vercel: garantem que a fiação de rotas,
// build e banco do novo ambiente permanece coerente conforme os arquivos evoluem.
// São checagens de texto (sem subir contêiner) — o smoke real roda no VPS.

const readRepoFile = (relative: string): string =>
  readFileSync(resolve(process.cwd(), relative), 'utf8');

// --------------------------------------------------------------- Dockerfile ---

test('Dockerfile expõe os alvos api e web', () => {
  const dockerfile = readRepoFile('Dockerfile');
  assert.match(dockerfile, /AS api\b/, 'esperava um estágio `AS api`');
  assert.match(dockerfile, /AS web\b/, 'esperava um estágio `AS web`');
});

test('Dockerfile roda o backend standalone (dist/src/main.js), não um handler Vercel', () => {
  const dockerfile = readRepoFile('Dockerfile');
  assert.match(dockerfile, /CMD \["node", "dist\/src\/main\.js"\]/);
});

test('Dockerfile embarca docs/ e scripts/ na imagem api (dependências de runtime)', () => {
  const dockerfile = readRepoFile('Dockerfile');
  // local-knowledge-provider.ts e nexus-copilot-context.ts leem docs/ em runtime;
  // scripts/ roda as cargas no perfil `tools`.
  assert.match(dockerfile, /COPY docs\s+\.\/docs/);
  assert.match(dockerfile, /COPY scripts\s+\.\/scripts/);
});

test('Dockerfile serve o SPA compilado pelo Caddy', () => {
  const dockerfile = readRepoFile('Dockerfile');
  assert.match(dockerfile, /FROM caddy:[^\s]+ AS web/);
  assert.match(dockerfile, /COPY --from=build \/app\/web\/dist \/srv/);
  assert.match(dockerfile, /COPY Caddyfile \/etc\/caddy\/Caddyfile/);
});

test('Dockerfile usa base glibc (bookworm) para os estágios Node, não musl/alpine', () => {
  const dockerfile = readRepoFile('Dockerfile');
  // better-sqlite3 e oracledb são deps de produção e só têm prebuild para glibc.
  const nodeStages = dockerfile.match(/FROM node:[^\s]+/g) ?? [];
  assert.ok(nodeStages.length > 0, 'esperava ao menos um estágio FROM node:');
  for (const stage of nodeStages) {
    assert.doesNotMatch(stage, /alpine/, `estágio Node não deve ser alpine: ${stage}`);
    assert.match(stage, /bookworm/, `estágio Node deve ser bookworm: ${stage}`);
  }
});

// ----------------------------------------------------------------- Caddyfile --

test('Caddyfile remove o prefixo /api antes de repassar para o backend', () => {
  const caddy = readRepoFile('Caddyfile');
  // O frontend chama /api/v1 e /api/tmf-api (installApiFetchRewrite); o backend
  // não conhece o /api — o proxy tem que removê-lo, como o normalizeRequestUrl faz.
  assert.match(caddy, /\/api\/v1\/\*/);
  assert.match(caddy, /\/api\/tmf-api\/\*/);
  assert.match(caddy, /uri strip_prefix \/api/);
});

test('Caddyfile roteia a API (com e sem /api) para o serviço api:4001', () => {
  const caddy = readRepoFile('Caddyfile');
  assert.match(caddy, /reverse_proxy api:4001/);
  // Rotas diretas de compatibilidade, espelhando vercel.json.
  assert.match(caddy, /\/v1\/\*/);
  assert.match(caddy, /\/tmf-api\/\*/);
  assert.match(caddy, /\/health\b/);
});

test('Caddyfile faz fallback de SPA para /index.html', () => {
  const caddy = readRepoFile('Caddyfile');
  assert.match(caddy, /try_files \{path\} \/index\.html/);
});

// --------------------------------------------------------- docker-compose.yml -

test('docker-compose declara os serviços api, web e tools', () => {
  const compose = readRepoFile('docker-compose.yml');
  assert.match(compose, /^\s{2}api:/m);
  assert.match(compose, /^\s{2}web:/m);
  assert.match(compose, /^\s{2}tools:/m);
});

test('docker-compose só sobe o web depois de o api ficar saudável', () => {
  const compose = readRepoFile('docker-compose.yml');
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:4001\/health'\)/);
});

test('docker-compose conecta ao Postgres externo, não sobe um novo', () => {
  const compose = readRepoFile('docker-compose.yml');
  // Decisão: manter o contêiner Postgres existente. A rede dbnet é externa e
  // NÃO há serviço `postgres`/`db` gerenciado pelo compose.
  assert.match(compose, /external: true/);
  assert.doesNotMatch(compose, /^\s{2}(postgres|db):/m);
});

test('docker-compose mantém as cargas fora do `up` (perfil tools)', () => {
  const compose = readRepoFile('docker-compose.yml');
  assert.match(compose, /profiles: \[tools\]/);
});

test('docker-compose publica 80/443 pelo web e propaga os args do Vite', () => {
  const compose = readRepoFile('docker-compose.yml');
  // Aspas simples ou duplas: o Prettier normaliza YAML para aspas simples, e o
  // estilo de aspas não muda o valor — só o conteúdo "443:443" importa aqui.
  assert.match(compose, /["']443:443["']/);
  assert.match(compose, /VITE_GOOGLE_MAPS_API_KEY/);
  assert.match(compose, /VITE_AUTH_TOKEN/);
});

// ------------------------------------------------------- .env.docker.example --

test('.env.docker.example traz as variáveis obrigatórias do VPS', () => {
  const env = readRepoFile('.env.docker.example');
  for (const key of [
    'NEXUS_DOMAIN',
    'LETSENCRYPT_EMAIL',
    'POSTGRES_NETWORK',
    'AUTH_TOKEN',
    'DATABASE_URL',
    'DATABASE_URL_DEV',
    'VITE_AUTH_TOKEN',
  ]) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `esperava ${key}= no .env.docker.example`);
  }
});

test('.env.docker.example desliga o auto-schema (produção valida schema_migrations)', () => {
  const env = readRepoFile('.env.docker.example');
  assert.match(env, /^DATABASE_AUTO_SCHEMA=false$/m);
});

// --------------------------------------- premissa da migração: DATABASE_URL ----

test('DATABASE_URL sobrepõe a resolução por ambiente da Vercel', () => {
  // O runtime usa `pg` puro; apontar DATABASE_URL para o contêiner basta, mesmo
  // com VERCEL_ENV/NODE_ENV de produção presentes. É o que destrava a migração
  // sem mexer no código de persistência.
  const config = loadConfig({
    DATABASE_URL: 'postgresql://nexus:pass@nexus-pg:5432/nexus',
    DATABASE_URL_PROD: 'postgresql://neon-prod.example/db',
    VERCEL_ENV: 'production',
    NODE_ENV: 'production',
  });
  assert.equal(config.databaseUrl, 'postgresql://nexus:pass@nexus-pg:5432/nexus');
});
