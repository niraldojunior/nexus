# V.TAL NEXUS — Network Inventory Platform

## Visão Geral da Arquitetura — HLD Overview

**Platform Architecture · 8 Modules · TM Forum ODA**

| Campo | Valor |
|---|---|
| **Document Reference** | VTN-HLD-OVERVIEW-001 |
| **Versão** | 1.2 — draft |
| **Data** | Junho 2026 |
| **TMFCs implementados** | TMFC014, TMFC003, TMFC024, TMFC002, TMFC022, TMFC020, TMFC026, TMFC027, TMFC701, TMFC041 |
| **Open APIs** | TMF632, TMF633, TMF634, TMF638, TMF639, TMF641, TMF645, TMF652, TMF664, TMF669, TMF673, TMF674, TMF675, TMF688, TMF701, TMF724 |
| **HLDs de módulo** | VTN-HLD-MOD01-GEO v1.1, VTN-HLD-MOD02-RES v1.2 |
| **Status** | Em elaboração |

---

## 1. Contexto estratégico

### 1.1 O problema

A V.tal opera com um conjunto fragmentado de sistemas de inventário legados — cada um cobrindo um domínio parcial da rede, sem integração canônica, sem modelo de dados compartilhado e com prazos de fim de suporte convergindo em 2026-2027:

| Sistema | Fornecedor | Fim de Suporte | Escopo atual |
|---|---|---|---|
| **Netwin** | Openlabs (Altice Labs) | Dezembro 2026 | Location Manager, Outside Plant, Inside Plant, Network & Services, Resource Provisioning |
| **NetworkCore** | Hexagon/Octave | Maio 2027 | Sites, Outside Plant — Região 2 |
| **Octave EAM** | Hexagon/Octave | Maio 2027 | Ativos físicos (racks, UPS, equipamentos gerais) |
| **Geosite** | Interno V.tal | Em uso ativo | Base cartográfica OSP, mapa de cobertura |
| **Geosite Logradouros** | Interno V.tal | Em uso ativo | Base de endereços postais e logradouros |
| **Geonet** | Interno V.tal | Em uso ativo | Conectividade lógica de rede |
| **OZMAP** | Terceiro | Em uso ativo | Inventário OSP da Um Telecom (pós-M&A) |
| **UMBOX** | Terceiro | Em uso ativo | Recursos lógicos da Um Telecom (pós-M&A) |

Além dos sunsets, a integração M&A da Um Telecom (Região Nordeste, atualmente em OZMAP e UMBOX) adiciona pressão: a migração não acontecerá antes do sunset do Netwin, criando um cenário de operação paralela que precisa ser explicitamente governado.

### 1.2 A resposta: V.tal Nexus

O V.tal Nexus é uma plataforma proprietária de inventário de rede que:

- **Consolida** os sistemas legados em uma única fonte de verdade, por domínio TM Forum
- **Posiciona** a V.tal em conformidade com TM Forum ODA (Open Digital Architecture)
- **É agnóstico à origem** — suporta migração de qualquer sistema legado sem alteração de schema, via grupo canônico `_origin`
- **Habilita multi-tenancy nativo** — ISPs e empresas do grupo (NIO, Tecto) como Tenants desde a fundação
- **Publica eventos canônicos** (TMF688) para todos os sistemas consumidores (Data Lake, Service Assurance, OSS/BSS)

### 1.3 Forcing functions (não-negociáveis)

| Data | Evento | Impacto |
|---|---|---|
| **Dezembro 2026** | Fim de suporte Netwin | MVP do Nexus deve cobrir escopo de Sites e Resources (Módulos 1 e 2) em produção |
| **Maio 2027** | Fim de suporte NetworkCore + Octave EAM | Migração da Região 2 completa |
| **Em curso** | Integração Um Telecom | OZMAP/UMBOX em operação paralela; migração diferida mas arquitetura deve acomodar |

---

## 2. Visão de produto

O Nexus não é apenas uma ferramenta interna de inventário — é um produto proprietário da V.tal posicionado como best-in-class no mercado de inventário de redes de telecomunicações, alinhado ao padrão internacional TM Forum ODA.

**Proposta de valor central:** uma única plataforma que responde às três perguntas fundamentais do inventário de redes:

| Pergunta | Módulo responsável | Standard TMF |
|---|---|---|
| **Onde** está cada elemento da rede? | Módulo 1 — Nexus Geographic | TMFC014 / TMF673/674/675 |
| **O quê** existe na rede (físico e lógico)? | Módulo 2 — Nexus Resource | TMFC003+024 / TMF634/639 |
| **Para quê** (qual serviço, qual cliente)? | Módulo 3 — Nexus Service | TMFC002+022 / TMF633/638 |

---

## 3. Arquitetura de módulos

### 3.1 Visão das 3 camadas

```
┌─────────────────────────────────────────────────────────────────────┐
│  CAMADA FUNDAÇÃO — responde onde e o quê                           │
│  Módulo 1: Nexus Geographic   ·  Módulo 2: Nexus Resource          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  CAMADA DIFERENCIAÇÃO — serviços, ordens, tenants, analytics       │
│  Módulo 3: Service  ·  Módulo 4: Order  ·  Módulo 6: Party        │
│  Módulo 7: Analytics                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  CAMADA HABILITADORA — orquestração e plataforma                   │
│  Módulo 5: Process Orchestration  ·  Módulo 8: Platform & Admin    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Mapa completo dos 8 módulos

| # | Módulo | Sub-brand | TMFCs | Open APIs | Camada | Status HLD |
|---|---|---|---|---|---|---|
| **1** | **Nexus Geographic** | Geographic Site, Address & Location | TMFC014 | TMF673, TMF674, TMF675, TMF688 | Fundação | v1.1 — Em elaboração |
| **2** | **Nexus Resource** | Resource Catalog & Inventory | TMFC003, TMFC024 | TMF634, TMF639, TMF664, TMF688 | Fundação | v1.2 — Em elaboração |
| **3** | **Nexus Service** | Service Catalog & Inventory | TMFC002, TMFC022 | TMF633, TMF638, TMF688 | Diferenciação | Não iniciado |
| **4** | **Nexus Order** | Order & Fulfillment | TMFC020, TMFC026, TMFC027 | TMF641, TMF645, TMF652, TMF664 | Diferenciação | Não iniciado |
| **5** | **Nexus Process** | Process Orchestration (BPMN) | TMFC701 | TMF701 | Habilitador | Não iniciado |
| **6** | **Nexus Party** | Party & Tenant Management | TMFC041 | TMF632, TMF669 | Diferenciação | Não iniciado |
| **7** | **Nexus Analytics** | Analytics & Events | Transversal | TMF688, TMF724 | Diferenciação | Não iniciado |
| **8** | **Nexus Platform** | Platform & Administration | Transversal | TMF634 ext. | Habilitador | Não iniciado |

### 3.3 Mapa de Open APIs TMF

| API | Nome | Módulo Nexus |
|---|---|---|
| **TMF632** | Party Management | 6 — Party & Tenant |
| **TMF633** | Service Catalog | 3 — Service |
| **TMF634** | Resource Catalog | 2 — Resource |
| **TMF638** | Service Inventory | 3 — Service |
| **TMF639** | Resource Inventory | 2 — Resource |
| **TMF641** | Service Ordering | 4 — Order & Fulfillment |
| **TMF645** | Service Qualification (Viabilidade) | 4 — Order & Fulfillment |
| **TMF652** | Resource Order | 4 — Order & Fulfillment |
| **TMF664** | Resource Function Activation | 2 — Resource + 4 — Order |
| **TMF669** | Party Role | 6 — Party & Tenant |
| **TMF673** | Geographic Address | 1 — Geographic |
| **TMF674** | Geographic Site | 1 — Geographic |
| **TMF675** | Geographic Location | 1 — Geographic |
| **TMF688** | Event Management | Transversal — todos os módulos |
| **TMF701** | Process Flow | 5 — Process Orchestration |
| **TMF724** | Document Management | 7 — Analytics & Events |

---

## 4. Princípios arquiteturais

### 4.1 TMF-first

Toda entidade, atributo e evento segue o modelo canônico TM Forum. Extensões V.tal entram como `characteristic` tipadas via catálogo — nunca como campos hardcoded. Esta decisão garante interoperabilidade futura e elimina proprietary lock-in.

### 4.2 Modular desacoplado

Cada módulo expõe Open APIs canônicas (TMF). A comunicação entre módulos é assíncrona via eventos TMF688 (Kafka, outbox pattern) ou síncrona via referências por ID — nunca por acoplamento direto de banco de dados.

### 4.3 Resource-centric + Service-centric

A plataforma responde simultaneamente "o quê existe" (Resource Domain) e "para quê existe" (Service Domain), com rastreabilidade bidirecional via `supportingResource`.

### 4.4 Event-driven

Toda mudança de estado relevante publica evento canônico TMF688 via outbox pattern. Eventos são imutáveis, idempotentes (UUID v7) e versionados em Schema Registry. Habilita Service Assurance, Data Lake e auditoria sem polling.

### 4.5 Extensível por metamodelo — sem código

Novos tipos de Site, Resource, Serviço ou Relationship são adicionados via catálogo administrável em runtime. O especificação (SiteSpecification, ResourceSpecification, RelationshipType) é o ponto de extensão.

### 4.6 Multi-tenant nativo

Sites, Resources e Services têm `relatedParty` com Tenants desde a criação. RBAC granular por módulo, Tenant e tipo de entidade. Tenants enxergam apenas o que está no seu escopo.

### 4.7 Oracle-native com Property Graph

Infrastructure stack Oracle 21c/23ai. Path computation fim-a-fim (porta OLT → ONT cliente) usa Oracle Property Graph como motor de grafo nativo sobre o inventário de Resources — performance adequada para 22M+ HPs.

### 4.8 Agnóstico à origem — grupo `_origin`

O Nexus sempre gera UUIDs v7 canônicos próprios. IDs de sistemas legados (Netwin, NetworkCore, Geosite, OZMAP, UMBOX) são preservados como `characteristic` somente-leitura no grupo `_origin` das entidades. Mesma estrutura suporta qualquer sistema de origem sem alteração de schema.

### 4.9 Continuidade operacional (dual-running)

Durante o período de coexistência com sistemas legados, o Nexus opera em paralelo. O grupo `_origin` habilita correlação bidirecional. A migração é por waves com rollback seguro.

---

## 5. Decisões arquiteturais

Decisões tomadas e registradas nesta sessão de trabalho. Cada uma com motivação, impacto e requisitos afetados:

### 5.1 Rack como fronteira Geographic ↔ Resource

**Decisão:** O Rack é o primeiro PhysicalResource. Tudo acima do Rack (sala, andar, Central) é GeographicSite (Módulo 1). Tudo dentro do Rack (OLT, placa, porta) é PhysicalResource (Módulo 2).

**Motivação:** Preserva separação canônica de responsabilidades — Geographic responde "onde", Resource responde "o quê". Evita que o Resource Domain precise conhecer a hierarquia geográfica internamente.

**Referência:** VTN-HLD-MOD01-GEO seção 4.2 / VTN-HLD-MOD02-RES seção 3.2

### 5.2 Home Passed como GeographicAddress; Home Connected como GeographicSite

**Decisão:** HP é GeographicAddress (TMF673) — entidade leve, sem ciclo de vida operacional. HC é GeographicSite do tipo InstallationPoint (TMF674) — criado no momento da ativação, com ciclo de vida Active/Retired.

**Motivação:** Escala. V.tal tem ~22M de HPs — criar 22M de GeographicSites seria inviável. GeographicAddress é leve e suficiente para responder "posso atender este endereço?". GeographicSite nasce sob demanda, apenas quando há instalação.

**Implicação:** A transição HP → HC é o trigger que cria o GeographicSite InstallationPoint. A desconexão do cliente transiciona o Site para Retired (não deleta — preserva histórico).

### 5.3 Postes de terceiros: V.tal como fonte de verdade

**Decisão:** O cadastro de postes (inclusive de propriedade de concessionárias de energia) fica integralmente na V.tal, sob o Nexus. Não há integração de sincronização com sistemas de concessionárias.

**Motivação:** Simplicidade no MVP. O Nexus permanece como fonte única de verdade para OSP. Postes de terceiros são modelados com `owner` (concessionária) e `contractRef` (contrato de aluguel) como characteristics.

**Referência:** VTN-HLD-MOD02-RES REQ-MOD02-008 (racional arquitetural Q-005)

### 5.4 Service Assurance: externa no MVP, preparada para futura migração

**Decisão:** Service Assurance (alarmes correlacionados, troubleshooting reativo) fica em ferramenta externa no MVP. O Nexus não implementa Service Assurance no escopo atual.

**Preparação:** O catálogo de eventos TMF688 (REQ-MOD02-025) já cobre as necessidades canônicas de Service Assurance (StateChangeEvent, RelationshipChangeEvent, PathChangeEvent). A migração futura da ferramenta de SA para dentro do Nexus não exige mudança arquitetural — apenas um novo consumidor dos eventos já publicados.

**Referência:** VTN-HLD-MOD02-RES REQ-MOD02-025 (racional arquitetural Q-006)

### 5.5 Swap de equipamento via BPMN (Módulo 5)

**Decisão:** Operação de swap (substituição de equipamento com preservação de conexões) é sempre orquestrada via workflow BPMN do Módulo 5, nunca procedimento manual.

**Etapas do workflow:** (1) validação de compatibilidade; (2) reserva do novo equipamento; (3) transição do antigo para `shuttingDown`; (4) swap atômico preservando conexões e Services; (5) ativação do novo; (6) transição do antigo para `Retired`. Cada etapa gera Audit Trail e evento TMF688.

**Referência:** VTN-HLD-MOD02-RES REQ-MOD02-014 RF-009

### 5.6 Catálogo de ResourceRelationships extensível via API

**Decisão:** O catálogo de RelationshipType tem bootstrap canônico (containedBy, connectedTo, endpoint_A/Z, mirrorOf, supportedBy, passesThrough, assignedTo, withinVRF, replaces, aliasOf) mas é extensível via API por Administradores do Catálogo — com Audit Trail e eventos TMF688.

**Motivação:** Preserva flexibilidade para casos operacionais não previstos no MVP sem comprometer governança. Mesmo padrão do catálogo de SiteSpecifications (Módulo 1).

**Referência:** VTN-HLD-MOD02-RES REQ-MOD02-024

### 5.7 Identidade canônica e proveniência — grupo `_origin`

**Decisão:** O Nexus sempre gera UUIDs v7 próprios como identificadores canônicos. IDs de sistemas legados são preservados como `characteristic` somente-leitura no grupo `_origin` de todas as entidades.

**Campos canônicos do grupo:**

| Characteristic | Obrigatório | Descrição |
|---|:---:|---|
| `_origin.system` | Sim | Nome do sistema de origem (Netwin, NetworkCore, Geosite, OZMAP, UMBOX) |
| `_origin.id` | Sim | ID da entidade no sistema de origem |
| `_origin.entity` | Sim | Tipo de entidade no sistema de origem |
| `_origin.migratedAt` | Sim | Timestamp ISO 8601 da migração |
| `_origin.migratedBy` | Sim | Identificador do job de migração |
| `_origin.url` | Não | Deep link para a entidade no sistema de origem |
| `_origin.extra` | Não | Atributos sem correspondência no Nexus (JSON serializado) |

**Sistemas cobertos:** Netwin, NetworkCore, Octave EAM, Geosite, Geosite Logradouros, OZMAP, UMBOX.

**Referência:** VTN-HLD-MOD01-GEO seção 19.1 / VTN-HLD-MOD02-RES seção 33.2

---

## 6. Modelo de domínio — visão integrada

Como as entidades dos três módulos de fundação se encadeiam no caso de uso central de FTTH:

```
MÓDULO 1 — GEOGRAPHIC              MÓDULO 2 — RESOURCE           MÓDULO 3 — SERVICE
══════════════════════             ═══════════════════════        ══════════════════════

Região                                                             
  └─ GeographicSite (CO)                                          
       ├─ SubSite (Sala)            Rack                          
       │    │                         └─ OLT                      
       │    │  place                       └─ Card                
       │    └─────────────────────────────────└─ Port (PON 0/0/0)─┐
       │                                                           │ connectedTo
       │                            Jumper                         │ (via DIO)
       │                               │                           │
       └─ relatedSite (feeds)─┐    RearPort DIO                   │
                               │        │                           │
GeographicSite (Armário) ◄────┘    Cabo CFOA (LineString)         │
  │                                    │                           │
  │  place                         Splitter 1:8                   │
  └──────────────────────────────── (+ CTO)                       │
                                        │                          │
GeographicSite                      Splitter 1:8                  │
  (InstallationPoint) ◄──── place ── ONT ──────── supportingResource ──► ServiceInstance
  │                                                                       (SubscriberID)
  └── GeographicAddress ◄── installationAddress ─────────────────────────►
  └── GeographicLocation (Point)
```

---

## 7. Status dos HLDs de módulo

### 7.1 Módulo 1 — Nexus Geographic (VTN-HLD-MOD01-GEO v1.1)

**Status:** Em elaboração · 12/12 requisitos levantados · 9 questões em aberto

| Bloco | Requisitos | Entidade TMF |
|---|---|---|
| **REQ-MOD01-001** | Cadastro de Geographic Location (Point, LineString, Polygon) | *GeographicLocation (TMF675)* |
| **REQ-MOD01-002** | Cadastro de Geographic Address (endereço postal estruturado) | *GeographicAddress (TMF673)* |
| **REQ-MOD01-003** | Catálogo de GeographicSite Specification | *GeographicSiteSpecification (TMF674)* |
| **REQ-MOD01-004** | Cadastro de Região (GeographicSite administrativo) | *GeographicSite category=Region* |
| **REQ-MOD01-005** | Classificação Funcional de Sites | *GeographicSite category=FunctionalGroup* |
| **REQ-MOD01-006** | Cadastro de Geographic Site (entidade central) | *GeographicSite (TMF674)* |
| **REQ-MOD01-007** | Sub-Sites (andares, salas, cages) | *GeographicSite category=SubSite* |
| **REQ-MOD01-008** | Ciclo de Vida do Site | *status + StateChangeEvent (TMF688)* |
| **REQ-MOD01-009** | Regras de Contenção e Hierarquia | *allowedParent/ChildSpec (TMF674)* |
| **REQ-MOD01-010** | Relações Topológicas A↔Z entre Sites | *relatedSite[] (TMF674)* |
| **REQ-MOD01-011** | Visão de Mapa Georreferenciado | *Funcionalidade UI sobre TMF674+675* |
| **REQ-MOD01-012** | Eventos de Domínio do Módulo Geographic | *Event (TMF688)* |

### 7.2 Módulo 2 — Nexus Resource (VTN-HLD-MOD02-RES v1.2)

**Status:** Em elaboração · 25/25 requisitos levantados · 8 questões em aberto

| Bloco | Requisitos | Entidade TMF |
|---|---|---|
| **A — Catálogo** | REQ-MOD02-001 a 004 | ResourceSpecification, ResourceCategory, ResourceFunctionSpec, Manufacturer |
| **B — Inventory base** | REQ-MOD02-005 a 007 | Resource CRUD (TMF639), Ciclo X.731, Contenção física |
| **C — Outside Plant** | REQ-MOD02-008 a 012 | SupportStructure, PassiveDevice, Cable, Splice, Path computation |
| **D — Inside Plant** | REQ-MOD02-013 a 017 | Rack, Equipment, Card, Port, Power Feed/Outlet |
| **E — Conectividade** | REQ-MOD02-018 a 019 | Connection (Jumper/PatchCord), Front/Rear Port (DIO) |
| **F — Recursos lógicos** | REQ-MOD02-020 a 023 | IPAM, VRF/RouteTarget, VLAN/VLANGroup, ASN/MPLS |
| **G — Transversais** | REQ-MOD02-024 a 025 | ResourceRelationship catalog, Eventos TMF688 |

### 7.3 Módulos 3–8 — Não iniciados

Os módulos restantes aguardam conclusão dos módulos de fundação (1 e 2) antes de iniciar levantamento de requisitos. Ordem de prioridade sugerida:

1. **Módulo 6 — Party & Tenant** — pré-requisito para Service Domain (Tenants e Parties já referenciados nos módulos 1 e 2)
2. **Módulo 3 — Service Domain** — REQ-001 CloudVoIP já especificado; aguarda Party como fundação
3. **Módulo 8 — Platform & Admin** — RBAC e Audit Trail precisam estar disponíveis cedo
4. **Módulo 4 — Order & Fulfillment** — depende de Service (Módulo 3) e Resource (Módulo 2)
5. **Módulo 5 — Process Orchestration** — ativado conforme decisão de swap via BPMN (Decisão 5.5)
6. **Módulo 7 — Analytics & Events** — consome eventos dos demais; implementado em paralelo

---

## 8. Cenários ilustrativos validados

Dois cenários foram exercitados para validar que a tese arquitetural se sustenta na prática operacional V.tal:

### 8.1 Cenário: Home Passed → Home Connected → ONT → Serviço

| Fase | Entidade criada | Módulo | Trigger |
|---|---|---|---|
| HP (endereço viável) | GeographicAddress + GeographicLocation | 1 — Geographic | Carga da base Logradouros / viabilidade |
| Qualificação de serviço | ServiceQualification (TMF645) | 4 — Order | Consulta de viabilidade por endereço |
| HC (instalação) | GeographicSite InstallationPoint | 1 — Geographic | Ativação do serviço |
| ONT instalada | PhysicalResource (TMF639) | 2 — Resource | Instalação física |
| Serviço ativo | ServiceInstance (TMF638) | 3 — Service | Comissionamento |

### 8.2 Cenário: Central Office GPON — hierarquia completa

Exercitado em VTN-HLD-MOD02-RES seção 31.2. Demonstra contenção em 7 níveis:

```
[Geographic]  Central (CO) → Andar → Sala
                                        │
[Resource]                         Rack → OLT → Card → Port (PON)
                                                          │
                                   Jumper → DIO Front/Rear → Cabo CFOA (LineString)
                                                               │
                                                          Splitter → CTO → Drop → ONT
```

### 8.3 Cenário: Cliente corporativo em condomínio empresarial

Exercitado em VTN-HLD-MOD02-RES seção 31.1. Demonstra modelagem de edificação comercial:

```
[Geographic]  Edifício → Andar 12 → Sala 1201 (InstallationPoint, Tenant Acme/NIO)
                                               │
[Resource]                                CPE Cisco ISR 1100 (place = Sala 1201)
                                               │ Port WAN → connectedTo → Switch-Acesso (no térreo)
[Logical]                              VRF CUSTOMER-ACME-12345 + IP 200.10.50.100/30
                                               │
[Service]                           ServiceInstance FTTH-Empresarial-1G (supportingResource = CPE + VRF + IP)
```

---

## 9. Questões em aberto consolidadas

Visão consolidada de todas as questões abertas dos HLDs de módulo produzidos até esta sessão:

### 9.1 Módulo 1 — Geographic (9 questões abertas)

| ID | Questão | Responsável |
|---|---|---|
| **Q-001** | Quais SiteSpecifications no bootstrap? Lista canônica V.tal precisa ser fechada (CO, POP, Armário, Ponto de Instalação, Andar, Sala, Cage — outros?). | *Produto + Engenharia V.tal* |
| **Q-002** | Cálculo do CN: determinístico a partir de Região + Regional, ou tem exceções? Precisa de matriz de derivação. | *Engenharia V.tal* |
| **Q-003** | CLLI obrigatório para todos os Sites CO ou apenas subconjunto (centrais em interconexão)? | *Engenharia V.tal + Regulatório* |
| **Q-004** | RelationshipTypes do catálogo inicial (Geographic): além de feeds/isFedBy, peersWith, memberOf/contains, há outros críticos V.tal? | *Operações V.tal* |
| **Q-005** | Integração com Geosite Logradouros: via API REST existente ou nova interface? | *Arquitetura + Geosite* |
| **Q-007** | syncGeoPosition (mapa): síncrono (PATCH) ou assíncrono (evento)? Trade-off UX vs. performance. | *Arquitetura + Produto* |
| **Q-008** | SLAs de disponibilidade e latência do catálogo de eventos em produção. | *Arquitetura + Plataforma* |
| **Q-009** | Geocodificação automática: qual provedor (Google, OpenStreetMap, base interna)? Custo e licenciamento. | *Produto + GIS V.tal* |
| **Q-010** | Hierarquia de Sub-Sites: existe caso real além de CO > Andar > Sala > Cage (4 níveis)? | *Engenharia V.tal* |

### 9.2 Módulo 2 — Resource (8 questões abertas)

| ID | Questão | Responsável |
|---|---|---|
| **Q-001** | Catálogo inicial de ResourceSpecifications: quais modelos exatos de OLT, ONT, Switch, Router no MVP? | *Engenharia V.tal + Produto* |
| **Q-002** | Importação de catálogo NetBox device-type-library: licenciamento e curadoria. | *Arquitetura + Engenharia* |
| **Q-004** | Oracle Property Graph: dimensionamento de licença para 22M+ HPs. | *Arquitetura + Plataforma* |
| **Q-007** | Fibers internas a Cables: 100% modeladas ou apenas ocupadas? Trade-off volume vs. completude. | *Arquitetura + OSP V.tal* |
| **Q-008** | IPAM legado (planilhas, sistemas internos): estratégia de carga inicial. | *Backbone + Arquitetura* |
| **Q-010** | Cache de paths: TTL configurável por tipo? Política de invalidação em massa. | *Arquitetura + Performance* |
| **Q-011** | PowerSupply interno vs. PowerOutlet externo: granularidade necessária para futura SA? | *Engenharia + Operações* |
| **Q-012 (resid.)** | ResourceRelationships: identificação de tipos operacionais V.tal além do bootstrap canônico. | *Operações V.tal* |

---

## 10. Roadmap de 18 meses (Jul 2026 — Dez 2027)

| Fase | Período | Entregas | Milestone |
|---|---|---|---|
| **Fase 1 — Fundação** | Jul–Set 2026 | HLDs MOD01+02 aprovados, catálogos bootstrapped, APIs Geographic e Resource em staging | MVP interno v0.1 |
| **Fase 2 — MVP Produção** | Out–Dez 2026 | Geographic + Resource em produção Região 1; migração wave 1 Netwin | **Sunset Netwin** (Dez 2026) |
| **Fase 3 — Serviços e Ordens** | Jan–Mar 2027 | Módulos 3 (Service), 4 (Order), 6 (Party) em produção; SubscriberID Nexus-native | |
| **Fase 4 — Migração Região 2** | Abr–Jun 2027 | NetworkCore + Octave EAM migrados; wave 2 migração completa | **Sunset NetworkCore** (Mai 2027) |
| **Fase 5 — Maturidade** | Jul–Dez 2027 | Módulos 5 (Process), 7 (Analytics), 8 (Platform); integração Um Telecom iniciada | Plataforma completa |

---

## 11. Controle de revisões

| Versão | Data | Descrição |
|---|---|---|
| 1.0 | Junho 2026 | Versão inicial: 8 módulos, alinhamento ODA, cruzamento sistemas × TMFCs, roadmap 18 meses. |
| 1.1 | Junho 2026 | Incorporação do HLD MOD01-GEO v1.0: princípios de design Geographic, modelo TMF673/674/675, cenários HP/HC. |
| 1.2 | Junho 2026 | Incorporação do HLD MOD02-RES v1.2: 25 requisitos Resource Domain, 7 decisões arquiteturais, cenários OSP/ISP, princípio `_origin` de agnósticidade à origem. Conversão para Markdown. |

---

*V.tal Nexus — Documento Confidencial — Uso Interno*
