# V.tal Nexus — Network Inventory Platform

> Plataforma proprietária de inventário de rede da V.tal, alinhada ao **TM Forum ODA** (Open Digital Architecture). Consolida os sistemas legados em uma única fonte de verdade, por domínio TMF, antes dos fins de suporte de 2026–2027.

**Documento de referência:** `/docs/00-visao-geral/product-overview.md` · **Status:** Em elaboração · **Confidencialidade:** Uso Interno

---

## O que é o Nexus

O Nexus responde às três perguntas fundamentais do inventário de redes, cada uma em um módulo de fundação, com rastreabilidade bidirecional entre eles:

| Pergunta | Módulo | Standard TMF |
|---|---|---|
| **Onde** está cada elemento da rede? | 1 — Nexus Geographic | TMF673 / TMF674 / TMF675 |
| **O quê** existe (físico e lógico)? | 2 — Nexus Resource | TMF634 / TMF639 |
| **Para quê / para quem** existe? | 3 — Nexus Service | TMF633 / TMF638 |

Não é apenas uma ferramenta interna: é posicionado como produto proprietário V.tal best-in-class, agnóstico à origem dos dados (suporta migração de qualquer legado sem alteração de schema) e multi-tenant nativo (ISPs e empresas do grupo como Tenants desde a fundação).

---

## Contexto estratégico

A V.tal opera hoje com inventário fragmentado, sem modelo de dados compartilhado, com prazos de fim de suporte convergindo:

| Sistema | Fornecedor | Fim de suporte | Escopo |
|---|---|---|---|
| Netwin | Openlabs (Altice Labs) | **Dez 2026** | Location, OSP, ISP, Network & Services, Provisioning |
| NetworkCore | Hexagon/Octave | **Mai 2027** | Sites, OSP — Região 2 |
| Octave EAM | Hexagon/Octave | Mai 2027 | Ativos físicos |
| Geosite / Logradouros / Geonet | Interno V.tal | Em uso | Base cartográfica, endereços, conectividade lógica |
| OZMAP / UMBOX | Terceiros | Em uso | Inventário da Um Telecom (pós-M&A) |

**Forcing functions:** MVP (Módulos 1 e 2) em produção antes do **sunset do Netwin (Dez 2026)**; Região 2 migrada antes do **sunset do NetworkCore (Mai 2027)**; integração da **Um Telecom** em operação paralela (migração diferida, arquitetura deve acomodar).

---

## Arquitetura de módulos

```
FUNDAÇÃO (onde / o quê)           Módulo 1: Geographic   ·   Módulo 2: Resource
DIFERENCIAÇÃO (serviço/ordem)     Módulo 3: Service · Módulo 4: Order · Módulo 6: Party · Módulo 7: Analytics
HABILITADOR (orquestração/plat.)  Módulo 5: Process Orchestration   ·   Módulo 8: Platform & Admin
```

| # | Módulo | Escopo | TMFCs | Open APIs | Status |
|---|---|---|---|---|---|
| 1 | **Nexus Geographic** | Site, Address & Location | TMFC014 | TMF673/674/675 | v1.1 — Em elaboração |
| 2 | **Nexus Resource** | Resource Catalog & Inventory | TMFC003, TMFC024 | TMF634/639/664 | v1.2 — Em elaboração |
| 3 | **Nexus Service** | Service Catalog & Inventory | TMFC002, TMFC022 | TMF633/638 | v1.0 — Em elaboração |
| 4 | **Nexus Order** | Order & Fulfillment | TMFC020/026/027 | TMF641/645/652/664 | Não iniciado |
| 5 | **Nexus Process** | Process Orchestration (BPMN) | TMFC701 | TMF701 | Não iniciado |
| 6 | **Nexus Party** | Party & Tenant | TMFC041 | TMF632/669 | Não iniciado |
| 7 | **Nexus Analytics** | Analytics & Events | Transversal | TMF688/724 | Não iniciado |
| 8 | **Nexus Platform** | Platform & Administration | Transversal | TMF634 ext. | Não iniciado |

Eventos canônicos **TMF688** (outbox pattern, Kafka) são transversais a todos os módulos.

---

## Estrutura do repositório

```
AGENTS.md                          # Guia para agentes de IA (leia antes de editar)
README.md                          # Este arquivo

docs/
├── 00-visao-geral/                # Contexto de produto e regras de negócio
│   ├── product-overview.md        # Visão de produto, tríade, módulos, roadmap
│   ├── business-rules.md          # Regras de negócio transversais e decisões arquiteturais
│   └── glossary.md                # Termos técnicos e acrônimos (TMF, GPON, CFS/RFS…)
│
├── 01-functional-specs/           # HLDs de módulo — especificações funcionais por domínio
│   ├── 01-modulo-geo.md           # Módulo 1 — Nexus Geographic (onde) · TMF673/674/675
│   ├── 02-modulo-resource.md      # Módulo 2 — Nexus Resource (o quê) · TMF634/639
│   └── 03-modulo-service.md       # Módulo 3 — Nexus Service (para quê/quem) · TMF633/638
│
├── 02-system-design/              # Design técnico e arquitetura de sistema
│   ├── architecture.md            # Arquitetura de referência, camadas, ADRs
│   ├── data-model.md              # Modelo de dados canônico, ERD, mapeamentos TMF
│   ├── integrations.md            # Integrações com legados e sistemas externos
│   ├── non-functional-requirements.md  # Performance, disponibilidade, escalabilidade
│   └── security.md                # RBAC, multi-tenancy, auditoria, criptografia
│
├── 03-design-system/              # Design system Nexus (tokens, componentes, UI kit)
│   ├── README.md                  # Visão geral e guia de uso do design system
│   ├── SKILL.md                   # Skill para agentes de IA gerarem UI Nexus
│   ├── styles.css                 # CSS global
│   ├── Nexus App.html             # Protótipo da aplicação
│   ├── Nexus Logo*.html           # Variantes do logo
│   ├── tokens/                    # Design tokens (CSS + JSON)
│   │   ├── base.css / colors.css / effects.css / fonts.css
│   │   ├── spacing.css / typography.css
│   │   └── colors.json / spacing.json / typography.json
│   ├── guidelines/                # Diretrizes visuais (cards HTML + docs Markdown)
│   │   ├── *.card.html            # Showcases interativos por categoria
│   │   └── *.md                   # Documentação: colors, principles, spacing, typography
│   ├── components/                # Componentes reutilizáveis
│   │   ├── *.md                   # Spec de uso: button, card, input, modal, sidebar, table
│   │   └── core/                  # Implementações React (JSX + TypeScript + prompts)
│   │       └── Badge · Button · Card · Input · MetricCard · StatusPill
│   ├── ui_kits/nexus/             # UI Kit completo da aplicação Nexus (React)
│   │   └── Dashboard · Inventory · Login · Shell · Topology · Viability
│   └── assets/                    # Logos, ícones e screenshots
│
└── 04-delivery-plan/              # Plano de entrega, roadmap, milestones
```

> **Nota sobre functional-specs:** a numeração de arquivo (`01-`, `02-`, `03-`) corresponde ao número do módulo. O documento de visão geral (antes `HLD01-Overview`) migrou para `docs/00-visao-geral/`. Os document references canônicos (`VTN-HLD-MOD01-GEO` etc.) são preservados dentro de cada arquivo.

---

## Convenções (resumo)

- **Formato:** HLDs em **Markdown**; apresentações executivas em PPTX seguindo o design system Nexus.
- **TMF-first:** toda entidade, atributo e evento segue o modelo canônico TM Forum. Extensões V.tal entram como `characteristic` tipada via catálogo — nunca campo hardcoded.
- **Idioma:** nomes de módulo e termos técnicos em **inglês** (Outside Plant, Resource Catalog, Service Inventory…); rótulos de camada, status e UI em **português**.
- **Identidade:** o Nexus gera **UUID v7** canônico próprio; IDs legados ficam no grupo somente-leitura **`_origin`** (agnosticidade à origem).
- **Persistência:** **soft-delete/soft-terminate** obrigatório — entidades são desativadas, nunca excluídas fisicamente.

Detalhamento completo das convenções e do cânone arquitetural: ver **[`AGENTS.md`](./AGENTS.md)**.

---

## Roadmap (18 meses · Jul 2026 – Dez 2027)

| Fase | Período | Entregas | Milestone |
|---|---|---|---|
| 1 — Fundação | Jul–Set 2026 | Functional specs MOD01+02 aprovadas, catálogos bootstrapped, APIs em staging | MVP interno v0.1 |
| 2 — MVP Produção | Out–Dez 2026 | Geographic + Resource em produção (Região 1); migração wave 1 | **Sunset Netwin** |
| 3 — Serviços e Ordens | Jan–Mar 2027 | Módulos 3, 4, 6 em produção; SubscriberID Nexus-native | |
| 4 — Migração Região 2 | Abr–Jun 2027 | NetworkCore + Octave EAM migrados | **Sunset NetworkCore** |
| 5 — Maturidade | Jul–Dez 2027 | Módulos 5, 7, 8; integração Um Telecom iniciada | Plataforma completa |

---

## Status atual

- ✅ Functional specs: Módulo 1 (Geographic) · Módulo 2 (Resource) · Módulo 3 (Service) — produzidas
- ✅ Design system: tokens, componentes core, UI kit Nexus
- 🔜 Próximas functional specs: Módulo 6 (Party & Tenant), Módulo 4 (Order & Fulfillment), Módulo 8 (Platform & Admin)
- 🔜 `docs/02-system-design/`: architecture, data-model, integrations, NFR, security — a iniciar
- 🔜 `docs/04-delivery-plan/`: roadmap detalhado, milestones, critérios de aceite de fase

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
