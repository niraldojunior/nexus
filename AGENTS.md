# AGENTS.md — Guia para agentes de IA no repositório V.tal Nexus

Este arquivo instrui qualquer agente de IA (Claude Code, Codex e outros) que trabalhe neste repositório. Leia-o **antes de escrever código ou documento**. O objetivo é produzir trabalho consistente com o que já existe — mesmo cânone arquitetural, mesmas convenções de código, mesma terminologia, mesma linguagem visual.

Playbooks detalhados ficam em arquivos separados, lidos **sob demanda** (§9 e §10). Não os carregue sem necessidade.

---

## 1. O que é este repositório

**V.tal Nexus** — inventário de rede proprietário da V.tal, alinhado a **TM Forum ODA**. O repositório contém as duas metades do produto:

- **Aplicação** — backend TypeScript/Node (`src/`, `api/`) + frontend React/Vite (`web/`), persistindo em Neon Postgres.
- **Especificação** — HLDs por módulo, design técnico, design system e plano de entrega (`docs/`).

A V.tal é uma **infraestrutura de fibra neutra (wholesale)** — o cliente primário do serviço é, em regra, um **ISP (Tenant)**, não o usuário final. Esta premissa molda todo o domínio de serviço.

---

## 2. Comandos

Node **22+**. Instale com `npm install`, copie `.env.example` para `.env` e ajuste.

| Comando                         | O que faz                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                   | Stack local completa — backend em `127.0.0.1:4001`, Vite em `127.0.0.1:5200`. **Usa PowerShell** (`start-dev.ps1`); em shell POSIX use `dev:neon` + `web:dev`. |
| `npm run dev:neon`              | Só o backend, contra o Neon de dev                                                                                                                             |
| `npm run web:dev`               | Só o frontend Vite                                                                                                                                             |
| `npm run build`                 | Compila TypeScript para `dist/`                                                                                                                                |
| `npm run typecheck`             | `tsc --noEmit` na raiz **e** em `web/`                                                                                                                         |
| `npm run lint` / `lint:fix`     | ESLint                                                                                                                                                         |
| `npm run format` / `format:fix` | Prettier                                                                                                                                                       |
| `npm run docs:check`            | Valida anatomia, JSON, links e rastreabilidade das functional specs                                                                                            |
| `npm test`                      | Suíte completa: unit → integration → regression                                                                                                                |

O **CI** (`.github/workflows/ci.yml`) roda, nesta ordem: `docs:check` → `lint` → `typecheck` → `build` → `test`. Rode ao menos `docs:check`, `lint` e `typecheck` antes de considerar uma mudança pronta.

Setup de ambiente, variáveis do Vercel e layout Neon dev/prod: veja o [README.md](README.md).

---

## 3. Testes

| Camada      | Comando                    | Runner                                  | Escopo                                          |
| ----------- | -------------------------- | --------------------------------------- | ----------------------------------------------- |
| Unit        | `npm run test:unit`        | Vitest (`vitest.config.ts`)             | `test/**/*.spec.ts` + `web/src/**/*.test.tsx`   |
| Integration | `npm run test:integration` | `scripts/run-tests.mjs` sobre o `dist/` | `*.integration.spec.ts`, `*-management.spec.ts` |
| Regression  | `npm run test:regression`  | Playwright                              | E2E de browser                                  |

Arquivo único no Vitest:

```bash
node --use-system-ca node_modules/vitest/vitest.mjs run --config vitest.config.ts test/geo.unit.spec.ts
```

**Armadilhas conhecidas — leia antes de debugar:**

- **`--use-system-ca` é obrigatório.** Atrás do proxy TLS corporativo, o Node rejeita a cadeia do Neon sem ele. Já está nos scripts npm; se invocar o Vitest na mão, inclua.
- **Use sempre o endpoint `-pooler` do Neon nos testes.** O endpoint direto **trava** dentro do worker aninhado do Vitest (o mesmo código roda em ~2s num processo Node standalone). Não é bug de configuração — já foi investigado e descartado.
- **Cada worker do Vitest tem seu próprio schema** (`nexus_test_w<VITEST_POOL_ID>`), reusado entre testes com `TRUNCATE`. Não escreva teste que dependa de schema limpo por arquivo.
- **Logs do worker aninhado não aparecem no stdout.** Para depurar persistência, faça um repro standalone contra o `dist/` compilado.
- **O backend de dev atende requisições em série.** Duas chamadas concorrentes iguais custam o dobro, não o mesmo. Com `React.StrictMode` (double-invoke), hooks que buscam listas caras devem deduplicar a requisição em voo com uma promise compartilhada em nível de módulo — padrão já aplicado em `web/src/hooks/useGeoDirectory.ts` e `useGeoTree.ts`.

---

## 4. Estrutura do repositório

```
AGENTS.md          # este arquivo — cânone e convenções
CLAUDE.md          # apenas `@AGENTS.md` (paridade Claude Code / Codex)
README.md          # setup, env vars, deploy Vercel

src/
├── modules/       # domínios: geo · resource · service · party · order · search · mcp
└── shared/        # config · http · persistence · tmf · logging · errors · runtime · ui · utils

api/               # Vercel Functions: /v1, /tmf-api, /health
web/src/           # React + Vite: pages · components · hooks · services · utils · data
test/              # vitest (unit/integration) + playwright (regression)
scripts/           # dev, seed e cargas de seed/migração

docs/
├── 1-overview/            # product-overview · business-rules · glossary · open-questions
├── 2-functional-specs/    # HLDs: 01-module-geo · 02-module-resource · 03-module-service
│   ├── _spec-template.md      # ← playbook: anatomia de HLD + template de requisito
│   ├── _benchmark-systems.md  # ← playbook: seção N.9
│   └── inspirations/          # fontes de benchmark: netwin · kuwaiba · netbox
├── 3-system-design/       # architecture · data-model · integrations · NFR · security
├── 4-design-system/       # SKILL.md + tokens · guidelines · components · ui_kits · assets
└── 5-delivery-plan/       # roadmap · backlog · riscos · questões em aberto
```

**Anatomia de um módulo de domínio** (use `src/modules/geo/` como gabarito): `domain.ts` (tipos e regras) · `repository.ts` + `postgres-repository.ts` (persistência, com interface separada) · `service.ts` (casos de uso) · `ids.ts` · `index.ts` (composição).

> **Document references dos HLDs** (`VTN-HLD-MOD01-GEO`, `-MOD02-RES`, `-MOD03-SVC`) vivem **dentro** de cada arquivo e não mudam com reorganização de pastas. O número do arquivo (`01-`, `02-`, `03-`) é o número do **módulo**, independente do número da pasta.

---

## 5. A tríade (decore isto)

| Pergunta             | Módulo         | TMF            | Pertence a                        |
| -------------------- | -------------- | -------------- | --------------------------------- |
| **Onde?**            | 1 — Geographic | TMF673/674/675 | Site, Sub-Site, Address, Location |
| **O quê?**           | 2 — Resource   | TMF634/639     | PhysicalResource, LogicalResource |
| **Para quê / quem?** | 3 — Service    | TMF633/638     | CFS, RFS, SubscriberID            |

Nunca misture as camadas. Um serviço **referencia** recurso (`supportingResource`), nunca o contém. Um recurso **referencia** geografia (`place`), nunca a contém.

---

## 6. Cânone arquitetural — decisões NÃO-negociáveis

Estas decisões estão firmadas. Respeite-as; não as reabra sem pedido explícito do usuário.

> Tabela compacta para consulta rápida. A **forma longa** — com racional, exemplos, casos de borda e
> o status real de cada decisão no código — está em `docs/1-overview/business-rules.md`. Consulte-a
> antes de decidir qualquer coisa que dependa do _porquê_ de uma regra.

| #       | Decisão                             | Regra prática                                                                                                                                                                                                          |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1**  | **TMF-first**                       | Toda entidade/atributo/evento segue o modelo canônico TMF. Extensão V.tal entra como `characteristic` tipada via catálogo — **nunca** campo hardcoded.                                                                 |
| **C2**  | **Rack é a fronteira Geo↔Resource** | Acima do Rack (sala, andar, Central) = GeographicSite. Do Rack para dentro = PhysicalResource.                                                                                                                         |
| **C3**  | **Fronteira dupla do Service**      | (a) Service ↔ Resource: serviço é intangível, referencia recurso via `supportingResource`. (b) CFS ↔ RFS: CFS = comercial (SubscriberID); RFS = técnico (consome recursos). CFS nunca referencia Resource diretamente. |
| **C4**  | **Home Passed não é Service**       | HP = GeographicAddress (Mód.1) + viabilidade TMF645 (Mód.4). HC = ServiceInstance (Mód.3). ~22M HPs **não** geram 22M Services.                                                                                        |
| **C5**  | **Agnóstico à origem — `_origin`**  | Nexus gera **UUID v7** próprio. IDs legados ficam em `characteristic` somente-leitura no grupo `_origin` (`_origin.system`, `.id`, `.entity`, `.migratedAt`, `.migratedBy`, `.url?`, `.extra?`).                       |
| **C6**  | **Soft-delete / soft-terminate**    | Nada é excluído fisicamente. Resource → `administrativeState=locked`. Service → `state=terminated`.                                                                                                                    |
| **C7**  | **Event-driven (TMF688)**           | Toda mudança relevante publica evento via outbox pattern, idempotente (UUID v7), schema versionado em Schema Registry.                                                                                                 |
| **C8**  | **Multi-tenant / wholesale**        | `relatedParty` com Tenant desde a criação. No Service, o subscriber do CFS é tipicamente um Tenant ISP (`modelo_comercial = wholesale \| direto`).                                                                     |
| **C9**  | **Catálogos extensíveis via API**   | RelationshipTypes e Specifications têm bootstrap canônico + CRUD via API com governança (Audit + TMF688). Sem listas fechadas hardcoded.                                                                               |
| **C10** | **Oracle-native + Property Graph**  | Alvo arquitetural: Oracle 21c/23ai, com path computation (porta OLT→ONT) via Property Graph. **A implementação atual roda em Neon Postgres** — trate C10 como destino, não como estado presente.                       |

---

## 7. Convenções de código

- **TypeScript estrito**, ESM. Prettier e ESLint mandam — não brigue com eles, rode `format:fix` / `lint:fix`.
- **Domínio isolado da persistência.** Repositório é interface (`*-repository-interface.ts`) com implementação Postgres separada. Não vaze SQL para `service.ts`.
- **Nomes de arquivo em kebab-case** no backend; **PascalCase** para componentes React.
- **Entidades e atributos seguem o vocabulário TMF** (C1), inclusive no banco e nas rotas.
- **Nunca hardcode tokens visuais** (cor, espaçamento, fonte) — use as variáveis CSS do design system.
- **Segredos nunca entram no repositório.** `.env` está no `.gitignore` e contém `DATABASE_URL*`, `AUTH_TOKEN` e `OPENAI_API_KEY`. Não os imprima em log, output ou commit.

---

## 8. Onde escrever cada tipo de conteúdo

| Tipo de conteúdo                                                          | Pasta / arquivo                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Propósito do produto, visão estratégica, tríade, módulos, roadmap         | `docs/1-overview/product-overview.md`                                               |
| Regras de negócio transversais, decisões arquiteturais (C1–C10 e futuras) | `docs/1-overview/business-rules.md`                                                 |
| Glossário de termos e acrônimos                                           | `docs/1-overview/glossary.md`                                                       |
| **Questão em aberto / decisão pendente**                                  | `docs/1-overview/open-questions.md` — **registro único**; não crie listas paralelas |
| Especificação funcional de um módulo (HLD)                                | `docs/2-functional-specs/0N-module-<nome>.md`                                       |
| Arquitetura de sistema, ADRs                                              | `docs/3-system-design/architecture.md`                                              |
| Modelo de dados canônico, ERD, mapeamentos TMF                            | `docs/3-system-design/data-model.md`                                                |
| Integrações com legados e sistemas externos                               | `docs/3-system-design/integrations.md`                                              |
| Requisitos não-funcionais (performance, SLA, escala)                      | `docs/3-system-design/non-functional-requirements.md`                               |
| RBAC, multi-tenancy, auditoria, segurança                                 | `docs/3-system-design/security.md`                                                  |
| Tokens, guidelines, componentes, UI                                       | `docs/4-design-system/` (ver §10)                                                   |
| Roadmap detalhado, milestones, critérios de aceite de fase                | `docs/5-delivery-plan/`                                                             |

> Não crie arquivos fora desta taxonomia sem motivo explícito.

---

## 9. Escrevendo uma functional spec

Specs têm anatomia rígida. **Ao criar ou editar um HLD, leia primeiro:**

| Playbook                                        | Quando                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/2-functional-specs/_spec-template.md`     | Anatomia do documento, template de requisito (9 sub-itens), método de validação |
| `docs/2-functional-specs/_benchmark-systems.md` | Preencher a seção N.9 (Netwin / Kuwaiba / NetBox)                               |

---

## 10. Design system

**`docs/4-design-system/SKILL.md` é a fonte normativa** para qualquer UI, componente, tela ou protótipo. É obrigatório lê-lo antes de gerar interface — ele carrega a linguagem visual vigente, que evolui mais rápido que este arquivo.

| Onde               | O quê                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `tokens/`          | Fonte de verdade visual: `colors` · `typography` · `spacing` · `effects` · `fonts` · `base` (CSS + JSON)              |
| `components/core/` | React: Badge · Button · Card · Input · MetricCard · StatusPill (cada um com `.d.ts` + `.prompt.md`)                   |
| `ui_kits/nexus/`   | Telas completas: Login · Shell · Dashboard · Inventory · Geo · Topology · Viability (+ `shared.jsx`, `data.js`)       |
| `guidelines/`      | `colors` · `typography` · `spacing` · `principles` · `page-chrome` · `presentations` (PPTX) + showcases `*.card.html` |

Para **código de produção**, a referência canônica de UI é o frontend real em `web/src`, não o UI kit — o kit é material de prototipagem.

---

## 11. Convenções de escrita e idioma

- **Idioma:** prosa em **português (pt-BR)**; nomes de módulo e termos técnicos em **inglês** (Outside Plant, Inside Plant, Resource Catalog, Service Inventory, Customer Facing Service, Resource Facing Service…); rótulos de camada, status e UI em português.
- **IDs canônicos:** requisitos `REQ-MODxx-NNN`; questões `Q-xxx`; decisões `D-x` ou `C-x`; funcionais `RF-`; negócio `RN-`; aceite `CA-`.
- **Formato:** Markdown. Tabelas para mapeamentos; prosa para racional; ASCII art para hierarquias e cenários.
- **JSON:** realista e válido; sempre com `@type`/`@referredType`; mostre as amarrações canônicas (`place`, `supportingResource`, `supportingService`, `relatedParty`).
- **Terminologia assumida (sem definir):** OSS/BSS, TM Forum, ODA, GPON/FTTH, HP/HC, EOL/EOF, planta externa/interna, OPEX/CAPEX, dual-running, cutover, CFS/RFS, SubscriberID, SID.

---

## 12. Referência rápida — Open APIs TMF por módulo

| API    | Nome                                | Módulo                    |
| ------ | ----------------------------------- | ------------------------- |
| TMF632 | Party Management                    | 6 — Party & Tenant        |
| TMF633 | Service Catalog                     | 3 — Service               |
| TMF634 | Resource Catalog                    | 2 — Resource              |
| TMF638 | Service Inventory                   | 3 — Service               |
| TMF639 | Resource Inventory                  | 2 — Resource              |
| TMF641 | Service Ordering                    | 4 — Order                 |
| TMF645 | Service Qualification (Viabilidade) | 4 — Order                 |
| TMF652 | Resource Order                      | 4 — Order                 |
| TMF664 | Resource Function Activation        | 2 + 4                     |
| TMF669 | Party Role                          | 6 — Party & Tenant        |
| TMF673 | Geographic Address                  | 1 — Geographic            |
| TMF674 | Geographic Site                     | 1 — Geographic            |
| TMF675 | Geographic Location                 | 1 — Geographic            |
| TMF688 | Event Management                    | Transversal               |
| TMF701 | Process Flow                        | 5 — Process Orchestration |
| TMF724 | Document Management                 | 7 — Analytics & Events    |

---

## 13. Guardrails — o que NÃO fazer

- ❌ Não duplique modelagem entre módulos. Service referencia Resource; não copia atributos.
- ❌ Não invente atributos TMF. Se não está no padrão, é `characteristic` via catálogo.
- ❌ Não persista Home Passed como Service (C4).
- ❌ Não use DELETE físico (C6).
- ❌ Não trate o subscriber do CFS como usuário final por default — o default é o ISP/Tenant (C8).
- ❌ Não reabra decisões ✅ sem pedido explícito.
- ❌ Não hardcode tokens visuais — sempre use as variáveis CSS do design system.
- ❌ Não crie telas ou componentes sem antes ler `docs/4-design-system/SKILL.md`.
- ❌ Não crie arquivos fora da taxonomia de pastas definida em §4.
- ❌ Não commite segredos nem imprima o conteúdo de `.env`.
- ✅ Ao mover ou renomear arquivos em `docs/`, atualize as referências — **há caminhos hardcoded em `src/modules/search/`** que quebram silenciosamente.
- ✅ Ao editar uma functional spec, atualize o **Controle de revisões** e reflita no `product-overview.md`.
- ✅ Ao criar/editar componente React, siga os tokens e consulte o `*.prompt.md` correspondente.

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
