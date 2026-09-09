# V.tal Nexus

Inventário de rede da V.tal, alinhado ao modelo **TM Forum ODA**. O repositório contém as duas
metades do produto: a **aplicação** em execução (backend TypeScript/Node + frontend React/Vite,
Oracle-only, rodando localmente) e a **especificação** que a governa (`docs/`).

A V.tal é uma infraestrutura de fibra neutra (_wholesale_) — o cliente do serviço é, em regra, um
ISP (Tenant), não o usuário final.

**Módulos de domínio implementados:** Geographic · Resource · Service · Party · Order · Search · MCP.

> Convenções de código, cânone arquitetural e taxonomia de documentação estão em
> **[AGENTS.md](AGENTS.md)** — leia antes de contribuir.

---

## Stack

| Camada    | Tecnologia                                     |
| --------- | ----------------------------------------------- |
| Backend   | Node 22+ · TypeScript 5.9 (ESM) · HTTP nativo   |
| Frontend  | React 18 · Vite (rolldown) · Tailwind 3 · Lucide |
| Banco     | Oracle Thin (`node-oracledb`), único provider   |
| Testes    | Vitest 4 · Playwright · Testing Library · MSW   |
| Qualidade | ESLint 9 · Prettier 3 · TypeScript strict       |
| Execução  | Somente local — sem Vercel, Docker ou CI/CD     |

---

## Pré-requisitos

- **Node.js 22+** (definido em `engines`)
- Acesso a uma instância **Oracle** (corporativa ou local) com um prefixo de objeto (`ORACLE_OBJECT_PREFIX`) reservado para o seu ambiente — o projeto não sobe banco embutido

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
> use os dois comandos separados: `npm run dev:db` e, em outro terminal, `npm run web:dev`.

### Rodando as partes isoladamente

```bash
npm run dev:db      # só o backend, em watch mode, contra o Oracle configurado no .env
npm run start:db    # só o backend, execução única (sem watch)
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

O Nexus fala com **um único banco: Oracle**. Não há seleção de provider nem fallback — configuração
incompleta ou instância indisponível interrompe a inicialização.

Informe `ORACLE_CONNECTION_STRING` (alias legado: `ORACLE_CONNECT_STRING`), `ORACLE_USER` e
`ORACLE_PASSWORD`. O driver `node-oracledb` opera em Thin mode, sem Oracle Client. O pool usa
`ORACLE_POOL_MIN`, `ORACLE_POOL_MAX`, `ORACLE_POOL_TIMEOUT_SECONDS` e
`ORACLE_POOL_PING_INTERVAL_SECONDS` — valores **em segundos**.

**Schema único, prefixo por ambiente.** A instância corporativa hospeda DEV/HML/PRD (e a suíte de
teste) num único schema Oracle, distinguidos por `ORACLE_OBJECT_PREFIX` — obrigatório e terminando
em `_` (ex.: `NEXUS_DEV_`, `NEXUS_HML_`, `NEXUS_PRD_`, `NEXUS_TEST_`). Todo objeto (tabela, índice,
constraint) é criado e consultado com esse prefixo
([`oracle-database.ts`](src/shared/persistence/oracle-database.ts),
[`oracle-object-names.ts`](src/shared/persistence/oracle-object-names.ts)). O usuário Oracle precisa
de privilégio de DDL quando `DATABASE_AUTO_SCHEMA=true` cria os objetos do prefixo.

Em produção o boot somente valida `<prefixo>schema_migrations`; aplique DDL antecipadamente com
`npm run db:migrate`. `DATABASE_AUTO_SCHEMA=true` é aceito apenas em desenvolvimento/teste.

A ordem de resolução das variáveis Oracle está em
[`src/shared/config/env.ts`](src/shared/config/env.ts).

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

Raramente precisam ser ajustadas — `DATABASE_AUTO_SCHEMA` (padrão `false` em `scripts/dev-database.mjs`,
`true` nos testes) é a mais comum, para permitir que o backend local aplique DDL pendente no boot.

---

## Scripts

### Desenvolvimento

| Comando               | O que faz                                                                    |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`          | Stack completa (backend + Vite). Alias de `dev:local`                        |
| `npm run dev:db`       | Backend em watch mode, contra o Oracle configurado no `.env`                 |
| `npm run dev:backend`  | Alias de `dev:db`                                                            |
| `npm run start:db`     | Backend, execução única (sem watch)                                          |
| `npm run web:dev`      | Frontend Vite                                                                |
| `npm start`            | Servidor estático simples na porta 5200, servindo `web/` com fallback SPA. **Não** é o Vite |

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
| `npm run test:unit`        | Vitest     | Testes sem banco                                   |
| `npm run test:integration` | Vitest     | Alias para a suíte Oracle                           |
| `npm run test:oracle`      | Vitest     | Path Oracle contra uma instância real (ver abaixo) |
| `npm run test:regression`  | Playwright | E2E de browser contra Oracle                        |
| `npm run test:watch`       | Vitest     | Modo watch                                         |
| `npm run test:coverage`    | Vitest     | Cobertura v8                                       |

O gate de dialeto Oracle roda **sem banco** dentro de `test:unit`
([`test/oracle-dialect.spec.ts`](test/oracle-dialect.spec.ts)). `npm run test:oracle` vai além e
exercita o path contra uma instância real — exige a conexão `ORACLE_*` no `.env` e um prefixo de
teste (`ORACLE_OBJECT_PREFIX`/`ORACLE_TEST_OBJECT_PREFIX` terminando em `_TEST_`). Roda em worker
único (o prefixo é um namespace compartilhado) e recusa rodar sob um prefixo que não seja de teste,
para não apagar DEV/HML/PRD no mesmo schema.

> A configuração segura do Oracle e do prefixo de teste está em [AGENTS.md](AGENTS.md) §3.

### Utilitários

| Comando                    | O que faz                                                 |
| -------------------------- | --------------------------------------------------------- |
| `npm run db:migrate`       | Aplica DDL pendente no prefixo Oracle configurado         |
| `npm run mcp:tmf`          | Servidor MCP (stdio) expondo as APIs TMF a clientes de IA |
| `npm run browsers:install` | Instala o Chromium do Playwright                          |

---

## Estrutura do projeto

```text
src/
├── modules/       # domínios: geo · resource · service · party · order · search · mcp
└── shared/        # config · http · persistence · tmf · logging · errors · runtime · ui · utils

web/src/           # React: pages · components · hooks · services · utils · data
test/              # vitest (unit/integration) + playwright (regression)
scripts/           # dev, seed, cargas e migração
docs/              # especificação — ver docs/ e AGENTS.md §8
```

Cada módulo de domínio segue a mesma anatomia: `domain.ts` (tipos e regras), `repository.ts` +
`oracle-repository.ts` (persistência atrás de interface), `service.ts` (casos de uso) e `index.ts`
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

## Execução

O Nexus roda **somente localmente** nesta etapa: sem Vercel, sem Docker/VPS/Caddy e sem CI/CD no
GitHub. O fluxo suportado é `npm run dev` (backend nativo em `src/main.ts` + Vite local) contra o
Oracle configurado no `.env`; não há build de imagem, deploy remoto nem pipeline automatizado.

## Carga inicial

Scripts de carga de dados reais (estações e recursos Netwin, seeds GPON, catálogo de serviços) vivem
em `scripts/` e gravam direto no Oracle configurado no `.env`, respeitando o `ORACLE_OBJECT_PREFIX`
do ambiente. Os que falam com a API usam `NEXUS_API` (padrão `http://127.0.0.1:4001`) e
`NEXUS_TOKEN` para autenticar contra o backend local em execução.

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

Sem CI/CD nesta etapa — o repositório não roda pipelines automatizados. Os gates (`docs:check`,
`lint`, `typecheck`, `build`, `test`) são comandos manuais; rode-os localmente antes de considerar
uma mudança pronta (ver [AGENTS.md](AGENTS.md) §2).

---

## Licença

`UNLICENSED` — repositório privado, uso interno V.tal.

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
