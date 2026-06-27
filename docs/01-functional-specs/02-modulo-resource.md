# V.TAL NEXUS — Network Inventory Platform

## HLD Módulo 2 · Nexus Resource Domain

**Resource Catalog, Resource Inventory & Physical/Logical Resource Management**

TMFC003 + TMFC024 · TMF634 / TMF639 / TMF688

| Campo | Valor |
|---|---|
| **Document Reference** | VTN-HLD-MOD02-RES |
| **Versão** | 1.0 — draft |
| **Data** | Junho 2026 |
| **Documento âncora** | VTN-HLD-OVERVIEW-001 |
| **HLD predecessor** | VTN-HLD-MOD01-GEO (Geographic) |
| **TMFCs implementados** | TMFC003 — Resource Catalog Mgmt; TMFC024 — Resource Inventory Mgmt |
| **Open APIs** | TMF634, TMF639, TMF664, TMF688 |
| **Requisitos cobertos** | REQ-MOD02-001 a REQ-MOD02-025 |
| **Status** | Em elaboração |

---

## 1. Propósito do módulo

O Módulo 2 — Nexus Resource Domain implementa os componentes ODA TMFC003 (Resource Catalog Management) e TMFC024 (Resource Inventory Management) através das Open APIs TMF634 (Resource Catalog) e TMF639 (Resource Inventory). É o módulo que responde "o que existe" na rede V.tal: postes, dutos, manholes, cabos, splitters, CTOs, racks, OLTs, placas, portas, ONTs/CPEs, IPs, VLANs, VRFs, ASNs.

Junto com o Módulo 1 (Geographic, que responde "onde"), forma a fundação física e lógica completa do inventário. A fronteira entre os módulos é clara: do Site/Sub-Site para fora, é Geographic; do Rack para dentro (Inside Plant) e dos recursos georreferenciados de OSP (postes/cabos/CTOs), é Resource. A referência entre os módulos é sempre via o atributo `place` do Resource → GeographicSite ou GeographicLocation.

Este documento é o segundo HLD de módulo da plataforma e estende o modelo arquitetural estabelecido em VTN-HLD-OVERVIEW-001.

## 2. Escopo

### 2.1 Dentro do escopo

- **Catálogo de Recursos (TMF634):** Resource Specifications, Resource Categories, Resource Function Specifications, Manufacturers/Vendors.
- **Resource Inventory base (TMF639):** CRUD canônico de Resource, ciclo de vida operacional X.731, hierarquia de contenção física.
- **Outside Plant georreferenciada:** Support Structures (postes, dutos, manholes, torres, caixas de emenda), Passive Devices (CTOs, NAPs, splitters externos), Cables/Cable Segments, Splices, Path computation fim-a-fim.
- **Inside Plant:** Racks, Equipment (OLTs, switches, routers, servidores, ONTs/CPEs), Cards/Módulos, Ports, Power Feeds e Outlets.
- **Conectividade física:** Conexões (jumpers, patch cords, cable terminations), Front Ports/Rear Ports em DIOs.
- **Recursos lógicos:** IPAM (Prefix, IP Address), VRF, Route Targets, VLAN, VLAN Group, ASN, MPLS Labels.
- **Transversais:** Catálogo formal de Resource Relationships, eventos de domínio TMF688.

### 2.2 Fora do escopo (tratado em outros módulos)

- Modelagem geoespacial (Site, Address, Location): **Módulo 1 — Nexus Geographic**.
- Catálogo de Serviços e Service Inventory (SubscriberID, instâncias de serviço): **Módulo 3 — Nexus Service Domain**.
- Orquestração de OS de provisionamento de recursos: **Módulo 4 — Nexus Order & Fulfillment**.
- Workflows complexos com aprovação humana (swap de OLT crítica, descomissionamento de Central): **Módulo 5 — Nexus Process Orchestration**.
- Tenants, Manufacturers e Vendors como entidades Party: **Módulo 6 — Nexus Party & Tenant**.
- Dashboards e analytics sobre Resources: **Módulo 7 — Nexus Analytics & Events**.
- Auditoria global e RBAC granular: **Módulo 8 — Nexus Platform & Administration**.
- Capacidade de Service Assurance (correlação de alarmes, troubleshooting): consumidor de eventos TMF688 publicados por este módulo, fora do Nexus.

### 2.3 Aderência ao codebase atual (`resource-catalog`)

O codebase presente neste repositório implementa apenas um subconjunto bem definido do HLD03. Ele cobre o **catálogo TMF634** e a infraestrutura transversal necessária para operar esse catálogo como microserviço NestJS, mas **não** implementa o inventário TMF639 nem os subdomínios físicos e lógicos detalhados nas seções seguintes deste HLD.

**Cobertura confirmada no código:**

- `ResourceCatalog`, `ResourceCategory` e `ResourceSpecification` com CRUD de criação, consulta, atualização e paginação.
- `ResourceCandidate` como entidade derivada e sincronizada automaticamente a partir de `ResourceSpecification`.
- `Hub` para registro e remoção de assinantes de eventos.
- Persistência com suporte a `MongoDB`, `SQLite` e `memory`.
- Filtros, validação de payload, paginação e cabeçalhos de resultado.
- Eventos de catálogo publicados para assinantes via dispatcher/Hub.
- Controllers HTTP versionados, presenters e use cases separados.
- Infraestrutura transversal de logger, health check, Swagger, CORS, cache, RMQ e tracing.

**Fora do escopo do codebase atual:**

- CRUD canônico de `Resource` TMF639.
- Modelagem de `PhysicalResource` e `LogicalResource`.
- Hierarquia de contenção física, portas, cards, racks, cabos, splices, IPAM, VRF, VLAN, ASN e MPLS.
- Path computation e catálogos de relacionamento do inventário.
- Ciclo de vida multi-dimensional X.731 do recurso físico/lógico.
- Eventos TMF688 do inventário de recursos.

**Conclusão de revisão:**

O HLD03 permanece válido como visão funcional do domínio Resource, mas a implementação disponível neste repositório corresponde, na prática, ao módulo de **Resource Catalog (TMF634)** e à base técnica transversal. As seções de inventário TMF639 devem ser tratadas como evolução futura ou como material de especificação para os próximos projetos, não como entrega atual deste codebase.

---

## 3. Modelo conceitual TMF

O módulo Resource implementa os TMFCs TMFC003 e TMFC024 expondo cinco grupos de entidades canônicas:

| Entidade | API | Papel no modelo |
|---|---|---|
| **ResourceSpecification** | TMF634 | Definição de tipo de recurso no catálogo (modelo de OLT, tipo de cabo, classe de IP). |
| **ResourceCategory** | TMF634 | Organização hierárquica navegável do catálogo (Equipamentos > Acesso > OLT). |
| **ResourceFunctionSpecification** | TMF634 | Template funcional reutilizável (configuração padrão de POP). |
| **PhysicalResource** | TMF639 | Instância de recurso físico (cabo, OLT, ONT, poste, CTO). |
| **LogicalResource** | TMF639 | Instância de recurso lógico (IP, VLAN, VRF, ASN). |

### 3.1 Hierarquia de tipos TMF

```
Resource (abstrato — TMF639)
  │
  ├─ PhysicalResource
  │    │
  │    ├─ Inside Plant
  │    │    ├─ Rack
  │    │    ├─ Equipment (OLT, switch, router, server, ONT, CPE)
  │    │    │    ├─ Card (placa GPON, line card)
  │    │    │    │    └─ Port (porta PON, Ethernet)
  │    │    │    └─ Port (em equipamentos sem cards)
  │    │    ├─ FrontPort / RearPort (DIO, DG, patch panel)
  │    │    ├─ Connection (jumper, patch cord)
  │    │    └─ PowerOutlet / PowerFeed
  │    │
  │    └─ Outside Plant
  │         ├─ SupportStructure (poste, manhole, torre, duto)
  │         ├─ PassiveDevice (CTO, NAP, splitter externo)
  │         ├─ Cable / CableSegment
  │         ├─ Fiber (interna ao cabo)
  │         └─ Splice (emenda de fibra)
  │
  └─ LogicalResource
       ├─ Prefix / IPAddress (IPAM)
       ├─ VRF / RouteTarget
       ├─ VLAN / VLANGroup
       ├─ ASN
       └─ MPLSLabel / MPLSCircuit
```

### 3.2 Fronteira com o Módulo 1 (Geographic)

A fronteira semântica entre o "onde" (Geographic) e o "o quê" (Resource) é definida assim:

```
MÓDULO 1 — GEOGRAPHIC                MÓDULO 2 — RESOURCE DOMAIN
═══════════════════════               ═══════════════════════════
Região                                 (não modelado aqui)
   └─ Site (Central, POP)              (não modelado aqui)
        └─ Sub-Site (Andar)            (não modelado aqui)
             └─ Sub-Site (Sala)        (não modelado aqui)
                  └─ Sub-Site (Cage)   (não modelado aqui)
                       │
                       │ Fronteira ─── Resource referencia Site/Location via "place"
                       ▼
                                       Rack (PhysicalResource)
                                          └─ Equipment (OLT)
                                               └─ Card
                                                    └─ Port

OUTSIDE PLANT (georreferenciada)
GeographicLocation (Point)             SupportStructure (Poste, Manhole)
GeographicLocation (Point)             PassiveDevice (CTO, NAP)
GeographicLocation (LineString)        Cable (com trajeto sobre Support Structures)
```

Toda criação de Resource referencia o módulo Geographic via `place` — esta referência é sincronamente validada (Site existe e está em status compatível). Mudanças no Geographic (ex.: desativação de Site) consultam o Resource Domain para listar dependentes.

---

## 4. Princípios de design do módulo Resource

### 4.1 Catálogo + Instância (TMF634 + TMF639)

O módulo trabalha com duas camadas: o **catálogo** (TMF634) descreve "o que pode existir" via ResourceSpecification; o **inventário** (TMF639) descreve "o que efetivamente existe" via Resource. Toda instância é tipada por uma especificação — não há Resources sem spec. Esta separação habilita extensibilidade sem código: novos tipos de cabo, novos modelos de OLT, novas categorias de IP entram via catálogo.

### 4.2 Unificação Físico/Lógico

Recursos físicos (cabos, equipamentos) e lógicos (IPs, VLANs, VRFs) compartilham o mesmo modelo Resource. Diferenciação é via `@type` (PhysicalResource ou LogicalResource) e via spec. Esta unificação habilita queries transversais ("todos os recursos vinculados ao Site X, físicos e lógicos") e simplifica drasticamente a API.

### 4.3 Tipagem de relações como catálogo controlado

Resource Relationships têm tipos canônicos com semântica documentada (containedBy, connectedTo, endpoint_A, mirrorOf, supportedBy, passesThrough, assignedTo, withinVRF, replaces). Esta padronização habilita queries de grafo, prevenção de erros de modelagem e UI de formulários polimórficos.

### 4.4 Modelo de grafo nativo

Inventário de telecom tem natureza inerentemente de grafo — Resources se conectam, se contêm, atravessam estruturas. O Nexus adota Oracle Property Graph (Oracle 21c/23ai) como camada de grafo sobre o storage relacional, habilitando queries de path computation, descendentes, raiz comum em performance adequada para escala V.tal (22M+ HPs).

### 4.5 Ciclo de vida multi-dimensional (X.731)

O ciclo de vida de Resources usa o modelo X.731 do TMF639 com 4 dimensões: status, operationalState, administrativeState, usageState. Esta granularidade permite expressar com precisão a condição do recurso. Combinações canônicas (InOperation, InMaintenance, InDefect, Reserved, Decommissioned, Planned) são apresentadas na UI para reduzir complexidade.

### 4.6 Eventos canônicos como contrato

Toda mudança publica evento TMF688 transacional (outbox pattern). Esta capacidade é o que habilita o Nexus a ser fonte de verdade do inventário consumida por Service Assurance, Service Domain, Order Fulfillment e Data Lake.

### 4.7 Soft-delete obrigatório

Resources não são excluídos fisicamente — apenas administrativamente desativados (administrativeState=locked, status=suspended). Esta política preserva histórico para auditoria, troubleshooting e analytics retrospectiva.

---

## 5. Resumo dos requisitos do módulo

O módulo Resource é composto por 25 requisitos, organizados em 7 blocos funcionais:

| Bloco | Requisitos |
|---|---|
| **A — Catálogo (TMF634)** | REQ-MOD02-001 a 004 |
| **B — Resource Inventory base (TMF639)** | REQ-MOD02-005 a 007 |
| **C — Outside Plant georreferenciada** | REQ-MOD02-008 a 012 |
| **D — Inside Plant** | REQ-MOD02-013 a 017 |
| **E — Conectividade física** | REQ-MOD02-018 a 019 |
| **F — Recursos lógicos** | REQ-MOD02-020 a 023 |
| **G — Transversais (Relationships + Eventos)** | REQ-MOD02-024 a 025 |

### 5.1 Tabela completa dos requisitos

| ID | Título | Entidade TMF principal |
|---|---|---|
| **REQ-MOD02-001** | Resource Specification (catálogo de tipos de recurso) | *ResourceSpecification (TMF634)* |
| **REQ-MOD02-002** | Resource Category (organização hierárquica do catálogo) | *ResourceCategory (TMF634)* |
| **REQ-MOD02-003** | Resource Function Specification (templates funcionais) | *ResourceFunctionSpecification (TMF634)* |
| **REQ-MOD02-004** | Manufacturer / Vendor (fabricantes e fornecedores) | *Party com role=manufacturer (TMF632 referenciado)* |
| **REQ-MOD02-005** | Cadastro genérico de Resource (CRUD canônico) | *Resource (PhysicalResource | LogicalResource) (TMF639)* |
| **REQ-MOD02-006** | Ciclo de vida operacional do Resource | *Resource.{resourceStatus, operationalState, administrativeState, usageState} + StateChangeEvent (TMF639 + TMF688)* |
| **REQ-MOD02-007** | Hierarquia de contenção física entre Resources | *resourceRelationship com type=containsAsChild (TMF639)* |
| **REQ-MOD02-008** | Support Structure (poste, manhole, torre, duto, caixa de emenda) | *PhysicalResource especializado (TMF639)* |
| **REQ-MOD02-009** | Passive Device (CTO, NAP, Splitter externo, Emenda) | *PhysicalResource passivo georreferenciado (TMF639)* |
| **REQ-MOD02-010** | Cable e Cable Segment georreferenciado | *PhysicalResource Cable + CableSegment (TMF639)* |
| **REQ-MOD02-011** | Splice (Emenda de fibra óptica) | *PhysicalResource Splice (TMF639)* |
| **REQ-MOD02-012** | Trajeto físico (Path computation) fim-a-fim | *Função sobre resourceRelationships (não é entidade própria)* |
| **REQ-MOD02-013** | Rack (gabinete com elevação e ocupação em U) | *PhysicalResource Rack (TMF639)* |
| **REQ-MOD02-014** | Equipment (OLT, switch, roteador, servidor, ONT/CPE) | *PhysicalResource Equipment (TMF639)* |
| **REQ-MOD02-015** | Card / Módulo (placas de chassi) | *PhysicalResource Card (TMF639)* |
| **REQ-MOD02-016** | Port (porta física) | *PhysicalResource Port (TMF639)* |
| **REQ-MOD02-017** | Power Feed e Power Outlet (alimentação elétrica) | *PhysicalResource Power Feed/Outlet (TMF639)* |
| **REQ-MOD02-018** | Conexão física (cable termination, patch cord, link) | *PhysicalResource Connection / Patch Cord (TMF639)* |
| **REQ-MOD02-019** | Front Port / Rear Port (DIO, DG, passagem interna/externa) | *PhysicalResource Port especializado (TMF639)* |
| **REQ-MOD02-020** | IPAM (Prefix, IP Address, Range) | *LogicalResource Prefix/IPAddress (TMF639)* |
| **REQ-MOD02-021** | VRF e Route Target (isolamento de roteamento) | *LogicalResource VRF e RouteTarget (TMF639)* |
| **REQ-MOD02-022** | VLAN e VLAN Group | *LogicalResource VLAN / VLANGroup (TMF639)* |
| **REQ-MOD02-023** | ASN e MPLS Label | *LogicalResource ASN / MPLSLabel (TMF639)* |
| **REQ-MOD02-024** | Resource Relationship (catálogo de relações tipadas) | *resourceRelationship com type catalog (TMF639)* |
| **REQ-MOD02-025** | Eventos de domínio do Resource | *Event (TMF688)* |

### 5.2 Ordem de implementação sugerida

- **Fase 1 — Catálogo + Inventário base:** REQ-001 a 007. Sem catálogo populado e CRUD canônico, nenhuma instância pode existir.
- **Fase 2 — Inside Plant:** REQ-013 a 017 + 018 e 019. Cobre Centrais e POPs — operação imediata pós-migração do NetworkCore.
- **Fase 3 — Outside Plant:** REQ-008 a 012. Cobre planta externa GPON — habilita rastreabilidade e troubleshooting fim-a-fim.
- **Fase 4 — Recursos lógicos:** REQ-020 a 023. Habilita serviços L3VPN, segmentação L2 e MPLS.
- **Fase 5 — Transversais:** REQ-024 e 025 são implementados em paralelo às fases anteriores (são habilitadores).


---

## 6. REQ-MOD02-001 — Resource Specification (catálogo de tipos de recurso)

> **Entidade TMF:** ResourceSpecification (TMF634)  
> **Open API TMF:** TMF634 — Resource Catalog Management API  
> **Prioridade:** Crítica — entidade fundacional do catálogo  
> **Status:** Em levantamento · Versão 1.0 — draft

### 6.1 Descrição

Uma ResourceSpecification é a definição abstrata de um tipo de recurso: modelo de OLT Huawei MA5800, tipo de cabo óptico drop com 1 fibra, especificação de CTO com 16 portas, formato de endereço IPv4. Define os atributos esperados, características técnicas, dimensões físicas, regras de contenção (quais subcomponentes pode conter) e regras de uso. É o ponto de extensão do metamodelo de recursos sem necessidade de alteração de código.

### 6.2 Racional arquitetural

O TMF634 estabelece ResourceSpecification como entidade-mãe do catálogo, com duas especializações: PhysicalResourceSpecification (equipamentos, cabos, infraestrutura) e LogicalResourceSpecification (IPs, VLANs, números). Esta separação canônica é adotada no Nexus para preservar a interoperabilidade. O Netwin tem o conceito de "Biblioteca de modelos" no módulo Catalogue — funcional mas não padronizado. O Kuwaiba implementa via Data Model Manager (metamodelo dinâmico) — extremamente flexível mas sem alinhamento TM Forum. O NetBox formaliza Device Types e Module Types — modelo mais próximo ao TMF634 entre os legados, mas limitado a equipamentos físicos. O Nexus combina a flexibilidade do Kuwaiba com a formalidade do NetBox sob o contrato canônico do TMF634.

### 6.3 Mapeamento de atributos TMF

Atributos canônicos da entidade ResourceSpecification (TMF634):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7 do catálogo Nexus. |
| `name` | string | Sim | Nome do tipo (ex.: "OLT Huawei MA5800-X17", "Cabo Óptico Drop 1F"). |
| `code` | string | Sim | Código curto único na plataforma (ex.: "OLT-HW-MA5800-X17"). |
| `description` | string | Não | Descrição funcional completa. |
| `category` | EntityRef | Sim | Referência a ResourceCategory (REQ-MOD02-002) para organização hierárquica do catálogo. |
| `@type` | string | Sim | PhysicalResourceSpecification | LogicalResourceSpecification. |
| `lifecycleStatus` | enum | Sim | InStudy | InDesign | Active | Retired. Apenas Active permite criar Resources. |
| `version` | string | Não | Versão da especificação (ex.: "1.0", "2.3"). |
| `validFor` | TimePeriod | Não | Período de validade da especificação. |
| `resourceSpecCharacteristic` | array | Não | Atributos técnicos esperados: capacidade de portas, potência, peso, profundidade U, tecnologia (GPON/XGSPON), tipo conector. |
| `attachment` | array | Não | Anexos: datasheets, manuais, fotos do fabricante. |
| `relatedParty` | array | Não | Manufacturer/Vendor (referência a Party do Módulo 6). |
| `resourceSpecRelationship` | array | Não | Relações entre especificações: "containsAsChild", "compatibleWith", "supersedes". |

### 6.4 Exemplo de payload

```json
{
  "id": "spec-olt-huawei-ma5800-x17",
  "@type": "PhysicalResourceSpecification",
  "name": "OLT Huawei MA5800-X17",
  "code": "OLT-HW-MA5800-X17",
  "category": { "id": "cat-equipment-olt", "@referredType": "ResourceCategory" },
  "lifecycleStatus": "Active",
  "version": "2.0",
  "resourceSpecCharacteristic": [
    { "name": "Tecnologia",      "valueType": "enum",   "values": ["GPON","XGSPON","XGPON"], "mandatory": true },
    { "name": "Numero_Slots",    "valueType": "int",    "mandatory": true, "defaultValue": 17 },
    { "name": "Profundidade_U",  "valueType": "decimal","mandatory": true, "unit": "U",  "defaultValue": 9 },
    { "name": "Potencia_Max_W",  "valueType": "int",    "mandatory": true, "unit": "W",  "defaultValue": 1800 },
    { "name": "Peso_kg",         "valueType": "decimal","mandatory": false,"unit": "kg" }
  ],
  "relatedParty": [
    { "party": { "id": "party-huawei", "@referredType": "Organization" }, "role": "manufacturer" }
  ],
  "resourceSpecRelationship": [
    { "type": "containsAsChild", "resourceSpec": { "id": "spec-card-gpon-h805", "@referredType": "ResourceSpecification" } }
  ]
}
```

### 6.5 Pré-condições

- A ResourceCategory referenciada existe (REQ-MOD02-002).
- O Manufacturer/Vendor referenciado existe no Módulo 6 (Party).
- O usuário tem permissão de Administrador do Catálogo de Recursos.

### 6.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar ResourceSpec** | Criar especificação com name, code, type (Physical/Logical), category, lifecycleStatus, resourceSpecCharacteristic. |
| **RF-002** | **Versionar** | Suportar versionamento explícito via version + validFor. Versões anteriores ficam Retired mas Resources existentes permanecem. |
| **RF-003** | **Atributos técnicos** | Definir resourceSpecCharacteristic com: name, valueType (string/int/decimal/enum/boolean/date), mandatory, configurable, validator (regex/range), defaultValue, unit. |
| **RF-004** | **Anexos** | Anexar datasheets, manuais e fotos via attachment (link ou upload com hash). |
| **RF-005** | **Relações entre specs** | Modelar resourceSpecRelationship para containsAsChild (ex.: chassi OLT contém placa), compatibleWith (ex.: SFP compatível com placa), supersedes (ex.: modelo novo substitui antigo). |
| **RF-006** | **Editar e despublicar** | Editar com Audit; transicionar para Retired bloqueia criação de novos Resources mas preserva existentes. |
| **RF-007** | **Listar e filtrar** | Listar com filtros por: category, type, lifecycleStatus, manufacturer, characteristic (ex.: GPON-only). |
| **RF-008** | **Importar de catálogos externos** | Importar specs de catálogos públicos (ex.: NetBox device-type-library) com mapeamento para o formato Nexus. |
| **RF-009** | **Exportar catálogo** | Exportar todo o catálogo em formato canônico para backup ou compartilhamento. |
| **RF-010** | **Eventos** | Publicar TMF688 a cada criação/alteração de ResourceSpec. |

### 6.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | code é único globalmente na plataforma. |
| **RN-002** | @type, name, code, category e lifecycleStatus são obrigatórios. |
| **RN-003** | Apenas specs com lifecycleStatus=Active podem ser usadas para criar novos Resources. |
| **RN-004** | resourceSpecCharacteristic mandatory só pode ser adicionado a spec sem Resources instanciados, ou via migração explícita. |
| **RN-005** | Spec em Retired preserva Resources existentes mas bloqueia criação de novos. |
| **RN-006** | resourceSpecRelationship containsAsChild define implicitamente regras de contenção física (REQ-MOD02-007). |
| **RN-007** | Toda alteração no catálogo gera Audit Trail e evento TMF688. |

### 6.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST de PhysicalResourceSpecification "OLT Huawei MA5800-X17" com category, manufacturer e characteristics retorna 201. |
| **CA-002** | **Unicidade de code** | POST com code já existente retorna 409. |
| **CA-003** | **Validação de characteristic** | PATCH em Resource cujo valor de characteristic falha no validator da spec retorna 400. |
| **CA-004** | **Retired bloqueia uso** | POST de Resource com resourceSpecification em Retired retorna 400. |
| **CA-005** | **Versionamento** | Nova versão da spec gera ID distinto; versão anterior recebe validFor.endDateTime automaticamente. |
| **CA-006** | **Import NetBox** | Importação de device-type YAML do NetBox gera ResourceSpec correspondente com mapeamento de atributos documentado. |
| **CA-007** | **Evento publicado** | Toda criação/alteração publica evento no tópico resource.spec.v1. |

### 6.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Catálogo de tipos formal** | Biblioteca de modelos (Catalogue) | Data Model Manager (metamodelo) | Device Types + Module Types | **ResourceSpecification conforme TMF634** |
| **Atributos técnicos por tipo** | Sim (parametrizado) | Sim (metamodelo) | Sim (custom fields + type) | **resourceSpecCharacteristic canônico** |
| **Versionamento** | Parcial | Não nativo | Não nativo | **version + validFor explícitos** |
| **Relações entre specs** | Parcial | Sim (containment) | Limitado | **resourceSpecRelationship tipado** |
| **Anexos (datasheets, fotos)** | Sim | Sim | Sim (limitado) | **attachment com hash de integridade** |


---

## 7. REQ-MOD02-002 — Resource Category (organização hierárquica do catálogo)

> **Entidade TMF:** ResourceCategory (TMF634)  
> **Open API TMF:** TMF634 — Resource Catalog Management API  
> **Prioridade:** Alta — organiza navegação e filtros do catálogo  
> **Status:** Em levantamento · Versão 1.0 — draft

### 7.1 Descrição

Uma ResourceCategory organiza ResourceSpecifications em hierarquia navegável: Equipamentos > Equipamentos de Acesso > OLT > [especificações]. Diferentemente das relações técnicas entre specs (containsAsChild), categorias servem para navegação humana e filtros operacionais. Uma spec pertence a uma categoria primária, mas pode estar referenciada por múltiplas categorias secundárias (multi-classificação).

### 7.2 Racional arquitetural

Sem categorias, o catálogo se torna uma lista plana ingerenciável (V.tal opera com milhares de especificações entre equipamentos, cabos e infraestrutura). O TMF634 prevê ResourceCategory como entidade dedicada, separada da Spec. O Netwin organiza por dimensões fixas (Infraestruturas, Cabos, Equipamentos, Rede, Serviços) — funcional mas hardcoded. O NetBox organiza Device Types por Manufacturer apenas. O Kuwaiba organiza via classes do metamodelo. O Nexus implementa categorias hierárquicas independentes do tipo de Resource e configuráveis em runtime.

### 7.3 Mapeamento de atributos TMF

Atributos canônicos da entidade ResourceCategory (TMF634):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7. |
| `name` | string | Sim | Nome da categoria (ex.: "Equipamentos de Acesso", "Cabos Ópticos Externos"). |
| `code` | string | Sim | Código curto único (ex.: "EQ-ACC", "CB-EXT"). |
| `parentCategory` | EntityRef | Não | Categoria pai. Nulo para categorias raiz. |
| `lifecycleStatus` | enum | Sim | Active | Retired. |
| `isRoot` | boolean | Não | true para categorias de topo. |
| `resourceSpecification` | array | Não | Lista de specs membros (relação inversa). |

### 7.4 Exemplo de payload

```json
{
  "id": "cat-equipment-olt",
  "name": "OLT",
  "code": "EQ-ACC-OLT",
  "parentCategory": { "id": "cat-equipment-access", "@referredType": "ResourceCategory" },
  "lifecycleStatus": "Active",
  "isRoot": false
}
```

### 7.5 Pré-condições

- A categoria pai, quando informada, já existe.
- O usuário tem permissão de Administrador do Catálogo de Recursos.

### 7.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar categoria** | Criar ResourceCategory com nome, código, categoria pai opcional. |
| **RF-002** | **Hierarquia em árvore** | Suportar profundidade ilimitada via parentCategory recursivo. |
| **RF-003** | **Categorias base V.tal** | Bootstrap automático: Equipamentos (Acesso, Agregação, Backbone), Cabos (Drop, Distribuição, Backbone), Infraestrutura (Postes, Dutos, CTOs), Recursos Lógicos (IPv4, IPv6, VLAN, ASN). |
| **RF-004** | **Associar specs a categorias** | Definir categoria primária na criação da spec; suportar múltiplas categorias secundárias. |
| **RF-005** | **Listar e filtrar** | Listar categorias em árvore; filtrar specs por categoria (incluindo descendentes). |
| **RF-006** | **Editar e excluir** | Editar com Audit; bloquear exclusão de categoria com specs ou subcategorias. |
| **RF-007** | **Contadores** | Expor contagem de specs e Resources instanciados por categoria (acumulado na subárvore). |
| **RF-008** | **Eventos** | Publicar TMF688 a cada alteração no catálogo de categorias. |

### 7.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | code da categoria é único globalmente. |
| **RN-002** | Nome único dentro do mesmo parentCategory. |
| **RN-003** | Não é permitido ciclo na hierarquia. |
| **RN-004** | Exclusão bloqueada se houver specs ou subcategorias; permite-se transição para Retired. |
| **RN-005** | Categorias-base V.tal são protegidas — alteração exige aprovação especial. |
| **RN-006** | Toda alteração gera Audit Trail e evento TMF688. |

### 7.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST de categoria "OLT" com parentCategory="Equipamentos de Acesso" retorna 201. |
| **CA-002** | **Filtro recursivo** | GET /resourceSpecification?category=Equipamentos retorna specs de todas as categorias descendentes. |
| **CA-003** | **Bloqueio de exclusão** | DELETE em categoria com specs ativas retorna 409. |
| **CA-004** | **Contadores** | GET /resourceCategory/{id}/aggregate retorna count de specs e Resources na subárvore. |

### 7.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Organização hierárquica** | Fixa por dimensões (Catalogue) | Via classes do metamodelo | Por Manufacturer apenas | **ResourceCategory hierárquica e configurável** |
| **Multi-classificação** | Não | Parcial | Não | **Sim (primária + secundárias)** |
| **Bootstrap V.tal** | Não aplicável | Não aplicável | Não aplicável | **Categorias-base pré-populadas** |


---

## 8. REQ-MOD02-003 — Resource Function Specification (templates funcionais)

> **Entidade TMF:** ResourceFunctionSpecification (TMF634)  
> **Open API TMF:** TMF634 — Resource Catalog Management API  
> **Prioridade:** Média — habilita reuso e configuração padronizada  
> **Status:** Em levantamento · Versão 1.0 — draft

### 8.1 Descrição

Uma ResourceFunctionSpecification é um template funcional reutilizável: configuração padrão de uma OLT, padrão de cabling de um rack, layout típico de uma CTO de 16 portas. Permite que operações repetitivas (instalação de novo POP, expansão de capacidade) usem templates ao invés de configuração manual repetida. É a entidade que materializa o conceito de "engineering pattern" no catálogo TMF.

### 8.2 Racional arquitetural

O Netwin tem "Templates" no módulo Catalogue (templates de instalação típicos). O Kuwaiba tem "Template Manager" robusto para serviços e classes. O NetBox tem Config Templates e Config Contexts. Todos os três sistemas reconhecem a necessidade de templates funcionais — mas com modelagens distintas. O TMF634 padroniza isto como ResourceFunctionSpecification (RFS), com a vantagem de ser referenciável por Service Specifications (TMF633) do Módulo 3, criando ponte natural entre o catálogo de recursos e o catálogo de serviços.

### 8.3 Mapeamento de atributos TMF

Atributos canônicos da entidade ResourceFunctionSpecification (TMF634):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7. |
| `name` | string | Sim | Nome do template (ex.: "OLT GPON Padrão 16 PON", "CTO 16 portas FTTH Padrão V.tal"). |
| `code` | string | Sim | Código curto único. |
| `description` | string | Não | Descrição funcional do template. |
| `resourceSpecification` | array<EntityRef> | Sim | ResourceSpecifications que compõem o template (ex.: 1x OLT, 17x Placa, 1x Power Supply). |
| `parameter` | array | Não | Parâmetros configuráveis do template (capacidade, redundância, etc.). |
| `lifecycleStatus` | enum | Sim | Active | Retired. |
| `validFor` | TimePeriod | Não | Período de validade. |

### 8.4 Exemplo de payload

```json
{
  "id": "rfs-olt-gpon-padrao",
  "name": "OLT GPON Padrao V.tal - 16 PON",
  "code": "RFS-OLT-GPON-16",
  "lifecycleStatus": "Active",
  "resourceSpecification": [
    { "id": "spec-olt-huawei-ma5800-x17", "quantity": 1 },
    { "id": "spec-card-gpon-h805",        "quantity": 16 },
    { "id": "spec-power-supply-2200w",    "quantity": 2 }
  ],
  "parameter": [
    { "name": "redundancia_alimentacao", "valueType": "boolean", "defaultValue": true }
  ]
}
```

### 8.5 Pré-condições

- Todas as ResourceSpecifications referenciadas existem e estão Active.
- O usuário tem permissão de Administrador do Catálogo de Recursos.

### 8.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Function Spec** | Criar template com nome, código, lista de specs componentes e parâmetros opcionais. |
| **RF-002** | **Instanciar a partir do template** | Endpoint POST /resourceFunctionSpecification/{id}/instantiate cria os Resources do template em lote, vinculados a um Site específico. |
| **RF-003** | **Templates compostos** | Suportar templates que referenciam outros templates (composição). |
| **RF-004** | **Parâmetros configuráveis** | Permitir parâmetros (ex.: número de placas adicionais) que ajustam a instanciação. |
| **RF-005** | **Editar e versionar** | Editar template; versionamento via validFor preserva instâncias criadas a partir de versões anteriores. |
| **RF-006** | **Listar e filtrar** | Listar templates por categoria, status, contendo determinada spec. |
| **RF-007** | **Eventos** | Publicar TMF688 a cada criação/alteração/instanciação. |

### 8.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Todas as resourceSpecifications referenciadas devem estar Active no momento da instanciação. |
| **RN-002** | Templates Retired não permitem nova instanciação; instâncias existentes preservadas. |
| **RN-003** | A instanciação cria Resources em lote em transação única — falha em qualquer um reverte tudo. |
| **RN-004** | Toda instanciação registra Audit Trail vinculado ao template usado. |

### 8.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST de template "OLT GPON Padrão" com 1x OLT + 17x Placa GPON retorna 201. |
| **CA-002** | **Instanciação** | POST /resourceFunctionSpecification/{id}/instantiate com Site alvo cria 18 Resources em transação. |
| **CA-003** | **Falha transacional** | Falha em criar 1 dos Resources reverte todos os criados anteriormente na mesma instanciação. |
| **CA-004** | **Spec Retired no template** | POST de instanciação com spec componente em Retired retorna 400. |

### 8.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Templates de instalação** | Sim (Catalogue Templates) | Sim (Template Manager) | Sim (Device Type composições) | **ResourceFunctionSpecification conforme TMF634** |
| **Instanciação em lote** | Sim | Sim | Parcial | **Endpoint dedicado /instantiate** |
| **Parâmetros configuráveis** | Sim | Sim | Limitado | **parameter[] tipado** |
| **Templates compostos** | Limitado | Sim | Limitado | **Sim (composição recursiva)** |


---

## 9. REQ-MOD02-004 — Manufacturer / Vendor (fabricantes e fornecedores)

> **Entidade TMF:** Party com role=manufacturer (TMF632 referenciado)  
> **Open API TMF:** TMF634 (referência) + TMF632 (Party do Módulo 6)  
> **Prioridade:** Média — atributo de governança e logística  
> **Status:** Em levantamento · Versão 1.0 — draft

### 9.1 Descrição

Manufacturer e Vendor são papéis específicos de Party (Organization) que identificam fabricantes (Huawei, Cisco, Furukawa) e fornecedores (distribuidores). São referenciados por ResourceSpecifications (quem fabricou aquele modelo) e por Resources (quem forneceu aquela unidade — útil para garantia e logística). Não são entidade própria do TMF634 — usam o TMF632 do Módulo 6 (Party) via relatedParty.

### 9.2 Racional arquitetural

Esta é uma decisão arquitetural deliberada: fabricantes não são entidade nova, são Party com role específico. Esta abordagem evita duplicação de entidades e mantém a consistência do modelo (Party do Módulo 6 é a fonte única para qualquer organização externa relacionada ao Nexus). O Netwin tem Fabricantes como tabela própria. O NetBox tem Manufacturers como entidade. O Kuwaiba modela como subclasse de Party no metamodelo. O Nexus segue o caminho mais limpo: Party com PartyRole, alinhado ao TMF632/TMF669.

### 9.3 Mapeamento de atributos TMF

Atributos canônicos da entidade Party com role=manufacturer (TMF632 referenciado):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `party` | EntityRef | Sim | Referência a Party do Módulo 6 (Organization). |
| `role` | enum | Sim | manufacturer | vendor | distributor. |
| `validFor` | TimePeriod | Não | Período de validade do papel. |

### 9.4 Exemplo de payload

```json
// ResourceSpec com Manufacturer e Vendor:
{
  "id": "spec-olt-huawei-ma5800-x17",
  "name": "OLT Huawei MA5800-X17",
  "relatedParty": [
    { "party": { "id": "party-huawei",   "@referredType": "Organization" }, "role": "manufacturer" },
    { "party": { "id": "party-furukawa", "@referredType": "Organization" }, "role": "distributor"  }
  ]
}
```

### 9.5 Pré-condições

- A Party (Organization) já existe no Módulo 6.
- O usuário tem permissão de edição da ResourceSpec.

### 9.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Vincular fabricante a spec** | Adicionar relatedParty com role=manufacturer na ResourceSpec. |
| **RF-002** | **Vincular fornecedor a Resource** | Adicionar relatedParty com role=vendor no Resource instanciado. |
| **RF-003** | **Filtrar specs por fabricante** | GET /resourceSpecification?relatedParty.role=manufacturer&relatedParty.id={partyId}. |
| **RF-004** | **Filtrar Resources por fornecedor** | GET /resource?relatedParty.role=vendor&relatedParty.id={partyId}. |
| **RF-005** | **Bootstrap V.tal** | Pré-popular Parties de fabricantes comuns: Huawei, ZTE, Furukawa, Datacom, Cisco, Nokia, Padtec, DZS, Siae. |

### 9.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Uma spec pode ter apenas um manufacturer; pode ter múltiplos distributors. |
| **RN-002** | Um Resource pode ter um manufacturer (herdado da spec) e um vendor específico (de aquisição). |
| **RN-003** | Excluir Party com role=manufacturer ativo em specs é bloqueado pelo Módulo 6. |

### 9.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Vincular fabricante** | PATCH em ResourceSpec adicionando relatedParty com role=manufacturer é aceito. |
| **CA-002** | **Filtro por fabricante** | GET com filtro retorna specs do fabricante informado. |
| **CA-003** | **Bootstrap** | Bootstrap cria os ~10 fabricantes principais V.tal automaticamente. |

### 9.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de fabricante** | Tabela própria | Subclasse de Party metamodelo | Entidade Manufacturer | **Party com role=manufacturer (TMF632 unificado)** |
| **Vendor (fornecedor) por Resource** | Não nativo | Via atributos custom | Não nativo | **relatedParty com role=vendor** |


---

## 10. REQ-MOD02-005 — Cadastro genérico de Resource (CRUD canônico)

> **Entidade TMF:** Resource (PhysicalResource | LogicalResource) (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — entidade central do módulo de inventário  
> **Status:** Em levantamento · Versão 1.0 — draft

### 10.1 Descrição

Um Resource é uma instância concreta de um tipo de recurso definido por ResourceSpecification: a OLT específica instalada na Central Botafogo (serial 12345), o cabo óptico OPGW-001 entre POP-A e POP-B, o IP 10.20.30.40 alocado para o cliente X. É a entidade-alvo de toda operação de inventário: criar, posicionar, modificar atributos, consultar relações, mudar estado, eventualmente desativar. Este requisito formaliza o CRUD canônico de Resource conforme TMF639.

### 10.2 Racional arquitetural

O TMF639 define Resource como entidade abstrata com duas especializações: PhysicalResource (com atributos como serialNumber, manufactureDate, partNumber, weight) e LogicalResource (sem materialização física). Esta é a base sobre a qual todos os requisitos subsequentes do módulo (REQ-008 a REQ-023) constroem casos de uso específicos (postes, cabos, OLTs, IPs). O design canônico do CRUD é fundamental para garantir consistência: mesmo padrão de API, mesmo modelo de eventos, mesmo mecanismo de extensão. Os sistemas legados tratam cada tipo de recurso com formulário e API próprios — abordagem inferior pela duplicação e divergência. O Nexus adota o modelo TMF639 unificado.

### 10.3 Mapeamento de atributos TMF

Atributos canônicos da entidade Resource (PhysicalResource | LogicalResource) (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7 — identificador estável global. |
| `name` | string | Sim | Nome operacional do Resource (ex.: "OLT-RJ-BOT-CO-01", "IP-10.20.30.40"). |
| `code` | string | Não | Código curto V.tal opcional. |
| `@type` | string | Sim | PhysicalResource | LogicalResource (refinado por specs específicas). |
| `resourceSpecification` | EntityRef | Sim | Referência à ResourceSpecification que define o tipo (REQ-MOD02-001). |
| `resourceStatus` | enum | Sim | standby | alarm | available | reserved | unknown | suspended. |
| `operationalState` | enum | Sim | enable | disable. |
| `administrativeState` | enum | Sim | locked | unlocked | shuttingDown. |
| `usageState` | enum | Sim | idle | active | busy. |
| `place` | EntityRef | Não | GeographicSite ou GeographicLocation (Módulo 1) onde o Resource está fisicamente. |
| `relatedParty` | array | Não | Owner, manufacturer, vendor (Módulo 6). |
| `resourceCharacteristic` | array | Não | Atributos específicos da instância conforme spec (serial, MAC, capacidade configurada etc.). |
| `resourceRelationship` | array | Não | Relações com outros Resources (parent/child, conectado-a, alimentado-por). REQ-MOD02-024. |
| `validFor` | TimePeriod | Não | Período de validade. |
| `startOperatingDate` | datetime | Não | Data de início de operação. |
| `endOperatingDate` | datetime | Não | Data prevista/efetiva de descomissionamento. |

### 10.4 Exemplo de payload

```json
{
  "id": "res-olt-rj-bot-co-01",
  "@type": "PhysicalResource",
  "name": "OLT-RJ-BOT-CO-01",
  "code": "OLT-001",
  "resourceSpecification": { "id": "spec-olt-huawei-ma5800-x17", "@referredType": "ResourceSpecification" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "administrativeState": "unlocked",
  "usageState": "active",
  "place": { "id": "site-rj-bot-co-01-cage-3", "@referredType": "GeographicSite" },
  "startOperatingDate": "2026-02-10T00:00:00Z",
  "resourceCharacteristic": [
    { "name": "Serial",         "value": "HW2024001234" },
    { "name": "Tecnologia",     "value": "GPON" },
    { "name": "MAC_Management", "value": "00:1A:2B:3C:4D:5E" },
    { "name": "Firmware",       "value": "V800R022C00SPC100" }
  ],
  "relatedParty": [
    { "party": { "id": "party-huawei",   "@referredType": "Organization" }, "role": "manufacturer" },
    { "party": { "id": "party-furukawa", "@referredType": "Organization" }, "role": "vendor"  }
  ]
}
```

### 10.5 Pré-condições

- ResourceSpecification referenciada existe e está Active.
- O Site/Location referenciado em place existe e está em status compatível (Active ou InConstruction).
- O usuário tem permissão de escrita no módulo Resource.

### 10.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Resource** | POST /resource com resourceSpecification, name, status inicial, place opcional, characteristics conforme spec. |
| **RF-002** | **Validar contra spec** | Validar resourceCharacteristic do Resource contra resourceSpecCharacteristic da spec: obrigatórios, validadores, tipos. |
| **RF-003** | **Atualizar Resource** | PATCH com partial update; campos imutáveis (id, resourceSpecification) rejeitados. |
| **RF-004** | **Reposicionar Resource** | PATCH em place permite mover Resource entre Sites/Locations; mudança gera evento específico. |
| **RF-005** | **Excluir/Desativar** | Bloquear exclusão de Resource com filhos (REQ-MOD02-007) ou conexões ativas; permitir transição para administrativeState=locked + status=suspended. |
| **RF-006** | **Listar e filtrar** | Suportar filtros por: status, type, resourceSpecification, place (incluindo descendentes do Site), characteristic, relatedParty. |
| **RF-007** | **Detalhar (GET)** | GET /resource/{id} expande resourceSpecification, place, relatedParty conforme parâmetro fields. |
| **RF-008** | **Importação em massa** | POST /resource/bulk para criação em lote com validação completa e relatório de sucesso/falha por item. |
| **RF-009** | **Histórico de estados** | Endpoint GET /resource/{id}/history retorna sequência de mudanças (via Event Store). |
| **RF-010** | **Eventos** | Publicar TMF688: ResourceCreateEvent, ResourceAttributeValueChangeEvent, ResourceStateChangeEvent, ResourceDeleteEvent. |

### 10.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | resourceSpecification, name, resourceStatus, operationalState, administrativeState e usageState são obrigatórios na criação. |
| **RN-002** | Atributo characteristic mandatory da spec é obrigatório no Resource. |
| **RN-003** | place, quando informado, deve ser GeographicSite Active ou InConstruction (validação cross-module). |
| **RN-004** | Resource não pode ser excluído fisicamente — apenas administrativamente desativado (administrativeState=locked + status=suspended). |
| **RN-005** | Mudança de place de Resource Active emite warning se houver dependências (conexões físicas ativas). |
| **RN-006** | Toda criação, alteração e mudança de estado publica evento TMF688 e gera Audit Trail. |
| **RN-007** | code, quando informado, deve ser único dentro da mesma ResourceSpecification. |

### 10.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST com resourceSpec=spec-olt-huawei e characteristic Serial="HW001234" retorna 201. |
| **CA-002** | **Spec Retired bloqueia** | POST com spec em Retired retorna 400. |
| **CA-003** | **Characteristic obrigatório** | POST sem characteristic mandatory da spec retorna 400 explicando o atributo faltante. |
| **CA-004** | **Validador de characteristic** | characteristic com valor falhando no validator regex retorna 400. |
| **CA-005** | **Site Active validado** | POST com place em Site Retired retorna 400. |
| **CA-006** | **Bloqueio de exclusão física** | DELETE /resource retorna 405 sempre; uso de PATCH com locked é o caminho correto. |
| **CA-007** | **Filtro por Site** | GET /resource?place.id={siteId}&include=descendants retorna Resources do Site e sub-sites. |
| **CA-008** | **Importação em massa** | POST /resource/bulk com 1000 itens retorna relatório com sucessos e falhas detalhadas. |
| **CA-009** | **Evento publicado** | Criação publica ResourceCreateEvent em resource.{type}.v1 (ex.: resource.physical.v1). |

### 10.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem CRUD canônica** | Formulários específicos por tipo | Genérico via metamodelo | Genérico com refinamento (DCIM) | **Resource conforme TMF639 (unificado)** |
| **Estados operacionais** | Estado ciclo de vida (custom) | Atributos do metamodelo | status (limitado) | **4 estados TMF (status, op, adm, usage)** |
| **Validação contra spec** | Sim (parametrizada) | Sim (metamodelo) | Sim (limitada) | **Validação canônica via spec** |
| **Mudança de localização** | Reassignment manual | Sim | Sim (rack/location) | **Eventos específicos de mudança** |
| **Soft-delete (sem exclusão física)** | Parcial | Sim | Sim | **Obrigatório (apenas locked)** |


---

## 11. REQ-MOD02-006 — Ciclo de vida operacional do Resource

> **Entidade TMF:** Resource.{resourceStatus, operationalState, administrativeState, usageState} + StateChangeEvent (TMF639 + TMF688)  
> **Open API TMF:** TMF639 + TMF688  
> **Prioridade:** Alta  
> **Status:** Em levantamento · Versão 1.0 — draft

### 11.1 Descrição

O ciclo de vida de um Resource é multi-dimensional no modelo TMF639: status operacional (status), estado de operação (operationalState), estado administrativo (administrativeState) e estado de uso (usageState). Esta granularidade permite expressar com precisão a condição do recurso: uma OLT pode estar enable/unlocked/active (operação plena), ou enable/locked/idle (operacional mas em manutenção administrativa), ou disable/unlocked/idle (defeito não bloqueado). É bastante diferente do modelo simples de "status único" dos sistemas legados.

### 11.2 Racional arquitetural

A modelagem ITU-T X.731 adotada pelo TMF639 (status, operational, administrative, usage) é mais expressiva e padronizada que os modelos de estado único dos sistemas legados (Netwin "Estado ciclo de vida", NetBox "status", Kuwaiba sem ciclo formal). Esta granularidade habilita: (a) automação de Service Assurance distinguindo defeito vs manutenção; (b) governança operacional (locked vs unlocked); (c) faturamento preciso (recursos reservados vs em uso). Para reduzir complexidade na UI, o Nexus apresenta combinações canônicas pré-definidas ("Em Operação", "Em Manutenção", "Em Defeito", "Reservado", "Descomissionado") que mapeiam para tuplas das 4 dimensões.

### 11.3 Mapeamento de atributos TMF

Atributos canônicos da entidade Resource.{resourceStatus, operationalState, administrativeState, usageState} + StateChangeEvent (TMF639 + TMF688):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceStatus` | enum | Sim | standby | alarm | available | reserved | unknown | suspended (X.731 status). |
| `operationalState` | enum | Sim | enable | disable. |
| `administrativeState` | enum | Sim | locked | unlocked | shuttingDown. |
| `usageState` | enum | Sim | idle | active | busy. |
| `statusReason` | string | Não | Motivo da última transição. |
| `statusDate` | datetime | Sim | Data da última mudança em qualquer dimensão de status. |

### 11.4 Exemplo de payload

```json
// Combinações canônicas exibidas na UI e seus mapeamentos X.731:
// InOperation       → status:available, op:enable,  adm:unlocked,    usage:active
// InMaintenance     → status:available, op:enable,  adm:locked,      usage:idle
// InDefect          → status:alarm,     op:disable, adm:unlocked,    usage:idle
// Reserved          → status:reserved,  op:enable,  adm:unlocked,    usage:idle
// Decommissioned    → status:suspended, op:disable, adm:locked,      usage:idle
// Planned           → status:standby,   op:enable,  adm:unlocked,    usage:idle

// Evento de mudança:
{
  "eventType": "ResourceStateChangeEvent",
  "eventTime": "2026-06-26T15:30:00Z",
  "source": "/tmf-api/resourceInventoryManagement/v4/resource/res-olt-rj-bot-co-01",
  "event": {
    "resource": { "id": "res-olt-rj-bot-co-01", "@referredType": "Resource" },
    "previousState": { "resourceStatus": "available", "administrativeState": "unlocked" },
    "newState":      { "resourceStatus": "available", "administrativeState": "shuttingDown" },
    "statusReason": "Iniciando janela de manutencao programada"
  }
}
```

### 11.5 Pré-condições

- O Resource existe.
- O usuário tem permissão para a transição específica (RBAC granular por tipo de Resource).

### 11.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Estados canônicos** | Suportar os 4 eixos X.731: status (6 valores), operationalState (2), administrativeState (3), usageState (3). |
| **RF-002** | **Combinações canônicas** | Definir combinações nomeadas para UI: InOperation, InMaintenance, InDefect, Reserved, Decommissioned, Planned. |
| **RF-003** | **Matriz de transições** | Configurar matriz de transições permitidas para cada dimensão (ex.: locked exige passar por shuttingDown se Resource estava active). |
| **RF-004** | **Histórico via eventos** | Cada mudança publica ResourceStateChangeEvent TMF688 com estado anterior/novo e usuário. |
| **RF-005** | **Consulta de histórico** | GET /resource/{id}/history retorna sequência cronológica. |
| **RF-006** | **Restrição em provisionamento** | Bloquear alocação de Resource em status reserved ou suspended para novos serviços. |
| **RF-007** | **Alerta operacional** | Mudança para alarm dispara notificação para equipes de operação configuráveis. |
| **RF-008** | **Recompute automático** | usageState pode ser recalculado automaticamente a partir de consumo por Services/conexões. |

### 11.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Status inicial padrão na criação: standby + enable + unlocked + idle (Resource recém-cadastrado, ainda não em operação). |
| **RN-002** | Transição para administrativeState=locked exige passagem por shuttingDown se usageState != idle. |
| **RN-003** | operationalState=disable é tipicamente gerado por sistemas de monitoramento (alarmes), não por intervenção manual. |
| **RN-004** | Recursos em resourceStatus=suspended ou administrativeState=locked não aceitam novas alocações. |
| **RN-005** | Eventos de StateChange são imutáveis. |
| **RN-006** | Mudanças críticas (locked, suspended) podem requerer aprovação via Process Orchestration (Módulo 5). |

### 11.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Estado inicial** | POST cria Resource com status=standby, op=enable, adm=unlocked, usage=idle. |
| **CA-002** | **Transição válida** | PATCH para administrativeState=locked em Resource active aceita apenas via shuttingDown intermediário. |
| **CA-003** | **Evento publicado** | Toda mudança publica StateChangeEvent em resource.{type}.lifecycle.v1. |
| **CA-004** | **Bloqueio em alocação** | POST de Service consumindo Resource em status=reserved retorna 409 (validação cross-module Service Domain). |
| **CA-005** | **Histórico completo** | GET /resource/{id}/history retorna lista de mudanças em ordem cronológica. |

### 11.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de estado** | Estado único (texto) | Sem ciclo formal | status único com choices | **X.731 (4 eixos) conforme TMF639** |
| **Histórico de transições** | Não | Audit Trail global | Não | **StateChangeEvent (TMF688) imutável** |
| **Combinações canônicas para UI** | N/A | N/A | N/A | **Sim — 6 combinações nomeadas** |
| **Aprovação para mudanças críticas** | Não | Workflow BPMN possível | Não | **Integração com Process Orchestration** |


---

## 12. REQ-MOD02-007 — Hierarquia de contenção física entre Resources

> **Entidade TMF:** resourceRelationship com type=containsAsChild (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — base para inside plant (rack → equipamento → placa → porta)  
> **Status:** Em levantamento · Versão 1.0 — draft

### 12.1 Descrição

A hierarquia de contenção física modela quais Resources estão fisicamente dentro de outros: uma porta está dentro de uma placa que está dentro de uma OLT que está dentro de um rack. Esta hierarquia é validada contra as regras definidas no catálogo (resourceSpecRelationship type=containsAsChild da REQ-MOD02-001) — não é arbitrária, é derivada das especificações. Inspiração direta no Containment Manager do Kuwaiba, formalizado conforme TMF639.

### 12.2 Racional arquitetural

Sem hierarquia de contenção, não é possível modelar com precisão a topologia física de Inside Plant (rack > OLT > placa > porta) nem rastrear corretamente trajetos físicos (porta de OLT > jumper > front port DIO > cabo > rear port DIO em destino). O TMF639 modela isto via resourceRelationship com type=containsAsChild — relação entre Resources tipados. A validação cross-reference com o catálogo (REQ-MOD02-001) garante que apenas combinações permitidas pela spec são aceitas (uma placa GPON H805 só pode estar contida em chassi de OLT MA5800, não em rack diretamente).

### 12.3 Mapeamento de atributos TMF

Atributos canônicos da entidade resourceRelationship com type=containsAsChild (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceRelationship` | array | Não | Em Resource: lista de relações com outros Resources. |
| `relationshipType` | enum | Sim | containsAsChild | containedBy | connectsTo | aliasOf | replaces. |
| `resource` | EntityRef | Sim | Resource relacionado. |
| `characteristic` | array | Não | Atributos da relação (ex.: posição em U no rack, slot na placa). |

### 12.4 Exemplo de payload

```json
// Exemplo: Card GPON contida em OLT (slot 5)
{
  "id": "res-card-gpon-rj-bot-001-slot-5",
  "name": "Card GPON Slot 5",
  "resourceSpecification": { "id": "spec-card-gpon-h805", "@referredType": "ResourceSpecification" },
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-olt-rj-bot-co-01", "@referredType": "Resource" },
      "characteristic": [
        { "name": "slot", "value": 5 }
      ] }
  ]
}
```

### 12.5 Pré-condições

- Os Resources pai e filho existem.
- A spec do Resource pai tem resourceSpecRelationship com containsAsChild apontando para a spec do filho.

### 12.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar relação de contenção** | Adicionar entry em resourceRelationship do filho com type=containedBy e referência ao pai (ou no pai com containsAsChild). |
| **RF-002** | **Validação contra catálogo** | Verificar que spec do filho está em resourceSpecRelationship.containsAsChild da spec do pai; caso contrário rejeitar. |
| **RF-003** | **Posição física** | Suportar characteristic da relação para posição física: slot, U position, port number. |
| **RF-004** | **Prevenção de ciclo** | Impedir que Resource seja contido em seu próprio descendente. |
| **RF-005** | **Limites de capacidade** | Validar limites: número máximo de filhos do tipo X conforme spec do pai. |
| **RF-006** | **Visualização hierárquica** | GET /resource/{id}/tree retorna árvore completa de contenção (descendentes). |
| **RF-007** | **Visualização inversa** | GET /resource/{id}/parent retorna cadeia de containers (ancestrais até a raiz). |
| **RF-008** | **Reposicionamento** | Permitir mover Resource filho para outro pai compatível (ex.: trocar placa de slot). |
| **RF-009** | **Cascata de eventos** | Mudança de status em Resource pai propaga eventos informativos para filhos (não muda status filho automaticamente). |
| **RF-010** | **Eventos** | Publicar ResourceRelationshipChangeEvent a cada criação/alteração de contenção. |

### 12.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Resource pode ter no máximo um parent (containedBy é cardinalidade 1). |
| **RN-002** | Combinação spec-pai/spec-filho deve estar no catálogo (REQ-MOD02-001) — caso contrário, criação é rejeitada. |
| **RN-003** | Não é permitido ciclo na hierarquia de contenção. |
| **RN-004** | Limites de capacidade da spec do pai são validados (ex.: chassi com 17 slots não aceita 18ª placa). |
| **RN-005** | characteristic de posição (slot, U) é único por pai — não há duas placas no mesmo slot. |
| **RN-006** | Excluir Resource pai com filhos é bloqueado; é necessário desvincular ou desativar filhos primeiro. |
| **RN-007** | Toda alteração de relação publica evento TMF688 e gera Audit Trail. |

### 12.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Contenção válida** | POST de Card em OLT cujo spec pai aceita Card como filho retorna 201. |
| **CA-002** | **Contenção inválida** | POST de Card em Rack diretamente (sem OLT intermediária) retorna 400. |
| **CA-003** | **Slot conflitante** | POST de segunda Card no slot 5 da mesma OLT retorna 409 (slot já ocupado). |
| **CA-004** | **Prevenção de ciclo** | PATCH tentando colocar Resource A como filho de B que já é descendente de A retorna 400. |
| **CA-005** | **Limite de capacidade** | POST de 18ª Card em OLT com max=17 retorna 400 com mensagem específica. |
| **CA-006** | **Visualização da árvore** | GET /resource/{id}/tree retorna estrutura aninhada com todos os Resources contidos. |
| **CA-007** | **Reposicionar** | PATCH em resourceRelationship.resource para outro pai compatível é aceito; pai antigo perde a referência. |
| **CA-008** | **Bloqueio de exclusão** | DELETE em Resource com filhos retorna 409 com lista de filhos. |

### 12.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Hierarquia formal de contenção** | Implícita (formulários) | Containment Manager | rack.devices, device.modules | **resourceRelationship containsAsChild (TMF639)** |
| **Validação contra catálogo** | Limitada | Sim (metamodelo) | Sim (Device Type) | **Validação canônica via spec relationship** |
| **Posição física (slot, U)** | Sim (campo específico) | Sim | Sim (Rack U position) | **characteristic da relação** |
| **Limites de capacidade** | Limitada | Sim | Sim (Device Bays, Module Bays) | **Validação no save** |
| **Reposicionamento** | Sim (manual) | Sim | Sim | **Sim com Audit** |


---

## 13. REQ-MOD02-008 — Support Structure (poste, manhole, torre, duto, caixa de emenda)

> **Entidade TMF:** PhysicalResource especializado (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — fundação da Outside Plant  
> **Status:** Em levantamento · Versão 1.0 — draft

### 13.1 Descrição

Support Structure é a categoria de PhysicalResource que representa a infraestrutura passiva de suporte da rede externa: postes (próprios e de terceiros — concessionárias de energia), manholes, torres, dutos, caixas de emenda, balanceiros. São recursos georreferenciados (Point ou LineString), normalmente compartilhados entre múltiplos cabos e sem componentes ativos. São pré-requisito para passagem de cabos: nenhum cabo pode ser cadastrado sem trajeto através de Support Structures.

### 13.2 Racional arquitetural

O Netwin trata Suportes (postes, dutos, manholes) como entidades de primeira classe no módulo Outside Plant. Esta abordagem é correta operacionalmente — a operação V.tal opera intensamente sobre postes (compartilhados com concessionárias, com SLA de aluguel) e dutos (limitados em capacidade de cabos por bitola). O Kuwaiba modela tudo via metamodelo (Pole, Manhole, Duct como classes derivadas de InventoryObject). O NetBox não tem modelagem nativa de OSP. O Nexus segue o TMF639 modelando Support Structures como PhysicalResources tipados via ResourceSpecification — categoria Infraestrutura/OSP/SupportStructure no catálogo, com atributos específicos (altura, material, propriedade, capacidade de cabos).

> **Decisão arquitetural Q-005 (Jun/2026):** A fonte de verdade do cadastro de postes — inclusive os de propriedade de terceiros (concessionárias de energia) — fica integralmente na V.tal, sob o Nexus. **Não há integração de sincronização com sistemas de concessionárias.** Postes de terceiros são modelados como Support Structures normais com `owner` (concessionária) e `contractRef` (contrato de aluguel) preenchidos, mas todo o ciclo de vida do cadastro (criação, atualização, desativação) é operado dentro do Nexus. Esta decisão simplifica o MVP: nenhum adapter de integração externa é necessário, e o Nexus permanece como fonte única de verdade para a infraestrutura de OSP.

### 13.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource especializado (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo de estrutura (Poste-Eucalipto-10m, Manhole-AT, Duto-PVC-100mm, Torre-Triangular-30m, CaixaEmenda-FOSC). |
| `place` | EntityRef | Sim | GeographicLocation. Point para postes/manholes/torres; LineString para dutos. |
| `resourceCharacteristic` | array | Não | Atributos específicos: altura, material, propriedade (V.tal/concessionária), capacidade, identificação externa (Sicom, número da concessionária). |
| `resourceRelationship` | array | Não | Relação compartilhamento com cabos/Resources que passam pela estrutura (type=supports). |

### 13.4 Exemplo de payload

```json
// Poste próprio V.tal
{
  "id": "res-poste-rjbot-0001",
  "@type": "PhysicalResource",
  "name": "Poste RJ-BOT-0001",
  "resourceSpecification": { "id": "spec-poste-eucalipto-10m" },
  "place": { "id": "loc-point-rjbot-0001", "@referredType": "GeographicLocation" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "administrativeState": "unlocked",
  "usageState": "active",
  "resourceCharacteristic": [
    { "name": "altura_m",     "value": 10 },
    { "name": "material",     "value": "eucalipto" },
    { "name": "owner",        "value": "V.tal" },
    { "name": "max_cables",   "value": 8 },
    { "name": "cables_atual", "value": 3 },
    { "name": "Sicom_ID",     "value": "VT-POL-123456" }
  ]
}

// Duto subterrâneo
{
  "id": "res-duto-rjbot-0001",
  "@type": "PhysicalResource",
  "name": "Duto Rua Voluntarios 100-200",
  "resourceSpecification": { "id": "spec-duto-pvc-100mm" },
  "place": { "id": "loc-linestring-rjbot-duto-001", "@referredType": "GeographicLocation" },
  "resourceCharacteristic": [
    { "name": "diametro_mm",      "value": 100 },
    { "name": "comprimento_m",    "value": 800 },
    { "name": "capacity_cables",  "value": 4 },
    { "name": "cables_installed", "value": 2 }
  ]
}
```

### 13.5 Pré-condições

- ResourceSpecification existe e está Active (catálogo populado com tipos canônicos V.tal de OSP).
- GeographicLocation referenciada existe (REQ-MOD01-001).
- Para postes de terceiros: cadastro do proprietário (concessionária) como Party (Módulo 6).

### 13.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Support Structure** | POST /resource com spec do tipo SupportStructure, place obrigatório (Point/LineString), characteristics conforme spec. |
| **RF-002** | **Tipos canônicos V.tal** | Catálogo pré-populado: Poste-Eucalipto-10m, Poste-Concreto-12m, Poste-Concessionária-9m, Manhole-AT-Padrão, Manhole-Comercial, Duto-PVC-100mm, Duto-PEAD-50mm, Torre-Triangular-30m, Torre-Monopolo-25m, Caixa-Emenda-Aérea-FOSC, Caixa-Emenda-Subterrânea. |
| **RF-003** | **Propriedade e SLA** | Suportar characteristic owner (V.tal | Light | Enel | Cemig | CPFL | Equatorial | outras concessionárias) e contractRef para postes alugados. |
| **RF-004** | **Capacidade física** | Para dutos: characteristic capacity_cables (número máximo de cabos) e cables_installed (atual). Para postes: max_cables. |
| **RF-005** | **Validação de capacidade** | Bloquear passagem de novo cabo (REQ-MOD02-010) em duto com capacity_cables atingida. |
| **RF-006** | **Identificadores externos** | Manter integração com sistemas legados via characteristic Sicom_ID, Geosite_OSP_ID, Concessionária_TAG. |
| **RF-007** | **Trajeto de dutos** | Para dutos, place=LineString com sequência de coordenadas; ferramenta de digitalização sobre mapa. |
| **RF-008** | **Cadastro em massa** | Importar lote de postes/dutos via CSV/GeoJSON com validação geométrica e de catálogo. |
| **RF-009** | **Visualização no mapa** | Renderizar Support Structures no mapa com ícones diferenciados por tipo (REQ-MOD01-011). |
| **RF-010** | **Inventário compartilhado** | Listar todos os cabos que passam por uma estrutura: GET /resource/{id}/supports. |

### 13.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | place é obrigatório para Support Structures — recurso de OSP sem georreferenciamento é inválido. |
| **RN-002** | Postes de terceiros (owner != V.tal) exigem contractRef para faturamento de aluguel. |
| **RN-003** | Duto com cables_installed = capacity_cables não aceita novos cabos — exigir expansão ou novo duto. |
| **RN-004** | Excluir Support Structure com cabos passando é bloqueado — exigir realocação dos cabos primeiro. |
| **RN-005** | Caixa de emenda só pode existir em pontos onde há cabo passando ou planejado. |
| **RN-006** | Sicom_ID e Geosite_OSP_ID são únicos quando informados (rastreabilidade com sistemas legados). |
| **RN-007** | Toda alteração geográfica (mover poste) gera evento crítico e exige Audit Trail. |

### 13.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar poste próprio** | POST com spec=Poste-Eucalipto-10m, place=Point, characteristic=[{altura:10},{material:eucalipto},{owner:V.tal}] retorna 201. |
| **CA-002** | **Criar poste de terceiro** | POST com owner=Light + contractRef preenchido é aceito; sem contractRef retorna 400. |
| **CA-003** | **Criar duto com trajeto** | POST com spec=Duto-PVC-100mm, place=LineString com 5 pontos, capacity=4 retorna 201. |
| **CA-004** | **Capacidade esgotada** | Tentativa de adicionar 5º cabo a duto com capacity_cables=4 retorna 409 com mensagem específica. |
| **CA-005** | **Bloqueio de exclusão** | DELETE em poste com cabos passando retorna 409 com lista de cabos. |
| **CA-006** | **Importação em lote** | POST /resource/bulk com 500 postes em GeoJSON retorna relatório com sucessos/falhas detalhados. |
| **CA-007** | **Visualização** | GET /map/resources?type=SupportStructure&bbox=... retorna FeatureCollection com postes/manholes/dutos. |

### 13.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de Support Structures** | Sim (Outside Plant) | Subclasses no metamodelo | Não nativo | **PhysicalResource tipado (TMF639)** |
| **Propriedade (V.tal/terceiros)** | Sim | Atributo livre | N/A | **characteristic owner + contractRef** |
| **Capacidade de dutos** | Sim | Atributo do metamodelo | N/A | **characteristic + validação no save** |
| **Trajeto de dutos no mapa** | Sim (Geosite OSP) | Limitado | N/A | **LineString conforme TMF675** |
| **Identificadores legados** | IDs internos | Custom attributes | N/A | **Sicom_ID, Geosite_OSP_ID como characteristics** |


---

## 14. REQ-MOD02-009 — Passive Device (CTO, NAP, Splitter externo, Emenda)

> **Entidade TMF:** PhysicalResource passivo georreferenciado (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — ponto de acesso da rede GPON  
> **Status:** Em levantamento · Versão 1.0 — draft

### 14.1 Descrição

Passive Devices são equipamentos passivos da Outside Plant: CTOs (Caixas de Terminação Óptica) com splitters internos, NAPs (Network Access Points), splitters externos primários, caixas de emenda. São o ponto de acesso final da rede GPON — onde o cabo da rede se divide para alcançar os clientes. Cada CTO tem um número fixo de portas de saída (8, 16, 32) e contém um ou mais splitters ópticos. São georreferenciados (Point) e tipicamente fixados em postes ou fachadas.

### 14.2 Racional arquitetural

CTOs são entidade central da operação V.tal — são milhões de unidades distribuídas no território, cada uma sendo o "endereço de rede" para um conjunto de clientes. O Netwin modela CTO como entidade dedicada com atributos específicos (capacidade, ocupação, splitter interno). O Kuwaiba modela como PassiveDevice subclasse de PhysicalNode com containment para splitters. No Nexus, a CTO é PhysicalResource com containmentRule permitindo Splitter como filho — essa contenção é o que materializa a relação "CTO contém splitter 1:8". Os atributos de capacidade e ocupação são derivados das portas filhas, garantindo consistência automática.

### 14.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource passivo georreferenciado (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (CTO-Furukawa-16P, NAP-Furukawa-12P, Splitter-PLC-1x8-Externo, Caixa-Emenda-FOSC-A12-12F). |
| `place` | EntityRef | Sim | GeographicLocation Point. |
| `resourceCharacteristic` | array | Não | capacity_ports, ports_occupied (derivado), supporting_structure (poste/fachada onde está). |
| `resourceRelationship` | array | Não | containsAsChild para Splitter; supportedBy para poste/estrutura. |

### 14.4 Exemplo de payload

```json
// CTO completa com Splitter 1:8 contido
{
  "id": "res-cto-rjbot-0001",
  "name": "CTO-RJ-BOT-0001",
  "resourceSpecification": { "id": "spec-cto-furukawa-16p" },
  "place": { "id": "loc-point-cto-rjbot-0001", "@referredType": "GeographicLocation" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "administrativeState": "unlocked",
  "usageState": "active",
  "resourceCharacteristic": [
    { "name": "capacity_ports", "value": 16 },
    { "name": "modelo",         "value": "Furukawa CFOA-SC-AS-16P" }
  ],
  "resourceRelationship": [
    { "relationshipType": "supportedBy",
      "resource": { "id": "res-poste-rjbot-0001", "@referredType": "Resource" } }
  ]
}

// Splitter 1:8 contido na CTO
{
  "id": "res-splitter-cto-rjbot-0001",
  "name": "Splitter 1:8 CTO-RJ-BOT-0001",
  "resourceSpecification": { "id": "spec-splitter-plc-1x8" },
  "place": { "id": "loc-point-cto-rjbot-0001", "@referredType": "GeographicLocation" },
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-cto-rjbot-0001", "@referredType": "Resource" } }
  ]
}
```

### 14.5 Pré-condições

- A Support Structure (poste/fachada) onde será fixada já existe.
- A GeographicLocation já existe.
- A ResourceSpecification do tipo está no catálogo.

### 14.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Passive Device** | POST com spec, place e supportingStructure (relação com poste). |
| **RF-002** | **Catálogo canônico V.tal** | Tipos pré-populados: CTO-16P, CTO-8P, NAP-Furukawa-12P, Splitter-PLC-1x8, Splitter-PLC-1x16, Splitter-PLC-1x32, Caixa-Emenda-Aérea, Caixa-Emenda-Subterrânea. |
| **RF-003** | **Contenção de Splitter** | CTO contém 1 ou mais Splitters como Resource filho (REQ-MOD02-007). |
| **RF-004** | **Portas de saída** | Cada Splitter tem ports filhas modeladas como PhysicalResource Port (REQ-MOD02-016) com input e outputs. |
| **RF-005** | **Ocupação derivada** | ports_occupied é calculado a partir das portas filhas que têm conexão ativa (não armazenado, derivado). |
| **RF-006** | **Vínculo a Support Structure** | resourceRelationship type=supportedBy aponta para o poste/manhole/fachada onde está fixada. |
| **RF-007** | **Cascata de ciclo de vida** | Status do PassiveDevice impacta status das portas filhas (status reserved/suspended impede uso). |
| **RF-008** | **Visualização no mapa** | Ícone específico no mapa diferencia CTOs por ocupação (vazia/parcial/cheia). |
| **RF-009** | **Análise de capacidade** | Endpoint /resource/{id}/availability retorna portas disponíveis para conexão de novos clientes. |

### 14.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Toda CTO deve estar supportedBy uma Support Structure (poste ou fachada). |
| **RN-002** | A capacity_ports da CTO é determinada pela spec (não pode ser configurada manualmente). |
| **RN-003** | Tentativa de exceder capacity_ports da CTO ao conectar novo cliente retorna erro de capacidade. |
| **RN-004** | Excluir CTO com portas ocupadas é bloqueado — exigir desconexão dos clientes primeiro. |
| **RN-005** | Toda CTO tem ao menos 1 Splitter contido — sem splitter, a CTO não tem função operacional. |
| **RN-006** | Tipos de splitter padrão V.tal: 1:8, 1:16, 1:32. Outras razões exigem aprovação especial. |

### 14.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar CTO completa** | POST de CTO + POST de Splitter 1:8 contido + POSTs de 8 portas: tudo aceito em sequência. |
| **CA-002** | **Sem support structure** | POST de CTO sem supportingStructure retorna 400. |
| **CA-003** | **Ocupação calculada** | GET /resource/{id} retorna ports_occupied derivado das portas com conexões ativas. |
| **CA-004** | **Capacidade esgotada** | Tentar conectar 17º cliente em CTO de 16 portas retorna 409. |
| **CA-005** | **Bloqueio de exclusão** | DELETE em CTO com clientes conectados retorna 409 com lista. |
| **CA-006** | **Mapa diferenciado** | GET /map/resources?type=CTO renderiza com cores por nível de ocupação. |

### 14.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de CTO/NAP** | Entidade dedicada (Outside Plant) | PassiveDevice subclass | Não nativo | **PhysicalResource via spec (TMF639)** |
| **Containment de splitter** | Implícita | Sim (Containment Manager) | N/A | **resourceRelationship containsAsChild** |
| **Ocupação derivada** | Calculada | Calculada | N/A | **Derivada de portas filhas em tempo real** |
| **Vínculo a poste** | Sim | Sim (parent in OSP) | N/A | **resourceRelationship supportedBy** |


---

## 15. REQ-MOD02-010 — Cable e Cable Segment georreferenciado

> **Entidade TMF:** PhysicalResource Cable + CableSegment (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — fundação da topologia física  
> **Status:** Em levantamento · Versão 1.0 — draft

### 15.1 Descrição

Um Cable é o recurso físico que carrega fibras ópticas entre dois pontos da rede: um cabo primário sai da Central até o armário (CDOE); um cabo secundário vai do armário até a CTO; um cabo drop vai da CTO até a ONT do cliente. Modelado como PhysicalResource georreferenciado (LineString — sequência ordenada de coordenadas que desenha o trajeto). Quando passa por múltiplos trechos com tipos diferentes ou interrupções (caixas de emenda), divide-se em CableSegments. Cada cabo tem N fibras internas, modeladas como sub-Resources do tipo Fiber.

### 15.2 Racional arquitetural

Cabo óptico é a entidade mais sensível da OSP — sua modelagem incorreta cripta a operação. O Netwin trata cabo como entidade com trajeto sobre suportes (postes/dutos) e fibras internas como sub-itens; abordagem operacional madura. O Kuwaiba modela como PhysicalLink georreferenciado via metamodelo. O TMF639 prevê PhysicalResource Cable com geographicLocation LineString — modelo limpo e canônico. O Nexus refina com duas camadas: (a) Cable como PhysicalResource macro (CFOA-001), com endpoints A e Z; (b) Fibers internas como Resources filhos do Cable. Esta separação permite que uma fibra individual seja conectada/emendada/cortada independentemente, preservando a integridade do cabo macro.

### 15.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Cable + CableSegment (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Cabo-Optico-CFOA-12F, Cabo-Drop-Self-Supporting-1F, etc.). |
| `place` | EntityRef | Sim | GeographicLocation LineString. |
| `resourceCharacteristic` | array | Não | numero_fibras, tipo (CFOA/CFOI/Drop/Aéreo/Subterrâneo), comprimento_m, fabricante_etiqueta. |
| `resourceRelationship` | array | Não | endpoint_A, endpoint_Z (em portas/splitters); passes_through (Support Structures). |

### 15.4 Exemplo de payload

```json
// Cabo primário CFOA 12F entre Central e Armário
{
  "id": "res-cabo-cfoa-rjbot-001",
  "name": "CFOA-RJ-BOT-001",
  "resourceSpecification": { "id": "spec-cabo-cfoa-12f" },
  "place": { "id": "loc-linestring-cfoa-001", "@referredType": "GeographicLocation" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "resourceCharacteristic": [
    { "name": "numero_fibras",       "value": 12 },
    { "name": "tipo",                "value": "CFOA-SM-AS" },
    { "name": "comprimento_m",       "value": 2400 },
    { "name": "fabricante_etiqueta", "value": "FRK-2024-001234" }
  ],
  "resourceRelationship": [
    { "relationshipType": "endpoint_A",
      "resource": { "id": "res-rearport-dio01-bot-001", "@referredType": "Resource" } },
    { "relationshipType": "endpoint_Z",
      "resource": { "id": "res-splitter-primario-rjbot-arm-001-input", "@referredType": "Resource" } },
    { "relationshipType": "passesThrough",
      "resource": { "id": "res-duto-rjbot-0001", "@referredType": "Resource" },
      "characteristic": [{ "name": "sequencia", "value": 1 }] },
    { "relationshipType": "passesThrough",
      "resource": { "id": "res-poste-rjbot-0001", "@referredType": "Resource" },
      "characteristic": [{ "name": "sequencia", "value": 2 }] }
  ]
}
```

### 15.5 Pré-condições

- Endpoints A e Z (portas, splitters, emendas) existem.
- Support Structures por onde o cabo passa existem.
- GeographicLocation LineString digitalizada.

### 15.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Cable** | POST com spec, place=LineString, endpoint_A, endpoint_Z, characteristic (numero_fibras, comprimento). |
| **RF-002** | **Geração automática de Fibers** | Ao criar Cable, criar automaticamente N Resources Fiber (filhos por containsAsChild) conforme numero_fibras da spec. |
| **RF-003** | **Trajeto sobre suportes** | Modelar passes_through como lista de Support Structures por onde o cabo passa, em ordem. |
| **RF-004** | **Validação de capacidade** | Validar que cada Support Structure no trajeto tem capacidade disponível antes de aceitar o cabo. |
| **RF-005** | **Endpoints tipados** | endpoint_A e endpoint_Z são referências a Port, Splitter input/output, ou Caixa de Emenda. |
| **RF-006** | **Cable Segments** | Para cabos com mudança de tipo no meio do trajeto ou passagem por emenda, modelar como múltiplos Cable Segments ligados por Splices (REQ-MOD02-011). |
| **RF-007** | **Atualização de trajeto** | Permitir editar place (LineString) com Audit Trail e revalidação de capacidades dos suportes. |
| **RF-008** | **Visualização no mapa** | Renderizar cabos como linhas no mapa, com cores diferenciadas por tipo e status. |
| **RF-009** | **Cálculo de ocupação de fibras** | GET /resource/{cableId}/fibers/availability retorna fibras livres vs ocupadas no cabo. |
| **RF-010** | **Substituição de cabo** | Operação especial replace que substitui um cabo por outro preservando conexões nas portas. |

### 15.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Cable sem place (LineString) é inválido. |
| **RN-002** | endpoint_A != endpoint_Z (cabo não pode ter ambos os endpoints no mesmo Resource). |
| **RN-003** | Cada Fiber do Cable é criada como filha containsAsChild — quantidade derivada da spec. |
| **RN-004** | Excluir Cable com fibras conectadas é bloqueado — exigir desconexão das fibras primeiro. |
| **RN-005** | Mudança de trajeto (place) de cabo Active emite warning crítico. |
| **RN-006** | Suporte da Cable Segments: cabo macro é Resource pai; cada segmento é Resource filho com trajeto parcial. |
| **RN-007** | Comprimento (m) deve ser consistente com a soma dos comprimentos do LineString — validação tolerante a ±5%. |

### 15.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar cabo de 12F** | POST de Cable com numero_fibras=12 cria automaticamente 12 Fibers como filhas. |
| **CA-002** | **Endpoint inválido** | POST com endpoint_A apontando para CTO inexistente retorna 400. |
| **CA-003** | **Capacidade de duto** | POST em trajeto que inclui duto cheio retorna 409. |
| **CA-004** | **Bloqueio de exclusão** | DELETE em cabo com fibras conectadas a ONTs retorna 409. |
| **CA-005** | **Ocupação de fibras** | GET /resource/{cableId}/fibers retorna lista com status de cada fibra. |
| **CA-006** | **Substituição** | POST /resource/{cableId}/replace com novo cabo preserva conexões nas portas finais. |

### 15.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de cabo georreferenciado** | Sim (OSP com trajeto) | PhysicalLink georreferenciado | Não nativo | **PhysicalResource + LineString (TMF675)** |
| **Fibras internas como sub-recursos** | Sim (sub-itens) | Sim (containment) | N/A | **Containment containsAsChild (Fibras)** |
| **Trajeto sobre suportes** | Sim | Sim | N/A | **passesThrough relationship** |
| **Validação de capacidade de duto** | Sim | Limitada | N/A | **Validação cross-reference automática** |
| **Cable Segments com emenda** | Limitado | Sim | N/A | **Segmentos como Resources filhos do cabo macro** |


---

## 16. REQ-MOD02-011 — Splice (Emenda de fibra óptica)

> **Entidade TMF:** PhysicalResource Splice (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — habilita rastreabilidade ponto-a-ponto  
> **Status:** Em levantamento · Versão 1.0 — draft

### 16.1 Descrição

Uma Splice é a emenda física que une duas fibras ópticas — seja por fusão (mais comum) ou por conector mecânico. Cada Splice conecta exatamente duas Fibers (uma de cada cabo) e tem características técnicas (atenuação medida em dB). Splices vivem dentro de Caixas de Emenda (Passive Devices) e são essenciais para rastrear o caminho real do sinal óptico fim-a-fim, mesmo quando atravessa múltiplos segmentos de cabo.

### 16.2 Racional arquitetural

Sem Splices modeladas, o cálculo de trajeto fim-a-fim do sinal (REQ-MOD02-012) é impossível para casos reais — em V.tal, é raro um cliente final ser conectado por um único cabo contínuo entre Central e ONT. O Netwin modela emendas no módulo OSP. O Kuwaiba modela como PhysicalConnection entre Fibers. O Nexus modela Splice como PhysicalResource especializado com duas relações endpoint (fibra A, fibra B), permitindo navegação bidirecional do trajeto.

### 16.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Splice (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Splice-Fusão, Splice-Mecânica). |
| `place` | EntityRef | Não | Herdado da Caixa de Emenda que contém. |
| `resourceCharacteristic` | array | Não | atenuacao_dB, tecnico_emendador, data_emenda. |
| `resourceRelationship` | array | Sim | endpoint_A (Fiber), endpoint_B (Fiber), containedBy (Caixa de Emenda). |

### 16.4 Exemplo de payload

```json
// Emenda entre fibra 3 do cabo A e fibra 1 do cabo B
{
  "id": "res-splice-rjbot-emenda-001-s003",
  "name": "Splice 003 - Caixa Emenda 001",
  "resourceSpecification": { "id": "spec-splice-fusao" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "resourceCharacteristic": [
    { "name": "atenuacao_dB",     "value": 0.12 },
    { "name": "tecnico_emendador","value": "12345 - Joao Silva" },
    { "name": "data_emenda",      "value": "2025-08-15T10:30:00Z" }
  ],
  "resourceRelationship": [
    { "relationshipType": "endpoint_A",
      "resource": { "id": "res-fiber-cfoa-001-f3", "@referredType": "Resource" } },
    { "relationshipType": "endpoint_B",
      "resource": { "id": "res-fiber-cfoi-002-f1", "@referredType": "Resource" } },
    { "relationshipType": "containedBy",
      "resource": { "id": "res-caixa-emenda-rjbot-001", "@referredType": "Resource" } }
  ]
}
```

### 16.5 Pré-condições

- As duas Fibers que serão emendadas existem.
- A Caixa de Emenda (PassiveDevice) onde a Splice será feita existe.

### 16.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Splice** | POST com endpoint_A=Fiber1, endpoint_B=Fiber2, containedBy=CaixaEmenda, characteristic=atenuacao_dB. |
| **RF-002** | **Validação de fibras livres** | Verificar que ambas as Fibers estão em status available antes de criar Splice. |
| **RF-003** | **Atenuação medida** | Registrar atenuacao_dB medida no campo (OTDR ou measurer); valor superior ao threshold da spec aciona alerta. |
| **RF-004** | **Rastreabilidade** | Ao consultar uma Fiber, expor a Splice (se existir) e a Fiber conectada do outro lado. |
| **RF-005** | **Operação de emenda em massa** | Endpoint /splice/bulk permite emendar N fibras de um cabo nas N fibras de outro em transação única. |
| **RF-006** | **Desfazer emenda** | PATCH para status=suspended marca Splice como inativa; DELETE remove com Audit. |
| **RF-007** | **Histórico de emendas** | GET /resource/{caixa-emenda-id}/splices retorna histórico de splices feitas na caixa, ativas e inativas. |

### 16.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Toda Splice tem exatamente duas fibras (endpoint_A != endpoint_B). |
| **RN-002** | Uma Fiber pode estar em no máximo uma Splice ativa simultaneamente. |
| **RN-003** | atenuacao_dB acima de threshold (configurável por tipo, padrão 0.3 dB) gera alerta de qualidade. |
| **RN-004** | Desfazer Splice libera ambas as fibras para reuso. |
| **RN-005** | Splice é containedBy obrigatoriamente uma Caixa de Emenda ou DIO. |
| **RN-006** | Toda operação de emenda gera Audit Trail (técnico, data, atenuação medida). |

### 16.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar Splice válida** | POST emendando Fiber1 (livre) e Fiber2 (livre) retorna 201. |
| **CA-002** | **Fiber já emendada** | POST com Fiber em Splice ativa retorna 409. |
| **CA-003** | **Atenuação alta** | POST com atenuacao_dB=0.5 (acima do threshold 0.3) é aceito mas gera evento de qualidade. |
| **CA-004** | **Bulk emenda** | POST /splice/bulk com 12 pares de fibras cria 12 Splices em transação única. |
| **CA-005** | **Rastreabilidade** | GET /resource/{fiberId}/path retorna trajeto incluindo splices até a próxima ponta livre. |

### 16.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de emenda** | Sim (OSP) | PhysicalConnection | Não nativo | **PhysicalResource Splice com 2 endpoints** |
| **Atenuação medida** | Sim | Atributo livre | N/A | **characteristic com threshold por spec** |
| **Histórico de emendas** | Limitado | Audit Trail | N/A | **Trail via eventos + characteristic data** |
| **Validação de fibras livres** | Sim | Limitada | N/A | **Cross-check automático antes do POST** |


---

## 17. REQ-MOD02-012 — Trajeto físico (Path computation) fim-a-fim

> **Entidade TMF:** Função sobre resourceRelationships (não é entidade própria)  
> **Open API TMF:** TMF639 — Resource Inventory + lógica de path  
> **Prioridade:** Crítica — habilita troubleshooting e Service Assurance  
> **Status:** Em levantamento · Versão 1.0 — draft

### 17.1 Descrição

O trajeto físico (Path) é o caminho do sinal óptico de um ponto a outro: porta PON da OLT → jumper → Front Port DIO → Rear Port DIO → fibra de cabo primário → splice → fibra de cabo secundário → CTO → splitter → fibra drop → ONT. Não é uma entidade armazenada — é computada em tempo real navegando as resourceRelationships (containedBy, endpoint, connectedTo). É a base de capacidades operacionais críticas: rastrear caminho de um cliente até a OLT, calcular atenuação total fim-a-fim, encontrar pontos comuns entre múltiplos clientes (raiz comum em incidente).

### 17.2 Racional arquitetural

Path computation é o "consultar cadeia de relações" do modelo de inventário — capacidade que o Kuwaiba implementa nativamente via seu modelo de grafo (uma das suas maiores forças). O Netwin oferece consulta limitada. O NetBox tem path navigation para circuits mas não para FTTH. O Nexus implementa path computation como serviço dedicado sobre o TMF639, retornando trajeto completo ou parcial com metadados (atenuação acumulada, distância, número de splices). Esta capacidade é o principal argumento para usar Oracle Property Graph (referenciado na visão geral) — permite queries de grafo nativas com performance adequada para 22M+ HPs e 4M+ HCs.

### 17.4 Exemplo de payload

```json
// Request: POST /resource/path
{
  "from": { "id": "res-port-olt-rjbot-co-01-card0-port0", "@referredType": "Resource" },
  "to":   { "id": "res-ont-cliente-12345", "@referredType": "Resource" }
}

// Response
{
  "path": [
    { "resource": { "id": "res-port-olt-rjbot-co-01-card0-port0" }, "type": "Port", "site": "Central RJ Botafogo" },
    { "resource": { "id": "res-jumper-001"                    }, "type": "PatchCord" },
    { "resource": { "id": "res-frontport-dio01-001"           }, "type": "FrontPort" },
    { "resource": { "id": "res-rearport-dio01-001"            }, "type": "RearPort" },
    { "resource": { "id": "res-fiber-cfoa-001-f3"             }, "type": "Fiber" },
    { "resource": { "id": "res-splice-rjbot-emenda-001-s003"  }, "type": "Splice", "attenuation_dB": 0.12 },
    { "resource": { "id": "res-fiber-cfoi-002-f1"             }, "type": "Fiber" },
    { "resource": { "id": "res-splitter-cto-rjbot-0001-out3"  }, "type": "SplitterOutput" },
    { "resource": { "id": "res-fiber-drop-cliente-12345"      }, "type": "Fiber" },
    { "resource": { "id": "res-ont-cliente-12345"             }, "type": "ONT" }
  ],
  "total_distance_m": 2680,
  "total_attenuation_dB": 13.7,
  "splice_count": 1,
  "truncated": false
}
```

### 17.5 Pré-condições

- As relações entre Resources (containedBy, endpoint, connectedTo, splice) estão modeladas corretamente.
- Não há "buracos" no grafo (fibras livres no meio do caminho geram resposta truncada).

### 17.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Path from-to** | Endpoint POST /resource/path?from={resourceId}&to={resourceId} retorna sequência de Resources atravessados. |
| **RF-002** | **Path single endpoint** | Endpoint POST /resource/path?from={resourceId} retorna trajeto completo até a próxima ponta (sem destino fixo). |
| **RF-003** | **Metadados acumulados** | Resposta inclui: total_distance_m, total_attenuation_dB (somando perdas de splices + atenuação por km do cabo), splice_count, segments_count. |
| **RF-004** | **Direção do path** | Suportar consulta unidirecional (OLT→ONT) ou bidirecional. |
| **RF-005** | **Filtragem por tipo** | Permitir filtrar trajeto incluindo/excluindo certos tipos (ex.: apenas elementos passivos). |
| **RF-006** | **Visualização no mapa** | Endpoint /resource/path/visualize retorna GeoJSON FeatureCollection com elementos do trajeto desenhados no mapa. |
| **RF-007** | **Detecção de raiz comum** | Endpoint POST /resource/path/commonRoot retorna a raiz comum entre N clientes (útil em incidentes massivos). |
| **RF-008** | **Cache e performance** | Trajetos frequentes (Central→ONT por cliente) podem ser cacheados; invalidação em mudanças de qualquer Resource do trajeto. |
| **RF-009** | **Limite de profundidade** | Parâmetro maxHops para limitar travessia em queries de grafo (evita loops e queries pesadas). |

### 17.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Path computation usa apenas relacionamentos ativos (status != suspended/locked). |
| **RN-002** | Em caso de Fiber não emendada no meio do trajeto, resposta é parcial com indicador truncated=true. |
| **RN-003** | Atenuação total é soma de: atenuacao_dB de splices + (distancia_m / 1000) * atenuacao_por_km da spec do cabo. |
| **RN-004** | Cache de paths tem TTL máximo de 5 minutos; invalidação imediata em eventos de mudança nos Resources envolvidos. |
| **RN-005** | maxHops padrão = 50 (suficiente para FTTH típico); queries excedendo retornam erro 414 com indicação. |

### 17.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Path OLT→ONT** | POST /resource/path com OLT-port como from e ONT como to retorna trajeto completo com ~7-10 saltos. |
| **CA-002** | **Atenuação total** | Resposta inclui total_attenuation_dB calculado dinamicamente. |
| **CA-003** | **Path truncado** | Trajeto com fibra livre no meio retorna {truncated: true, lastResource: ...}. |
| **CA-004** | **Visualização** | GET /resource/path/visualize retorna GeoJSON com elementos do trajeto. |
| **CA-005** | **Raiz comum** | POST /resource/path/commonRoot com 5 IDs de ONTs retorna a CTO/cabo comum mais próximo. |
| **CA-006** | **Performance** | Path típico de 8 saltos resolvido em < 500ms (95p) com Oracle Property Graph. |

### 17.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Path computation fim-a-fim** | Limitada | Sim (nativo do grafo) | Limitada a circuits | **Sim — sobre Oracle Property Graph** |
| **Atenuação acumulada** | Manual | Não nativa | N/A | **Calculada em tempo real** |
| **Raiz comum entre clientes** | Não | Sim | N/A | **Endpoint dedicado /commonRoot** |
| **Visualização do trajeto no mapa** | Sim (Geosite OSP) | Sim | N/A | **GeoJSON nativo** |
| **Performance em escala** | Adequada para escala atual | Limitada (Neo4j embarcado) | Não aplicável | **Oracle Property Graph para 22M+ HPs** |


---

## 18. REQ-MOD02-013 — Rack (gabinete com elevação e ocupação em U)

> **Entidade TMF:** PhysicalResource Rack (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — fronteira entre Geographic e Inside Plant  
> **Status:** Em levantamento · Versão 1.0 — draft

### 18.1 Descrição

O Rack é o primeiro PhysicalResource quando se entra na Inside Plant de um Site. É a fronteira semântica entre o Módulo 1 (Geographic, que cobre Sites e Sub-Sites) e o Módulo 2 (Resource, que cobre tudo dentro do Rack: equipamentos, placas, portas). Modela um gabinete físico com elevação em U (típico de 42U ou 47U), com posição numérica de cada U, e contém equipamentos ativos e passivos. É georreferenciado indiretamente — fica em um Sub-Site, que fica em um Site, que tem coordenada.

### 18.2 Racional arquitetural

Esta é uma decisão arquitetural deliberada e importante: o Rack é o "primeiro Resource" e o "último Site não é". Andares, salas e cages são GeographicSite (Módulo 1, REQ-MOD01-007). A partir do Rack, tudo é Resource (Módulo 2). Esta fronteira é o que mantém os módulos com responsabilidades claras: Módulo 1 responde "onde está" via hierarquia geográfica; Módulo 2 responde "o que está" via contenção de Resources. O NetBox formaliza Rack como entidade dedicada com slots numerados e ocupação em U — modelo amplamente adotado e que o Nexus replica via PhysicalResource. O Kuwaiba modela como subclasse de container com posição interna. O Netwin modela como container genérico.

### 18.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Rack (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Rack-19pol-42U, Rack-19pol-47U, Open-Frame-19pol-45U). |
| `place` | EntityRef | Sim | GeographicSite (Sub-Site Sala/Cage onde o Rack está fisicamente). |
| `resourceCharacteristic` | array | Não | U_total, U_occupied (derivado), fabricante, modelo, lado_acesso (frontal/traseiro/ambos), peso_max_kg. |
| `resourceRelationship` | array | Não | containsAsChild para Equipment com characteristic U_position. |

### 18.4 Exemplo de payload

```json
{
  "id": "res-rack-rjbot-co-01-gpon-n01",
  "name": "Rack-GPON-Norte-01",
  "resourceSpecification": { "id": "spec-rack-19pol-42u" },
  "place": { "id": "site-rjbot-co-01-andar1-sala-gpon-norte", "@referredType": "GeographicSite" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "administrativeState": "unlocked",
  "usageState": "active",
  "resourceCharacteristic": [
    { "name": "U_total",      "value": 42 },
    { "name": "fabricante",   "value": "Schroff" },
    { "name": "modelo",       "value": "Varistar-42U" },
    { "name": "lado_acesso",  "value": "ambos" },
    { "name": "peso_max_kg",  "value": 1500 }
  ]
}
```

### 18.5 Pré-condições

- O Sub-Site (Sala/Cage) referenciado em place existe e está Active/InConstruction.
- ResourceSpecification do tipo Rack está no catálogo.

### 18.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Rack** | POST com spec, place (Sub-Site), characteristic (U_total, fabricante, modelo). |
| **RF-002** | **Catálogo de Racks** | Tipos pré-populados: Rack-19pol-42U-Fechado, Rack-19pol-47U-Fechado, Open-Frame-19pol-45U, Rack-23pol-42U-Telecom. |
| **RF-003** | **Posicionamento em U** | Equipamentos contidos têm characteristic U_position (1-42 para rack de 42U) e U_size (quantos Us ocupam). |
| **RF-004** | **Validação de capacidade** | Bloquear inclusão de equipamento em posição U que sobreponha equipamento existente. |
| **RF-005** | **Validação de limites** | Bloquear inclusão em U_position que excede U_total do rack. |
| **RF-006** | **Ocupação derivada** | U_occupied é calculado em tempo real a partir da soma de U_size dos equipamentos contidos. |
| **RF-007** | **Visualização front view** | Endpoint GET /resource/{rackId}/elevation retorna representação visual do rack com posição dos equipamentos para renderização gráfica. |
| **RF-008** | **Espaços livres** | Endpoint /resource/{rackId}/freeSpace retorna lista de intervalos U disponíveis. |
| **RF-009** | **Movimentação intra-rack** | Permitir mover equipamento para outro U_position no mesmo Rack com Audit. |
| **RF-010** | **Movimentação inter-rack** | Permitir mover equipamento para outro Rack (validação de espaço disponível no destino). |

### 18.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | place do Rack deve ser GeographicSite com category=SubSite (Sala, Cage) ou Site direto (excepcional). |
| **RN-002** | U_total é determinado pela spec do Rack — não configurável manualmente. |
| **RN-003** | U_position + U_size de equipamentos contidos não pode exceder U_total. |
| **RN-004** | Não há sobreposição de equipamentos no mesmo U_position. |
| **RN-005** | Excluir Rack com equipamentos é bloqueado. |
| **RN-006** | Mudança de place do Rack (move entre salas) é operação especial com aprovação e impacto em equipamentos contidos. |

### 18.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar Rack** | POST com spec=Rack-19pol-42U, place=Sub-Site, characteristic[U_total:42] retorna 201. |
| **CA-002** | **Posição válida** | POST de Equipment com U_position=10, U_size=2 em rack vazio é aceito. |
| **CA-003** | **Sobreposição rejeitada** | POST de Equipment em U_position=11 (sobrepõe ao U_size=2 ocupando 10-11) retorna 409. |
| **CA-004** | **Excede limite** | POST de Equipment com U_position=42, U_size=2 em rack U_total=42 retorna 400. |
| **CA-005** | **Elevation view** | GET /resource/{rackId}/elevation retorna mapa visual completo (front e rear). |
| **CA-006** | **Free space** | GET /resource/{rackId}/freeSpace retorna intervalos contínuos disponíveis. |

### 18.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de Rack** | Container genérico | Subclasse de Container | Entidade Rack dedicada | **PhysicalResource via spec (TMF639)** |
| **Posicionamento em U** | Sim | Sim | Sim (nativo) | **characteristic U_position + U_size** |
| **Validação de sobreposição** | Limitada | Sim | Sim | **Validação no save** |
| **Elevation view** | Limitada | Sim | Sim (UI nativa) | **Endpoint /elevation** |
| **Free space query** | Não | Limitada | Sim | **Endpoint /freeSpace** |


---

## 19. REQ-MOD02-014 — Equipment (OLT, switch, roteador, servidor, ONT/CPE)

> **Entidade TMF:** PhysicalResource Equipment (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — equipamento ativo do inventário  
> **Status:** Em levantamento · Versão 1.0 — draft

### 19.1 Descrição

Equipment representa todos os equipamentos ativos da rede V.tal: OLTs (acesso GPON), switches (agregação), roteadores (backbone), servidores (data center), ONTs/CPEs (cliente). Todos seguem o mesmo padrão TMF639: PhysicalResource tipado por ResourceSpecification (que define características da família/modelo), instanciado com atributos específicos (serial, MAC, firmware) e posicionado fisicamente (place em Rack ou Site). A distinção entre tipos vem do catálogo, não da modelagem — o Nexus não tem entidades "OLT" e "Switch" separadas, apenas Equipment com spec diferentes.

### 19.2 Racional arquitetural

O TMF639 unifica equipamentos sob PhysicalResource — diferentemente do NetBox que tem entidade Device única mas com role discriminator, do Kuwaiba que tem subclasses no metamodelo, e do Netwin que tem entidades específicas por família. A unificação reduz duplicação de código, padroniza queries e habilita filtros transversais ("todos os equipamentos do fabricante X, em qualquer função"). A diferenciação operacional vem das ResourceSpecifications no catálogo: spec-olt-huawei-ma5800 vs spec-switch-cisco-9300 vs spec-router-juniper-mx10 vs spec-ont-huawei-hg8145. Cada spec define seu próprio resourceSpecCharacteristic (atributos esperados) e suas resourceSpecRelationship (placas que pode conter).

### 19.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Equipment (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Define a família/modelo (OLT, switch, router, ONT etc.). |
| `place` | EntityRef | Não | GeographicSite (para ONT em ponto de instalação) ou herdado via containedBy (em Rack). |
| `resourceCharacteristic` | array | Não | Serial (único por fabricante), MAC management, firmware, software_version, IP_management, ASN_local (router), capacity_specs. |
| `resourceRelationship` | array | Não | containedBy (Rack), containsAsChild (Cards), connectedTo (uplinks). |

### 19.4 Exemplo de payload

```json
// OLT em Rack
{
  "id": "res-olt-rjbot-co-01",
  "name": "OLT-RJ-BOT-CO-01",
  "resourceSpecification": { "id": "spec-olt-huawei-ma5800-x17" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "resourceCharacteristic": [
    { "name": "Serial",         "value": "HW2024001234" },
    { "name": "MAC_management", "value": "00:1A:2B:3C:4D:5E" },
    { "name": "IP_management",  "value": "10.255.1.1" },
    { "name": "firmware",       "value": "V800R022C00SPC100" },
    { "name": "PON_density",    "value": 256 }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-rack-rjbot-co-01-gpon-n01", "@referredType": "Resource" },
      "characteristic": [
        { "name": "U_position", "value": 1 },
        { "name": "U_size",     "value": 9 }
      ] }
  ]
}

// ONT no cliente
{
  "id": "res-ont-cliente-12345",
  "name": "ONT-Cliente-12345",
  "resourceSpecification": { "id": "spec-ont-huawei-hg8145x6" },
  "place": { "id": "site-installation-cliente-12345", "@referredType": "GeographicSite" },
  "resourceCharacteristic": [
    { "name": "Serial",          "value": "HWTC87654321" },
    { "name": "MAC_management",  "value": "AA:BB:CC:DD:EE:FF" },
    { "name": "GPON_serial",     "value": "HWTC87654321" },
    { "name": "firmware",        "value": "V5R022C10SPC100" }
  ]
}
```

### 19.5 Pré-condições

- ResourceSpecification existe e está Active.
- Para equipamentos em Rack: o Rack existe e tem U_position livre.
- Para ONTs em pontos de instalação: o GeographicSite InstallationPoint existe.

### 19.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Equipment** | POST com spec, place ou containedBy, resourceCharacteristic (Serial obrigatório, MAC, firmware). |
| **RF-002** | **Catálogo de modelos canônicos** | Catálogo pré-populado com modelos V.tal: OLT (Huawei MA5800, ZTE C300, Datacom DM4100); Switches (Cisco Catalyst 9300, Datacom DmSwitch); Routers (Juniper MX, Cisco ASR); ONTs (Huawei HG8145, ZTE F660); CPEs corporativos. |
| **RF-003** | **Atributos por família** | Cada spec define seus resourceSpecCharacteristics: OLT tem PON_density; Switch tem ports_density; Router tem ASN; ONT tem GPON_serial. |
| **RF-004** | **Validação contra spec** | Validação de characteristic obrigatórios (Serial sempre) e validadores (regex de Serial por fabricante). |
| **RF-005** | **Posicionamento físico** | Para Rack-mountable: containedBy=Rack com U_position. Para ONT: place=InstallationPoint. |
| **RF-006** | **Contenção de placas** | Equipamentos modulares (OLT chassi, Switch chassi, Router chassi) aceitam Cards como filhos containsAsChild (REQ-MOD02-015). |
| **RF-007** | **Endereço de gerência** | characteristic IP_management e MAC_management são chaves para integração com sistemas de monitoramento (SNMP, NETCONF). |
| **RF-008** | **Firmware tracking** | Mudança de firmware é evento auditado (publicação TMF688) com versão anterior e nova. |
| **RF-009** | **Substituição (swap) via workflow BPMN** | A operação `POST /resource/{id}/swap` inicia um workflow BPMN orquestrado pelo Módulo 5 (Process Orchestration) que executa as etapas: (1) validação de compatibilidade entre equipamento antigo e novo; (2) reserva do equipamento novo; (3) transição do antigo para `shuttingDown`; (4) swap atômico preservando conexões filhas e ligações com Services; (5) ativação do novo (`Active`); (6) transição do antigo para `Retired`. Cada etapa gera Audit Trail e evento TMF688. **Decisão arquitetural Q-009 (Jun/2026):** swap nunca é operação manual — é sempre orquestrada para garantir rastreabilidade e segurança operacional, especialmente em Centrais críticas. |
| **RF-010** | **Decommissioning** | Procedimento padronizado: cascade events to dependent services, transition to status=suspended, allow physical removal. |

### 19.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Serial é obrigatório para todo Equipment e único globalmente (rastreabilidade do fabricante). |
| **RN-002** | MAC_management, quando informado, é único globalmente. |
| **RN-003** | Equipment rack-mountable deve ter containedBy=Rack ou containedBy=Equipment-pai (cards em chassi). |
| **RN-004** | ONT/CPE tem place=GeographicSite InstallationPoint (sem Rack), modelo cliente. |
| **RN-005** | Mudança de firmware gera evento auditado. |
| **RN-006** | Operação swap preserva: connections, services dependentes, atributos lógicos (IP gerência); altera: Serial, MAC, firmware. |
| **RN-007** | Excluir Equipment com Cards/conexões/Services é bloqueado. |

### 19.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar OLT em Rack** | POST com spec=OLT-Huawei-MA5800-X17, containedBy=Rack-GPON-N01, U_position=1, U_size=9, characteristic[Serial:HW2024001234] retorna 201. |
| **CA-002** | **Criar ONT em InstallationPoint** | POST com spec=ONT-Huawei-HG8145X6, place=site-installation-cliente-12345, characteristic[Serial,MAC] retorna 201. |
| **CA-003** | **Serial duplicado** | POST com Serial já existente retorna 409. |
| **CA-004** | **Sem Rack para rack-mountable** | POST de OLT sem containedBy retorna 400. |
| **CA-005** | **Cards em chassi** | POST de Card com containedBy=OLT-chassi é aceito (REQ-MOD02-015). |
| **CA-006** | **Mudança de firmware** | PATCH em characteristic firmware publica ResourceAttributeValueChangeEvent. |
| **CA-007** | **Swap orquestrado** | POST /resource/{id}/swap retorna 202 com `workflowInstanceId` do Módulo 5; consulta posterior ao Process Orchestration acompanha as etapas até conclusão. Ao final, conexões e Services dependentes apontam para o novo equipamento; o antigo está em status Retired. |

### 19.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Unificação de equipamentos** | Entidades específicas | Subclasses no metamodelo | Device + role | **PhysicalResource via spec (unificado)** |
| **Atributos por família** | Hardcoded | Metamodelo dinâmico | Custom Fields | **resourceSpecCharacteristic versionado** |
| **Posição em Rack** | Sim | Sim | Sim (nativa) | **containedBy.characteristic U_position** |
| **Serial único global** | Sim | Sim | Sim | **Validação canônica** |
| **Swap preservando conexões** | Procedimento manual | Sim | Limitado | **Operação dedicada /swap** |


---

## 20. REQ-MOD02-015 — Card / Módulo (placas de chassi)

> **Entidade TMF:** PhysicalResource Card (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — granularidade necessária para OLTs e roteadores  
> **Status:** Em levantamento · Versão 1.0 — draft

### 20.1 Descrição

Cards são placas que vão dentro de chassis modulares: placas GPON em chassi de OLT, placas de uplink, placas Ethernet em switches, line cards em roteadores. Cada Card é PhysicalResource com containedBy=Equipment (o chassi) e characteristic slot (posição no chassi). Contém suas próprias Ports (REQ-MOD02-016) como filhas. Permite operações granulares: trocar uma placa defeituosa sem desligar o chassi, expandir capacidade adicionando placas, remover placas inativas.

### 20.2 Racional arquitetural

Sem modelagem de Cards, o inventário precisaria embutir todas as portas diretamente no chassi — perdendo a granularidade necessária para representar a operação real: V.tal pode trocar uma placa GPON de 16 portas mantendo o chassi e as outras placas em produção. O Kuwaiba modela Card como subclasse de PhysicalNode. O NetBox tem Module Bays e Modules. O TMF639 trata como PhysicalResource genérico — o Nexus refina via spec específica de Card no catálogo, com characteristics próprios (ports_density, technology, redundancy).

### 20.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Card (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Card-GPON-H805-GPBD, Card-Uplink-H801-X2CS, Line-Card-Cisco-XR-100G). |
| `resourceCharacteristic` | array | Não | slot, Serial, ports_density, technology (GPON/XGSPON/Ethernet). |
| `resourceRelationship` | array | Sim | containedBy (Equipment chassi), containsAsChild (Ports). |

### 20.4 Exemplo de payload

```json
{
  "id": "res-card-gpon-rjbot-001-slot-0",
  "name": "Card GPON Slot 0",
  "resourceSpecification": { "id": "spec-card-gpon-h805-gpbd" },
  "resourceCharacteristic": [
    { "name": "Serial",        "value": "HW-CARD-2024-5678" },
    { "name": "technology",    "value": "GPON" },
    { "name": "ports_density", "value": 16 }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-olt-rjbot-co-01", "@referredType": "Resource" },
      "characteristic": [{ "name": "slot", "value": 0 }] }
  ]
}
```

### 20.5 Pré-condições

- O Equipment chassi existe.
- A spec do Card é compatível com a spec do chassi (resourceSpecRelationship containsAsChild definido).
- O slot está disponível.

### 20.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Card** | POST com spec, containedBy (chassi), characteristic slot e Serial. |
| **RF-002** | **Validação de compatibilidade** | Verificar que a spec do chassi tem a spec do Card em resourceSpecRelationship.containsAsChild. |
| **RF-003** | **Slot único** | Validar que o slot dentro do mesmo chassi é único. |
| **RF-004** | **Geração automática de Ports** | Ao criar Card, criar automaticamente as Ports filhas conforme ports_density da spec. |
| **RF-005** | **Hot swap** | Suportar operação de troca de Card preservando o chassi e demais Cards. |
| **RF-006** | **Limites por chassi** | Validar limite máximo de Cards do chassi (ex.: 17 slots em OLT MA5800-X17). |

### 20.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Card deve ser containedBy de Equipment com spec compatível. |
| **RN-002** | slot é único dentro do mesmo chassi. |
| **RN-003** | Quantidade de Ports filhas é determinada pela spec do Card. |
| **RN-004** | Excluir Card com Ports conectadas é bloqueado. |
| **RN-005** | Troca de Card (swap) preserva Ports e suas conexões quando spec equivalente. |

### 20.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar Card** | POST com spec=Card-GPON-H805, containedBy=OLT-01, slot=0 retorna 201 e cria automaticamente 16 Ports filhas. |
| **CA-002** | **Spec incompatível** | POST de Card em chassi cuja spec não permite retorna 400. |
| **CA-003** | **Slot duplicado** | POST de segundo Card no slot 0 do mesmo chassi retorna 409. |
| **CA-004** | **Bloqueio de exclusão** | DELETE em Card com Ports conectadas retorna 409. |

### 20.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de Card** | Sim (placa) | Subclasse no metamodelo | Module + Module Bay | **PhysicalResource via spec (TMF639)** |
| **Geração automática de Ports** | Limitada | Sim | Sim (Front/Rear Port template) | **Auto-gerado ao criar Card** |
| **Hot swap** | Procedimento | Sim | Sim | **Operação dedicada** |


---

## 21. REQ-MOD02-016 — Port (porta física)

> **Entidade TMF:** PhysicalResource Port (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — ponto de conexão da rede  
> **Status:** Em levantamento · Versão 1.0 — draft

### 21.1 Descrição

Uma Port é o ponto físico de conexão: porta PON em placa de OLT, porta Ethernet em switch, porta SFP em uplink, output de splitter, porta de patch panel. É o objeto mais granular do inventário físico e o que efetivamente se conecta a outras Ports formando a topologia. Cada Port pertence a um Card (ou diretamente a Equipment sem Cards), tem identificador único dentro do pai (port_number), tipo (PON/Ethernet/Console), velocidade e estado operacional próprio (pode estar habilitada/desabilitada independente do Card).

### 21.2 Racional arquitetural

Ports são o nível de granularidade mais comum em queries operacionais ("qual cliente está na porta 0/2/15 da OLT X?"). O modelo deve garantir que esta query seja trivial — daí a importância de manter Ports como Resources de primeira classe (não atributos de Cards). O TMF639 trata Port como PhysicalResource. O NetBox tem entidade Interface com tipo. O Kuwaiba modela como Port subclasse de ConnectivityElement. O Nexus segue o TMF639 com spec específica e characteristic port_number padronizada no formato slot/subslot/port (ex.: "0/0/15" para Card slot 0, subcard 0, porta 15).

### 21.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Port (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Port-GPON, Port-Ethernet-10G, Port-Ethernet-100G, Port-SFP, Port-Console). |
| `resourceCharacteristic` | array | Não | port_number (notação slot/subslot/port), port_type (GPON/Ethernet/SFP/Console), speed_gbps, connector_type (SC/APC, RJ45, LC). |
| `resourceRelationship` | array | Sim | containedBy (Card ou Equipment), connectedTo (outra Port via conexão). |

### 21.4 Exemplo de payload

```json
{
  "id": "res-port-olt-rjbot-co-01-card0-port15",
  "name": "Port 0/0/15",
  "resourceSpecification": { "id": "spec-port-gpon" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "usageState": "idle",
  "resourceCharacteristic": [
    { "name": "port_number",     "value": "0/0/15" },
    { "name": "port_type",       "value": "GPON" },
    { "name": "connector_type",  "value": "SC/APC" },
    { "name": "etiqueta_fisica", "value": "PON-001-15" }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-card-gpon-rjbot-001-slot-0", "@referredType": "Resource" } }
  ]
}
```

### 21.5 Pré-condições

- O Card (ou Equipment sem cards) existe.
- port_number disponível no Card pai.

### 21.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Port (auto via Card)** | Ports são tipicamente criadas automaticamente quando Card é criado (REQ-MOD02-015). |
| **RF-002** | **Criar Port manual** | POST individual permitido em casos especiais (módulos pluggable, expansões). |
| **RF-003** | **Listar Ports** | GET /resource?@type=Port&containedBy={cardId} retorna todas as portas do Card. |
| **RF-004** | **Disponibilidade** | GET /resource/{portId} expõe se está available (sem conexão), reserved (planejada) ou active (conectada). |
| **RF-005** | **Conexão física** | Port se conecta a outra Port via PhysicalResource Connection (REQ-MOD02-018). |
| **RF-006** | **Estado operacional** | operationalState=disable indica porta administrativamente fora de uso, mesmo com cabo conectado. |
| **RF-007** | **Filtros operacionais** | GET /resource?@type=Port&port_type=GPON&resourceStatus=available em determinado Site retorna PON livres para alocação. |
| **RF-008** | **Etiquetagem** | characteristic etiqueta_fisica para correlação com etiqueta visual no campo. |

### 21.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | port_number é único dentro do mesmo Card pai. |
| **RN-002** | Port só pode ter uma conexão física ativa simultaneamente. |
| **RN-003** | Notação padrão para port_number: "slot/subslot/port" (ex.: "0/0/15"); flexível para outros padrões. |
| **RN-004** | Excluir Port com conexão ativa é bloqueado. |
| **RN-005** | Mudança de operationalState publica evento (consumido por monitoramento e Service Assurance). |

### 21.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Auto-geração** | Criar Card de 16 portas cria 16 Ports automaticamente. |
| **CA-002** | **port_number único** | POST de Port com port_number já existente no Card retorna 409. |
| **CA-003** | **Disponibilidade** | GET /resource/{portId} retorna available para porta sem connectedTo. |
| **CA-004** | **Conexão** | PATCH adicionando connectedTo a outra Port é aceito (via REQ-MOD02-018). |
| **CA-005** | **Filtro PON livre** | GET /resource?type=Port&port_type=GPON&status=available em Central X retorna lista. |

### 21.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Port como entidade própria** | Sub-item de Card | ConnectivityElement subclass | Interface | **PhysicalResource Port (TMF639)** |
| **Notação padrão port_number** | Variada | Variada | Padronizada | **slot/subslot/port** |
| **Estado operacional independente** | Limitado | Sim | Sim | **op/adm state próprios** |


---

## 22. REQ-MOD02-017 — Power Feed e Power Outlet (alimentação elétrica)

> **Entidade TMF:** PhysicalResource Power Feed/Outlet (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Média — governança de continuidade e redundância  
> **Status:** Em levantamento · Versão 1.0 — draft

### 22.1 Descrição

Power Feeds e Outlets modelam a infraestrutura elétrica que alimenta os equipamentos: PDUs (Power Distribution Units) em racks, no-breaks/UPS, fontes redundantes em equipamentos. Permite rastrear redundância elétrica ("se o no-break A cair, quais equipamentos perdem alimentação?"), planejar capacidade de potência (soma de potência consumida vs capacidade do PDU) e governar mudanças de continuidade. Inspirado no modelo Power do NetBox (PowerPanel, PowerFeed, PowerPort, PowerOutlet).

### 22.2 Racional arquitetural

A modelagem de energia é frequentemente ignorada em sistemas de inventário — mas no contexto de Centrais de telecomunicações com SLA 99.999%, é capacidade essencial. O NetBox tem o modelo mais maduro entre os legados. O Nexus adapta este modelo ao TMF639: PowerPanel (no-break/UPS) como PhysicalResource pai; PowerFeed (saída do panel) como filho; PowerOutlet (tomada/disjuntor no PDU do rack) como filho do PDU; PowerPort (porta de alimentação no equipamento) consome de PowerOutlet via connectedTo. A grande vantagem deste modelo é responder consultas críticas: "se este no-break for desligado, quais Services são afetados em cascata?".

### 22.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Power Feed/Outlet (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (UPS-Eaton-200kVA, PDU-APC-Rack, PowerOutlet-C19, PowerPort-Equip-Std). |
| `resourceCharacteristic` | array | Não | voltage_V, amperage_A, capacity_W, phase (single/three), connector_type (C13/C19/L6-30). |
| `resourceRelationship` | array | Não | containedBy (PowerFeed em PowerPanel; Outlet em PDU); connectedTo (PowerPort em PowerOutlet). |

### 22.4 Exemplo de payload

```json
// UPS principal da Central
{
  "id": "res-ups-rjbot-co-01-principal",
  "name": "UPS Principal RJ-BOT",
  "resourceSpecification": { "id": "spec-ups-eaton-200kva" },
  "place": { "id": "site-rjbot-co-01-andar2-sala-ups", "@referredType": "GeographicSite" },
  "resourceCharacteristic": [
    { "name": "capacity_kVA", "value": 200 },
    { "name": "capacity_W",   "value": 180000 },
    { "name": "phase",        "value": "three" }
  ]
}

// PowerOutlet em PDU de Rack
{
  "id": "res-pdu-outlet-rjbot-rack-n01-c19-01",
  "name": "Outlet C19-01 Rack-N01",
  "resourceSpecification": { "id": "spec-power-outlet-c19" },
  "resourceCharacteristic": [
    { "name": "voltage_V",     "value": 220 },
    { "name": "amperage_A",    "value": 16 },
    { "name": "connector_type","value": "C19" }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-pdu-rjbot-rack-n01-a", "@referredType": "Resource" } }
  ]
}
```

### 22.5 Pré-condições

- Catálogo de Power Equipment populado.
- Site/Rack onde a alimentação está existe.

### 22.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **PowerPanel (UPS/no-break)** | PhysicalResource representando UPS ou no-break com capacity_W total. |
| **RF-002** | **PowerFeed** | PhysicalResource saída de PowerPanel; alimenta um ou mais PDUs. |
| **RF-003** | **PDU em Rack** | PhysicalResource containedBy Rack; tem N PowerOutlets como filhos. |
| **RF-004** | **PowerOutlet** | PhysicalResource (tomada/disjuntor) com voltage, amperage, connector_type. |
| **RF-005** | **PowerPort em Equipment** | Equipamentos com alimentação têm PowerPorts (1 ou 2 para redundância) que se conectam a PowerOutlets. |
| **RF-006** | **Conexão e redundância** | Equipment com 2 PowerPorts pode conectar em 2 PowerOutlets distintos para redundância A+B. |
| **RF-007** | **Cálculo de carga** | Endpoint /resource/{panel}/loadCalculation soma capacity_W dos PowerPorts conectados em cascata. |
| **RF-008** | **Análise de impacto elétrico** | Endpoint /resource/{panel}/impactAnalysis retorna lista de equipamentos afetados se o panel cair. |
| **RF-009** | **Visualização da árvore** | GET /resource/{panel}/tree retorna árvore Panel → Feeds → PDUs → Outlets → Equipments. |

### 22.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | PowerOutlet conecta a no máximo 1 PowerPort simultaneamente. |
| **RN-002** | Equipment com redundância elétrica (A+B) tem 2 PowerPorts; conectar ambos no mesmo Outlet anula a redundância (gera warning). |
| **RN-003** | Soma de capacity_W dos consumidores não pode exceder capacidade do PowerPanel. |
| **RN-004** | Excluir PowerPanel com Feeds ativos é bloqueado. |

### 22.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Modelagem completa** | Criar UPS → Feed → PDU → Outlet → conectar PowerPort de OLT: cadeia aceita. |
| **CA-002** | **Sobrecarga detectada** | PATCH adicionando PowerPort que excede capacity do panel emite warning. |
| **CA-003** | **Falsa redundância** | Conectar ambos PowerPorts (A+B) do mesmo equipamento ao mesmo Outlet emite warning. |
| **CA-004** | **Análise de impacto** | GET /resource/{ups}/impactAnalysis retorna lista de equipamentos a jusante. |

### 22.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de energia** | Limitada | Limitada | PowerPanel/Feed/Outlet (maduro) | **Adaptação do modelo NetBox ao TMF639** |
| **Redundância A+B** | Limitada | Não nativa | Sim | **Suportada via 2 PowerPorts** |
| **Cálculo de carga** | Manual | Não nativa | Sim (loadCalculation) | **Endpoint dedicado** |
| **Análise de impacto elétrico** | Não | Não | Sim | **Endpoint /impactAnalysis** |


---

## 23. REQ-MOD02-018 — Conexão física (cable termination, patch cord, link)

> **Entidade TMF:** PhysicalResource Connection / Patch Cord (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — habilita topologia ponto a ponto  
> **Status:** Em levantamento · Versão 1.0 — draft

### 23.1 Descrição

A Conexão Física é a ligação efetiva entre duas Ports (ou entre Port e Fiber): jumper interno conectando porta PON da OLT ao Front Port do DIO; patch cord ligando uplink de OLT a switch de agregação; cabo de cobre conectando router e firewall. É o que efetivamente fecha o circuito físico e habilita a comunicação. Modelada como PhysicalResource especializado com dois endpoints (Port-A e Port-Z) e characteristic do meio físico (tipo de cabo, comprimento, conector).

### 23.2 Racional arquitetural

Sem conexões físicas modeladas, o inventário sabe "quais equipamentos existem onde" mas não sabe "como se comunicam". O path computation (REQ-MOD02-012) depende criticamente desta capacidade. O Kuwaiba modela como PhysicalConnection com dois endpoints — robusto. O NetBox modela Cable como entidade com termination_a e termination_z genéricos (pode terminar em vários tipos). O TMF639 prevê PhysicalLink como subclasse de PhysicalResource — o Nexus segue este modelo refinando os tipos: Jumper (interno em rack), PatchCord (entre racks), CableTermination (terminação de cabo OSP em porta).

### 23.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Connection / Patch Cord (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Jumper-SC/APC-3m, PatchCord-LC/LC-5m, CableTermination-FastConnect). |
| `resourceCharacteristic` | array | Não | comprimento_m, connector_a, connector_z, tipo_meio (fibra/cobre), etiqueta_fisica. |
| `resourceRelationship` | array | Sim | endpoint_A (Port), endpoint_Z (Port ou Fiber). |

### 23.4 Exemplo de payload

```json
{
  "id": "res-jumper-rjbot-co-01-001",
  "name": "Jumper OLT-01 → DIO-01 Front 1",
  "resourceSpecification": { "id": "spec-jumper-sc-apc-3m" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "usageState": "active",
  "resourceCharacteristic": [
    { "name": "comprimento_m",   "value": 3 },
    { "name": "connector_a",     "value": "SC/APC" },
    { "name": "connector_z",     "value": "SC/APC" },
    { "name": "tipo_meio",       "value": "fibra-monomodo" },
    { "name": "etiqueta_fisica", "value": "JMP-001" }
  ],
  "resourceRelationship": [
    { "relationshipType": "endpoint_A",
      "resource": { "id": "res-port-olt-rjbot-co-01-card0-port0", "@referredType": "Resource" } },
    { "relationshipType": "endpoint_Z",
      "resource": { "id": "res-frontport-dio01-rjbot-co-01-001", "@referredType": "Resource" } }
  ]
}
```

### 23.5 Pré-condições

- As duas Ports/Fibers a conectar existem e estão available.
- A spec de conector_a/z é compatível com os endpoints.

### 23.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Conexão** | POST com spec, endpoint_A, endpoint_Z, characteristic (comprimento, etiqueta). |
| **RF-002** | **Validação de compatibilidade** | Verificar que os tipos de conector dos endpoints e da conexão são compatíveis. |
| **RF-003** | **Validação de Port disponível** | endpoint_A e endpoint_Z devem estar em status available antes da criação. |
| **RF-004** | **Bidirecionalidade** | Conexão é inerentemente bidirecional — após criação, ambas as Ports passam a usageState=active. |
| **RF-005** | **Etiquetagem** | characteristic etiqueta_fisica para correlação com etiqueta visual no campo. |
| **RF-006** | **Desconexão** | DELETE em Connection libera ambas as Ports (usageState=idle) e gera Audit. |
| **RF-007** | **Operação em massa** | Endpoint /connection/bulk para criar N conexões em transação (cabling em massa de novo rack). |
| **RF-008** | **Eventos** | Publicar ConnectionCreateEvent, ConnectionDeleteEvent. |

### 23.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | endpoint_A != endpoint_Z (não conecta porta a si mesma). |
| **RN-002** | Cada Port pode ter no máximo uma Connection ativa. |
| **RN-003** | Tipos de conector incompatíveis (ex.: SC vs LC sem adaptador) são rejeitados. |
| **RN-004** | Desconexão é livre se não houver Service ativo dependente; se houver, exige confirmação. |
| **RN-005** | Toda conexão/desconexão publica evento (consumido por Service Assurance). |

### 23.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar Jumper interno** | POST com spec=Jumper-SC/APC-3m, endpoint_A=porta-OLT, endpoint_Z=frontport-DIO retorna 201. |
| **CA-002** | **Port já ocupada** | POST conectando Port com Connection existente retorna 409. |
| **CA-003** | **Conector incompatível** | POST com spec=Jumper-SC mas Port com conector LC retorna 400. |
| **CA-004** | **Desconexão libera Port** | DELETE em Connection torna ambas as Ports available de novo. |
| **CA-005** | **Bulk** | POST /connection/bulk com 16 patches retorna 201 com lista. |

### 23.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Conexão física como entidade** | Limitada | PhysicalConnection robusta | Cable com terminations | **PhysicalResource Connection (TMF639)** |
| **Validação de compatibilidade** | Manual | Sim | Sim | **Validação no save** |
| **Bidirecionalidade** | Implícita | Sim | Sim | **Nativa do modelo** |
| **Etiquetagem física** | Sim (campos) | Sim (custom attr) | Sim (label) | **characteristic etiqueta_fisica** |


---

## 24. REQ-MOD02-019 — Front Port / Rear Port (DIO, DG, passagem interna/externa)

> **Entidade TMF:** PhysicalResource Port especializado (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — fronteira entre Inside Plant e Outside Plant  
> **Status:** Em levantamento · Versão 1.0 — draft

### 24.1 Descrição

Front Ports e Rear Ports são pares especiais de Ports em equipamentos passivos de passagem: DIOs (Distribuidores Internos Ópticos), DGs (Distribuidores Gerais), patch panels. Cada par representa uma passagem: o que entra no Front Port "aparece" no Rear Port correspondente (e vice-versa). Esta passagem interna permite que cabos da Outside Plant terminem no Rear Port (lado externo do DIO, voltado para a sala de cabos) enquanto jumpers internos saem do Front Port (lado dos equipamentos). É a fronteira semântica entre Inside Plant e Outside Plant.

### 24.2 Racional arquitetural

Em FTTH, todo cabo da rua que chega à Central termina em um Rear Port de DIO; daí jumpers internos levam o sinal para os Front Ports correspondentes, que se conectam às portas PON das OLTs. Sem modelar essa passagem interna, o path computation (REQ-MOD02-012) quebra na entrada da Central. O NetBox modela explicitamente Front Port e Rear Port em Device Type. O Kuwaiba modela como Port com relação "mirror". O Nexus segue o NetBox: Front Port e Rear Port como Ports especializadas com resourceRelationship type=mirrorOf referenciando o par correspondente.

### 24.3 Mapeamento de atributos TMF

Atributos canônicos da entidade PhysicalResource Port especializado (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (FrontPort-DIO-SC/APC, RearPort-DIO-SC/APC). |
| `resourceCharacteristic` | array | Não | port_number, connector_type, rear_port_position (em FrontPort), front_port_position (em RearPort). |
| `resourceRelationship` | array | Sim | containedBy (DIO/Panel), mirrorOf (par Front↔Rear). |

### 24.4 Exemplo de payload

```json
// FrontPort 1 do DIO
{
  "id": "res-frontport-dio01-rjbot-co-01-001",
  "name": "FrontPort 1 DIO-01",
  "resourceSpecification": { "id": "spec-frontport-dio-sc-apc" },
  "resourceCharacteristic": [
    { "name": "port_number",         "value": 1 },
    { "name": "connector_type",      "value": "SC/APC" },
    { "name": "rear_port_position",  "value": 1 }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-dio-rjbot-co-01-001", "@referredType": "Resource" } },
    { "relationshipType": "mirrorOf",
      "resource": { "id": "res-rearport-dio01-rjbot-co-01-001", "@referredType": "Resource" } }
  ]
}
```

### 24.5 Pré-condições

- O DIO (PhysicalResource) onde Front/Rear estão existe.
- A spec do DIO define o número de portas Front e Rear (sempre igual).

### 24.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Auto-geração no DIO** | Criar DIO de 144F gera automaticamente 144 FrontPorts + 144 RearPorts com relação mirrorOf entre pares. |
| **RF-002** | **Mirror automático** | resourceRelationship mirrorOf bidirecional é criada automaticamente entre Front-N e Rear-N. |
| **RF-003** | **Passagem para path** | Path computation atravessa automaticamente Front↔Rear via mirrorOf como se fosse 1 hop. |
| **RF-004** | **Validação no path** | Path validate verifica que conexões em FrontPort têm contraparte coerente em RearPort. |
| **RF-005** | **Operação de troca de DIO** | Substituir DIO preserva mapeamento Front↔Rear e conexões existentes na operação swap. |

### 24.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Para cada DIO, número de FrontPorts = número de RearPorts. |
| **RN-002** | Relação mirrorOf é 1-para-1 e bidirecional. |
| **RN-003** | mirrorOf é criada automaticamente no provisionamento do DIO e nunca alterada manualmente. |
| **RN-004** | Excluir FrontPort ou RearPort individualmente é bloqueado — só via exclusão do DIO inteiro. |

### 24.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Auto-geração** | POST de DIO 144F cria 288 Ports (144 Front + 144 Rear) com 144 relações mirrorOf. |
| **CA-002** | **Path atravessa DIO** | Path computation com cabo terminando em Rear-1 atravessa para Front-1 e segue. |
| **CA-003** | **Bloqueio de delete** | DELETE em FrontPort individual retorna 405. |

### 24.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Front/Rear Port** | Não modela explicitamente | Sim (Port com mirror) | Sim (nativo) | **Sim — auto-gerado no DIO** |
| **Atravessamento no path** | Manual | Automático | Automático | **Automático via mirrorOf** |
| **Auto-geração com DIO** | Sim | Sim | Sim (template) | **Sim — sem código adicional** |


---

## 25. REQ-MOD02-020 — IPAM (Prefix, IP Address, Range)

> **Entidade TMF:** LogicalResource Prefix/IPAddress (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Crítica — gerência de endereçamento IP  
> **Status:** Em levantamento · Versão 1.0 — draft

### 25.1 Descrição

IPAM (IP Address Management) gerencia o universo de endereços IPv4 e IPv6 da V.tal: blocos /16 públicos da V.tal, subnets /24 alocadas a Centrais, faixas /29 reservadas para gerência de equipamentos, IPs individuais atribuídos a clientes corporativos. Modelado como LogicalResource em duas entidades principais: Prefix (bloco CIDR) e IPAddress (IP individual). Suporta hierarquia de blocos (um /16 contém múltiplos /24, que contém /29, que contém /32), reservas, atribuições a clientes e a interfaces de equipamentos.

### 25.2 Racional arquitetural

IPAM é capacidade onde o NetBox é referência: modelagem hierárquica de Prefix (com containment automático via lookup de subnets), IPAddress como entidade individual, VRF para isolamento. O Kuwaiba e o Netwin têm capacidade limitada nessa dimensão. O Nexus adota o modelo NetBox adaptado ao TMF639 como LogicalResource: Prefix é o bloco CIDR; IPAddress é o IP individual dentro de Prefix. A hierarquia de blocos é navegável por queries CIDR (qual /24 contém o IP X? qual /16 contém o /24 Y?). Toda alocação a clientes/interfaces é via resourceRelationship.

### 25.3 Mapeamento de atributos TMF

Atributos canônicos da entidade LogicalResource Prefix/IPAddress (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | Tipo (Prefix-IPv4, Prefix-IPv6, IPAddress-IPv4, IPAddress-IPv6). |
| `resourceCharacteristic` | array | Não | cidr (notação 10.0.0.0/24), family (4|6), role (Loopback/PointToPoint/Management/Customer), description. |
| `resourceRelationship` | array | Não | containedBy (Prefix pai); assignedTo (Port/Interface ou Service); withinVRF (REQ-MOD02-021). |

### 25.4 Exemplo de payload

```json
// Prefix /24 para clientes corporativos
{
  "id": "res-prefix-200-10-50-0-24",
  "name": "200.10.50.0/24 - Corporate RJ",
  "@type": "LogicalResource",
  "resourceSpecification": { "id": "spec-prefix-ipv4" },
  "resourceStatus": "available",
  "resourceCharacteristic": [
    { "name": "cidr",        "value": "200.10.50.0/24" },
    { "name": "family",      "value": 4 },
    { "name": "role",        "value": "Customer" },
    { "name": "description", "value": "Bloco para clientes corporativos RJ" }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-prefix-200-10-0-0-16", "@referredType": "Resource" } },
    { "relationshipType": "withinVRF",
      "resource": { "id": "res-vrf-corporate-rj", "@referredType": "Resource" } }
  ]
}

// IP atribuído a interface de cliente
{
  "id": "res-ipaddr-200-10-50-100",
  "name": "200.10.50.100",
  "@type": "LogicalResource",
  "resourceSpecification": { "id": "spec-ipaddress-ipv4" },
  "resourceStatus": "available",
  "usageState": "active",
  "resourceCharacteristic": [
    { "name": "address", "value": "200.10.50.100" },
    { "name": "mask",    "value": "255.255.255.252" }
  ],
  "resourceRelationship": [
    { "relationshipType": "containedBy",
      "resource": { "id": "res-prefix-200-10-50-0-24", "@referredType": "Resource" } },
    { "relationshipType": "assignedTo",
      "resource": { "id": "res-port-cpe-cliente-67890", "@referredType": "Resource" } }
  ]
}
```

### 25.5 Pré-condições

- Catálogo de IPAM spec configurado.
- Para subprefix: o prefix pai existe e contém o bloco CIDR.

### 25.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Prefix** | POST com cidr, family, role; sistema valida formato CIDR e calcula containment automático. |
| **RF-002** | **Hierarquia automática** | Calcular Prefix pai automaticamente via lookup do bloco que contém o cidr informado. |
| **RF-003** | **Criar IPAddress** | POST com ip individual; sistema localiza Prefix pai por containment. |
| **RF-004** | **Reservas** | Atributo resourceStatus=reserved indica IP planejado mas não atribuído. |
| **RF-005** | **Atribuição a interface** | Adicionar resourceRelationship assignedTo apontando para Port (interface lógica). |
| **RF-006** | **Atribuição a Service** | Adicionar resourceRelationship assignedTo apontando para Service (cliente corporativo). |
| **RF-007** | **Próximo IP livre** | Endpoint /resource/{prefixId}/nextAvailable retorna próximo IP livre no Prefix. |
| **RF-008** | **Utilização do Prefix** | Endpoint /resource/{prefixId}/utilization retorna % de uso (alocados vs capacidade). |
| **RF-009** | **Conflito de alocação** | Detectar e rejeitar alocação de IP já em uso em mesma VRF. |
| **RF-010** | **Histórico de alocação** | Histórico completo de quais Resources/Services usaram um IP ao longo do tempo (via eventos). |

### 25.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | cidr deve ser sintaticamente válido (CIDR notation IPv4 ou IPv6). |
| **RN-002** | IP duplicado dentro da mesma VRF é proibido. |
| **RN-003** | Excluir Prefix com IPs alocados é bloqueado (libera alocações primeiro). |
| **RN-004** | Reserva tem TTL opcional — após expirar, IP volta a available automaticamente. |
| **RN-005** | Atribuição a Service exige Service ativo (cross-validation com Módulo 3). |

### 25.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar Prefix /16** | POST com cidr=200.10.0.0/16, role=Customer retorna 201. |
| **CA-002** | **Hierarquia automática** | POST de Prefix /24 dentro de /16 já existente preenche automaticamente containedBy. |
| **CA-003** | **Conflito de IP** | POST de IP já alocado em mesma VRF retorna 409. |
| **CA-004** | **Next available** | GET /resource/{prefixId}/nextAvailable retorna próximo IP livre. |
| **CA-005** | **Utilização** | GET retorna {total: 254, allocated: 100, utilization: 39.4}. |
| **CA-006** | **Assignment** | PATCH adicionando assignedTo=Port é aceito; usageState=active. |

### 25.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **IPAM nativo** | Limitado (planilha) | Limitado | Sim — referência | **LogicalResource Prefix/IP (TMF639)** |
| **Hierarquia automática** | Manual | Manual | Sim (lookup CIDR) | **Sim (lookup automático)** |
| **Next available** | Não | Não | Sim (UI) | **Endpoint /nextAvailable** |
| **Utilização** | Manual | Não | Sim (UI) | **Endpoint /utilization** |
| **Conflito de alocação** | Manual | Não | Sim (validação) | **Validação canônica em VRF** |


---

## 26. REQ-MOD02-021 — VRF e Route Target (isolamento de roteamento)

> **Entidade TMF:** LogicalResource VRF e RouteTarget (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — isolamento de tráfego de clientes  
> **Status:** Em levantamento · Versão 1.0 — draft

### 26.1 Descrição

VRF (Virtual Routing and Forwarding) é a instância de roteamento isolada — habilita que o mesmo IP exista em VRFs distintas sem conflito (cliente A pode usar 10.0.0.0/24 em sua VRF; cliente B também em sua). Route Targets (RTs) são identificadores que governam quais VRFs trocam rotas entre si (essencial para serviços L3VPN/MPLS). VRFs são LogicalResource com características próprias e referenciadas por Prefixes e IPs.

### 26.2 Racional arquitetural

VRF é elemento crítico para clientes corporativos (L3VPN) e segmentação interna de gerência (V.tal gerência separada da internet). NetBox modela VRF como entidade nativa. Nexus segue mesmo padrão como LogicalResource — Prefixes têm resourceRelationship withinVRF.

### 26.3 Mapeamento de atributos TMF

Atributos canônicos da entidade LogicalResource VRF e RouteTarget (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | spec-vrf, spec-route-target. |
| `resourceCharacteristic` | array | Não | rd (Route Distinguisher, formato ASN:NN), name, description; para RT: rt_value (formato ASN:NN), action (import/export/both). |
| `resourceRelationship` | array | Não | VRF com RouteTargets (import/export); Prefixes/IPs withinVRF. |

### 26.4 Exemplo de payload

```json
{
  "id": "res-vrf-customer-12345",
  "name": "CUSTOMER-12345",
  "@type": "LogicalResource",
  "resourceSpecification": { "id": "spec-vrf" },
  "resourceCharacteristic": [
    { "name": "rd",          "value": "65000:12345" },
    { "name": "description", "value": "VRF L3VPN cliente 12345" }
  ],
  "resourceRelationship": [
    { "relationshipType": "importsTarget",
      "resource": { "id": "res-rt-12345-export", "@referredType": "Resource" } },
    { "relationshipType": "exportsTarget",
      "resource": { "id": "res-rt-12345-export", "@referredType": "Resource" } }
  ]
}
```

### 26.5 Pré-condições

- ASN da V.tal cadastrado (REQ-MOD02-023) para compor RD/RT.
- Tenant (cliente) cadastrado no Módulo 6 (Party) para vincular ao VRF.

### 26.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar VRF** | POST com name, rd (Route Distinguisher) único. |
| **RF-002** | **Criar Route Target** | POST com rt_value, action (import|export|both). |
| **RF-003** | **Associar RT a VRF** | PATCH em VRF adicionando resourceRelationship com RouteTargets. |
| **RF-004** | **Listar Prefixes/IPs por VRF** | GET /resource?type=Prefix&withinVRF={vrfId} retorna escopo de endereçamento da VRF. |
| **RF-005** | **Validação RD único** | rd é único globalmente — duas VRFs não podem compartilhar o mesmo RD. |
| **RF-006** | **Topologia MPLS** | Endpoint /resource/{vrfId}/topology retorna grafo de VRFs conectadas via RTs comuns. |

### 26.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | rd é único globalmente (validação no save). |
| **RN-002** | Excluir VRF com Prefixes ou IPs vinculados é bloqueado. |
| **RN-003** | RT pode ser referenciado por múltiplos VRFs (relação N:N). |
| **RN-004** | VRF padrão (Internet/Default) tem nome reservado e não pode ser excluído. |

### 26.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar VRF** | POST com name=CUSTOMER-12345 e rd=65000:12345 retorna 201. |
| **CA-002** | **RD duplicado** | POST com rd já existente retorna 409. |
| **CA-003** | **Listar escopo** | GET de Prefixes withinVRF=CUSTOMER-12345 retorna apenas Prefixes da VRF. |
| **CA-004** | **Topologia** | GET /resource/{vrfId}/topology retorna VRFs conectadas via RTs comuns. |

### 26.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **VRF modelado** | Limitado | Limitado | Sim (nativo) | **LogicalResource VRF (TMF639)** |
| **Route Target** | Não | Não | Sim | **LogicalResource RT** |
| **Topologia MPLS** | Não | Não | Limitada | **Endpoint dedicado** |


---

## 27. REQ-MOD02-022 — VLAN e VLAN Group

> **Entidade TMF:** LogicalResource VLAN / VLANGroup (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — segmentação L2  
> **Status:** Em levantamento · Versão 1.0 — draft

### 27.1 Descrição

VLANs (Virtual LANs) são segmentos lógicos L2 identificados por VID (1-4094). VLAN Groups agrupam VLANs por escopo (ex.: todas as VLANs de gerência da Região 1, todas as VLANs de S-VLANs do serviço VoIP). Cada VLAN tem um VID único dentro do seu Group. Atribuídas a Ports e Cards via resourceRelationship.

### 27.2 Racional arquitetural

VLAN é capacidade básica de qualquer inventário de redes. NetBox modela VLAN + VLAN Group como referência. Nexus segue padrão TMF639.

### 27.3 Mapeamento de atributos TMF

Atributos canônicos da entidade LogicalResource VLAN / VLANGroup (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | spec-vlan, spec-vlan-group. |
| `resourceCharacteristic` | array | Não | vid (1-4094), name, role (Management/Customer/Service/Internal/Voice). |
| `resourceRelationship` | array | Não | VLAN withinGroup (VLANGroup); VLAN assignedTo (Port/Card). |

### 27.4 Exemplo de payload

```json
// VLAN Group
{
  "id": "res-vlan-group-mgmt-rj",
  "name": "VLAN Group Management RJ",
  "resourceSpecification": { "id": "spec-vlan-group" },
  "resourceCharacteristic": [
    { "name": "scope", "value": "region-rj" }
  ]
}

// VLAN
{
  "id": "res-vlan-mgmt-rj-100",
  "name": "VLAN 100 - MGMT-RJ",
  "resourceSpecification": { "id": "spec-vlan" },
  "resourceCharacteristic": [
    { "name": "vid",  "value": 100 },
    { "name": "role", "value": "Management" }
  ],
  "resourceRelationship": [
    { "relationshipType": "withinGroup",
      "resource": { "id": "res-vlan-group-mgmt-rj", "@referredType": "Resource" } }
  ]
}
```

### 27.5 Pré-condições

- VLANGroup existe quando referenciado.
- Port ou Card existe quando atribuída.

### 27.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar VLANGroup** | POST com name, scope (region/site/global). |
| **RF-002** | **Criar VLAN** | POST com vid, name, withinGroup opcional. |
| **RF-003** | **Atribuir VLAN a Port** | PATCH em Port adicionando resourceRelationship assignedVLAN. |
| **RF-004** | **VID único por Group** | Validar que vid é único dentro do mesmo VLANGroup. |
| **RF-005** | **Range scanner** | Endpoint /vlan-group/{id}/availableVIDs retorna lista de VIDs livres. |
| **RF-006** | **Q-in-Q** | Suportar VLAN tagging duplo (S-VLAN/C-VLAN) via characteristics adicionais. |

### 27.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | vid no range 1-4094. |
| **RN-002** | Sem VLANGroup, vid é único globalmente; com Group, único dentro do Group. |
| **RN-003** | Excluir VLAN com Ports atribuídas é bloqueado. |

### 27.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar VLAN** | POST com vid=100, name=MGMT, withinGroup=GR-MGMT-RJ retorna 201. |
| **CA-002** | **VID duplicado** | POST de segundo VLAN com mesmo vid no mesmo Group retorna 409. |
| **CA-003** | **Atribuição** | PATCH em Port adicionando VLAN é aceito. |
| **CA-004** | **Available VIDs** | GET retorna lista de VIDs livres no Group. |

### 27.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **VLAN modelado** | Sim | Sim | Sim — referência | **LogicalResource VLAN (TMF639)** |
| **VLAN Group** | Não | Limitado | Sim | **LogicalResource VLANGroup** |
| **Range scanner** | Não | Não | Sim | **Endpoint /availableVIDs** |


---

## 28. REQ-MOD02-023 — ASN e MPLS Label

> **Entidade TMF:** LogicalResource ASN / MPLSLabel (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Média — backbone e MPLS  
> **Status:** Em levantamento · Versão 1.0 — draft

### 28.1 Descrição

ASN (Autonomous System Number) identifica sistemas autônomos no roteamento BGP — a V.tal opera com ASN próprios (públicos para internet, privados para roteamento interno). MPLS Labels são identificadores numéricos da camada de transporte MPLS — alocados por Router e consumidos por circuitos. Ambos são LogicalResource e atribuídos a Routers e Circuits.

### 28.2 Racional arquitetural

Capacidades de backbone que sustentam serviços para ISPs e corporativos. Modelagem TMF639 padronizada.

### 28.3 Mapeamento de atributos TMF

Atributos canônicos da entidade LogicalResource ASN / MPLSLabel (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `resourceSpecification` | EntityRef | Sim | spec-asn, spec-mpls-label, spec-mpls-circuit. |
| `resourceCharacteristic` | array | Não | asn_value (2- ou 4-byte), public (true|false); MPLS: label_value, scope (router/global). |
| `resourceRelationship` | array | Não | ASN assignedTo (Router); MPLSLabel allocatedBy (Router). |

### 28.4 Exemplo de payload

```json
{
  "id": "res-asn-vtal-28631",
  "name": "ASN V.tal 28631",
  "@type": "LogicalResource",
  "resourceSpecification": { "id": "spec-asn" },
  "resourceCharacteristic": [
    { "name": "asn_value", "value": 28631 },
    { "name": "public",    "value": true }
  ]
}
```

### 28.5 Pré-condições

- Router existe quando referenciado.

### 28.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar ASN** | POST com asn_value, public (true|false). |
| **RF-002** | **Atribuir ASN a Router** | PATCH em Router adicionando resourceRelationship hasASN. |
| **RF-003** | **Alocar MPLS Label** | POST de MPLSLabel com label_value e allocatedBy=Router. |
| **RF-004** | **Range de Labels disponíveis** | Endpoint /router/{id}/labelRange retorna labels livres. |

### 28.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | asn_value público é único globalmente. |
| **RN-002** | MPLS Label é único no escopo do Router que aloca. |
| **RN-003** | Excluir ASN com Routers vinculados é bloqueado. |

### 28.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar ASN público** | POST com asn_value=28631 (ASN público V.tal) retorna 201. |
| **CA-002** | **ASN duplicado** | POST com asn_value já existente retorna 409. |
| **CA-003** | **MPLS Label** | POST de label=16001 em router-mx10-rj retorna 201. |

### 28.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **ASN como recurso** | Não modelado | Não modelado | Sim | **LogicalResource ASN** |
| **MPLS Label management** | Não modelado | Não modelado | Limitado | **LogicalResource MPLSLabel** |


---

## 29. REQ-MOD02-024 — Resource Relationship (catálogo de relações tipadas)

> **Entidade TMF:** resourceRelationship com type catalog (TMF639)  
> **Open API TMF:** TMF639 — Resource Inventory Management API  
> **Prioridade:** Alta — governa todas as relações entre Resources  
> **Status:** Em levantamento · Versão 1.0 — draft

### 29.1 Descrição

O catálogo de Resource Relationships define os tipos canônicos de relação entre Resources: containedBy/containsAsChild, connectedTo, endpoint_A/endpoint_Z, mirrorOf, supportedBy, passesThrough, assignedTo, withinVRF, replaces, aliasOf. Este requisito formaliza a tipagem das relações que aparecem espalhadas pelos demais requisitos do módulo, garantindo consistência e habilitando consultas semânticas (grafo).

### 29.2 Racional arquitetural

Sem catálogo formal de relações, as relações tendem a proliferar com nomes inconsistentes, dificultando queries de grafo (REQ-MOD02-012). O Kuwaiba implementa relations especiais com semântica forte. O TMF639 prevê resourceRelationship.relationshipType como string livre — o Nexus formaliza um catálogo controlado de tipos com semânticas definidas. Esta padronização também habilita a UI de criar formulários polimórficos baseados em relação.

> **Decisão arquitetural Q-012 (Jun/2026):** O catálogo de RelationshipType é **extensível via API**, não uma lista fechada no MVP. Segue o mesmo padrão do catálogo de SiteSpecification do Módulo 1 (REQ-MOD01-003): tem um **bootstrap canônico** com os tipos listados na seção 29.1 (containedBy, connectedTo, endpoint_A/Z, mirrorOf, supportedBy, passesThrough, assignedTo, withinVRF, replaces, aliasOf), mas Administradores do Catálogo podem **criar novos RelationshipTypes via API REST** com governança apropriada (Audit Trail + evento TMF688 publicado). Esta decisão preserva a flexibilidade para casos operacionais não previstos no MVP sem comprometer a consistência (tipos novos passam pela mesma validação de unicidade e definição de inverso/simetria).

### 29.3 Mapeamento de atributos TMF

Atributos canônicos da entidade resourceRelationship com type catalog (TMF639):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `relationshipType` | string | Sim | Vem do catálogo controlado de tipos. |
| `resource` | EntityRef | Sim | Resource relacionado. |
| `characteristic` | array | Não | Atributos específicos da relação (ex.: slot, U_position, sequencia). |
| `validFor` | TimePeriod | Não | Período de validade da relação. |

### 29.4 Exemplo de payload

```json
// Catálogo de tipos canônicos
{
  "RelationshipTypes": [
    { "code": "containedBy",       "inverse": "containsAsChild",  "symmetric": false, "scope": "physical" },
    { "code": "containsAsChild",   "inverse": "containedBy",      "symmetric": false, "scope": "physical" },
    { "code": "connectedTo",       "inverse": "connectedTo",      "symmetric": true,  "scope": "physical" },
    { "code": "endpoint_A",        "inverse": "endpoint_Z_of",    "symmetric": false, "scope": "physical" },
    { "code": "endpoint_Z",        "inverse": "endpoint_A_of",    "symmetric": false, "scope": "physical" },
    { "code": "mirrorOf",          "inverse": "mirrorOf",         "symmetric": true,  "scope": "physical" },
    { "code": "supportedBy",       "inverse": "supports",         "symmetric": false, "scope": "physical" },
    { "code": "passesThrough",     "inverse": "traversedBy",      "symmetric": false, "scope": "physical" },
    { "code": "assignedTo",        "inverse": "hasAssigned",      "symmetric": false, "scope": "logical"  },
    { "code": "withinVRF",         "inverse": "containsResource", "symmetric": false, "scope": "logical"  },
    { "code": "withinGroup",       "inverse": "groupContains",    "symmetric": false, "scope": "logical"  },
    { "code": "replaces",          "inverse": "replacedBy",       "symmetric": false, "scope": "lifecycle"}
  ]
}
```

### 29.5 Pré-condições

- Catálogo de RelationshipType configurado.

### 29.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Bootstrap canônico do catálogo** | Pré-popular o catálogo de RelationshipTypes com tipos canônicos com semântica documentada: containedBy/containsAsChild (contenção física); connectedTo (conexão física bidirecional); endpoint_A/endpoint_Z (endpoints de Cable/Connection/Splice); mirrorOf (passagem interna em DIO); supportedBy (estrutura de apoio); passesThrough (trajeto sobre Support Structures); assignedTo (alocação lógica de IPs e VLANs); withinVRF/withinGroup (agrupamento lógico); replaces/replacedBy (substituição com preservação histórica); aliasOf (relação simbólica para integração legada). |
| **RF-002** | **Extensibilidade via API** | Administradores do Catálogo podem criar novos RelationshipTypes via `POST /resourceRelationshipType` informando `code`, `inverse` (opcional), `symmetric` (boolean), `scope` (physical/logical/lifecycle) e `description`. Validação no save: `code` único globalmente; se `inverse` é informado, o tipo inverso deve existir e ser coerente (inverse do inverso é o próprio tipo). |
| **RF-003** | **Inverso automático em relações** | Para relações assimétricas (containedBy↔containsAsChild) criadas em Resources, a inversa é criada automaticamente. |
| **RF-004** | **Validação de tipo em uso** | Bloquear criação de `resourceRelationship` em Resources com `type` fora do catálogo. |
| **RF-005** | **Consulta semântica** | Endpoint `/resource/{id}/relationships?type={type}` retorna relações filtradas por tipo. |
| **RF-006** | **Grafo** | Suporte a queries de grafo via Oracle Property Graph: pathBetween(a,b), descendants(a), connectedComponent(a). |
| **RF-007** | **Eventos do catálogo** | Toda criação/alteração de RelationshipType publica evento TMF688 no tópico `resource.relationshipType.v1`. |
| **RF-008** | **Despublicação controlada** | RelationshipType pode ser transicionado para `Retired` mas não excluído fisicamente; tipos Retired não aceitam novas relações criadas, mas relações existentes permanecem. Bootstrap canônico é protegido — não pode ir para Retired sem aprovação especial. |

### 29.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | `relationshipType` usado em uma relação deve existir no catálogo (Active ou Retired). |
| **RN-002** | Para tipos assimétricos com inverso definido, inversa é criada automaticamente nas relações. |
| **RN-003** | Relações têm `validFor`; podem ser desativadas com endDateTime sem exclusão física. |
| **RN-004** | `code` de RelationshipType é único globalmente. |
| **RN-005** | Tipos do bootstrap canônico (lista do RF-001) são protegidos — alteração estrutural exige aprovação especial; novos tipos via API entram com flag `extension=true` para distinção operacional. |
| **RN-006** | Criação de novo RelationshipType exige role Administrador do Catálogo de Recursos e gera Audit Trail. |

### 29.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Tipo válido em uso** | POST de relationship com type=containedBy é aceito. |
| **CA-002** | **Tipo inválido em uso** | POST com type fora do catálogo retorna 400 com mensagem de tipo desconhecido. |
| **CA-003** | **Inversa automática** | Criar containedBy A→B cria automaticamente containsAsChild B→A. |
| **CA-004** | **Criar novo tipo via API** | POST /resourceRelationshipType com `code=feedsPower`, `inverse=isPoweredBy`, `symmetric=false`, `scope=physical` retorna 201; novo tipo fica disponível para uso. |
| **CA-005** | **Code duplicado** | POST de novo tipo com `code` já existente retorna 409. |
| **CA-006** | **Bootstrap protegido** | PATCH alterando estrutura de tipo canônico (ex.: containedBy) retorna 403 sem role especial. |
| **CA-007** | **Evento publicado** | Criação ou alteração de RelationshipType publica TMF688 em `resource.relationshipType.v1`. |

### 29.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Catálogo formal de relações** | Não | Sim (relations especiais) | Não | **Catálogo controlado com semântica documentada** |
| **Inverso automático** | Não | Sim | Não | **Automático para tipos assimétricos** |
| **Grafo nativo** | Não | Sim | Limitado | **Sobre Oracle Property Graph** |


---

## 30. REQ-MOD02-025 — Eventos de domínio do Resource

> **Entidade TMF:** Event (TMF688)  
> **Open API TMF:** TMF688 — Event Management API  
> **Prioridade:** Alta — habilita Service Assurance e Data Lake  
> **Status:** Em levantamento · Versão 1.0 — draft

### 30.1 Descrição

Toda mudança de estado em Resources publica eventos canônicos TMF688: criação, alteração de atributos, mudança de estado de ciclo de vida, mudança de relação, desativação. Estes eventos são consumidos por: sistemas de Service Assurance (alarmes correlacionados), Service Domain (validação de capacidade), Order Fulfillment (atualização de status de OS), Data Lake (analytics e BI). Este requisito formaliza o catálogo de eventos do Resource.

### 30.2 Racional arquitetural

O Resource Domain é o módulo de maior volume de eventos em V.tal — milhões de Resources com mudanças constantes de estado (alarmes, ocupação, conexões). A publicação canônica TMF688 é o que habilita o Nexus a ser fonte de verdade consumida por outros sistemas (alarmes, Service Assurance, BI). Os tópicos são versionados por entidade conforme padrão de eventos do Módulo 1 (REQ-MOD01-012).

> **Decisão arquitetural Q-006 (Jun/2026):** Service Assurance (alarmes correlacionados, troubleshooting reativo) fica em **ferramenta externa específica no MVP** e **não migra para o Nexus** nesta fase. Contudo, este requisito (REQ-MOD02-025) é desenhado para **preparar terreno para a futura migração** quando ela for decidida. O catálogo de eventos publicados (StateChange, RelationshipChange, PathChange, etc.) já cobre as necessidades canônicas de Service Assurance e segue o padrão TMF688, garantindo que o ferramental externo de hoje consome os mesmos eventos que um módulo futuro de Service Assurance interno consumiria amanhã. Nenhuma adaptação arquitetural específica é necessária neste momento — apenas a disciplina de manter o catálogo de eventos completo, versionado e bem documentado.

### 30.4 Exemplo de payload

```json
// Catálogo de eventos publicados pelo módulo Resource

// Resource (físico e lógico):
//   ResourceCreateEvent
//   ResourceAttributeValueChangeEvent
//   ResourceStateChangeEvent
//   ResourceRelationshipChangeEvent
//   ResourceDeleteEvent (soft)

// Catálogo:
//   ResourceSpecCreateEvent
//   ResourceSpecAttributeValueChangeEvent
//   ResourceCategoryChangeEvent

// Conexões:
//   ConnectionCreateEvent
//   ConnectionDeleteEvent

// Eventos de Path (para invalidação de cache):
//   PathChangeEvent (quando mudança em algum Resource afeta paths cacheados)

// Exemplo de ResourceStateChangeEvent:
{
  "eventId": "evt-018f8c...",
  "eventType": "ResourceStateChangeEvent",
  "eventTime": "2026-06-26T16:00:00Z",
  "source": "/tmf-api/resourceInventoryManagement/v4/resource/res-olt-rjbot-co-01",
  "correlationId": "txn-018f8c...",
  "event": {
    "resource": { "id": "res-olt-rjbot-co-01", "@referredType": "Resource" },
    "previousState": { "operationalState": "enable" },
    "newState":      { "operationalState": "disable", "resourceStatus": "alarm" },
    "statusReason":  "Falha hardware detectada por NMS"
  }
}
```

### 30.5 Pré-condições

- Barramento Kafka disponível.
- Tópicos do módulo Resource criados.

### 30.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Publicação transacional** | Toda escrita em Resource publica evento via outbox pattern. |
| **RF-002** | **Catálogo de eventos** | Manter catálogo formal: ResourceCreateEvent/ResourceDeleteEvent (soft); ResourceAttributeValueChangeEvent; ResourceStateChangeEvent (por dimensão X.731); ResourceRelationshipChangeEvent; ResourceSpecCreateEvent/ResourceSpecAttributeValueChangeEvent; ConnectionCreateEvent/ConnectionDeleteEvent; PathChangeEvent (mudanças que afetam paths cacheados). |
| **RF-003** | **Tópicos canônicos** | Tópicos versionados: resource.physical.v1 (PhysicalResources); resource.logical.v1 (LogicalResources); resource.spec.v1 (Catálogo); resource.relationship.v1; resource.lifecycle.v1. |
| **RF-004** | **Schema Registry** | Schemas em Avro/JSON Schema versionado. |
| **RF-005** | **Idempotência** | eventId UUID v7 único; consumidores deduplicam. |
| **RF-006** | **Correlation** | correlationId rastreável até OS originadora. |
| **RF-007** | **Outbox pattern** | Eventos em outbox local, publicados após commit; falha de publicação tem retry exponencial. |
| **RF-008** | **Dead Letter** | Eventos com falha persistente vão para tópico dead letter para análise. |

### 30.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Eventos são imutáveis após publicação. |
| **RN-002** | Publicação é parte da transação de escrita. |
| **RN-003** | Schemas versionados; breaking changes geram nova versão de tópico. |
| **RN-004** | Retention: 30d em Kafka quente, indefinida em Data Lake. |
| **RN-005** | Eventos não contêm dados sensíveis em claro — apenas referências por ID. |

### 30.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Publicação no commit** | Criação de Resource publica evento no tópico. |
| **CA-002** | **Outbox** | Falha de publicação reverte escrita. |
| **CA-003** | **Schema válido** | Eventos com schema inválido vão para dead letter. |
| **CA-004** | **Catálogo público** | GET /events/catalog retorna lista com schemas e exemplos. |

### 30.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Eventos canônicos** | Não publica | Não publica | Webhooks limitado | **TMF688 nativo** |
| **Outbox pattern** | N/A | N/A | N/A | **Sim** |
| **Schema Registry** | N/A | N/A | N/A | **Avro/JSON versionado** |
| **Catálogo público** | N/A | N/A | N/A | **GET /events/catalog** |


---

## 31. Cenários ilustrativos da modelagem

Esta seção apresenta dois cenários completos para validar como o modelo do Módulo 2 (Resource Domain) opera em conjunto com o Módulo 1 (Geographic) na prática operacional V.tal. Os cenários atravessam catálogo, instâncias, relações de contenção, georreferenciamento e ciclo de vida.

### 31.1 Cenário A — Cliente corporativo em condomínio empresarial

**Contexto:** Cliente corporativo (Empresa Acme) com escritório no Edifício Corporate Tower, Andar 12, Sala 1201 — Rio de Janeiro. Foi contratado serviço FTTH Empresarial 1Gbps com CPE Cisco ISR 1100 dedicado.

**Modelagem completa:**

```
MÓDULO 1 — GEOGRAPHIC (o "onde")
═══════════════════════════════════════════════════════════════════

GeographicAddress (TMF673)
  "Av. das Americas, 4200, Edificio Corporate Tower, Barra da Tijuca, RJ"

GeographicLocation (TMF675)
  Point [-43.3220, -22.9942]

GeographicSite "Edificio Corporate Tower"   (siteSpec: Building)
  ├─ address → GeographicAddress acima (role: principal)
  ├─ place → GeographicLocation acima
  ├─ status = Active
  ├─ characteristic:
  │    └─ tipo_imovel = "Comercial-Corporativo"
  │
  └─ SubSite "Andar 12"                        (siteSpec: Floor)
       └─ SubSite "Sala 1201 - Empresa Acme"   (siteSpec: InstallationPoint)
            ├─ status = Active
            ├─ relatedParty → Tenant "Empresa Acme" (NIO)
            └─ characteristic:
                 └─ ponto_demarcacao = "Patch panel sala telecom"


MÓDULO 2 — RESOURCE DOMAIN (o "o quê")
═══════════════════════════════════════════════════════════════════

NO EDIFÍCIO (sala de telecom do prédio):
  Rack-Sala-Telecom-Corp-Tower (PhysicalResource, spec: Rack-19pol-24U)
    ├─ place → SubSite "Andar Térreo - Sala de Telecom" (do prédio)
    │
    └─ Switch-Acesso-Corp-Tower (PhysicalResource, spec: Switch-Datacom-DM4170)
         ├─ containedBy → Rack (U_position: 18, U_size: 1)
         ├─ Card uplink (containsAsChild)
         │    └─ Port uplink GPON → conectado a cabo drop (Outside Plant)
         └─ Card acesso (containsAsChild)
              └─ Port 1/0/12 → conectado a patch cord → Cliente Acme

NA SALA 1201 DO CLIENTE:
  CPE Cisco ISR 1100 (PhysicalResource, spec: CPE-Cisco-ISR1100-Empresarial)
    ├─ place → SubSite "Sala 1201" (InstallationPoint do cliente)
    ├─ resourceCharacteristic:
    │    ├─ Serial = "CSC-ISR-2024-9876"
    │    ├─ MAC_management = "11:22:33:44:55:66"
    │    └─ firmware = "IOS-XE-17.6.4"
    ├─ Port WAN → connectedTo Port 1/0/12 do Switch-Acesso (via patch cord)
    └─ Port LAN[1..8] → disponíveis para rede interna do cliente

CONEXÃO LÓGICA:
  VRF "CUSTOMER-ACME-12345" (LogicalResource)
    ├─ rd = "65000:12345"
    └─ withinVRF: 200.10.50.100/30 (IP gerência do CPE)

  Prefix 200.10.50.0/24 (LogicalResource)
    └─ withinVRF = "CUSTOMER-ACME-12345"
         └─ contém: IP 200.10.50.100 → assignedTo Port WAN do CPE


MÓDULO 3 — SERVICE DOMAIN (o "para quê")
═══════════════════════════════════════════════════════════════════

ServiceInstance "FTTH-Empresarial-1G-Acme-12345" (TMF638)
  ├─ supportingResource → CPE Cisco ISR 1100
  ├─ supportingResource → Port WAN do CPE
  ├─ supportingResource → VRF "CUSTOMER-ACME-12345"
  ├─ supportingResource → IP 200.10.50.100
  ├─ installationAddress → GeographicAddress "Sala 1201"
  ├─ relatedParty → Subscriber Empresa Acme (via Tenant NIO)
  └─ characteristic:
       ├─ velocidade_mbps = 1000
       ├─ SLA = "Empresarial-99.9"
       └─ horario_atendimento = "24x7"
```

**Observações sobre a modelagem do Cenário A:**

1. O Edifício é GeographicSite tipo Building — não é Resource, é "onde". O modelo Geographic do TMF674 carrega naturalmente edificações comerciais via siteSpecification dedicada.
2. A Sala 1201 é Sub-Site tipo InstallationPoint — o ponto operacional do cliente. Tem relatedParty apontando para o Tenant que comprou o serviço (no caso, NIO, a empresa do grupo V.tal que vende serviços corporativos).
3. O CPE tem `place = SubSite Sala 1201` direto — não está em Rack, está fixado em rack/parede da sala do cliente. O modelo aceita ambos os cenários.
4. O Switch-Acesso fica fisicamente em rack na sala de telecom do prédio — atende N clientes do mesmo edifício. Sua relação com a Sala 1201 é via conexão física (Port LAN do Switch → Port WAN do CPE).
5. A VRF do cliente isola seu endereçamento de outros clientes — pode usar 192.168.x.x internamente sem conflito.
6. O Service Domain (Módulo 3) é quem amarra tudo via supportingResource — referenciando os Resources que materializam o serviço.

### 31.2 Cenário B — Central de telecomunicações (Central Office GPON)

**Contexto:** Central Botafogo (Rio de Janeiro) — Central Office de produção da V.tal, com OLTs GPON alimentando dezenas de armários e milhares de clientes FTTH residenciais e empresariais.

**Visão completa em camadas:**

```
MÓDULO 1 — GEOGRAPHIC (estrutura geográfica)
═══════════════════════════════════════════════════════════════════

GeographicAddress (TMF673)
  "Rua Voluntarios da Patria, 100, Botafogo, RJ, 22270-170"

GeographicLocation (TMF675)
  Point [-43.1809, -22.9035]

GeographicSite "Central Botafogo"           (siteSpec: CentralOffice)
  ├─ address → GeographicAddress acima
  ├─ place → GeographicLocation acima
  ├─ status = Active
  ├─ characteristic:
  │    ├─ CLLI = "RJBTFL01CO0"
  │    ├─ CN = "RJ-SE-01"
  │    ├─ Anel = "AN-RJ-NORTE-01"
  │    └─ SICOM_ID = "12345"
  ├─ parentSite → Regiao "Rio de Janeiro"
  ├─ relatedParty → V.tal (role: owner)
  │
  ├─ SubSite "Andar Terreo - Entrada de Cabos"  (Floor)
  │    └─ SubSite "Sala DG/DIO"                  (Room)
  │
  ├─ SubSite "Andar 1 - Equipamentos GPON"       (Floor)
  │    ├─ SubSite "Sala GPON Norte"              (Room)
  │    └─ SubSite "Sala GPON Sul"                (Room)
  │
  └─ SubSite "Andar 2 - Energia e Climatizacao"  (Floor)
       └─ SubSite "Sala UPS/Nobreak"             (Room)


MÓDULO 2 — RESOURCE DOMAIN (equipamentos e cabos)
═══════════════════════════════════════════════════════════════════

NA SALA DG/DIO:

  Rack DIO-01 (PhysicalResource, spec: Rack-19pol-42U)
    ├─ place → SubSite "Sala DG/DIO"
    ├─ characteristic: { U_total: 42, U_occupied: 28 }
    │
    └─ DIO-01 (PhysicalResource, spec: DIO-144F-SC-APC)
         ├─ containedBy → Rack (U_position: 1, U_size: 4)
         ├─ FrontPort[1..144]  ← jumpers internos vindos do DG
         ├─ RearPort[1..144]   ← cabos primarios saindo para a rede
         └─ mirrorOf: cada FrontPort[N] ↔ RearPort[N]


NA SALA GPON NORTE:

  Rack-GPON-N01 (PhysicalResource, spec: Rack-19pol-42U)
    ├─ place → SubSite "Sala GPON Norte"
    ├─ characteristic: { U_total: 42, U_occupied: 36 }
    │
    └─ OLT-01 (PhysicalResource, spec: OLT-Huawei-MA5800-X17)
         ├─ containedBy → Rack-GPON-N01 (U: 1-9)
         ├─ characteristic:
         │    ├─ Serial = "HW2024001234"
         │    ├─ Tecnologia = "GPON"
         │    ├─ MAC = "00:1A:2B:3C:4D:5E"
         │    └─ Firmware = "V800R022C00SPC100"
         │
         ├─ Card Slot 0 (spec: Card-GPON-H805-GPBD)
         │    ├─ containedBy → OLT-01 (slot: 0)
         │    └─ Port 0/0/0..15  ← 16 portas PON
         │
         ├─ Card Slot 1..15 (Cards GPON adicionais)
         │
         └─ Card Slot 16 (spec: Card-Uplink-H801-X2CS)
              ├─ Port 0/16/0 ← uplink 10G para agregacao
              └─ Port 0/16/1 ← uplink 10G redundante


NA SALA UPS/NOBREAK:

  UPS-Principal (PhysicalResource, spec: UPS-Eaton-200kVA)
    ├─ place → SubSite "Sala UPS/Nobreak"
    └─ characteristic: { capacity_kVA: 200, capacity_W: 180000 }


TRAJETO FISICO DA OLT ATE O CLIENTE:
═══════════════════════════════════════════════════════════════════

Port 0/0/0 (OLT-01, Sala GPON Norte)
  │
  │ Jumper interno (PhysicalResource, spec: Jumper-SC/APC-3m)
  ▼
FrontPort 1 do DIO-01 (Sala DG/DIO)
  │
  │ mirrorOf (passagem interna)
  ▼
RearPort 1 do DIO-01
  │
  │ Cabo CFOA-RJ-BOT-001 (PhysicalResource, spec: Cabo-CFOA-12F)
  │  ├─ place → GeographicLocation LineString
  │  ├─ characteristic: { fibras: 12, comprimento: 2400m }
  │  ├─ endpoint_A → RearPort 1 do DIO-01
  │  ├─ endpoint_Z → Splitter primario em Armario AR-RJ-001
  │  └─ passesThrough: [duto-001, poste-002, poste-003, ...]
  ▼
Splitter Primario 1:8 (em Armario AR-RJ-001, fora da Central)
  ├─ place → GeographicLocation (Point, do armario)
  ├─ output[1] → Cabo CFOI secundario → CTO-001
  └─ output[2..8] → outras CTOs
       │
       ▼
CTO-001 (PhysicalResource, spec: CTO-Furukawa-16P)
  ├─ place → GeographicLocation (Point no poste)
  ├─ supportedBy → Poste-RJBOT-0123
  └─ Splitter Secundario 1:8 (containedBy → CTO-001)
       └─ output[1..8] → Cabos drop → ONTs clientes
            │
            ▼
ONT Cliente XYZ (PhysicalResource, spec: ONT-Huawei-HG8145X6)
  ├─ place → GeographicSite InstallationPoint (residencia do cliente)
  └─ supportingResource de → ServiceInstance FTTH 500Mbps
```

**Observações sobre a modelagem do Cenário B:**

1. **Fronteira Geographic↔Resource explícita:** a Sala GPON Norte é GeographicSite (Módulo 1). O Rack dentro dela é PhysicalResource (Módulo 2) com `place = SubSite Sala GPON Norte`. Tudo dentro do Rack é Resource. O Rack é literalmente "o primeiro Resource".
2. **Atributos V.tal canônicos preservados:** CLLI, CN, Anel, SICOM_ID estão em `characteristic` do GeographicSite — derivados do `specCharacteristic` da SiteSpecification CentralOffice (Módulo 1, REQ-MOD01-006).
3. **DIO modelado corretamente:** Front Ports e Rear Ports gerados automaticamente ao criar o DIO, com relação `mirrorOf` 1-para-1 entre eles. Path computation atravessa o DIO automaticamente.
4. **Cabo georreferenciado com trajeto:** o Cabo CFOA é Resource (Módulo 2) com `place = LineString` (Módulo 1, GeographicLocation). `passesThrough` lista os postes e dutos por onde o cabo passa fisicamente.
5. **Contenção em cascata:** Central → Andar → Sala (Geographic) → Rack → OLT → Card → Port (Resource). Sete níveis de contenção representados sem código adicional, pois cada nível é validado contra catálogo (`allowedChildSpec` em Geographic, `resourceSpecRelationship containsAsChild` em Resource).
6. **Energia rastreada:** o UPS Principal alimenta os Racks de Equipment via cadeia PowerFeed → PDU → PowerOutlet → PowerPort. Em caso de falha do UPS, query `/resource/{ups}/impactAnalysis` retorna todos os Resources afetados.
7. **Path computation fim-a-fim:** consulta `POST /resource/path` com from=Port-OLT-0/0/0 e to=ONT-Cliente-XYZ retorna toda a cadeia (~10 hops), com total_distance, total_attenuation e splice_count calculados em tempo real.

### 31.3 Comparação dos dois cenários

| Aspecto | Cenário A (Cliente Corporativo) | Cenário B (Central Office) |
|---|---|---|
| **Profundidade hierárquica Geographic** | 3 níveis (Building > Floor > InstallationPoint) | 4 níveis (CO > Floor > Room > Cage opcional) |
| **Tipo de SiteSpec do "ponto"** | InstallationPoint | CentralOffice + sub-sites Room |
| **Equipment principal** | CPE (1 unidade, place direto em Sub-Site) | OLT (N unidades em Racks) |
| **Inside Plant local** | Mínimo (CPE em parede/rack pequeno) | Massivo (DIOs, dezenas de Racks, UPS) |
| **Outside Plant relevante** | Apenas o cabo drop até o prédio | Cabos primários para N armários, milhares de clientes |
| **Recursos lógicos relevantes** | VRF dedicada + IPs do cliente | VLANs de gerência, ASN da V.tal, IPs de uplink |
| **Volume típico** | Centenas de milhares (HCs corporativos) | Centenas de Centrais |
| **Frequência de mudança** | Alta (contratos novos, expansões) | Baixa (estrutura estável, equipamentos evoluem) |

### 31.4 Padrões reaproveitáveis

Ambos os cenários compartilham os mesmos padrões de modelagem — comprovando que o modelo Nexus se sustenta em escala e diversidade operacional:

- **Site/Sub-Site como hierarquia geográfica.** Building, CentralOffice, POP, Armário, InstallationPoint são apenas SiteSpecifications diferentes do mesmo modelo TMF674.
- **`place` como amarração canônica.** Todo Resource tem `place` apontando para o ponto da hierarquia geográfica onde está. Sem exceções.
- **Contenção tipada e validada.** `containedBy` / `containsAsChild` modela todas as situações: Card em chassi, Splitter em CTO, equipamento em Rack — com validação contra catálogo.
- **Conexões físicas como entidade própria.** Jumpers, patch cords, cabos drop — todos são PhysicalResource Connection com endpoints tipados.
- **Recursos lógicos como camada sobre os físicos.** VRFs, IPs, VLANs vinculam-se a Ports e Equipments via `assignedTo`.
- **Serviços referenciam Resources via `supportingResource`.** O Service Domain (Módulo 3) é cliente do Resource Domain — nunca duplica modelagem.

---

## 32. Contratos com outros módulos do Nexus

| Módulo | Tipo de consumo | Detalhe |
|---|---|---|
| **Módulo 1 — Geographic** | Síncrono (referência) + Assíncrono (eventos) | Resource referencia GeographicSite/Location via place. Eventos Geographic disparam validações no Resource. |
| **Módulo 3 — Service Domain** | Síncrono (referência) + Assíncrono (eventos) | ServiceInstance.supportingResource referencia Resources. Eventos Resource (StateChange) consumidos por Service Assurance. |
| **Módulo 4 — Order & Fulfillment** | Síncrono (alocação) + Síncrono (Feasibility) | Orders alocam Resources (reservas), consultam disponibilidade via /availability. TMF664 Resource Function Activation usado para configurar Resources. |
| **Módulo 5 — Process Orchestration** | Síncrono (BPMN tasks) | Workflows para swap de equipamento, decommissioning, mudanças críticas consultam e alteram Resources via API. |
| **Módulo 6 — Party & Tenant** | Síncrono (referência) | Resources têm relatedParty com Owner, Manufacturer, Vendor, Tenant. Validação de existência da Party no save. |
| **Módulo 7 — Analytics & Events** | Assíncrono (consumidor) | Todos os eventos TMF688 publicados pelo Resource Domain são consumidos pelo Data Lake. |
| **Módulo 8 — Platform & Admin** | Síncrono (RBAC, Audit) | RBAC granular por tipo de Resource (ex.: apenas Engenharia OSP edita postes/dutos). |

---

## 33. Questões em aberto

| ID | Questão | Status / Decisão | Responsável |
|---|---|---|---|
| **Q-001** | Catálogo inicial de ResourceSpecifications V.tal: quais modelos exatos de OLT, ONT, Switch, Router são suportados no MVP? Lista canônica precisa ser fechada. | *Aberta* | *Engenharia V.tal + Produto* |
| **Q-002** | Importação de catálogo NetBox device-type-library para acelerar bootstrap: licenciamento e curadoria. | *Aberta* | *Arquitetura + Engenharia* |
| **Q-003** | Migração de Resources do Netwin: preserva IDs ou gera novos UUIDs? Estratégia de cross-reference durante dual-running. | ✅ **Decidido (Jun/2026):** o Nexus **sempre gera seus próprios UUIDs v7** como identificadores canônicos. IDs legados são preservados como characteristics do grupo `_origin` na entidade (ver seção 33.2). O Nexus é agnóstico à origem — mesma estrutura serve Netwin, NetworkCore, Geosite, OZMAP ou qualquer outro sistema sem alteração de schema. Decisão alinhada ao princípio estabelecido no Módulo 1 (VTN-HLD-MOD01-GEO seção 19.1). | *Migração* |
| **Q-004** | Oracle Property Graph: dimensionamento de licença para 22M+ HPs com queries de path em performance. | *Aberta* | *Arquitetura + Plataforma* |
| **Q-005** | Postes de terceiros (concessionárias): fonte de verdade do cadastro. | ✅ **Decidido (Jun/2026):** o cadastro fica integralmente na V.tal — o Nexus é fonte de verdade. Postes de terceiros são modelados como Support Structures com `owner` (concessionária) e `contractRef` (contrato de aluguel), mas o ciclo de vida do cadastro é gerido pela V.tal, sem integração de sincronização com sistemas das concessionárias. Refletido em REQ-MOD02-008. | *OSP V.tal + Arquitetura* |
| **Q-006** | Service Assurance (alarmes correlacionados): fronteira com o Nexus. | ✅ **Decidido (Jun/2026):** Service Assurance fica em ferramenta externa específica e **não migra para o Nexus no MVP**. Contudo, o Resource Domain do Nexus **deve estar preparado para futura migração**, publicando eventos TMF688 (REQ-MOD02-025) que possam ser consumidos por Service Assurance hoje (externo) e amanhã (interno ao Nexus). Não há ação imediata além de manter o catálogo de eventos completo e extensível. | *Arquitetura Nexus + Operações* |
| **Q-007** | Modelagem detalhada de Fibers internas a Cables: 100% das fibras de cada cabo são modeladas, ou apenas as ocupadas? Trade-off de volume vs completude. | *Aberta* | *Arquitetura + OSP V.tal* |
| **Q-008** | IPAM legado da V.tal (planilhas, sistemas internos): estratégia de carga inicial para MVP. | *Aberta* | *Backbone + Arquitetura* |
| **Q-009** | Operação de swap de equipamento: workflow automatizado (Módulo 5) ou procedimento manual com Audit? | ✅ **Decidido (Jun/2026):** sim — operação de swap usa **workflow automatizado orquestrado pelo Módulo 5 (Process Orchestration)**, com BPMN definindo etapas (validação, reserva do equipamento novo, transição shuttingDown do antigo, swap atômico preservando conexões, ativação do novo, transição Retired do antigo). Audit Trail é gerado em cada etapa. Refletido em REQ-MOD02-014 RF-009. | *Operações + Produto* |
| **Q-010** | Cache de paths computados (REQ-MOD02-012): TTL configurável por tipo de path? Política de invalidação em massa. | *Aberta* | *Arquitetura + Performance* |
| **Q-011** | Modelagem de fontes de equipamento (PowerSupply interno vs PowerOutlet externo): granularidade necessária para Service Assurance? | *Aberta* | *Engenharia + Operações* |
| **Q-012** | Catálogo de ResourceRelationships: lista fechada no MVP ou extensível via API? | ✅ **Decidido (Jun/2026):** **extensível via API**. Catálogo de RelationshipType segue o mesmo padrão do catálogo de SiteSpecification (Módulo 1, REQ-MOD01-003): tem um bootstrap de tipos canônicos (lista da REQ-MOD02-024), mas Administradores do Catálogo podem criar novos tipos via API com governança (Audit Trail + evento TMF688). Refletido em REQ-MOD02-024. | *Arquitetura* |

### 33.1 Decisões resolvidas e seus impactos arquiteturais

| Decisão | Requisitos impactados | Mudança aplicada |
|---|---|---|
| **Q-005 — Postes próprios na V.tal** | REQ-MOD02-008 | Sem integração externa de sincronização; `owner` e `contractRef` permanecem como characteristics, sem necessidade de adapter de leitura para sistemas de concessionárias. |
| **Q-006 — Service Assurance externa, preparar para futura migração** | REQ-MOD02-025 | O catálogo de eventos TMF688 já cobre as necessidades futuras de Service Assurance (StateChange, RelationshipChange, PathChange). Nenhum requisito é eliminado; apenas a integração de consumo desses eventos pelo módulo de Service Assurance fica diferida. |
| **Q-009 — Swap via Módulo 5 (BPMN)** | REQ-MOD02-014 (RF-009 Substituição), REQ-MOD02-019 (swap de DIO) | Operação `/resource/{id}/swap` deixa de ser um endpoint atômico simples — passa a iniciar um workflow BPMN no Módulo 5, que executa as etapas de forma orquestrada e auditável. |
| **Q-012 — Catálogo de Relationships extensível** | REQ-MOD02-024 | RelationshipType vira entidade com CRUD via API (não mais lista fechada hardcoded). RF-001 do REQ-024 atualizado para refletir governança via Administrador do Catálogo. |
| **Q-003 — Identidade e proveniência na migração** | REQ-MOD02-001, REQ-MOD02-005 e todos os demais Resources | Nexus gera UUID v7 canônico próprio; IDs legados preservados no grupo `_origin` como characteristics somente-leitura. Ver seção 33.2. |

### 33.2 Decisão de migração — Identidade e proveniência de Resources

> **Princípio arquitetural (Jun/2026):** O Nexus é agnóstico à origem de seus dados. Todo identificador canônico é UUID v7 gerado pelo próprio Nexus, independente do sistema de origem. IDs legados são preservados como atributos customizados (`characteristic`) no grupo convencional `_origin`, exclusivamente para fins de rastreabilidade histórica, auditoria e suporte ao período de dual-running. Este princípio é o mesmo estabelecido para entidades geográficas em VTN-HLD-MOD01-GEO seção 19.1 — é transversal a toda a plataforma Nexus.

**Sistemas de origem cobertos:**

| Sistema de origem | Recursos migrados |
|---|---|
| Netwin (Openlabs) | Equipamentos de Inside Plant, cabos, splitters, CTOs |
| Hexagon/Octave NetworkCore | Recursos de Outside Plant — Região 2 |
| Octave EAM | Ativos físicos com ciclo de vida (racks, UPS, equipamentos gerais) |
| Geosite OSP | Postes, dutos, manholes, trajetos de cabos |
| OZMAP | Recursos OSP e Inside Plant da Um Telecom (pós-M&A) |
| UMBOX | Recursos lógicos (IPs, VLANs) da Um Telecom (pós-M&A) |

**Grupo canônico `_origin` para PhysicalResource e LogicalResource:**

| Characteristic | Tipo | Obrigatório na migração | Descrição |
|---|---|:---:|---|
| `_origin.system` | string | Sim | Nome do sistema de origem (ex.: `Netwin`, `NetworkCore`, `Geosite`, `OZMAP`, `OctaveEAM`). |
| `_origin.id` | string | Sim | Identificador da entidade no sistema de origem (ex.: `"EQP-12345"`, `"CAB-00987"`). |
| `_origin.entity` | string | Sim | Nome do tipo de entidade no sistema de origem (ex.: `"Equipment"`, `"Cable"`, `"Splitter"`, `"IPPool"`). |
| `_origin.migratedAt` | datetime | Sim | Timestamp ISO 8601 da migração. |
| `_origin.migratedBy` | string | Sim | Identificador do job de migração (ex.: `"migration-job-netwin-osp-wave2-v1"`). |
| `_origin.url` | string | Não | Deep link para a entidade no sistema de origem (quando disponível). |
| `_origin.extra` | JSON string | Não | Atributos do sistema de origem sem correspondência no Nexus, preservados como JSON bruto para auditoria. Útil especialmente para campos proprietários do Netwin e Octave EAM. |

**Exemplo de OLT migrada do Netwin:**

```json
{
  "id": "res-018fa3c2-1b7e-7c04-a9d2-3e5f1a2b4c77",
  "@type": "PhysicalResource",
  "name": "OLT-RJ-BOT-CO-01",
  "resourceSpecification": { "id": "spec-olt-huawei-ma5800-x17" },
  "resourceStatus": "available",
  "operationalState": "enable",
  "administrativeState": "unlocked",
  "resourceCharacteristic": [
    { "name": "Serial",          "value": "HW2024001234" },
    { "name": "Tecnologia",      "value": "GPON" },
    { "name": "_origin.system",      "value": "Netwin" },
    { "name": "_origin.id",          "value": "EQP-00421" },
    { "name": "_origin.entity",      "value": "ActiveEquipment" },
    { "name": "_origin.migratedAt",  "value": "2026-10-01T02:00:00Z" },
    { "name": "_origin.migratedBy",  "value": "migration-job-netwin-isp-wave1-v1" },
    { "name": "_origin.extra",       "value": "{\"netwin_rack_position\":\"U1-U9\",\"netwin_status_code\":\"OP\"}" }
  ]
}
```

**Exemplo de cabo migrado do Geosite OSP:**

```json
{
  "id": "res-018fa3c2-2c8f-7d05-b0e3-4f6a2b3c5d88",
  "@type": "PhysicalResource",
  "name": "CFOA-RJ-BOT-001",
  "resourceSpecification": { "id": "spec-cabo-cfoa-12f" },
  "resourceCharacteristic": [
    { "name": "numero_fibras",       "value": 12 },
    { "name": "_origin.system",      "value": "Geosite" },
    { "name": "_origin.id",          "value": "CAB-GEO-00987" },
    { "name": "_origin.entity",      "value": "OpticalCable" },
    { "name": "_origin.migratedAt",  "value": "2026-09-20T03:00:00Z" },
    { "name": "_origin.migratedBy",  "value": "migration-job-geosite-osp-wave1-v2" }
  ]
}
```

**Capacidades habilitadas pelo grupo `_origin`:**

- **Consulta por ID legado:** `GET /resource?characteristic._origin.system=Netwin&characteristic._origin.id=EQP-00421` retorna o Resource correspondente no Nexus.
- **Relatório de migração por wave:** `GET /resource?characteristic._origin.migratedBy=migration-job-netwin-isp-wave1-v1` lista todos os Resources migrados em uma wave específica.
- **Cobertura de migração:** comparar contagem de entidades no sistema legado com `GET /resource?characteristic._origin.system=Netwin&count=true` para validar completude da migração.
- **Auditoria retroativa:** após descomissionamento do Netwin, o histórico de origem permanece no Nexus indefinidamente.

**Regras de negócio do grupo `_origin`:**

- `_origin.*` são characteristics somente-leitura após a criação — PATCH em qualquer `_origin.*` retorna 403 para usuários operacionais; aceito apenas por role `MigrationJob`.
- Uma entidade pode ter múltiplos grupos `_origin` numerados (`_origin_1.*`, `_origin_2.*`) para casos de migração em cascata entre sistemas.
- `_origin.*` não são validados pelo `resourceSpecCharacteristic` das specs — são transversais a todos os tipos de Resource.
- ResourceSpecifications também podem ter `_origin.*` no catálogo quando migradas (ex.: Device Types importados do NetBox device-type-library com origem documentada).
- `_origin.extra` não tem validação de schema — preservação bruta intencional para garantir que nenhuma informação do legado seja perdida.

---

## 34. Controle de revisões

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | Junho 2026 | Produto — V.tal Nexus | Versão inicial do HLD do Módulo 2 — Nexus Resource Domain, com 25 requisitos alinhados a TMF634 e TMF639, e seção de cenários ilustrativos (Cliente Corporativo e Central Office). |
| 1.1 | Junho 2026 | Produto — V.tal Nexus | Incorporação de 4 decisões arquiteturais: Q-005 (postes), Q-006 (Service Assurance), Q-009 (swap via BPMN), Q-012 (catálogo de Relationships extensível). Adicionada seção 33.1. |
| 1.2 | Junho 2026 | Produto — V.tal Nexus | Resolução de Q-003 (estratégia de migração e identidade): definição do princípio de agnósticidade à origem, grupo canônico `_origin` para todas as entidades de Resource (PhysicalResource, LogicalResource e ResourceSpecification), tabela de sistemas cobertos (Netwin, NetworkCore, Octave EAM, Geosite OSP, OZMAP, UMBOX), payloads de exemplo (OLT e cabo), capacidades habilitadas e regras de negócio. Adicionada seção 33.2. |

---

*V.tal Nexus — Documento Confidencial — Uso Interno*
