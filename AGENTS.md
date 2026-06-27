# AGENTS.md — Guia para agentes de IA no repositório V.tal Nexus

Este arquivo instrui qualquer agente de IA (Claude e outros) que trabalhe neste repositório. O objetivo é **produzir documentos consistentes com os artefatos já existentes** — mesma anatomia, mesmo cânone arquitetural, mesma terminologia, mesma linguagem visual. Leia este arquivo **antes de criar ou editar qualquer documento ou componente**.

---

## 1. O que é este repositório

Repositório de design e especificação da plataforma **V.tal Nexus** — inventário de rede proprietário da V.tal, alinhado a **TM Forum ODA** (Open Digital Architecture). Contém:

- **Especificações funcionais** por domínio (functional specs / HLDs de módulo)
- **Design técnico** (arquitetura, modelo de dados, integrações)
- **Design system** completo (tokens, componentes React, UI kit, guidelines)
- **Plano de entrega**

A V.tal é uma **infraestrutura de fibra neutra (wholesale)** — o cliente primário do serviço é, em regra, um **ISP (Tenant)**, não o usuário final. Esta premissa molda todo o domínio de serviço.

---

## 2. Estrutura do repositório

```
AGENTS.md
README.md

docs/
├── 00-visao-geral/
│   ├── product-overview.md          # Visão de produto, tríade, módulos, roadmap
│   ├── business-rules.md            # Regras de negócio transversais e decisões arquiteturais
│   └── glossary.md                  # Termos técnicos e acrônimos
│
├── 01-functional-specs/             # Especificações funcionais por módulo (HLDs)
│   ├── 01-modulo-geo.md             # Módulo 1 — Geographic · TMF673/674/675
│   ├── 02-modulo-resource.md        # Módulo 2 — Resource · TMF634/639
│   └── 03-modulo-service.md         # Módulo 3 — Service · TMF633/638
│
├── 02-system-design/
│   ├── architecture.md
│   ├── data-model.md
│   ├── integrations.md
│   ├── non-functional-requirements.md
│   └── security.md
│
├── 03-design-system/
│   ├── README.md / SKILL.md
│   ├── styles.css / Nexus App.html / Nexus Logo*.html
│   ├── tokens/                      # base · colors · effects · fonts · spacing · typography (CSS+JSON)
│   ├── guidelines/                  # *.card.html + colors · principles · spacing · typography (MD)
│   ├── components/                  # *.md specs + core/ (Badge · Button · Card · Input · MetricCard · StatusPill)
│   ├── ui_kits/nexus/               # Dashboard · Inventory · Login · Shell · Topology · Viability (React)
│   └── assets/                      # logos, ícones, screenshots
│
└── 04-delivery-plan/
```

> **Correspondência com document references canônicos:** os document references internos dos HLDs (`VTN-HLD-MOD01-GEO`, `VTN-HLD-MOD02-RES`, `VTN-HLD-MOD03-SVC`) são **preservados dentro de cada arquivo** — eles não mudam com a reorganização de pastas. O número do arquivo (`01-`, `02-`, `03-`) coincide com o número do módulo. O Overview (antes `HLD01`) vive em `docs/00-visao-geral/product-overview.md`.

---

## 3. A tríade (decore isto)

| Pergunta | Módulo | TMF | Pertence a |
|---|---|---|---|
| **Onde?** | 1 — Geographic | TMF673/674/675 | Site, Sub-Site, Address, Location |
| **O quê?** | 2 — Resource | TMF634/639 | PhysicalResource, LogicalResource |
| **Para quê / quem?** | 3 — Service | TMF633/638 | CFS, RFS, SubscriberID |

Nunca misture as camadas. Um serviço **referencia** recurso (`supportingResource`), nunca o contém. Um recurso **referencia** geografia (`place`), nunca a contém.

---

## 4. Cânone arquitetural — decisões NÃO-negociáveis

Estas decisões estão firmadas. Respeite-as; não as reabra sem pedido explícito do usuário.

| # | Decisão | Regra prática |
|---|---|---|
| **C1** | **TMF-first** | Toda entidade/atributo/evento segue o modelo canônico TMF. Extensão V.tal entra como `characteristic` tipada via catálogo — **nunca** campo hardcoded. |
| **C2** | **Rack é a fronteira Geo↔Resource** | Acima do Rack (sala, andar, Central) = GeographicSite. Do Rack para dentro = PhysicalResource. |
| **C3** | **Fronteira dupla do Service** | (a) Service ↔ Resource: serviço é intangível, referencia recurso via `supportingResource`. (b) CFS ↔ RFS: CFS = comercial (SubscriberID); RFS = técnico (consome recursos). CFS nunca referencia Resource diretamente. |
| **C4** | **Home Passed não é Service** | HP = GeographicAddress (Mód.1) + viabilidade TMF645 (Mód.4). HC = ServiceInstance (Mód.3). ~22M HPs **não** geram 22M Services. |
| **C5** | **Agnóstico à origem — `_origin`** | Nexus gera **UUID v7** próprio. IDs legados ficam em `characteristic` somente-leitura no grupo `_origin` (`_origin.system`, `.id`, `.entity`, `.migratedAt`, `.migratedBy`, `.url?`, `.extra?`). |
| **C6** | **Soft-delete / soft-terminate** | Nada é excluído fisicamente. Resource → `administrativeState=locked`. Service → `state=terminated`. |
| **C7** | **Event-driven (TMF688)** | Toda mudança relevante publica evento via outbox pattern, idempotente (UUID v7), schema versionado em Schema Registry. |
| **C8** | **Multi-tenant / wholesale** | `relatedParty` com Tenant desde a criação. No Service, o subscriber do CFS é tipicamente um Tenant ISP (`modelo_comercial = wholesale | direto`). |
| **C9** | **Catálogos extensíveis via API** | RelationshipTypes e Specifications têm bootstrap canônico + CRUD via API com governança (Audit + TMF688). Sem listas fechadas hardcoded. |
| **C10** | **Oracle-native + Property Graph** | Stack Oracle 21c/23ai. Path computation (porta OLT→ONT) via Oracle Property Graph sobre o inventário de Resources. |

---

## 5. Onde escrever cada tipo de conteúdo

| Tipo de conteúdo | Pasta / arquivo |
|---|---|
| Propósito do produto, visão estratégica, tríade, módulos, roadmap | `docs/00-visao-geral/product-overview.md` |
| Regras de negócio transversais, decisões arquiteturais (C1–C10 e futuras) | `docs/00-visao-geral/business-rules.md` |
| Glossário de termos e acrônimos | `docs/00-visao-geral/glossary.md` |
| Especificação funcional de um módulo (HLD) | `docs/01-functional-specs/0N-modulo-<nome>.md` |
| Arquitetura de sistema, ADRs | `docs/02-system-design/architecture.md` |
| Modelo de dados canônico, ERD, mapeamentos TMF | `docs/02-system-design/data-model.md` |
| Integrações com legados e sistemas externos | `docs/02-system-design/integrations.md` |
| Requisitos não-funcionais (performance, SLA, escala) | `docs/02-system-design/non-functional-requirements.md` |
| RBAC, multi-tenancy, auditoria, segurança | `docs/02-system-design/security.md` |
| Tokens, guidelines, componentes, UI | `docs/03-design-system/` (ver §8) |
| Roadmap detalhado, milestones, critérios de aceite de fase | `docs/04-delivery-plan/` |

> Não crie arquivos fora desta taxonomia sem motivo explícito.

---

## 6. Anatomia de uma functional spec (HLD de módulo)

Replique **exatamente** esta espinha (vide `02-modulo-resource.md` e `03-modulo-service.md` como gabarito):

1. **Cabeçalho** — tabela: Document Reference (`VTN-HLD-MODxx-XXX`), versão, data, âncora, predecessores, TMFCs, Open APIs, requisitos cobertos, status.
2. **Propósito do módulo** — o que responde; posição na tríade.
3. **Escopo** — `2.1 Dentro do escopo` / `2.2 Fora do escopo (tratado em outros módulos)`.
4. **Modelo conceitual TMF** — tabela de entidades + hierarquia de tipos (ASCII) + fronteiras com módulos vizinhos.
5. **Princípios de design do módulo** — 6–9 princípios curtos.
6. **Resumo dos requisitos** — blocos (A, B, C…) + tabela completa + ordem de implementação.
7. **Um bloco por requisito** (ver §7 abaixo).
8. **Cenários ilustrativos** — 2–3 cenários ASCII end-to-end atravessando os 3 módulos + padrões reaproveitáveis.
9. **Síntese arquitetural.**
10. **Contratos com outros módulos** — tabela Módulo × tipo de consumo × detalhe.
11. **Questões em aberto** — tabela Q-xxx (Aberta / ✅ Decidido) + decisões resolvidas + seção `_origin` com payload de exemplo.
12. **Controle de revisões.**
13. Rodapé: `*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*`

---

## 7. Template de requisito (9 sub-itens — obrigatório)

Cada `REQ-MODxx-NNN` tem **exatamente** estas 9 sub-seções, nesta ordem:

```
## N. REQ-MODxx-NNN — <Título>
> Entidade TMF · Open API TMF · Prioridade · Status

### N.1 Descrição
### N.2 Racional arquitetural
### N.3 Mapeamento de atributos TMF        (tabela: Atributo | Tipo | Obrigatório | Observação V.tal)
### N.4 Exemplo de payload                  (JSON realista com place/supportingResource/supportingService)
### N.5 Pré-condições
### N.6 Requisitos Funcionais               (tabela RF-001…: ID | Nome | Descrição)
### N.7 Regras de Negócio                   (tabela RN-001…: ID | Regra)
### N.8 Critérios de Aceite                 (tabela CA-001…: ID | Critério | Resultado Esperado)
### N.9 Mapeamento contra sistemas de referência   (ver §9)
```

Requisitos **ilustrativos** (serviços ou cenários concretos como GPON, CloudVoIP) usam variante enxuta: Descrição → Racional → Modelagem de referência → Características → RF → CA → Mapeamento.

---

## 8. Design system — como trabalhar em `docs/03-design-system/`

### 8.1 Leia o SKILL.md antes de gerar qualquer UI

`docs/03-design-system/SKILL.md` é o guia normativo para geração de interfaces Nexus por agentes de IA. É obrigatório lê-lo antes de criar ou editar qualquer componente, tela ou protótipo.

### 8.2 Tokens (fonte de verdade visual)

Os design tokens vivem em `docs/03-design-system/tokens/`. Nunca hardcode valores de cor, espaçamento, tipografia ou efeito — referencie sempre os tokens:

| Token | Arquivo | Uso |
|---|---|---|
| Cores | `tokens/colors.css` / `colors.json` | Paleta completa (brand, network, neutral, status) |
| Tipografia | `tokens/typography.css` / `typography.json` | Famílias, tamanhos, pesos |
| Espaçamento | `tokens/spacing.css` / `spacing.json` | Escala de espaço (4px base) |
| Efeitos | `tokens/effects.css` | Elevação, sombras, radii |
| Fontes | `tokens/fonts.css` | @font-face e variáveis de família |
| Base | `tokens/base.css` | Variáveis raiz globais |

### 8.3 Paleta resumida (para referência rápida)

| Papel | Token CSS | Hex |
|---|---|---|
| Canvas (fundo da página) | `--color-surface-primary` | `#E5E7EB` |
| Card (superfície elevada) | `--color-surface-elevated` | `#FFFFFF` |
| Rail / Sidebar escura | `--color-bg-dark` | `#2E3238` |
| Accent amarelo | `--color-accent` | ver `colors.css` |
| Texto primário | `--color-text-primary` | ver `colors.css` |

### 8.4 Componentes core

Implementações React em `docs/03-design-system/components/core/`:

| Componente | Arquivos | Quando usar |
|---|---|---|
| `Button` | `Button.jsx` / `.d.ts` / `.prompt.md` | Toda ação primária/secundária |
| `Card` | `Card.jsx` / … | Container de conteúdo elevado |
| `Badge` | `Badge.jsx` / … | Status, labels, contadores |
| `Input` | `Input.jsx` / … | Formulários e filtros |
| `MetricCard` | `MetricCard.jsx` / … | KPIs e métricas no dashboard |
| `StatusPill` | `StatusPill.jsx` / … | Estado operacional de entidades |

Consulte o `*.prompt.md` de cada componente para instrução de uso por agente.

### 8.5 UI Kit (telas completas)

`docs/03-design-system/ui_kits/nexus/` contém o kit completo da aplicação:

| Arquivo | Tela |
|---|---|
| `Login.jsx` | Autenticação |
| `Shell.jsx` | Shell, sidebar e navegação global |
| `Dashboard.jsx` | Dashboard de inventário |
| `Inventory.jsx` | Listagem e detalhamento de entidades |
| `Topology.jsx` | Visão topológica de rede |
| `Viability.jsx` | Consulta de viabilidade (HP/HC) |
| `shared.jsx` | Componentes compartilhados entre telas |
| `data.js` | Mock data para prototipagem |

### 8.6 Guidelines

`docs/03-design-system/guidelines/` contém:
- `*.card.html` — showcases interativos de cada categoria visual (abra no browser para inspecionar)
- `*.md` — documentação em Markdown: `colors.md`, `typography.md`, `spacing.md`, `principles.md`

### 8.7 Apresentações executivas (PPTX)

Quando gerar slides, aplique o design system V.tal:

- **Canvas:** `#E5E7EB` (surface-primary)
- **Cards:** brancos com sombra suave
- **Accent:** amarelo preciso (sem uso decorativo excessivo)
- **Capa / Encerramento:** rail escuro `#2E3238`
- **Textura:** dot-grid
- **Eyebrow labels:** caixa alta com letter-spacing
- **Barra inferior:** tri-cor
- **Rodapé:** PÚBLICA
- **Tom:** defesa de tese (enquadramento estratégico explícito, tradeoffs visíveis) — nunca deck de kickoff

---

## 9. Mapeamento contra sistemas de referência

Toda seção N.9 de requisito traz uma tabela comparando a capacidade nos três inventários de benchmark e a decisão do Nexus. Use os arquivos originais como fonte — não invente comportamento.

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|

**O que cada sistema representa:**

- **Netwin (Altice Labs)** — legado primário a substituir. Cobre todos os domínios (Location, OSP, ISP, Network & Services, Provisioning, Reports, Catalogue). O módulo *Network & Services* já separa "serviços de cliente" / "serviços de rede" (proto CFS/RFS); *Resource Provisioning* tem Viabilidade GPON. Referência em `Netwin.md`.
- **Kuwaiba (open-source)** — metamodelo de classes hierárquicas. *Service Manager* + *Contract Manager*; `GenericService` associado a circuitos via relação `uses`. Não tem split CFS/RFS limpo do SID. Connectivity Manager com path computation. Referência em `Kuwaiba.md`.
- **NetBox (open-source)** — DCIM/IPAM resource-centric. **Não tem service inventory** (L2VPN/Circuits/Application Services são resource-adjacent). É o contraste que justifica construir domínios de serviço/ordem no Nexus, em vez de esticar uma ferramenta DCIM. Referência em `Netbox.md`.

---

## 10. Convenções de escrita e idioma

- **Idioma:** prosa em **português (pt-BR)**; nomes de módulo e termos técnicos em **inglês** (Outside Plant, Inside Plant, Resource Catalog, Service Inventory, Customer Facing Service, Resource Facing Service…); rótulos de camada, status e UI em português.
- **IDs canônicos:** requisitos `REQ-MODxx-NNN`; questões `Q-xxx`; decisões `D-x` ou `C-x`; funcionais `RF-`; negócio `RN-`; aceite `CA-`.
- **Formato:** Markdown. Tabelas para mapeamentos; prosa para racional; ASCII art para hierarquias e cenários.
- **JSON:** realista e válido; sempre com `@type`/`@referredType`; mostre as amarrações canônicas (`place`, `supportingResource`, `supportingService`, `relatedParty`).
- **Terminologia assumida (sem definir):** OSS/BSS, TM Forum, ODA, GPON/FTTH, HP/HC, EOL/EOF, planta externa/interna, OPEX/CAPEX, dual-running, cutover, CFS/RFS, SubscriberID, SID.

---

## 11. Método de validação — "exercitar a tese"

Antes de fechar um requisito ou modelo, **exercite-o contra um cenário operacional real** da V.tal. Se o modelo não sustenta o cenário, ele não está pronto. Cenários validados (já documentados):

| Cenário | Onde está |
|---|---|
| Home Passed → Home Connected → ONT → Serviço | `00-visao-geral/product-overview.md` §8.1 |
| Central Office GPON — hierarquia OLT→Card→Porta→DIO→Cabo→Splitter→CTO→ONT | `02-modulo-resource.md` §31.2 |
| Cliente corporativo em condomínio empresarial (VRF + CPE + porta) | `02-modulo-resource.md` §31.1 |
| Banda larga residencial via ISP (wholesale Bitstream) | `03-modulo-service.md` §22.1 |
| Link dedicado multiponto L3VPN (CFS→RFS acesso+transporte+backbone) | `03-modulo-service.md` §22.2 |
| CloudVoIP sobre link empresarial (serviceRelationship dependsOn) | `03-modulo-service.md` §22.3 |

---

## 12. Referência rápida — Open APIs TMF por módulo

| API | Nome | Módulo |
|---|---|---|
| TMF632 | Party Management | 6 — Party & Tenant |
| TMF633 | Service Catalog | 3 — Service |
| TMF634 | Resource Catalog | 2 — Resource |
| TMF638 | Service Inventory | 3 — Service |
| TMF639 | Resource Inventory | 2 — Resource |
| TMF641 | Service Ordering | 4 — Order |
| TMF645 | Service Qualification (Viabilidade) | 4 — Order |
| TMF652 | Resource Order | 4 — Order |
| TMF664 | Resource Function Activation | 2 + 4 |
| TMF669 | Party Role | 6 — Party & Tenant |
| TMF673 | Geographic Address | 1 — Geographic |
| TMF674 | Geographic Site | 1 — Geographic |
| TMF675 | Geographic Location | 1 — Geographic |
| TMF688 | Event Management | Transversal |
| TMF701 | Process Flow | 5 — Process Orchestration |
| TMF724 | Document Management | 7 — Analytics & Events |

---

## 13. Guardrails — o que NÃO fazer

- ❌ Não duplique modelagem entre módulos. Service referencia Resource; não copia atributos.
- ❌ Não invente atributos TMF. Se não está no padrão, é `characteristic` via catálogo.
- ❌ Não persista Home Passed como Service (C4).
- ❌ Não use DELETE físico (C6).
- ❌ Não trate o subscriber do CFS como usuário final por default — o default é o ISP/Tenant (C8).
- ❌ Não reabra decisões ✅ sem pedido explícito.
- ❌ Não hardcode tokens visuais (cores, espaçamentos, fontes) — sempre use variáveis CSS do design system.
- ❌ Não crie telas ou componentes sem antes ler `docs/03-design-system/SKILL.md`.
- ❌ Não crie arquivos fora da taxonomia de pastas definida em §2.
- ✅ Ao editar uma functional spec, atualize o **Controle de revisões** e reflita no `product-overview.md` (status, questões consolidadas).
- ✅ Ao criar/editar componente React, siga os tokens e consulte o `*.prompt.md` correspondente.

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
