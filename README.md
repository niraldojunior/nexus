# V.tal Nexus

Inventário de rede da V.tal, alinhado ao modelo **TM Forum ODA**. O repositório contém as duas
metades do produto: a **aplicação** em execução (backend TypeScript/Node + frontend React/Vite,
com persistência dual nativa em PostgreSQL e Oracle via `DATABASE_PROVIDER`) e a **especificação**
que a governa (`docs/`).

A V.tal é uma infraestrutura de fibra neutra (_wholesale_) — o cliente do serviço é, em regra, um
ISP (Tenant), não o usuário final.

**Módulos de domínio implementados:** Geographic · Resource · Service · Party · Order · Search · MCP.

> Convenções de código, cânone arquitetural e taxonomia de documentação estão em
> **[AGENTS.md](AGENTS.md)** — leia antes de contribuir.

---

## Stack

| Camada    | Tecnologia                                                    |
| --------- | ------------------------------------------------------------- |
| Backend   | Node 22+ · TypeScript 5.9 (ESM) · HTTP nativo                 |
| Frontend  | React 18 · Vite (rolldown) · Tailwind 3 · Lucide              |
| Banco     | PostgreSQL (laboratório hospedado em Neon) ou Oracle Thin, ambos nativos (`DATABASE_PROVIDER`) |
| Testes    | Vitest 4 · Playwright · Testing Library · MSW                 |
| Qualidade | ESLint 9 · Prettier 3 · TypeScript strict                     |
| Deploy    | Vercel (paralelo) · Docker Compose no VPS                     |

---

## Pré-requisitos

- **Node.js 22+** (definido em `engines`)
- Uma instância **PostgreSQL** para desenvolvimento (o laboratório atual usa Neon; qualquer Postgres
  comum serve, ver "Deploy (Docker / VPS)") ou **Oracle** — o projeto não sobe banco local

---

## Setup

```bash
npm install
cp .env.example .env     # ajuste os valores (ver "Variáveis de ambiente")
npm run build
npm run dev
```

`npm run dev` sobe a stack completa:

| Serviço         | URL                     |
| --------------- | ----------------------- |
| Backend         | `http://127.0.0.1:4001` |
| Frontend (Vite) | `http://127.0.0.1:5200` |

> **`npm run dev` usa PowerShell** (`start-dev.ps1`) — ele encerra sessões anteriores, libera as
> portas, faz o build e aguarda o `/health` antes de subir o Vite. Em shell POSIX (Linux, macOS, WSL),
> use os dois comandos separados: `npm run dev:neon` e, em outro terminal, `npm run web:dev`.

### Rodando as partes isoladamente

```bash
npm run dev:neon    # só o backend, em watch mode, contra o Neon de dev
npm run start:neon  # só o backend, execução única (sem watch)
npm run web:dev     # só o frontend Vite
```

---

## Variáveis de ambiente

### Aplicação

| Variável                         | Obrigatória         | Padrão        | Descrição                                                         |
| -------------------------------- | ------------------- | ------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                       | não                 | `development` | `development` · `test` · `production`                             |
| `PORT`                           | não                 | `4001`        | Porta do backend                                                  |
| `APP_NAME`                       | não                 | `v-tal-nexus` | Nome da aplicação nos logs                                        |
| `LOG_LEVEL`                      | não                 | `info`        | `debug` · `info` · `warn` · `error`                               |
| `AUTH_ENABLED`                   | não                 | `true`        | Liga o guard de bearer token                                      |
| `AUTH_TOKEN`                     | **sim em produção** | `change-me`   | Token estático de máquina (scripts/MCP)                           |
| `AUTH_JWT_SECRET`                | para login          | —             | Segredo HS256 do IdP local; sem ele `/v1/auth/login` responde 503 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | para o 1º login     | —             | Admin semente criado no bootstrap (idempotente)                   |
| `AUTH_ACCESS_TOKEN_TTL_HOURS`    | não                 | `12`          | Validade do JWT de sessão, em horas                               |
| `TMF_PUBLIC_BASE_URL`            | não                 | —             | Host público prefixado nos `href` TMF; vazio preserva paths relativos |

> `TMF_PUBLIC_BASE_URL` deve conter a origem pública sem barra final (por exemplo, `https://api.exemplo.com`). Use-a quando o Nexus estiver atrás de um gateway como Apigee; sem ela, os `href` seguem relativos (`/tmf-api/...`), preservando o contrato histórico.

> **Login de usuário.** Usuários reais entram por e-mail/senha (`POST /v1/auth/login` → JWT), gravado
> no `localStorage` da SPA. O `AUTH_TOKEN` estático continua para máquina-a-máquina. Defina
> `AUTH_JWT_SECRET` (`openssl rand -hex 32`) e `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`; o primeiro
> login usa esse admin, que cria os demais usuários na tela **Usuários** (papéis RBAC).

### Banco de dados

`DATABASE_PROVIDER=postgres|oracle` seleciona um único provider no boot (`postgres` por padrão).
A configuração incompleta ou a indisponibilidade do provider selecionado interrompe a inicialização;
o Nexus não tenta o outro banco silenciosamente.

Com `DATABASE_PROVIDER=oracle`, informe `ORACLE_CONNECTION_STRING` (alias legado:
`ORACLE_CONNECT_STRING`), `ORACLE_USER` e `ORACLE_PASSWORD`. O driver `node-oracledb` opera em Thin
mode, sem Oracle Client. O pool Oracle usa `ORACLE_POOL_MIN`, `ORACLE_POOL_MAX` (com fallback para
os `DATABASE_POOL_*` compartilhados), `ORACLE_POOL_TIMEOUT_SECONDS` e
`ORACLE_POOL_PING_INTERVAL_SECONDS` — valores **em segundos**. O provider Postgres continua com
`DATABASE_POOL_*` (milissegundos).

**Schema único, prefixo por ambiente.** A instância corporativa hospeda DEV/HML/PRD (e a suíte de
teste) num único schema Oracle, distinguidos por `ORACLE_OBJECT_PREFIX` — obrigatório e terminando
em `_` (ex.: `NEXUS_DEV_`, `NEXUS_HML_`, `NEXUS_PRD_`, `NEXUS_TEST_`). Todo objeto (tabela, índice,
constraint) é criado e consultado com esse prefixo; o SQL da aplicação é autorado no dialeto
Postgres e traduzido para Oracle em runtime ([`oracle-database.ts`](src/shared/persistence/oracle-database.ts),
[`oracle-object-names.ts`](src/shared/persistence/oracle-object-names.ts)). O usuário Oracle precisa
de privilégio de DDL quando `DATABASE_AUTO_SCHEMA=true` cria os objetos do prefixo.

Em produção o boot somente valida `<prefixo>schema_migrations`; aplique DDL antecipadamente com
`npm run db:migrate`. `DATABASE_AUTO_SCHEMA=true` é aceito apenas em desenvolvimento/teste.

Para o cutover, `npm run migrate:postgres-to-oracle -- --dry-run|--resume|--verify-only` usa
`SOURCE_DATABASE_URL`, `TARGET_ORACLE_CONNECT_STRING`, `TARGET_ORACLE_USER`,
`TARGET_ORACLE_PASSWORD`, `TARGET_ORACLE_OBJECT_PREFIX` (deve casar com o `ORACLE_OBJECT_PREFIX` do
runtime de destino) e `MIGRATION_BATCH_SIZE` (padrão `1000`). Fluxo recomendado: `--dry-run` →
carga → `--verify-only`. O relatório contém somente contagens e hashes normalizados, nunca
credenciais ou conteúdo dos registros.

Com `DATABASE_PROVIDER=postgres`, ao menos uma connection string PostgreSQL é obrigatória — a
aplicação **falha no boot** sem ela. Todas precisam começar com `postgres://` ou `postgresql://`.
O laboratório atual hospeda esse Postgres no Neon, mas o runtime usa `pg` puro (ver "Deploy (Docker
/ VPS)") — qualquer instância PostgreSQL comum serve.

| Variável            | Quando é usada                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`      | **Override explícito** — se presente, vence todas as outras             |
| `DATABASE_URL_PROD` | `VERCEL_ENV=production` ou `NODE_ENV=production`                        |
| `DATABASE_URL_DEV`  | Vercel Preview/Development, e fallback do desenvolvimento local         |
| `DATABASE_URL_TEST` | Preferida em ambiente local/test, para isolar os testes do banco de dev |

A ordem de resolução está em [`src/shared/config/env.ts`](src/shared/config/env.ts). Cada variável
aceita o alias `NEON_DATABASE_URL_*` (ex.: `NEON_DATABASE_URL_PROD`).

> Os testes não usam o Neon. Use o endpoint **`-pooler`** apenas para o runtime e as operações
> manuais que ainda dependem do Postgres do laboratório.

### Integrações opcionais

| Variável                                    | Padrão                      | Descrição                                                                                           |
| ------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                            | —                           | Habilita as rotas de research/chat. Sem ela, o Copilot cai em fallback local sobre `docs/`          |
| `OPENAI_MODEL`                              | `gpt-4o-mini`               | Modelo usado nas rotas de chat                                                                      |
| `API_ENDPOINT`                              | `https://api.openai.com/v1` | Endpoint compatível com OpenAI                                                                      |
| `VITE_GOOGLE_MAPS_API_KEY`                  | —                           | Mapas do módulo Geo (só a JS API está habilitada)                                                   |
| `GEONET_API_BASE_URL` / `GEONET_TOKEN_URL`  | —                           | Base e OAuth2 do GeographicAddressManagement; ambas obrigatórias para habilitar a comparação Geonet |
| `GEONET_CLIENT_ID` / `GEONET_CLIENT_SECRET` | —                           | Credenciais OAuth2 server-side do Geonet; nunca devem ter prefixo `VITE_`                           |

### Avançadas

Raramente precisam ser ajustadas — têm padrões seguros definidos em `scripts/dev-neon.mjs`:
`DATABASE_AUTO_SCHEMA`, `DATABASE_BRIDGE_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS`,
`DATABASE_BRIDGE_BUFFER_BYTES`, `DATABASE_REUSE_TEST_INSTANCE`.

---

## Scripts

### Desenvolvimento

| Comando              | O que faz                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`        | Stack completa (backend + Vite). Alias de `dev:local`                                       |
| `npm run dev:neon`   | Backend em watch mode, contra o Neon de dev                                                 |
| `npm run dev:backend` | Alias de `dev:db` — backend em watch mode, contra o provider selecionado em `DATABASE_PROVIDER` |
| `npm run start:neon` | Backend, execução única                                                                     |
| `npm run web:dev`    | Frontend Vite                                                                               |
| `npm start`          | Servidor estático simples na porta 5200, servindo `web/` com fallback SPA. **Não** é o Vite |

### Build e qualidade

| Comando                         | O que faz                                                             |
| ------------------------------- | --------------------------------------------------------------------- |
| `npm run build`                 | Compila o backend TypeScript para `dist/`                             |
| `npm run web:build`             | Build de produção do frontend em `web/dist`                           |
| `npm run typecheck`             | `tsc --noEmit` na raiz **e** em `web/`                                |
| `npm run docs:check`            | Valida estrutura, JSON, links, benchmark, questões e backlog dos HLDs |
| `npm run lint` / `lint:fix`     | ESLint                                                                |
| `npm run format` / `format:fix` | Prettier                                                              |
| `npm run clean`                 | Remove `dist/`                                                        |

### Testes

| Comando                    | Runner     | Escopo                                             |
| -------------------------- | ---------- | -------------------------------------------------- |
| `npm test`                 | —          | Suíte completa: unit → Oracle → regression         |
| `npm run test:unit`        | Vitest     | Testes sem banco e sem acesso ao Postgres de dev   |
| `npm run test:integration` | Vitest     | Alias para a suíte Oracle                           |
| `npm run test:oracle`      | Vitest     | Path Oracle contra uma instância real (ver abaixo) |
| `npm run test:regression`  | Playwright | E2E de browser contra Oracle                        |
| `npm run test:watch`       | Vitest     | Modo watch                                         |
| `npm run test:coverage`    | Vitest     | Cobertura v8                                       |

O gate de dialeto Oracle roda **sem banco** dentro de `test:unit`
([`test/oracle-dialect.spec.ts`](test/oracle-dialect.spec.ts)): traduz o SQL da aplicação e falha se
sobrar qualquer construção só-Postgres. `npm run test:oracle` vai além e exercita o path contra uma
instância real — exige `DATABASE_PROVIDER=oracle` (setado pelo script), a conexão `ORACLE_*` no
`.env` e um prefixo de teste (`ORACLE_OBJECT_PREFIX`/`ORACLE_TEST_OBJECT_PREFIX` terminando em
`_TEST_`). Roda em worker único (o prefixo é um namespace compartilhado) e recusa rodar sob um
prefixo que não seja de teste, para não apagar DEV/HML/PRD no mesmo schema.

> Os testes não acessam o Neon. A configuração segura do Oracle e do prefixo de teste está em
> [AGENTS.md](AGENTS.md) §3.

### Utilitários

| Comando                    | O que faz                                                 |
| -------------------------- | --------------------------------------------------------- |
| `npm run migrate:neon`     | Carga inicial a partir de um snapshot SQLite (ver abaixo) |
| `npm run mcp:tmf`          | Servidor MCP (stdio) expondo as APIs TMF a clientes de IA |
| `npm run browsers:install` | Instala o Chromium do Playwright                          |

---

## Estrutura do projeto

```text
src/
├── modules/       # domínios: geo · resource · service · party · order · search · mcp
└── shared/        # config · http · persistence · tmf · logging · errors · runtime · ui · utils

api/               # entrypoints das Vercel Functions
web/src/           # React: pages · components · hooks · services · utils · data
test/              # vitest (unit/integration) + playwright (regression)
scripts/           # dev, seed, cargas e migração
docs/              # especificação — ver docs/ e AGENTS.md §8
```

Cada módulo de domínio segue a mesma anatomia: `domain.ts` (tipos e regras), `repository.ts` +
`postgres-repository.ts` (persistência atrás de interface), `service.ts` (casos de uso) e `index.ts`
(composição). Use `src/modules/geo/` como gabarito.

---

## API

O backend expõe três superfícies:

| Prefixo      | Conteúdo                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/health`    | Health check. **Público** — não exige autenticação                                                                                         |
| `/v1/*`      | API interna do produto: `geo`, `resource/workspace`, `service/workspace`, `research`, `searches`, `users`, `bootstrap`, `chat/completions` |
| `/tmf-api/*` | Open APIs TM Forum v4 (ver abaixo)                                                                                                         |

**Open APIs TMF implementadas:** TMF632 (Party), TMF633/638 (Service Catalog/Inventory),
TMF634/639 (Resource Catalog/Inventory), TMF641 (Service Ordering), TMF645 (Service Qualification),
TMF652 (Resource Order), TMF664 (Resource Function Activation), TMF669 (Party Role),
TMF673/674/675 (Geographic Address/Site/Location) e TMF688 (Event).

### Autenticação

Com `AUTH_ENABLED=true` (padrão), toda rota exceto `/health` exige:

```text
Authorization: Bearer <AUTH_TOKEN>
```

---

## Deploy (Vercel)

Deploy automático, configurado em [`vercel.json`](vercel.json):

- push em `main` → **Production**
- pull requests e demais branches → **Preview**
- build: `npm run build && npm run web:build`; estático servido de `web/dist`
- `/v1/*`, `/tmf-api/*` e `/health` são roteados para as Vercel Functions; o resto cai no SPA

### Variáveis a configurar na Vercel

| Escopo           | Variáveis                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| Production       | `DATABASE_URL_PROD`, `AUTH_TOKEN`, `APP_NAME`, `AUTH_ENABLED`                |
| Preview          | `DATABASE_URL_DEV`, `AUTH_TOKEN`, `APP_NAME`, `AUTH_ENABLED`                 |
| Ambos (opcional) | `OPENAI_API_KEY`, `OPENAI_MODEL`, `API_ENDPOINT`, `VITE_GOOGLE_MAPS_API_KEY` |

Defina `DATABASE_URL` apenas se quiser sobrescrever a seleção por ambiente.

### Layout do Postgres de laboratório (Neon)

| Ambiente  | Escopo Vercel     | Variável usada      | Banco    |
| --------- | ----------------- | ------------------- | -------- |
| Dev local | `.env` local      | `DATABASE_URL_DEV`  | Neon dev |
| Preview   | Vercel Preview    | `DATABASE_URL_DEV`  | Neon dev |
| Produção  | Vercel Production | `DATABASE_URL_PROD` | Neon PRD |

Com esse layout, branches e previews nunca tocam dados de produção. Para isolar os testes locais do
banco de dev, aponte `DATABASE_URL_TEST` para um banco separado.

---

## Deploy (Docker / VPS)

Alternativa ao Vercel, para rodar a stack num VPS próprio com domínio e HTTPS. O deploy Vercel segue
em paralelo — nada em `vercel.json` / `api/` é removido. O runtime usa `pg` puro, então um Postgres
comum (ex.: contêiner) serve sem mudar código: basta apontar `DATABASE_URL` para ele.

**Componentes** (todos na raiz):

| Arquivo               | Papel                                                               |
| --------------------- | ------------------------------------------------------------------- |
| `Dockerfile`          | Multi-stage; alvos `api` (backend Node) e `web` (Caddy + SPA)       |
| `Caddyfile`           | Proxy reverso + TLS automático; espelha as rotas de `vercel.json`   |
| `docker-compose.yml`  | Serviços `api`, `web` e `tools` (schema/cargas); Postgres é externo |
| `.env.docker.example` | Modelo do `.env.docker` (gitignored)                                |

O Postgres **não** é gerenciado pelo compose — conecta-se ao contêiner existente por uma rede docker
externa (`POSTGRES_NETWORK`). A imagem `web` serve o SPA atrás de `basic_auth`; o Bearer do frontend
vai compilado no bundle (`VITE_AUTH_TOKEN`) e **não é segredo** — o perímetro real é o `basic_auth`.

### Passos

```bash
# 1. Rede + banco do Postgres já existente
docker network create nexus-db
docker network connect nexus-db <container-pg>

# 2. Configuração
cp .env.docker.example .env.docker   # preencher domínio, senha, DATABASE_URL, tokens
#    hash do basic_auth:
docker run --rm caddy:2-alpine caddy hash-password --plaintext '<senha>'

# 3. Schema (banco vazio) — aponte o DNS do domínio para o VPS antes deste passo
docker compose --profile tools run --rm tools

# 4. Subir a stack (api + web com TLS via Let's Encrypt)
docker compose up -d --build
curl -fsS https://<domínio>/health
```

### Recarga dos dados

Os CSVs de origem são gitignored — copie `legacy-data/` para o VPS. Rode os loaders **sempre dentro
do `tools`** (que só enxerga `.env.docker`), nunca da estação de trabalho: com o `.env` do repo
carregado, `load-recursos-netwin.mjs --apply` dá `TRUNCATE` no Neon de dev.

```bash
docker compose --profile tools run --rm --entrypoint node tools scripts/<loader>.mjs
```

Ordem: `estacoes_carregar.mjs --fast` → `load-recursos-netwin.mjs --apply` → seeds GPON/Service →
`repair-geo-consistency.mjs` + `backfill-serving-site.mjs`. Os seeds que falam com a API usam
`NEXUS_API=http://api:4001` e `NEXUS_TOKEN=$AUTH_TOKEN` (rede interna, sem passar pelo `basic_auth`).

### CI das imagens

`.github/workflows/docker.yml` valida o compose, constrói as imagens `api`/`web` e, fora de PR,
publica no GHCR (`ghcr.io/<owner>/nexus-{api,web}`). Defina `VITE_AUTH_TOKEN` e
`VITE_GOOGLE_MAPS_API_KEY` como secrets do repositório para que o bundle publicado saia com os
valores corretos.

---

## Carga inicial

Para popular um banco PostgreSQL vazio (Neon ou qualquer outro) a partir de um snapshot SQLite:

```powershell
$env:TARGET_DATABASE_URL='<postgres-connection-string>'
npm run migrate:neon
```

`SOURCE_DATABASE_URL` aponta o SQLite de origem. Rode uma vez por banco (dev e produção) se quiser
ambos populados a partir da mesma baseline.

Scripts de carga de dados reais (estações e recursos Netwin, seeds GPON) vivem em `scripts/` e usam
`NEXUS_API` (padrão `http://127.0.0.1:4001`) e `NEXUS_TOKEN` para falar com o backend em execução.

---

## Documentação

| Onde                                                 | O quê                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                               | Cânone arquitetural, convenções de código, armadilhas, guardrails |
| [docs/1-overview/](docs/1-overview/)                 | Visão de produto, regras de negócio, glossário                    |
| [docs/2-functional-specs/](docs/2-functional-specs/) | HLDs por módulo (Geo · Resource · Service)                        |
| [docs/3-system-design/](docs/3-system-design/)       | Arquitetura, modelo de dados, integrações, NFR, segurança         |
| [docs/4-design-system/](docs/4-design-system/)       | Tokens, componentes, UI kit, guidelines                           |
| [docs/5-delivery-plan/](docs/5-delivery-plan/)       | Roadmap, backlog, riscos, questões em aberto                      |

---

## CI

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em push para `main` e em todo
pull request, nesta ordem: `lint` → `typecheck` → `build` → `test`.

---

## Licença

`UNLICENSED` — repositório privado, uso interno V.tal.

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
