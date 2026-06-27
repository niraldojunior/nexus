# V.TAL NEXUS — Network Inventory Platform

## HLD Módulo 3 · Nexus Service Domain

**Service Catalog, Service Inventory & Customer/Resource-Facing Service Management**

TMFC002 + TMFC022 · TMF633 / TMF638 / TMF688

| Campo | Valor |
|---|---|
| **Document Reference** | VTN-HLD-MOD03-SVC |
| **Sequência de HLD** | HLD04 (4º documento) · Módulo 3 da arquitetura |
| **Versão** | 1.0 — draft |
| **Data** | Junho 2026 |
| **Documento âncora** | VTN-HLD-OVERVIEW-001 |
| **HLDs predecessores** | VTN-HLD-MOD01-GEO (Geographic) · VTN-HLD-MOD02-RES (Resource) |
| **TMFCs implementados** | TMFC002 — Service Inventory Mgmt; TMFC022 — Service Catalog Mgmt |
| **Open APIs** | TMF633, TMF638, TMF688 |
| **Requisitos cobertos** | REQ-MOD03-001 a REQ-MOD03-016 |
| **Status** | Em elaboração |

---

## 1. Propósito do módulo

O Módulo 3 — Nexus Service Domain implementa os componentes ODA **TMFC022 (Service Catalog Management)** e **TMFC002 (Service Inventory Management)** através das Open APIs **TMF633 (Service Catalog)** e **TMF638 (Service Inventory)**. É o módulo que responde **"para quê / para quem"** existe a rede V.tal: que serviço está ativo sobre cada porta, ONT, VLAN ou circuito, e a quem ele é entregue.

Fecha a tríade fundamental do inventário, em cima da fundação dos Módulos 1 e 2:

| Pergunta | Módulo | Standard |
|---|---|---|
| **Onde** está o elemento de rede? | 1 — Geographic | TMF673/674/675 |
| **O quê** existe (físico e lógico)? | 2 — Resource | TMF634/639 |
| **Para quê / para quem** existe? | **3 — Service** | **TMF633/638** |

O Service Domain nunca duplica modelagem de Resource. Ele modela o **intangível** — o serviço contratado/entregue — e amarra-se ao mundo físico/lógico exclusivamente por **referência** (`supportingResource`). A OLT, a porta PON, a VLAN, o VRF e o IP continuam sendo entidades do Módulo 2; o serviço apenas aponta para eles.

Este é o terceiro HLD de módulo da plataforma (quarto documento da série, após o Overview) e estende o modelo arquitetural estabelecido em VTN-HLD-OVERVIEW-001, reaproveitando integralmente as decisões de fronteira já firmadas (Decisão 5.2 — Home Passed; cenários de FTTH validados no HLD03).

### 1.1 V.tal como rede neutra — o serviço de cliente é, em regra, atacadista

Premissa estratégica que molda todo o domínio: a V.tal é uma **infraestrutura de fibra neutra (wholesale)**. O cliente primário do serviço, na maioria dos casos, **não é o assinante residencial final, mas o ISP** (provedor) que revende a conectividade. Isso tem três consequências diretas no modelo:

- O **Customer Facing Service (CFS)** é, tipicamente, entregue a um **Tenant ISP** (ex.: bitstream GPON vendido ao Provedor X), e não ao usuário final.
- O **multi-tenant nativo** (princípio 4.6 do Overview) deixa de ser um detalhe e passa a ser estrutural: o `relatedParty[role=subscriber]` do CFS aponta quase sempre para um Tenant da camada de Party (Módulo 6).
- O modelo precisa acomodar **os dois mundos simultaneamente**: wholesale (CFS → ISP) e atendimento direto (CFS → cliente corporativo/residencial direto V.tal), sem bifurcar o schema.

Esta dualidade é tratada como decisão arquitetural explícita (seção 33, Decisão D-2).

---

## 2. Escopo

### 2.1 Dentro do escopo

- **Catálogo de Serviços (TMF633):** ServiceSpecification (com as duas especializações **CFS Spec** e **RFS Spec**), ServiceCategory (organização hierárquica navegável), ServiceCandidate (oferta publicável/comercializável), Service Level Specification (SLA como parte da spec).
- **Service Inventory base (TMF638):** CRUD canônico de Service, máquina de estados de ciclo de vida TMF638, soft-terminate.
- **Customer Facing Service (CFS):** o serviço como visto pelo cliente/ISP — o "o que foi contratado" — ancorado por **SubscriberID**.
- **Resource Facing Service (RFS):** a realização técnica do serviço — o "como a rede entrega" — que consome Resources (sessão GPON, S-VLAN/C-VLAN do assinante, circuito L2/L3, VRF).
- **Amarração e composição:** `supportingResource` (Service → Resource), `supportingService` (CFS → RFS), `serviceRelationship` (relações tipadas entre serviços), `place`/`serviceLocation` (vínculo geográfico).
- **Serviços ilustrativos V.tal (seção didática):** Banda Larga FTTH/Bitstream GPON, Empresarial/Link Dedicado (EILD, L2/L3 VPN), CloudVoIP.
- **Transversais:** catálogo formal de Service Relationships, eventos de domínio TMF688, grupo `_origin` de proveniência.

### 2.2 Fora do escopo (tratado em outros módulos)

- Modelagem geoespacial (Site, Address, Location): **Módulo 1 — Nexus Geographic**.
- Recursos físicos e lógicos (OLT, porta, ONT, VLAN, VRF, IP, circuito físico): **Módulo 2 — Nexus Resource**.
- **Service Ordering** (TMF641) — captação e decomposição de ordem de serviço: **Módulo 4 — Nexus Order & Fulfillment**.
- **Service Qualification / Viabilidade / Home Passed** (TMF645): **Módulo 4 — Nexus Order & Fulfillment**. Ver Decisão D-1 (seção 33): Home Passed **não** é instância persistida no Service Inventory.
- **Subscriber/Customer/ISP como entidade Party** (a entidade jurídica, contatos, contrato comercial): **Módulo 6 — Nexus Party & Tenant** (referenciada aqui via `relatedParty`).
- **Orquestração** de ativação/desativação com aprovação humana e tarefas BPMN: **Módulo 5 — Nexus Process Orchestration**.
- **Service Assurance** (correlação de alarmes sobre serviço, troubleshooting reativo): externa no MVP — consumidora dos eventos TMF688 publicados por este módulo (Decisão 5.4 do Overview).
- **Provisionamento físico/lógico efetivo** (configurar a OLT, criar a VLAN no equipamento): **Módulo 4** via TMF664 (Resource Function Activation) sobre o Resource Domain. O Service Domain registra o resultado; não executa a configuração.
- Dashboards e analytics sobre serviços (penetração, churn, ocupação): **Módulo 7 — Nexus Analytics & Events**.
- Auditoria global e RBAC granular: **Módulo 8 — Nexus Platform & Administration**.

---

## 3. Modelo conceitual TMF

O módulo implementa os TMFCs TMFC022 e TMFC002 expondo quatro grupos de entidades canônicas:

| Entidade | API | Papel no modelo |
|---|---|---|
| **ServiceSpecification** | TMF633 | Definição de tipo de serviço no catálogo. Duas especializações: **CustomerFacingServiceSpecification** e **ResourceFacingServiceSpecification**. |
| **ServiceCategory** | TMF633 | Organização hierárquica navegável do catálogo (Acesso > Banda Larga > Bitstream GPON). |
| **ServiceCandidate** | TMF633 | Exposição de uma ServiceSpecification como oferta publicável/comercializável (controla visibilidade no catálogo de vendas). |
| **Service** | TMF638 | Instância concreta de serviço. Duas especializações: **CustomerFacingService (CFS)** e **ResourceFacingService (RFS)**. |

### 3.1 Hierarquia de tipos TMF

```
ServiceSpecification (abstrato — TMF633)
  ├─ CustomerFacingServiceSpecification   (o que se vende: "Bitstream GPON 700M")
  └─ ResourceFacingServiceSpecification    (como se entrega: "Sessão GPON + S/C-VLAN")

Service (abstrato — TMF638)
  │
  ├─ CustomerFacingService (CFS)
  │     ├─ ancorado por SubscriberID
  │     ├─ relatedParty → Subscriber (Tenant ISP | cliente direto)
  │     ├─ supportingService → [RFS...]      (composição CFS → RFS)
  │     ├─ place / serviceLocation → GeographicSite/Address (Módulo 1)
  │     └─ NÃO referencia Resource diretamente (faz via RFS)
  │
  └─ ResourceFacingService (RFS)
        ├─ supportingResource → [Resource...]  (ONT, Port PON, VLAN, VRF, IP — Módulo 2)
        ├─ supportingService → [RFS...]        (RFS pode compor outro RFS)
        └─ NÃO tem SubscriberID nem cliente (é interno à rede)
```

### 3.2 Fronteira com o Módulo 2 (Resource) — a regra estruturante

Assim como o **Rack** é a linha divisória entre Geographic e Resource (Decisão 5.1 do Overview), o Service Domain tem **duas fronteiras** que precisam ser ditas com a mesma clareza:

**Fronteira externa — Service ↔ Resource (intangível vs. coisa):**

> O Service Domain modela apenas o **intangível**. Ele **nunca possui** um recurso físico ou lógico. A relação é sempre `supportingResource` (referência por ID), nunca contenção. Se a entidade tem serial, MAC, posição em U, coordenada, fibra ou porta — é Resource (Módulo 2). Se a entidade é "aquilo que o cliente contratou" ou "aquilo que a rede entrega logicamente" — é Service (Módulo 3).

**Fronteira interna — CFS ↔ RFS (comercial vs. técnico):**

> **CFS** responde *o que o cliente vê e contrata* (a oferta, o SLA comercial, o SubscriberID). **RFS** responde *como a rede realiza tecnicamente* (a sessão, o circuito, o par de VLANs). Um CFS é realizado por um ou mais RFS (`supportingService`); cada RFS consome Resources (`supportingResource`). O cliente nunca enxerga o RFS; a rede nunca opera o CFS.

```
[Camada comercial]   CFS  "Bitstream GPON 700M — Provedor X" (SubscriberID)
                       │ supportingService
[Camada técnica]     RFS  "Acesso GPON + S/C-VLAN do assinante"
                       │ supportingResource
[Camada Resource]    ONT · Port PON · S-VLAN · C-VLAN · perfil de banda   (Módulo 2)
                       │ place
[Camada Geographic]  Endereço de instalação · InstallationPoint           (Módulo 1)
```

### 3.3 Fronteira com o Módulo 4 (Order) — a decisão Home Passed

O Service Domain **não** modela viabilidade nem Home Passed. Reafirmando a Decisão 5.2 do Overview e tornando-a contrato deste módulo:

| Conceito | Natureza | Onde mora |
|---|---|---|
| **Home Passed (HP)** | Capacidade de rede disponível em um endereço. É derivada de Geo + Resource. | **GeographicAddress** (Módulo 1) + consulta de viabilidade **TMF645** (Módulo 4). **Não** é Service. |
| **Home Connected (HC)** | Serviço efetivamente ativo no endereço. | **ServiceInstance** (este módulo) com `place` no InstallationPoint e `supportingResource` nos recursos reais. |

A transição HP → HC é o **trigger de criação** do CFS+RFS neste módulo. Antes da ativação, não existe Service no inventário — existe apenas endereço viável (Geo) e, eventualmente, uma ServiceQualification efêmera (Order). Isso preserva a escala: ~22M de HPs **não** geram 22M de Services.

---

## 4. Princípios de design do módulo Service

### 4.1 Catálogo + Instância (TMF633 + TMF638)

Todo Service é instância de uma ServiceSpecification. O catálogo (TMF633) define os tipos; o inventory (TMF638) guarda as instâncias. Mesmo par de camadas já adotado em Resource (TMF634+639) e Geographic (SiteSpecification + Site). Consistência transversal da plataforma.

### 4.2 Separação CFS / RFS como cidadão de primeira classe

A separação Customer-Facing / Resource-Facing é o coração do SID (TM Forum Information Framework) e o principal diferencial frente a inventários resource-centric. Permite: (a) reusar um mesmo RFS para múltiplos CFS; (b) trocar a realização técnica sem alterar o contrato comercial; (c) modelar wholesale (CFS ao ISP) sobre a mesma rede física do varejo.

### 4.3 Serviço referencia Resource, nunca duplica

`supportingResource` é a única ponte para o Módulo 2. Nenhum atributo físico/lógico é copiado para o Service. Se o RFS precisa saber a porta PON, ele referencia o Resource Port — não guarda `slot/port` como string. Elimina divergência de dados, problema crônico dos legados.

### 4.4 SubscriberID como identidade do serviço de cliente

Todo CFS tem um `serviceCharacteristic` canônico **SubscriberID** — o identificador estável do serviço na perspectiva do cliente/BSS, independente do `id` UUID v7 interno. É a chave de correlação com OSS/BSS, com o sistema de billing do ISP e com o atendimento. Gerado pelo Nexus (Nexus-native) a partir da Fase 3 do roadmap.

### 4.5 Ciclo de vida multi-estado (TMF638)

O Service segue a máquina de estados canônica TMF638 (`feasibilityChecked → designed → reserved → inactive → active → terminated`), com `suspended` operacional modelado como `inactive` + razão. Transições publicam evento e geram Audit Trail.

### 4.6 Eventos canônicos como contrato

Toda mudança publica evento TMF688 transacional (outbox pattern). É o que habilita o Service Domain a ser fonte de verdade do "estado de serviço" consumida por Service Assurance, Order Fulfillment, BSS/billing e Data Lake.

### 4.7 Soft-terminate obrigatório

Services não são excluídos fisicamente. Cancelamento transiciona para `terminated` (preservando histórico para auditoria, churn analytics e disputas comerciais). Mesma política de soft-delete do Resource Domain.

### 4.8 Agnóstico à origem — grupo `_origin`

Idêntico aos Módulos 1 e 2: o Nexus gera UUID v7 próprio; IDs de serviço legados (Netwin Network & Services, UMBOX, OZMAP) são preservados como `characteristic` somente-leitura no grupo `_origin`. Mesma estrutura, sem alteração de schema. Ver seção 33.2.

---

## 5. Resumo dos requisitos do módulo

O módulo Service é composto por **16 requisitos**, organizados em 5 blocos funcionais:

| Bloco | Requisitos |
|---|---|
| **A — Service Catalog (TMF633)** | REQ-MOD03-001 a 003 |
| **B — Service Inventory base (TMF638)** | REQ-MOD03-004 a 007 |
| **C — Amarração, composição e identidade** | REQ-MOD03-008 a 011 |
| **D — Serviços ilustrativos V.tal** | REQ-MOD03-012 a 014 |
| **E — Transversais (Relationships + Eventos)** | REQ-MOD03-015 a 016 |

### 5.1 Tabela completa dos requisitos

| ID | Título | Entidade TMF principal |
|---|---|---|
| **REQ-MOD03-001** | Service Specification (CFS Spec + RFS Spec) | *ServiceSpecification (TMF633)* |
| **REQ-MOD03-002** | Service Category (organização hierárquica do catálogo) | *ServiceCategory (TMF633)* |
| **REQ-MOD03-003** | Service Candidate (oferta publicável) | *ServiceCandidate (TMF633)* |
| **REQ-MOD03-004** | Cadastro genérico de Service (CRUD canônico) | *Service (CFS \| RFS) (TMF638)* |
| **REQ-MOD03-005** | Ciclo de vida do Service (máquina de estados) | *Service.state (TMF638)* |
| **REQ-MOD03-006** | Customer Facing Service (CFS) | *CustomerFacingService (TMF638)* |
| **REQ-MOD03-007** | Resource Facing Service (RFS) | *ResourceFacingService (TMF638)* |
| **REQ-MOD03-008** | Vínculo Service → Resource (supportingResource) | *Service.supportingResource (TMF638)* |
| **REQ-MOD03-009** | Composição CFS ↔ RFS (supportingService) | *Service.supportingService (TMF638)* |
| **REQ-MOD03-010** | Localização do Service (place / serviceLocation) | *Service.place (TMF638 → TMF674/673)* |
| **REQ-MOD03-011** | SubscriberID e identidade do serviço de cliente | *serviceCharacteristic SubscriberID (TMF638)* |
| **REQ-MOD03-012** | Serviço Banda Larga FTTH / Bitstream GPON | *CFS+RFS (TMF638) — ilustrativo* |
| **REQ-MOD03-013** | Serviço Empresarial / Link Dedicado (EILD, L2/L3 VPN) | *CFS+RFS (TMF638) — ilustrativo* |
| **REQ-MOD03-014** | Serviço CloudVoIP | *CFS+RFS (TMF638) — ilustrativo* |
| **REQ-MOD03-015** | Service Relationship (catálogo de relações tipadas) | *Service.serviceRelationship (TMF638)* |
| **REQ-MOD03-016** | Eventos de domínio do Service | *Event (TMF688)* |

### 5.2 Ordem de implementação sugerida

1. **Catálogo primeiro** (001–003): sem spec não há instância.
2. **Inventory base + ciclo de vida** (004–005): o CRUD canônico e a máquina de estados.
3. **CFS/RFS e amarrações** (006–011): o miolo do domínio.
4. **Serviços V.tal** (012–014): exercitam o modelo contra os produtos reais.
5. **Transversais** (015–016): relações e eventos fecham o contrato com os demais módulos.

> **Pré-requisito externo:** o Service Domain depende do **Módulo 6 — Party & Tenant** para `relatedParty[role=subscriber]` (ISP/cliente). No MVP, enquanto o Módulo 6 não está pronto, Subscribers são referenciados por ID com validação diferida (ver Decisão D-3).

---

## 6. REQ-MOD03-001 — Service Specification (CFS Spec + RFS Spec)

> **Entidade TMF:** ServiceSpecification (CustomerFacingServiceSpecification | ResourceFacingServiceSpecification) (TMF633)
> **Open API TMF:** TMF633 — Service Catalog Management API
> **Prioridade:** Crítica — fundação do catálogo de serviços
> **Status:** Em levantamento · Versão 1.0 — draft

### 6.1 Descrição

Uma ServiceSpecification define um **tipo de serviço**: "Bitstream GPON 700M" (CFS Spec), "Acesso GPON com S/C-VLAN" (RFS Spec). É o molde a partir do qual instâncias de Service são criadas, declarando as características esperadas, os validadores, o SLA e — no caso de RFS Spec — quais ResourceSpecifications o serviço consome.

### 6.2 Racional arquitetural

O TMF633 separa explicitamente CFS Spec (orientada a cliente) de RFS Spec (orientada a recurso). Essa separação no catálogo é o que viabiliza, no inventory, o reuso de RFS por múltiplos CFS e a estabilidade do contrato comercial frente a mudanças técnicas. Os legados não têm essa separação no catálogo — Netwin define "serviços" sem distinguir camada comercial e técnica, e o NetBox não tem catálogo de serviço algum. O Nexus adota o modelo SID canônico.

### 6.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7. |
| `name` | string | Sim | Ex.: "Bitstream GPON 700M", "RFS Acesso GPON". |
| `@type` | string | Sim | `CustomerFacingServiceSpecification` \| `ResourceFacingServiceSpecification`. |
| `version` | string | Sim | Versionamento da spec (ex.: "1.0"). |
| `lifecycleStatus` | enum | Sim | `In Study` \| `In Design` \| `Active` \| `Launched` \| `Retired` \| `Obsolete`. |
| `isBundle` | boolean | Não | Indica spec composta (bundle de serviços). |
| `category` | EntityRef | Não | ServiceCategory (REQ-MOD03-002). |
| `specCharacteristic` | array | Não | Características declaradas (velocidade, SLA, perfil de banda, validadores). |
| `serviceLevelSpecification` | array | Não | SLA(s) associados (disponibilidade, latência, MTTR). |
| `resourceSpecification` | array | Condicional | **Apenas RFS Spec** — quais ResourceSpecs o serviço consome (TMF634, Módulo 2). |
| `serviceSpecRelationship` | array | Não | Relações entre specs (CFS Spec → RFS Spec; dependsOn; substituição). |
| `relatedParty` | array | Não | Owner da spec, área responsável. |
| `validFor` | TimePeriod | Não | Janela de validade. |

### 6.4 Exemplo de payload

```json
{
  "id": "spec-cfs-bitstream-gpon-700",
  "@type": "CustomerFacingServiceSpecification",
  "name": "Bitstream GPON 700M",
  "version": "1.0",
  "lifecycleStatus": "Active",
  "isBundle": false,
  "category": { "id": "cat-acesso-banda-larga", "@referredType": "ServiceCategory" },
  "specCharacteristic": [
    { "name": "downstream_mbps", "valueType": "integer", "configurable": false, "characteristicValueSpecification": [{ "value": 700 }] },
    { "name": "upstream_mbps",   "valueType": "integer", "configurable": false, "characteristicValueSpecification": [{ "value": 350 }] },
    { "name": "modelo_comercial","valueType": "string",  "characteristicValueSpecification": [{ "value": "wholesale" }, { "value": "direto" }] }
  ],
  "serviceLevelSpecification": [
    { "id": "sla-residencial-padrao", "name": "SLA Residencial 99.5 / MTTR 24h" }
  ],
  "serviceSpecRelationship": [
    { "id": "spec-rfs-acesso-gpon", "relationshipType": "isRealizedBy", "@referredType": "ResourceFacingServiceSpecification" }
  ]
}
```

### 6.5 Pré-condições

- ServiceCategory referenciada (se houver) existe e está Active.
- ResourceSpecifications referenciadas (em RFS Spec) existem no catálogo do Módulo 2.
- Usuário com permissão de Administrador do Catálogo de Serviços.

### 6.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar CFS/RFS Spec** | POST /serviceSpecification com `@type` discriminando CFS ou RFS. |
| **RF-002** | **Declarar características** | Suportar specCharacteristic com tipo, validador, valores permitidos, configurável/fixo. |
| **RF-003** | **Vincular SLA** | Associar serviceLevelSpecification à spec. |
| **RF-004** | **RFS → ResourceSpec** | RFS Spec declara quais ResourceSpecifications consome (cross-catalog Módulo 2). |
| **RF-005** | **Relacionar specs** | serviceSpecRelationship: CFS `isRealizedBy` RFS; dependsOn; replaces. |
| **RF-006** | **Versionar e aposentar** | Transição de lifecycleStatus com nova `version`; Retired/Obsolete bloqueia novas instâncias. |
| **RF-007** | **Bootstrap V.tal** | Pré-popular specs canônicas: Bitstream GPON (300/500/700/1G), EILD/Link Dedicado, L2VPN, CloudVoIP, e as RFS Specs correspondentes. |
| **RF-008** | **Eventos** | Publicar TMF688: ServiceSpecificationCreate/Change/Delete/StateChange. |

### 6.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | `name`, `@type`, `version`, `lifecycleStatus` obrigatórios. |
| **RN-002** | Apenas RFS Spec pode declarar `resourceSpecification`; CFS Spec que o fizer é rejeitada. |
| **RN-003** | Spec em `Retired`/`Obsolete` não aceita criação de novas instâncias de Service. |
| **RN-004** | Característica `mandatory` da spec é obrigatória nas instâncias derivadas. |
| **RN-005** | Toda criação/alteração publica TMF688 e gera Audit Trail. |

### 6.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar CFS** | POST de CFS Spec sem `resourceSpecification` é aceito. |
| **CA-002** | **CFS com resourceSpec** | POST de CFS Spec com `resourceSpecification` retorna 422. |
| **CA-003** | **Aposentar** | Spec `Retired` rejeita POST de nova instância no inventory. |
| **CA-004** | **Bootstrap** | Bootstrap cria as specs canônicas V.tal (CFS+RFS) automaticamente. |

### 6.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Catálogo de serviço** | Catálogo de "Rede e Serviços" (sem CFS/RFS) | Template Manager (GenericService) | **Inexistente** | **TMF633 com CFS Spec + RFS Spec** |
| **Separação comercial/técnico** | Implícita, não modelada | Não explícita | N/A | **Explícita (SID)** |
| **SLA na spec** | Atributo livre | Não nativo | N/A | **serviceLevelSpecification** |
| **Spec → ResourceSpec** | Não tipado | Via "uses" | N/A | **RFS.resourceSpecification (cross-catalog)** |

---

## 7. REQ-MOD03-002 — Service Category (organização hierárquica do catálogo)

> **Entidade TMF:** ServiceCategory (TMF633)
> **Open API TMF:** TMF633
> **Prioridade:** Alta
> **Status:** Em levantamento · Versão 1.0 — draft

### 7.1 Descrição

ServiceCategory organiza o catálogo de serviços em árvore navegável: Acesso > Banda Larga > Bitstream GPON; Conectividade Empresarial > Link Dedicado > EILD. Espelha o padrão de ResourceCategory (REQ-MOD02-002) e SiteSpecification hierárquica.

### 7.2 Racional arquitetural

Categorização é requisito de usabilidade do catálogo (busca, navegação, governança por área) e de portabilidade para o futuro front comercial. A árvore é independente da hierarquia técnica CFS/RFS — uma categoria pode conter CFS e RFS Specs.

### 7.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7. |
| `name` | string | Sim | Ex.: "Banda Larga", "Conectividade Empresarial". |
| `@type` | string | Sim | ServiceCategory. |
| `parentId` | EntityRef | Não | Categoria pai (auto-relacionamento). |
| `isRoot` | boolean | Não | Marca raiz da árvore. |
| `lifecycleStatus` | enum | Sim | Active \| Retired. |
| `serviceCandidate` | array | Não | ServiceCandidates classificados nesta categoria. |

### 7.4 Exemplo de payload

```json
{
  "id": "cat-acesso-banda-larga",
  "@type": "ServiceCategory",
  "name": "Banda Larga",
  "parentId": { "id": "cat-acesso", "@referredType": "ServiceCategory" },
  "isRoot": false,
  "lifecycleStatus": "Active"
}
```

### 7.5 Pré-condições

- Categoria pai (se informada) existe e está Active.
- Usuário com permissão de Administrador do Catálogo.

### 7.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar categoria** | POST /serviceCategory com parentId opcional. |
| **RF-002** | **Navegar árvore** | GET com expansão de descendentes/ancestrais. |
| **RF-003** | **Reparentar** | PATCH de parentId com validação anti-ciclo. |
| **RF-004** | **Bootstrap** | Árvore canônica V.tal: Acesso, Conectividade Empresarial, Voz, Transporte/Atacado. |

### 7.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Não pode haver ciclo na hierarquia (A pai de B, B pai de A). |
| **RN-002** | Categoria com filhos/candidates ativos não pode ser excluída — apenas Retired. |
| **RN-003** | Apenas uma categoria `isRoot=true` por árvore de domínio. |

### 7.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Árvore** | GET retorna hierarquia completa navegável. |
| **CA-002** | **Anti-ciclo** | Reparent que cria ciclo retorna 422. |

### 7.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Categorização de serviço** | Tipificação plana | Hierarquia de classes (metamodelo) | N/A | **ServiceCategory hierárquica (TMF633)** |

---

## 8. REQ-MOD03-003 — Service Candidate (oferta publicável)

> **Entidade TMF:** ServiceCandidate (TMF633)
> **Open API TMF:** TMF633
> **Prioridade:** Média
> **Status:** Em levantamento · Versão 1.0 — draft

### 8.1 Descrição

ServiceCandidate expõe uma ServiceSpecification como **oferta comercializável** — controla *o que está disponível para venda/contratação* num dado período, separando o catálogo técnico (todas as specs) do catálogo comercial (o subconjunto ofertável). Tipicamente envolve apenas CFS Specs.

### 8.2 Racional arquitetural

Nem toda spec ativa é vendável: uma RFS Spec é interna; uma CFS Spec pode existir mas estar fora de oferta numa região. O ServiceCandidate é o ponto de controle de visibilidade comercial, e o gancho natural para o futuro Product Catalog (TMF620) e para o Order (Módulo 4).

### 8.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7. |
| `name` | string | Sim | Nome comercial da oferta. |
| `lifecycleStatus` | enum | Sim | In Study \| Active \| Launched \| Retired. |
| `serviceSpecification` | EntityRef | Sim | CFS Spec referenciada. |
| `category` | array | Não | ServiceCategory(s). |
| `validFor` | TimePeriod | Não | Janela de oferta. |

### 8.4 Exemplo de payload

```json
{
  "id": "cand-bitstream-gpon-700-r1",
  "@type": "ServiceCandidate",
  "name": "Bitstream GPON 700M — Região 1",
  "lifecycleStatus": "Launched",
  "serviceSpecification": { "id": "spec-cfs-bitstream-gpon-700", "@referredType": "CustomerFacingServiceSpecification" },
  "category": [{ "id": "cat-acesso-banda-larga" }],
  "validFor": { "startDateTime": "2027-01-01T00:00:00Z" }
}
```

### 8.5 Pré-condições

- ServiceSpecification referenciada existe e está Active/Launched.

### 8.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Publicar candidate** | POST /serviceCandidate vinculando CFS Spec. |
| **RF-002** | **Controlar visibilidade** | lifecycleStatus governa o que aparece como ofertável. |
| **RF-003** | **Filtrar por categoria/região** | GET por category e validFor. |

### 8.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Candidate só referencia CFS Spec (não RFS). |
| **RN-002** | Candidate `Launched` exige spec `Active`/`Launched`. |

### 8.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Publicar** | Candidate sobre CFS Spec ativa é aceito. |
| **CA-002** | **RFS bloqueado** | Candidate sobre RFS Spec retorna 422. |

### 8.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Oferta comercializável** | Não separado da spec | Não nativo | N/A | **ServiceCandidate (TMF633)** |

---

## 9. REQ-MOD03-004 — Cadastro genérico de Service (CRUD canônico)

> **Entidade TMF:** Service (CustomerFacingService | ResourceFacingService) (TMF638)
> **Open API TMF:** TMF638 — Service Inventory Management API
> **Prioridade:** Crítica — entidade central do módulo
> **Status:** Em levantamento · Versão 1.0 — draft

### 9.1 Descrição

Um Service é uma instância concreta de um tipo definido por ServiceSpecification: o "Bitstream GPON 700M do Provedor X no assinante Y" (CFS), a "sessão GPON + par de VLANs que realiza esse acesso" (RFS). É a entidade-alvo de toda operação de inventário de serviço: criar, ativar, suspender, terminar, consultar relações e recursos de suporte. Este requisito formaliza o CRUD canônico de Service conforme TMF638.

### 9.2 Racional arquitetural

O TMF638 define Service como entidade abstrata com duas especializações (CFS, RFS) que compartilham o mesmo CRUD, mesmo modelo de eventos e mesma máquina de estados. Um único endpoint `/service` serve ambos, discriminados por `@type`. Os legados tratam serviço de cliente e serviço de rede em telas/APIs distintas; o Nexus unifica, como já fez com PhysicalResource/LogicalResource no Módulo 2.

### 9.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7 — identificador canônico interno. |
| `name` | string | Sim | Nome operacional do serviço. |
| `@type` | string | Sim | `CustomerFacingService` \| `ResourceFacingService`. |
| `serviceType` | string | Não | Rótulo livre (ex.: "GPON", "L2VPN", "VoIP"). |
| `serviceSpecification` | EntityRef | Sim | ServiceSpecification que define o tipo (REQ-001). |
| `state` | enum | Sim | feasibilityChecked \| designed \| reserved \| inactive \| active \| terminated. |
| `serviceDate` | datetime | Não | Data de referência. |
| `startDate` / `endDate` | datetime | Não | Início/fim de operação do serviço. |
| `category` | string | Não | Categoria do serviço. |
| `isServiceEnabled` | boolean | Não | Flag operacional de habilitação. |
| `hasStarted` | boolean | Não | Serviço já iniciou operação. |
| `serviceCharacteristic` | array | Não | Atributos da instância (velocidade configurada, SubscriberID, S/C-VLAN, perfil). |
| `supportingResource` | array | Condicional | **RFS** — Resources que realizam o serviço (Módulo 2). |
| `supportingService` | array | Condicional | **CFS** → RFS; RFS → RFS. Composição. |
| `serviceRelationship` | array | Não | Relações tipadas com outros serviços (REQ-015). |
| `relatedParty` | array | Não | Subscriber (ISP/cliente), owner (Módulo 6). |
| `place` | array | Não | GeographicSite/Address de instalação (Módulo 1). |
| `serviceOrderItem` | array | Não | Referência ao item de ordem que originou (Módulo 4). |

### 9.4 Exemplo de payload

```json
{
  "id": "svc-018fb1d4-7a2e-7c01-9f3a-22aa55bb88cc",
  "@type": "CustomerFacingService",
  "name": "Bitstream-GPON-700-ProvedorX-SUB778899",
  "serviceType": "GPON",
  "serviceSpecification": { "id": "spec-cfs-bitstream-gpon-700", "@referredType": "CustomerFacingServiceSpecification" },
  "state": "active",
  "startDate": "2027-02-15T10:30:00Z",
  "isServiceEnabled": true,
  "serviceCharacteristic": [
    { "name": "SubscriberID",    "value": "SUB778899" },
    { "name": "downstream_mbps", "value": 700 },
    { "name": "modelo_comercial","value": "wholesale" }
  ],
  "supportingService": [
    { "id": "svc-rfs-acesso-gpon-778899", "@referredType": "ResourceFacingService" }
  ],
  "relatedParty": [
    { "role": "subscriber", "@referredType": "Organization", "id": "tenant-provedor-x" }
  ],
  "place": [
    { "role": "installationAddress", "@referredType": "GeographicAddress", "id": "addr-rj-tijuca-rua-x-100-ap-302" }
  ]
}
```

### 9.5 Pré-condições

- ServiceSpecification existe e está Active/Launched.
- Para RFS: os Resources de `supportingResource` existem e estão em estado compatível (Módulo 2).
- Para CFS: o Subscriber referenciado existe (Módulo 6) — validação diferida no MVP (D-3).

### 9.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Service** | POST /service com `@type`, serviceSpecification, state inicial, characteristics. |
| **RF-002** | **Validar contra spec** | Validar serviceCharacteristic contra specCharacteristic (obrigatórios, validadores, tipos). |
| **RF-003** | **Atualizar Service** | PATCH parcial; campos imutáveis (id, serviceSpecification, @type) rejeitados. |
| **RF-004** | **Mudar estado** | PATCH de `state` validado pela máquina de estados (REQ-005). |
| **RF-005** | **Terminar (soft)** | Cancelamento transiciona para `terminated`; nunca DELETE físico. |
| **RF-006** | **Listar e filtrar** | Filtros: state, @type, serviceSpecification, relatedParty (subscriber), place, characteristic (ex.: SubscriberID). |
| **RF-007** | **Detalhar (GET)** | GET /service/{id} expande spec, supportingResource, supportingService, place, relatedParty via `fields`. |
| **RF-008** | **Importação em massa** | POST /service/bulk para migração/carga com relatório por item. |
| **RF-009** | **Histórico** | GET /service/{id}/history via Event Store. |
| **RF-010** | **Eventos** | Publicar TMF688: ServiceCreate / AttributeValueChange / StateChange / Delete. |

### 9.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | serviceSpecification, name, @type e state obrigatórios na criação. |
| **RN-002** | `@type` do Service deve casar com `@type` da spec (CFS↔CFS Spec, RFS↔RFS Spec). |
| **RN-003** | CFS **não** pode ter `supportingResource` direto — apenas via RFS (RN-004 reforça a fronteira). |
| **RN-004** | RFS **não** pode ter SubscriberID nem `relatedParty[role=subscriber]`. |
| **RN-005** | Service não é excluído fisicamente — apenas `terminated`. |
| **RN-006** | Toda criação/alteração/transição publica TMF688 e gera Audit Trail. |
| **RN-007** | SubscriberID, quando presente (CFS), é único entre serviços ativos. |

### 9.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criar CFS** | POST de CFS com supportingService→RFS é aceito. |
| **CA-002** | **CFS com Resource** | CFS com supportingResource direto retorna 422 (RN-003). |
| **CA-003** | **RFS com Subscriber** | RFS com relatedParty[subscriber] retorna 422 (RN-004). |
| **CA-004** | **Soft-terminate** | DELETE físico bloqueado; transição para terminated aceita. |
| **CA-005** | **Filtro por SubscriberID** | GET /service?characteristic.SubscriberID=SUB778899 retorna o CFS. |

### 9.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Instância de serviço** | "Serviços de cliente / de rede" (Network & Services) | GenericService (Service Manager) | **Inexistente** (L2VPN/Circuit como proxy) | **Service CFS/RFS unificado (TMF638)** |
| **CRUD único CFS+RFS** | Telas separadas | Classe única GenericService | N/A | **/service com @type** |
| **Soft-terminate** | Estado de ciclo de vida | Delete lógico | N/A | **state=terminated, sem DELETE** |

---

## 10. REQ-MOD03-005 — Ciclo de vida do Service (máquina de estados)

> **Entidade TMF:** Service.state (TMF638)
> **Open API TMF:** TMF638 + eventos TMF688
> **Prioridade:** Crítica
> **Status:** Em levantamento · Versão 1.0 — draft

### 10.1 Descrição

Define a máquina de estados canônica do Service e as transições válidas, do desenho à terminação, incluindo o tratamento de suspensão operacional (ex.: inadimplência, manutenção).

### 10.2 Racional arquitetural

O TMF638 padroniza os estados de serviço. Adotá-los garante interoperabilidade com Order (TMF641), Service Assurance e BSS. "Suspended" não é estado canônico TMF638 — é modelado como `inactive` + `serviceCharacteristic[suspensionReason]`, preservando aderência ao padrão sem perder a semântica operacional V.tal.

### 10.3 Mapeamento de estados (TMF638)

| Estado | Significado | Trigger típico |
|---|---|---|
| `feasibilityChecked` | Viabilidade confirmada (vinda do Order/TMF645). | Qualificação aprovada. |
| `designed` | Serviço desenhado (CFS+RFS montados, recursos identificados). | Decomposição da ordem. |
| `reserved` | Recursos reservados para o serviço (Módulo 2 `reserved`). | Reserva de porta/VLAN. |
| `inactive` | Provisionado mas não operante (inclui **suspenso**). | Aguardando ativação / suspensão. |
| `active` | Serviço operante e habilitado. | Comissionamento concluído. |
| `terminated` | Serviço encerrado (histórico preservado). | Cancelamento/churn. |

### 10.4 Diagrama de transições

```
                 ┌──────────────────────────────────────────────┐
                 ▼                                              │
feasibilityChecked → designed → reserved → inactive → active ───┤
                                              ▲   │      │       │
                          (suspender)         │   └──────┘       │
                                              └──── inactive ◄────┘ (suspensão: reason)
                                                       │
                                                       ▼
                                                  terminated  ◄── (de qualquer estado, via cancelamento)
```

### 10.5 Pré-condições

- Service existe. Transição solicitada é válida na matriz.

### 10.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Matriz de transições** | Aceitar apenas transições válidas; rejeitar saltos inválidos (ex.: terminated → active). |
| **RF-002** | **Ativar** | inactive/reserved → active com validação de recursos de suporte habilitados. |
| **RF-003** | **Suspender** | active → inactive + serviceCharacteristic[suspensionReason] (inadimplência, manutenção). |
| **RF-004** | **Religar** | inactive(suspenso) → active. |
| **RF-005** | **Terminar** | Qualquer estado → terminated, liberando reservas de Resources (Módulo 2). |
| **RF-006** | **Propagar** | Mudança de estado de CFS pode propagar para RFS conforme política. |
| **RF-007** | **Eventos** | ServiceStateChangeEvent com from/to e razão. |

### 10.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | terminated é terminal — sem transição de saída. |
| **RN-002** | Ativar CFS exige todos os RFS de suporte em `active`. |
| **RN-003** | Terminar CFS aciona liberação das reservas de Resource via Módulo 2 (status reserved → available). |
| **RN-004** | Suspensão preserva os vínculos supportingResource/supportingService (não desfaz). |
| **RN-005** | Toda transição publica TMF688 e gera Audit Trail. |

### 10.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Transição válida** | inactive → active aceito quando RFS ativos. |
| **CA-002** | **Salto inválido** | terminated → active retorna 409. |
| **CA-003** | **Suspensão** | active → inactive grava suspensionReason e mantém vínculos. |
| **CA-004** | **Liberação** | terminated libera reservas no Módulo 2 (evento correlato). |

### 10.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Ciclo de vida de serviço** | Estados próprios | Estado simples | N/A | **TMF638 canônico (6 estados)** |
| **Suspensão** | Estado dedicado | Manual | N/A | **inactive + suspensionReason** |
| **Liberação de recurso ao terminar** | Manual | Manual | N/A | **Automática via evento (Módulo 2)** |

---

## 11. REQ-MOD03-006 — Customer Facing Service (CFS)

> **Entidade TMF:** CustomerFacingService (TMF638)
> **Open API TMF:** TMF638
> **Prioridade:** Crítica
> **Status:** Em levantamento · Versão 1.0 — draft

### 11.1 Descrição

O CFS é o serviço **como o cliente o contrata e enxerga**: a oferta, a velocidade comercial, o SLA, o SubscriberID. No modelo wholesale V.tal, o cliente do CFS é tipicamente um **Tenant ISP**. O CFS não conhece porta PON nem VLAN — ele conhece "o que foi vendido" e delega a realização técnica ao(s) RFS.

### 11.2 Racional arquitetural

Isolar o CFS é o que permite que o contrato comercial sobreviva a mudanças de realização técnica (troca de OLT, re-roteamento, mudança de VLAN). O cliente continua com o mesmo CFS/SubscriberID enquanto o RFS por baixo muda. É também o ponto de integração com BSS/billing.

### 11.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `@type` | string | Sim | CustomerFacingService. |
| `serviceCharacteristic[SubscriberID]` | string | Sim | Identidade do serviço de cliente (REQ-011). |
| `relatedParty[role=subscriber]` | EntityRef | Sim | Tenant ISP ou cliente direto (Módulo 6). |
| `supportingService` | array | Sim | RFS que realizam o CFS. |
| `place[role=installationAddress]` | EntityRef | Não | Endereço de instalação (Módulo 1). |
| `serviceCharacteristic[*]` | array | Não | Velocidade comercial, SLA comercial, modelo (wholesale/direto). |

### 11.4 Exemplo de payload

```json
{
  "@type": "CustomerFacingService",
  "name": "Bitstream-GPON-700-ProvedorX-SUB778899",
  "serviceSpecification": { "id": "spec-cfs-bitstream-gpon-700" },
  "state": "active",
  "serviceCharacteristic": [
    { "name": "SubscriberID", "value": "SUB778899" },
    { "name": "modelo_comercial", "value": "wholesale" },
    { "name": "sla_comercial", "value": "Residencial-99.5" }
  ],
  "supportingService": [{ "id": "svc-rfs-acesso-gpon-778899", "@referredType": "ResourceFacingService" }],
  "relatedParty": [{ "role": "subscriber", "id": "tenant-provedor-x", "@referredType": "Organization" }]
}
```

### 11.5 Pré-condições

- CFS Spec ativa. Subscriber referenciado (validação diferida no MVP). Ao menos um RFS de suporte.

### 11.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar CFS** | POST de CFS com SubscriberID, subscriber e supportingService. |
| **RF-002** | **Trocar realização** | Substituir RFS de suporte sem alterar SubscriberID/CFS (re-home). |
| **RF-003** | **Consultar por cliente** | GET por relatedParty (todos os CFS de um ISP). |
| **RF-004** | **Consultar por SubscriberID** | GET por characteristic SubscriberID. |

### 11.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | CFS exige SubscriberID e ao menos um supportingService (RFS). |
| **RN-002** | CFS não referencia Resource diretamente. |
| **RN-003** | Troca de RFS preserva o SubscriberID e gera evento de re-home. |

### 11.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Por ISP** | GET por subscriber retorna todos os CFS do Tenant. |
| **CA-002** | **Re-home** | Trocar RFS mantém SubscriberID; evento emitido. |

### 11.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Serviço de cliente** | "Serviço de cliente" (Network & Services) | Service Manager (cliente) | **Inexistente** | **CFS (TMF638) com SubscriberID** |
| **Wholesale (cliente = ISP)** | Parcial | Via Contract | N/A | **relatedParty[subscriber]=Tenant ISP** |

---

## 12. REQ-MOD03-007 — Resource Facing Service (RFS)

> **Entidade TMF:** ResourceFacingService (TMF638)
> **Open API TMF:** TMF638
> **Prioridade:** Crítica
> **Status:** Em levantamento · Versão 1.0 — draft

### 12.1 Descrição

O RFS é a **realização técnica** do serviço: a sessão GPON, o par S-VLAN/C-VLAN do assinante, o circuito L2/L3, o VRF do cliente empresarial. É o RFS que amarra Resources (`supportingResource`). É interno à rede — nunca tem cliente nem SubscriberID.

### 12.2 Racional arquitetural

O RFS é o que torna o inventário de serviço *acionável* pela operação: é por ele que se navega do serviço até a porta física (e, via Resource, até o path completo OLT→ONT computado no Módulo 2). Reutilizável: um RFS de "transporte L2VPN" pode suportar múltiplos CFS de clientes diferentes.

### 12.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `@type` | string | Sim | ResourceFacingService. |
| `supportingResource` | array | Sim | Resources que realizam (ONT, Port PON, VLAN, VRF, IP, Circuit). |
| `supportingService` | array | Não | Outro RFS componível (ex.: RFS acesso sobre RFS transporte). |
| `serviceCharacteristic[*]` | array | Não | S-VLAN, C-VLAN, perfil de banda, parâmetros técnicos. |

### 12.4 Exemplo de payload

```json
{
  "@type": "ResourceFacingService",
  "name": "RFS-Acesso-GPON-778899",
  "serviceSpecification": { "id": "spec-rfs-acesso-gpon" },
  "state": "active",
  "serviceCharacteristic": [
    { "name": "S_VLAN", "value": 1001 },
    { "name": "C_VLAN", "value": 778 },
    { "name": "perfil_banda", "value": "GPON-700-350" }
  ],
  "supportingResource": [
    { "id": "res-ont-778899", "@referredType": "PhysicalResource" },
    { "id": "res-port-pon-rj-bot-0-1-3", "@referredType": "PhysicalResource" },
    { "id": "res-svlan-1001", "@referredType": "LogicalResource" },
    { "id": "res-cvlan-778", "@referredType": "LogicalResource" }
  ]
}
```

### 12.5 Pré-condições

- RFS Spec ativa. Resources de suporte existem e estão habilitados (Módulo 2).

### 12.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar RFS** | POST de RFS com supportingResource. |
| **RF-002** | **Compor RFS** | RFS sobre RFS (acesso sobre transporte). |
| **RF-003** | **Navegar até recurso** | GET expandindo supportingResource → path físico (Módulo 2). |
| **RF-004** | **Reusar RFS** | Mesmo RFS suportar múltiplos CFS (RN-002). |

### 12.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | RFS exige ao menos um supportingResource ou um supportingService. |
| **RN-002** | Um RFS pode ser referenciado por múltiplos CFS (compartilhamento). |
| **RN-003** | RFS não tem SubscriberID nem relatedParty[subscriber]. |
| **RN-004** | Terminar RFS exige que nenhum CFS ativo dependa dele. |

### 12.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Navegação** | GET RFS → supportingResource → porta/ONT reais (Módulo 2). |
| **CA-002** | **Compartilhamento** | RFS referenciado por 2 CFS é válido. |
| **CA-003** | **Dependência** | Terminar RFS com CFS ativo retorna 409. |

### 12.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Serviço de rede** | "Serviço de rede" (Network & Services) | GenericService + "uses" circuito | L2VPN / Circuit (resource-adjacent) | **RFS (TMF638) com supportingResource** |
| **Reuso técnico** | Limitado | Via relacionamento | Não | **RFS compartilhável entre CFS** |
| **Navegação até porta** | Sim (Portas e Serviços) | Via Connectivity | Via cable trace | **supportingResource → path (Módulo 2)** |

---

## 13. REQ-MOD03-008 — Vínculo Service → Resource (supportingResource)

> **Entidade TMF:** Service.supportingResource (TMF638 → TMF639)
> **Open API TMF:** TMF638 (referência), TMF639 (alvo)
> **Prioridade:** Crítica — a ponte entre os domínios
> **Status:** Em levantamento · Versão 1.0 — draft

### 13.1 Descrição

Formaliza a única ponte legítima entre o Service Domain e o Resource Domain: `supportingResource`. Define como a referência é validada, mantida e usada para rastreabilidade bidirecional (serviço↔recurso).

### 13.2 Racional arquitetural

É a materialização do princípio 4.3. A referência é por **ID + @referredType**, resolvida via API do Módulo 2 — nunca por join de banco. Habilita as duas perguntas operacionais críticas: "que recursos sustentam este serviço?" (forward) e "que serviços caem se este recurso falhar?" (reverse, base de impact analysis para Service Assurance).

### 13.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `supportingResource[].id` | string | Sim | UUID do Resource (Módulo 2). |
| `supportingResource[].@referredType` | string | Sim | PhysicalResource \| LogicalResource. |
| `supportingResource[].name` | string | Não | Cache do nome (denormalização opcional p/ leitura). |
| `supportingResource[].role` | string | Não | Papel do recurso no serviço (ex.: "accessPort", "cpe", "vrf"). |

### 13.4 Exemplo de consulta de impacto reverso

```
GET /service?supportingResource.id=res-port-pon-rj-bot-0-1-3&state=active
→ retorna todos os RFS/CFS ativos que dependem daquela porta PON
  (entrada para análise de impacto de uma falha de placa/porta)
```

### 13.5 Pré-condições

- Resource referenciado existe no Módulo 2 (validação síncrona no save).

### 13.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Vincular recurso** | Adicionar supportingResource com validação de existência (Módulo 2). |
| **RF-002** | **Forward trace** | GET serviço → recursos de suporte (com papel). |
| **RF-003** | **Reverse trace** | GET por supportingResource → serviços impactados. |
| **RF-004** | **Consistência por evento** | Consumir ResourceStateChange/Delete (Módulo 2) e marcar serviços impactados. |

### 13.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | supportingResource só em RFS (CFS é indireto, via RFS). |
| **RN-002** | Vincular recurso inexistente é rejeitado (422). |
| **RN-003** | Delete/suspensão de Resource com serviço ativo dependente gera evento de alerta (não bloqueia no Módulo 2, mas sinaliza). |

### 13.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Validação** | Vincular Resource inexistente retorna 422. |
| **CA-002** | **Reverse trace** | GET por recurso lista serviços ativos dependentes. |
| **CA-003** | **Propagação** | ResourceStateChange (down) marca serviços como impactados. |

### 13.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Serviço → recurso** | Portas e Serviços | "uses" (Service → circuit) | Indireto (L2VPN termination) | **supportingResource (referência por ID)** |
| **Impacto reverso** | Relatório | Manual | Limitado | **Reverse trace por query/evento** |

---

## 14. REQ-MOD03-009 — Composição CFS ↔ RFS (supportingService)

> **Entidade TMF:** Service.supportingService (TMF638)
> **Open API TMF:** TMF638
> **Prioridade:** Crítica
> **Status:** Em levantamento · Versão 1.0 — draft

### 14.1 Descrição

Formaliza a composição entre serviços: CFS é realizado por um ou mais RFS; um RFS pode ser composto por outros RFS (ex.: RFS de acesso sobre RFS de transporte). `supportingService` é o atributo que expressa essa árvore.

### 14.2 Racional arquitetural

É o eixo interno do domínio (3.2). A árvore CFS → RFS → RFS é o que permite modelar serviços empresariais multi-camada (acesso + transporte + VPN) e wholesale (CFS-ISP sobre RFS compartilhado) sem duplicar realização técnica.

### 14.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `supportingService[].id` | string | Sim | UUID do serviço suportante. |
| `supportingService[].@referredType` | string | Sim | ResourceFacingService (tipicamente). |
| `supportingService[].role` | string | Não | Papel na composição (ex.: "access", "transport"). |

### 14.4 Exemplo de payload (empresarial multi-camada)

```
CFS  "Link-Dedicado-1G-Acme"
 ├─ supportingService → RFS "Acesso-Ethernet-Acme"  (role: access)
 └─ supportingService → RFS "Transporte-L2VPN-Acme" (role: transport)
                          └─ supportingService → RFS "Backbone-EVPN-Core" (compartilhado)
```

### 14.5 Pré-condições

- Serviços referenciados existem. Sem ciclos na árvore de composição.

### 14.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Compor** | Adicionar supportingService a CFS/RFS. |
| **RF-002** | **Navegar árvore** | GET expandindo composição completa (CFS → RFS → RFS). |
| **RF-003** | **Anti-ciclo** | Rejeitar composição que forme ciclo. |
| **RF-004** | **Propagação de estado** | Política de propagação de estado pela árvore (REQ-005 RF-006). |

### 14.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | CFS só compõe com RFS (não com outro CFS). |
| **RN-002** | Sem ciclos: A suporta B, B não pode suportar A. |
| **RN-003** | Terminar serviço suportante exige tratar dependentes (RN-004 do REQ-007). |

### 14.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Árvore** | GET retorna composição multi-nível. |
| **CA-002** | **Anti-ciclo** | Composição cíclica retorna 422. |

### 14.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Composição de serviço** | Plana | Hierarquia parcial | Não | **supportingService (árvore CFS→RFS→RFS)** |

---

## 15. REQ-MOD03-010 — Localização do Service (place / serviceLocation)

> **Entidade TMF:** Service.place (TMF638 → TMF673/674/675)
> **Open API TMF:** TMF638 (referência ao Módulo 1)
> **Prioridade:** Alta
> **Status:** Em levantamento · Versão 1.0 — draft

### 15.1 Descrição

Define como o Service se ancora geograficamente: endereço de instalação (GeographicAddress), ponto de instalação (GeographicSite InstallationPoint), ou área de cobertura (GeographicLocation). Reaproveita inteiramente o Módulo 1 — o Service não modela geografia, apenas referencia.

### 15.2 Racional arquitetural

Coerência com a Decisão 5.2 do Overview: HC cria o InstallationPoint (Módulo 1); o CFS referencia esse Site/Address via `place`. Para serviços não pontuais (ex.: L2VPN multiponto, transporte entre cidades), `place` é multi-valorado com papéis (endpoint A, endpoint Z).

### 15.3 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `place[].id` | string | Não | UUID do Site/Address/Location (Módulo 1). |
| `place[].@referredType` | string | Não | GeographicAddress \| GeographicSite \| GeographicLocation. |
| `place[].role` | string | Não | installationAddress \| endpointA \| endpointZ \| coverageArea. |

### 15.4 Exemplo de payload (serviço ponto-a-ponto)

```json
"place": [
  { "role": "endpointA", "@referredType": "GeographicSite", "id": "site-rj-matriz-acme" },
  { "role": "endpointZ", "@referredType": "GeographicSite", "id": "site-sp-filial-acme" }
]
```

### 15.5 Pré-condições

- Site/Address referenciado existe no Módulo 1.

### 15.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Ancorar** | Vincular place com papel ao CFS/RFS. |
| **RF-002** | **Multiponto** | Suportar múltiplos place com papéis (A/Z, coverage). |
| **RF-003** | **Consulta geográfica** | GET serviços por place (todos os serviços de um Site/endereço). |

### 15.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | place referencia entidade existente no Módulo 1 (validação no save). |
| **RN-002** | CFS residencial tem 1 installationAddress; serviço P2P tem endpointA e endpointZ. |

### 15.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Por endereço** | GET serviços por place retorna serviços ativos no endereço. |
| **CA-002** | **P2P** | Serviço com endpointA/Z é aceito e consultável por ambos. |

### 15.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Serviço → localização** | Via local/endereço | Via geo do objeto | Via site (resource) | **place → Módulo 1 (TMF673/674/675)** |
| **Multiponto A/Z** | Limitado | Via circuito | Via circuit termination | **place[] com papéis** |

---

## 16. REQ-MOD03-011 — SubscriberID e identidade do serviço de cliente

> **Entidade TMF:** serviceCharacteristic[SubscriberID] (TMF638)
> **Open API TMF:** TMF638
> **Prioridade:** Crítica
> **Status:** Em levantamento · Versão 1.0 — draft

### 16.1 Descrição

Define o SubscriberID como a identidade canônica do serviço de cliente (CFS), estável e independente do UUID interno. É a chave de correlação com BSS/billing, OSS, atendimento e — no wholesale — com o sistema do próprio ISP.

### 16.2 Racional arquitetural

O `id` UUID v7 é interno e não-amigável; o BSS e o atendimento precisam de um identificador de negócio estável. O SubscriberID cumpre esse papel e sobrevive a re-homes técnicos (troca de RFS/recursos). A partir da Fase 3 do roadmap, é gerado pelo Nexus (Nexus-native), substituindo identidades legadas de assinante.

### 16.3 Mapeamento de atributos TMF

| Característica | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `SubscriberID` | string | Sim (CFS) | Identidade de negócio do serviço de cliente. Única entre serviços ativos. |
| `legacySubscriberID` | string | Não | ID de assinante no sistema de origem (no grupo `_origin`). |
| `bssReference` | string | Não | Chave de correlação com billing/BSS. |

### 16.4 Exemplo

```json
"serviceCharacteristic": [
  { "name": "SubscriberID", "value": "SUB778899" },
  { "name": "bssReference", "value": "BSS-CTR-2027-55012" }
]
```

### 16.5 Pré-condições

- CFS sendo criado. Estratégia de geração de SubscriberID definida (D-4).

### 16.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Gerar/atribuir** | Atribuir SubscriberID na criação do CFS (gerado ou informado na migração). |
| **RF-002** | **Unicidade** | Garantir unicidade entre serviços ativos. |
| **RF-003** | **Estabilidade** | Preservar SubscriberID em re-homes (troca de RFS/recursos). |
| **RF-004** | **Busca** | GET /service por SubscriberID (índice dedicado). |

### 16.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | SubscriberID obrigatório em todo CFS. |
| **RN-002** | Único entre CFS não-terminados. |
| **RN-003** | Imutável após criação (re-home não altera). |

### 16.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Unicidade** | Criar 2º CFS com mesmo SubscriberID ativo retorna 409. |
| **CA-002** | **Re-home** | Trocar RFS preserva SubscriberID. |

### 16.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Identidade de assinante** | ID de serviço próprio | Via cliente/contrato | N/A | **SubscriberID Nexus-native + `_origin.legacy`** |

---

## 17. REQ-MOD03-012 — Serviço Banda Larga FTTH / Bitstream GPON

> **Entidade TMF:** CFS + RFS (TMF638) — requisito ilustrativo
> **Prioridade:** Alta — produto core V.tal
> **Status:** Em levantamento · Versão 1.0 — draft

### 17.1 Descrição

Especifica a modelagem do produto core da V.tal: banda larga FTTH sobre GPON. No modelo wholesale, é o **Bitstream GPON** vendido ao ISP; no atendimento direto, é o **FTTH residencial** ao cliente final. Mesmo RFS técnico, CFS distintos por modelo comercial.

### 17.2 Racional arquitetural

Exercita o modelo CFS/RFS contra o caso de maior volume (22M HPs). Demonstra como wholesale e varejo coexistem sobre a mesma realização técnica, e como a transição HP→HC instancia o serviço.

### 17.3 Modelagem de referência

```
CFS "Bitstream GPON 700M" (wholesale → Tenant Provedor X)   |   CFS "FTTH 700M" (direto → cliente)
   SubscriberID: SUB778899                                   |      SubscriberID: SUB901234
        └─ supportingService ──────────┐                     |          └─ supportingService ─┐
                                        ▼                     |                                ▼
                          RFS "Acesso GPON" (compartilhável: 1 por assinante físico)
                             serviceCharacteristic: S_VLAN, C_VLAN, perfil_banda
                             supportingResource:
                                ├─ ONT (PhysicalResource, Módulo 2)
                                ├─ Port PON 0/1/3 (PhysicalResource)
                                ├─ S-VLAN 1001 (LogicalResource)
                                └─ C-VLAN 778 (LogicalResource)
                                        │ place
                          GeographicSite InstallationPoint + GeographicAddress (Módulo 1)
```

### 17.4 Características-chave

| Característica | Camada | Exemplo |
|---|---|---|
| downstream/upstream | CFS | 700/350 Mbps |
| modelo_comercial | CFS | wholesale \| direto |
| S_VLAN / C_VLAN | RFS | 1001 / 778 |
| perfil_banda | RFS | GPON-700-350 |
| ONT / Port PON | Resource (Mód. 2) | referência |

### 17.5 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Instanciar na ativação** | Criar CFS+RFS no trigger HP→HC. |
| **RF-002** | **Wholesale e direto** | Suportar ambos os CFS sobre o mesmo RFS de acesso. |
| **RF-003** | **Upgrade de velocidade** | Alterar CFS (nova spec) preservando SubscriberID e ajustando perfil no RFS. |

### 17.6 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Ativação** | CFS+RFS criados, recursos vinculados, state=active. |
| **CA-002** | **Upgrade** | Mudança de velocidade ajusta perfil_banda no RFS sem trocar SubscriberID. |

### 17.7 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Banda larga GPON** | FTTH Aprovisionamento / GPON | Via circuito + service | L2VPN proxy | **CFS+RFS GPON (TMF638)** |
| **Wholesale + varejo** | Parcial | Via contrato | Não | **2 CFS / 1 RFS** |

---

## 18. REQ-MOD03-013 — Serviço Empresarial / Link Dedicado (EILD, L2/L3 VPN)

> **Entidade TMF:** CFS + RFS (TMF638) — requisito ilustrativo
> **Prioridade:** Alta
> **Status:** Em levantamento · Versão 1.0 — draft

### 18.1 Descrição

Modela serviços empresariais: link dedicado (EILD), L2VPN (transporte ethernet) e L3VPN (conectividade IP com VRF). Caso multi-camada e multiponto (matriz↔filiais), que exercita `supportingService` em árvore e `place` com endpoints A/Z.

### 18.2 Racional arquitetural

Demonstra a composição CFS→RFS-acesso + RFS-transporte, com RFS de backbone compartilhado, e o uso de Resources lógicos (VRF, IP, circuito) do Módulo 2. Reaproveita o cenário Acme do HLD03 (seção 31.1), agora com a decomposição de serviço completa.

### 18.3 Modelagem de referência

```
CFS "Link-Dedicado-1G-Acme" (SubscriberID SUB-CORP-12345, subscriber: cliente direto Acme)
 ├─ place: endpointA = Matriz RJ, endpointZ = Filial SP
 ├─ supportingService → RFS "Acesso-Ethernet-Acme-RJ"
 │     supportingResource: CPE Cisco ISR 1100, Port WAN, Switch-Acesso porta (Módulo 2)
 ├─ supportingService → RFS "Acesso-Ethernet-Acme-SP"
 └─ supportingService → RFS "Transporte-L3VPN-Acme"
       serviceCharacteristic: rd "65000:12345"
       supportingResource: VRF CUSTOMER-ACME-12345, Prefix 200.10.50.0/24, IP gerência (Módulo 2)
       └─ supportingService → RFS "Backbone-EVPN-Core" (compartilhado entre clientes)
```

### 18.4 Características-chave

| Característica | Camada | Exemplo |
|---|---|---|
| velocidade / CIR | CFS | 1 Gbps / 1 Gbps |
| sla_comercial | CFS | Empresarial-99.9 / MTTR 4h |
| rd (route distinguisher) | RFS L3VPN | 65000:12345 |
| VRF / Prefix / IP | Resource (Mód. 2) | referência |

### 18.5 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Multiponto** | CFS com endpointA/Z e RFS de acesso por ponta. |
| **RF-002** | **L3VPN** | RFS com VRF/IP referenciados (Módulo 2). |
| **RF-003** | **Backbone compartilhado** | RFS de core reutilizado por múltiplos CFS empresariais. |

### 18.6 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Composição** | CFS → 2 RFS acesso + 1 RFS transporte montados. |
| **CA-002** | **VRF** | RFS L3VPN referencia VRF existente no Módulo 2. |

### 18.7 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **L2/L3 VPN empresarial** | Serviços de rede | MPLS/circuito + service | L2VPN / VRF (resource) | **CFS+RFS multi-camada (TMF638)** |
| **Backbone compartilhado** | Limitado | Via circuito | Parcial | **RFS core compartilhado** |

---

## 19. REQ-MOD03-014 — Serviço CloudVoIP

> **Entidade TMF:** CFS + RFS (TMF638) — requisito ilustrativo
> **Prioridade:** Média
> **Status:** Em levantamento · Versão 1.0 — draft (REQ-001 já citado no Overview seção 7.3)

### 19.1 Descrição

Modela serviço de voz gerenciada (CloudVoIP): linha/tronco SIP entregue sobre a conectividade FTTH/empresarial. Caso que exercita serviço *sobre serviço* — o CFS VoIP depende do CFS de acesso — e recursos lógicos de voz (números/E.164 como LogicalResource no Módulo 2).

### 19.2 Racional arquitetural

Demonstra dependência inter-CFS via `serviceRelationship` (REQ-015) e o uso de números telefônicos como Resource lógico. Foi o primeiro serviço esboçado para o domínio (Overview 7.3); aqui é formalizado no padrão CFS/RFS.

### 19.3 Modelagem de referência

```
CFS "CloudVoIP-10-ramais-Acme" (SubscriberID SUB-VOIP-7788)
 ├─ serviceRelationship → CFS "Link-Dedicado-1G-Acme" (type: dependsOn)
 ├─ supportingService → RFS "Tronco-SIP-Acme"
 │     serviceCharacteristic: codec, canais_simultaneos=10
 │     supportingResource:
 │        ├─ Faixa E.164 +55 21 4002-89xx (LogicalResource, Módulo 2)
 │        └─ Registro SIP / perfil (LogicalResource)
 └─ characteristic: plano="Ilimitado Fixo", ramais=10
```

### 19.4 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **VoIP sobre acesso** | CFS VoIP com dependsOn ao CFS de acesso. |
| **RF-002** | **Números como recurso** | RFS referencia faixa/números E.164 (LogicalResource, Módulo 2). |
| **RF-003** | **Suspensão em cascata** | Suspensão do acesso reflete no VoIP conforme política. |

### 19.5 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Dependência** | CFS VoIP referencia CFS acesso via serviceRelationship. |
| **CA-002** | **Números** | RFS SIP referencia faixa E.164 no Módulo 2. |

### 19.6 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Voz/VoIP** | Serviço de cliente | GenericService | Não | **CFS+RFS VoIP (TMF638)** |
| **Números E.164** | Recurso lógico | Atributo | Não | **LogicalResource (Módulo 2)** |
| **Serviço sobre serviço** | Limitado | Via relacionamento | Não | **serviceRelationship dependsOn** |

---

## 20. REQ-MOD03-015 — Service Relationship (catálogo de relações tipadas)

> **Entidade TMF:** Service.serviceRelationship (TMF638)
> **Open API TMF:** TMF638
> **Prioridade:** Alta
> **Status:** Em levantamento · Versão 1.0 — draft

### 20.1 Descrição

Define o catálogo de tipos de relação entre serviços (`serviceRelationship`), distinto da composição (`supportingService`). Cobre dependência, agregação, substituição e relações peer.

### 20.2 Racional arquitetural

Mesmo padrão do catálogo de ResourceRelationships (REQ-MOD02-024, Decisão 5.6 do Overview): bootstrap canônico + extensível via API com governança. `supportingService` é composição estrutural; `serviceRelationship` é semântica de negócio (dependsOn, replaces, aggregates).

### 20.3 Bootstrap canônico de RelationshipTypes (Service)

| Tipo | Semântica |
|---|---|
| `dependsOn` | Serviço A requer B operante (VoIP dependsOn acesso). |
| `aggregates` | A agrega B em um bundle comercial. |
| `replaces` | A substitui B (upgrade/migração). |
| `peersWith` | A e B são pares (ex.: redundância). |
| `backsUp` | A é backup de B. |

### 20.4 Mapeamento de atributos TMF

| Atributo TMF | Tipo | Obrigatório | Observação |
|---|---|:---:|---|
| `serviceRelationship[].relationshipType` | string | Sim | Tipo do catálogo (bootstrap ou extensão). |
| `serviceRelationship[].service.id` | string | Sim | Serviço relacionado. |

### 20.5 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Catálogo extensível** | CRUD de RelationshipType com Audit + evento. |
| **RF-002** | **Relacionar** | Adicionar serviceRelationship tipado entre serviços. |
| **RF-003** | **Navegar** | GET serviços relacionados por tipo. |

### 20.6 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | relationshipType deve existir no catálogo. |
| **RN-002** | Novos tipos via Administrador do Catálogo, com governança (Audit + TMF688). |

### 20.7 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Tipado** | Relação com tipo do catálogo é aceita. |
| **CA-002** | **Extensão** | Novo tipo criado via API gera Audit + evento. |

### 20.8 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Relações de serviço** | Implícitas | Relacionamentos de classe | Não | **Catálogo tipado extensível (TMF638)** |

---

## 21. REQ-MOD03-016 — Eventos de domínio do Service

> **Entidade TMF:** Event (TMF688)
> **Open API TMF:** TMF688 — Event Management
> **Prioridade:** Crítica
> **Status:** Em levantamento · Versão 1.0 — draft

### 21.1 Descrição

Define o catálogo de eventos canônicos publicados pelo Service Domain via outbox pattern, consumidos por Service Assurance, Order, BSS/billing e Data Lake.

### 21.2 Racional arquitetural

É o que torna o Service Domain fonte de verdade do "estado de serviço". Mesmo mecanismo do Módulo 2 (REQ-MOD02-025): outbox transacional, schema versionado, idempotência por UUID v7, catálogo público.

### 21.3 Catálogo de eventos

| Evento | Quando | Principais consumidores |
|---|---|---|
| `ServiceCreateEvent` | Novo serviço instanciado. | Order, Data Lake. |
| `ServiceAttributeValueChangeEvent` | Mudança de característica (ex.: upgrade). | BSS, Data Lake. |
| `ServiceStateChangeEvent` | Transição de estado (active/inactive/terminated). | Service Assurance, BSS, Order. |
| `ServiceDeleteEvent` | Terminação (soft). | Data Lake, billing. |
| `ServiceRehomeEvent` | Troca de RFS/recursos preservando SubscriberID. | Service Assurance. |

### 21.4 Exemplo de evento

```json
{
  "eventId": "evt-018fc0aa-...",
  "eventType": "ServiceStateChangeEvent",
  "eventTime": "2027-03-10T14:22:00Z",
  "event": {
    "service": {
      "id": "svc-018fb1d4-...",
      "@type": "CustomerFacingService",
      "serviceCharacteristic": [{ "name": "SubscriberID", "value": "SUB778899" }],
      "state": "inactive",
      "previousState": "active",
      "stateChangeReason": "suspensão por inadimplência"
    }
  }
}
```

### 21.5 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Outbox transacional** | Falha de publicação reverte a escrita. |
| **RF-002** | **Schema Registry** | Eventos versionados (Avro/JSON); inválidos vão para dead letter. |
| **RF-003** | **Catálogo público** | GET /events/catalog com schemas e exemplos. |
| **RF-004** | **Idempotência** | UUID v7 por evento. |

### 21.6 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Toda mudança relevante publica evento. |
| **RN-002** | Eventos são imutáveis e idempotentes. |

### 21.7 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Outbox** | Falha de publicação reverte escrita. |
| **CA-002** | **Catálogo** | GET /events/catalog lista os 5 eventos com schema. |

### 21.8 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Eventos canônicos** | Não publica | Não publica | Webhooks limitado | **TMF688 nativo (outbox)** |

---

## 22. Cenários ilustrativos da modelagem

Três cenários para validar que o modelo do Módulo 3 opera em conjunto com os Módulos 1 e 2 na prática V.tal, atravessando catálogo, CFS/RFS, amarração a recursos e ciclo de vida.

### 22.1 Cenário A — Banda larga residencial via ISP (wholesale Bitstream)

**Contexto:** Assinante final do **Provedor X** (Tenant ISP) ativa banda larga 700M em apartamento na Tijuca, RJ. A V.tal entrega bitstream ao ISP; o ISP fatura o usuário final. A V.tal **não** conhece o usuário final — conhece o ISP e o ponto de instalação.

```
MÓDULO 1 — GEOGRAPHIC (o "onde")
═══════════════════════════════════════════════════════════════════
GeographicAddress "Rua X, 100, ap. 302, Tijuca, RJ"   (era HP; agora HC)
GeographicSite InstallationPoint "ap.302"  (criado na transição HP→HC)

MÓDULO 2 — RESOURCE (o "o quê")
═══════════════════════════════════════════════════════════════════
ONT-778899 (PhysicalResource) · place → InstallationPoint
Port PON 0/1/3 da OLT-RJ-TIJ-CO-01 (PhysicalResource)
S-VLAN 1001 · C-VLAN 778 (LogicalResource)

MÓDULO 3 — SERVICE (o "para quê / para quem")
═══════════════════════════════════════════════════════════════════
RFS "Acesso-GPON-778899"  (state: active)
   supportingResource → ONT, Port PON, S-VLAN, C-VLAN
   serviceCharacteristic → perfil_banda=GPON-700-350

CFS "Bitstream-GPON-700-ProvedorX-SUB778899"  (state: active)
   SubscriberID = SUB778899
   relatedParty[subscriber] → Tenant "Provedor X"   ← o cliente é o ISP
   supportingService → RFS Acesso-GPON-778899
   place[installationAddress] → GeographicAddress ap.302
   characteristic → modelo_comercial=wholesale
```

**O que o cenário valida:** o cliente do CFS é o ISP (multi-tenant estrutural); o RFS é compartilhável (se a V.tal também vendesse direto no mesmo ponto, seria outro CFS sobre o mesmo RFS); HP→HC instanciou o serviço; nenhum dado físico foi duplicado no Service.

### 22.2 Cenário B — Cliente corporativo, link dedicado multiponto

**Contexto:** Empresa **Acme** (cliente direto V.tal) contrata link dedicado 1G entre matriz (RJ) e filial (SP), com L3VPN. Reaproveita o cenário Acme do HLD03 (seção 31.1), agora com a decomposição de serviço.

```
CFS "Link-Dedicado-1G-Acme"  (SubscriberID SUB-CORP-12345 · subscriber: Acme direto)
 ├─ place: endpointA=Matriz RJ (site), endpointZ=Filial SP (site)
 ├─ sla_comercial = Empresarial-99.9 / MTTR 4h
 ├─ supportingService → RFS "Acesso-Ethernet-Acme-RJ"
 │      supportingResource → CPE Cisco ISR 1100 (RJ), Port WAN, Switch porta 1/0/12
 ├─ supportingService → RFS "Acesso-Ethernet-Acme-SP"
 │      supportingResource → CPE (SP), Port WAN, Switch porta
 └─ supportingService → RFS "Transporte-L3VPN-Acme"
        serviceCharacteristic → rd=65000:12345
        supportingResource → VRF CUSTOMER-ACME-12345, Prefix 200.10.50.0/24, IP gerência
        └─ supportingService → RFS "Backbone-EVPN-Core" (compartilhado)
```

**O que o cenário valida:** composição CFS→RFS em árvore; `place` multiponto A/Z; RFS de backbone compartilhado entre clientes; recursos lógicos (VRF/IP) do Módulo 2 referenciados, não duplicados.

### 22.3 Cenário C — CloudVoIP sobre o link da Acme

```
CFS "CloudVoIP-10ramais-Acme" (SubscriberID SUB-VOIP-7788)
 ├─ serviceRelationship → CFS "Link-Dedicado-1G-Acme" (dependsOn)
 └─ supportingService → RFS "Tronco-SIP-Acme"
        supportingResource → Faixa E.164 +55 21 4002-89xx (LogicalResource)
```

**O que o cenário valida:** serviço sobre serviço via `serviceRelationship dependsOn`; números E.164 como Resource lógico (Módulo 2); base para suspensão em cascata.

### 22.4 Padrões reaproveitáveis

- **CFS = comercial, RFS = técnico, sempre.** A pergunta "o cliente vê isso?" decide a camada.
- **Resource nunca é duplicado.** Toda referência física/lógica é `supportingResource` no RFS.
- **O cliente do CFS pode ser um Tenant ISP.** Wholesale é o caso default V.tal.
- **HP→HC instancia o serviço.** Antes disso, só existe endereço viável (Geo) — não há Service.
- **SubscriberID sobrevive a re-homes.** A identidade comercial é estável; a realização técnica é fluida.

---

## 23. Síntese arquitetural do módulo

- **Catálogo + Instância (TMF633 + TMF638).** ServiceSpecification (CFS/RFS) define; Service (CFS/RFS) instancia.
- **CFS/RFS como cidadão de primeira classe.** O split SID é o diferencial frente a inventários resource-centric.
- **Service referencia Resource, nunca duplica.** `supportingResource` é a única ponte ao Módulo 2.
- **Multi-tenant estrutural.** O cliente do CFS é tipicamente um Tenant ISP (wholesale).
- **Home Passed não é Service.** Viabilidade é Geo+Order; serviço nasce no HC.
- **Eventos canônicos como contrato.** TMF688 habilita Assurance, BSS, Order e Data Lake.
- **Agnóstico à origem.** Grupo `_origin` preserva identidades de serviço legadas.

---

## 24. Contratos com outros módulos do Nexus

| Módulo | Tipo de consumo | Detalhe |
|---|---|---|
| **Módulo 1 — Geographic** | Síncrono (referência) | Service referencia Site/Address via `place`. Validação de existência no save. |
| **Módulo 2 — Resource** | Síncrono (referência) + Assíncrono (eventos) | RFS referencia Resources via `supportingResource`. Consome ResourceStateChange para análise de impacto. Terminar serviço libera reservas de Resource. |
| **Módulo 4 — Order & Fulfillment** | Síncrono (origem) + Assíncrono (eventos) | Orders criam/alteram Services (decomposição da ordem). Viabilidade (TMF645/HP) é do Order, não do Service. `serviceOrderItem` referencia o item de ordem. |
| **Módulo 5 — Process Orchestration** | Síncrono (BPMN tasks) | Ativação/desativação complexa, re-home e suspensão em cascata podem ser orquestrados por BPMN. |
| **Módulo 6 — Party & Tenant** | Síncrono (referência) | `relatedParty[subscriber]` → Tenant ISP / cliente. Validação de existência (diferida no MVP — D-3). |
| **Módulo 7 — Analytics & Events** | Assíncrono (consumidor) | Eventos TMF688 do Service consumidos pelo Data Lake (penetração, churn, ocupação). |
| **Módulo 8 — Platform & Admin** | Síncrono (RBAC, Audit) | RBAC por Tenant e tipo de serviço (ISP enxerga apenas seus CFS). |

---

## 25. Questões em aberto

| ID | Questão | Status / Decisão | Responsável |
|---|---|---|---|
| **Q-001** | Catálogo inicial de ServiceSpecifications (CFS+RFS) do MVP: lista canônica fechada (velocidades GPON, variantes empresariais, VoIP). | *Aberta* | *Produto + Engenharia V.tal* |
| **Q-002** | Geração do SubscriberID: formato, faixa, autoridade emissora (Nexus-native) e convivência com IDs legados de assinante. | *Aberta* | *Produto + BSS* |
| **Q-003** | Validação de `relatedParty[subscriber]` antes do Módulo 6: diferida com reconciliação, ou Party mínima provisória? | ✅ **Decidido (D-3, Jun/2026):** validação **diferida** no MVP — Subscriber referenciado por ID, reconciliado quando o Módulo 6 entrar (Fase 3). Ver 25.1. | *Arquitetura* |
| **Q-004** | Granularidade do RFS GPON: um RFS por assinante, ou RFS de "porta PON" agregando assinantes? Trade-off volume vs. fidelidade. | *Aberta* | *Engenharia + Arquitetura* |
| **Q-005** | Modelagem de bundle comercial (acesso + VoIP + valor agregado): CFS bundle (`isBundle`) ou agregação via serviceRelationship? | *Aberta* | *Produto* |
| **Q-006** | Propagação de estado CFS↔RFS↔Resource: política de cascata (suspensão, falha) — automática ou orquestrada (Módulo 5)? | *Aberta* | *Operações + Arquitetura* |
| **Q-007** | Service Assurance sobre serviço: confirmar que impact analysis (reverse trace) atende o consumidor externo de SA no MVP. | *Aberta* | *Arquitetura + Operações* |

### 25.1 Decisões resolvidas e seus impactos arquiteturais

| Decisão | Requisitos impactados | Mudança aplicada |
|---|---|---|
| **D-1 — Home Passed não é Service** (reafirma Overview 5.2) | REQ-MOD03-004, 010 | HP/viabilidade fica no Módulo 4 (TMF645) sobre Geo+Resource. Service só nasce no HC. Nenhuma entidade de viabilidade persistida no Service Inventory. |
| **D-2 — Wholesale como modelo default** | REQ-MOD03-006, 011 | `relatedParty[subscriber]` aponta tipicamente para Tenant ISP. CFS carrega `modelo_comercial` (wholesale\|direto). Mesmo RFS suporta os dois CFS. |
| **D-3 — Validação de Subscriber diferida** | REQ-MOD03-006 | No MVP, Subscriber é referenciado por ID sem validação síncrona; reconciliação quando o Módulo 6 entrar (Fase 3). |
| **D-4 — Catálogo de Service Relationships extensível** (mesmo padrão D-5.6 do Overview) | REQ-MOD03-015 | RelationshipType de serviço tem bootstrap canônico + CRUD via API com governança (Audit + TMF688). |

### 25.2 Decisão de migração — Identidade e proveniência de Services

> **Princípio arquitetural (transversal):** idêntico aos Módulos 1 e 2. O Nexus gera UUID v7 canônico próprio para todo Service; IDs de serviço legados são preservados como `characteristic` somente-leitura no grupo `_origin`.

**Sistemas de origem cobertos (Service):**

| Sistema de origem | Serviços migrados |
|---|---|
| Netwin — Network & Services | Serviços de cliente (CFS) e serviços de rede (RFS) de FTTH/GPON |
| Netwin — Resource Provisioning | Provisionamentos GPON associados a serviço |
| UMBOX | Serviços/recursos lógicos da Um Telecom (pós-M&A) |
| OZMAP | Vínculos de serviço de acesso da Um Telecom |

**Grupo canônico `_origin` para Service:**

| Characteristic | Tipo | Obrigatório na migração | Descrição |
|---|---|:---:|---|
| `_origin.system` | string | Sim | Ex.: `Netwin`, `UMBOX`, `OZMAP`. |
| `_origin.id` | string | Sim | ID do serviço no sistema de origem. |
| `_origin.entity` | string | Sim | Tipo no origem (ex.: `CustomerService`, `NetworkService`). |
| `_origin.legacySubscriberID` | string | Não | ID de assinante legado, preservado para correlação. |
| `_origin.migratedAt` | datetime | Sim | Timestamp ISO 8601. |
| `_origin.migratedBy` | string | Sim | Job de migração. |
| `_origin.extra` | JSON string | Não | Campos proprietários do legado, preservados brutos. |

**Exemplo de CFS migrado do Netwin:**

```json
{
  "id": "svc-018fc1aa-3d9f-7e02-b1c4-55dd99ee00ff",
  "@type": "CustomerFacingService",
  "name": "FTTH-700-SUB-legado-44521",
  "serviceSpecification": { "id": "spec-cfs-bitstream-gpon-700" },
  "state": "active",
  "serviceCharacteristic": [
    { "name": "SubscriberID",            "value": "SUB778899" },
    { "name": "_origin.system",          "value": "Netwin" },
    { "name": "_origin.id",              "value": "SVC-CLI-44521" },
    { "name": "_origin.entity",          "value": "CustomerService" },
    { "name": "_origin.legacySubscriberID", "value": "44521" },
    { "name": "_origin.migratedAt",      "value": "2026-11-15T02:00:00Z" },
    { "name": "_origin.migratedBy",      "value": "migration-job-netwin-svc-wave1-v1" }
  ]
}
```

**Regras do grupo `_origin` (Service):** idênticas ao Módulo 2 — somente-leitura após criação (PATCH 403 exceto role `MigrationJob`); não validado contra specCharacteristic; suporta múltiplos grupos numerados em migração em cascata.

---

## 26. Controle de revisões

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | Junho 2026 | Produto — V.tal Nexus | Versão inicial do HLD do Módulo 3 — Nexus Service Domain (HLD04), com 16 requisitos alinhados a TMF633 e TMF638, separação CFS/RFS, decisão de wholesale (D-2), reafirmação da fronteira Home Passed (D-1), cenários ilustrativos (residencial wholesale, empresarial multiponto, CloudVoIP) e seção de proveniência `_origin` para serviços. |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
