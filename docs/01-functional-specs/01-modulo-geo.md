# V.TAL NEXUS — Network Inventory Platform

## HLD Módulo 1 · Nexus Geographic

**Geographic Site, Address & Location Management**

TMFC014 · TMF673 / TMF674 / TMF675

| Campo | Valor |
|---|---|
| **Document Reference** | VTN-HLD-MOD01-GEO |
| **Versão** | 1.0 — draft |
| **Data** | Junho 2026 |
| **Documento âncora** | VTN-HLD-OVERVIEW-001 |
| **TMFC implementado** | TMFC014 — Geographic Site Mgmt |
| **Open APIs** | TMF673, TMF674, TMF675, TMF688 |
| **Requisitos cobertos** | REQ-MOD01-001 a REQ-MOD01-012 |
| **Status** | Em elaboração |

---

## 1. Propósito do módulo

O Módulo 1 — Nexus Geographic é a fundação geoespacial do V.tal Nexus. Implementa o componente ODA TMFC014 (Geographic Site Management) através das três Open APIs canônicas do TM Forum: TMF673 (Geographic Address), TMF674 (Geographic Site) e TMF675 (Geographic Location).

A responsabilidade do módulo é prover o "onde" para todas as demais entidades do Nexus: equipamentos posicionados em Sites, serviços ativados em endereços, ordens executadas sobre localidades. Sem este módulo, nenhum outro módulo do Nexus tem semântica espacial.

Este documento se ancora arquiteturalmente no documento de visão geral VTN-HLD-OVERVIEW-001 (seção 7.1) e deve ser lido em conjunto com ele para entender o posicionamento deste módulo na arquitetura completa do Nexus.

## 2. Escopo

### 2.1 Dentro do escopo

- Modelagem canônica de Geographic Address (TMF673) como entidade independente.
- Modelagem canônica de Geographic Location (TMF675) com suporte a Point, LineString e Polygon.
- Modelagem canônica de Geographic Site (TMF674) e sua hierarquia parentSite.
- Catálogo de Site Specifications com regras de contenção configuráveis.
- Regiões Geográficas como GeographicSite administrativo (category=Region).
- Grupos Funcionais como GeographicSite agrupador (category=FunctionalGroup).
- Sub-Sites (andares, salas, cages) como GeographicSite interno (category=SubSite).
- Ciclo de vida formal de Sites com histórico via TMF688 StateChangeEvent.
- Relações topológicas A↔Z entre Sites via relatedSite.
- Visão de mapa georreferenciado com sincronização bidirecional.
- Publicação canônica de eventos TMF688 para todas as mudanças relevantes.

### 2.2 Fora do escopo (tratado em outros módulos)

- Posicionamento e gestão de equipamentos físicos (cabos, postes, OLTs, racks): **Módulo 2 — Nexus Resource Domain**.
- Recursos lógicos georreferenciados (números de telefone associados a área): **Módulo 2 — Nexus Resource Domain**.
- Serviços ativados em endereços (SubscriberID): **Módulo 3 — Nexus Service Domain**.
- Viabilidade de serviço por endereço (TMF645): **Módulo 4 — Nexus Order & Fulfillment**.
- Workflow de aprovação para mudanças críticas de Site: **Módulo 5 — Nexus Process Orchestration**.
- Tenants e responsáveis (Owners) como entidades de Party: **Módulo 6 — Nexus Party & Tenant** (referenciados aqui via relatedParty).
- Métricas e dashboards de cobertura geográfica: **Módulo 7 — Nexus Analytics & Events**.
- Auditoria global e RBAC granular: **Módulo 8 — Nexus Platform & Administration**.

---

## 3. Modelo conceitual TMF

O módulo Geographic implementa o TMFC014 expondo três entidades canônicas que se referenciam, conforme o modelo de informação do TM Forum:

| Entidade | API | Papel no modelo |
|---|---|---|
| **GeographicLocation** | TMF675 | Representação geoespacial pura (Point, LineString, Polygon). Independente de qualquer outra entidade. É referenciada por endereços e sites para indicar onde estão fisicamente no mundo. |
| **GeographicAddress** | TMF673 | Endereço postal estruturado (logradouro, número, CEP, cidade, estado, país). Entidade independente que pode opcionalmente referenciar uma GeographicLocation para sua geocodificação. |
| **GeographicSite** | TMF674 | Local físico (Central, POP, Armário, andar, sala). Entidade central do módulo. Referencia GeographicLocation (place) e GeographicAddress (address). Tem hierarquia (parentSite) e relações topológicas (relatedSite). |
| **GeographicSiteSpecification** | TMF674 | Especificação de tipo de Site (Catálogo). Define atributos esperados, validações e regras de contenção (allowedParent/Child). É o ponto de extensão do metamodelo. |

### 3.1 Relações entre entidades

```
┌──────────────────────────────────┐
│  GeographicSiteSpecification     │  Catálogo (TMF674)
│  (Central, POP, Floor, Room...)  │
└──────────────┬───────────────────┘
               │ siteSpecification
               ▼
┌──────────────────────────────────┐         ┌──────────────────────┐
│       GeographicSite             │ address │  GeographicAddress   │
│  (Central RJ, POP-BOT, etc.)    ├────────►│       (TMF673)       │
│                                  │         └──────────┬───────────┘
│  parentSite ──┐                  │                    │ geographicLocation
│  relatedSite─┐│                  │ place              ▼
│              ││                  ├──────────────► ┌──────────────────────┐
│              ▼▼                  │                │ GeographicLocation   │
│      (outros GeographicSite)     │                │       (TMF675)       │
└──────────────────────────────────┘                └──────────────────────┘
```

---

## 4. Princípios de design do módulo Geographic

Os princípios abaixo são derivados da visão geral do produto (VTN-HLD-OVERVIEW-001 seção 9) e particularizados para o módulo Geographic:

### 4.1 Entidades TMF como contrato canônico

A modelagem do módulo segue rigorosamente o TMF674/TMF673/TMF675. Extensões V.tal entram como specCharacteristic (atributos customizados) no catálogo, nunca como campos hardcoded na entidade. Esta decisão preserva a interoperabilidade futura com outros sistemas ODA.

### 4.2 Separação Location ↔ Address ↔ Site

Os três conceitos são tratados como entidades distintas e referenciáveis: Location é a geometria, Address é a representação postal, Site é a unidade operacional. A mesma Location pode ser referenciada por múltiplos Sites e Addresses; um Site pode ter múltiplos Addresses (principal, despacho, cobrança).

### 4.3 Unificação no TMF674

Regiões, Grupos Funcionais, Sites e Sub-Sites são todos GeographicSite com siteSpecification distinta — não entidades separadas. Esta unificação simplifica a API, reaproveita validações e elimina a complexidade conceitual de manter hierarquias paralelas.

### 4.4 Catálogo extensível com regras de contenção configuráveis

Novos tipos de Site, novos atributos customizados e novas regras de contenção são adicionados via catálogo administrável — sem necessidade de release de código. Inspiração: Containment Manager do Kuwaiba, formalizado conforme TMF674.

### 4.5 Ciclo de vida via eventos

O histórico de transições de status não é uma tabela dedicada — é a sequência ordenada de StateChangeEvent (TMF688) no Event Store. Esta abordagem é alinhada ao princípio de Event Sourcing parcial declarado na visão geral.

### 4.6 Multi-tenancy desde a fundação

Sites podem ter relatedParty com Tenants distintos; visibilidade e operação de Sites são governadas por RBAC granular do módulo Platform & Administration. Tenants enxergam apenas Sites e relações dentro do seu escopo autorizado.

---

## 5. Resumo dos requisitos do módulo

O módulo Geographic é composto por 12 requisitos, organizados conforme o fluxo natural de modelagem TMF: primeiro as entidades geoespaciais base (Location, Address), depois o catálogo (SiteSpecification), depois as instâncias (Region, Site, Sub-Site, ciclo de vida), depois as relações (contenção, topologia A↔Z) e finalmente as funcionalidades transversais (mapa, eventos).

| ID | Título | Entidade TMF principal |
|---|---|---|
| **REQ-MOD01-001** | Cadastro de Geographic Location (ponto, área, linha) | *GeographicLocation (TMF675)* |
| **REQ-MOD01-002** | Cadastro de Geographic Address (endereço postal estruturado) | *GeographicAddress (TMF673)* |
| **REQ-MOD01-003** | Catálogo de Geographic Site Specification (tipos de site) | *GeographicSiteSpecification (TMF674)* |
| **REQ-MOD01-004** | Cadastro de Região Geográfica (GeographicSite administrativo) | *GeographicSite com siteType=Region (TMF674)* |
| **REQ-MOD01-005** | Classificação Funcional de Sites (siteType e grupo funcional) | *GeographicSite com siteType (TMF674) + grupo via relatedSite* |
| **REQ-MOD01-006** | Cadastro de Geographic Site (entidade central do módulo) | *GeographicSite (TMF674)* |
| **REQ-MOD01-007** | Sub-Sites (andares, salas, cages como GeographicSite) | *GeographicSite com category=SubSite (TMF674)* |
| **REQ-MOD01-008** | Ciclo de Vida do Site (status, transições e histórico) | *GeographicSite.status + StateChangeEvent (TMF674 + TMF688)* |
| **REQ-MOD01-009** | Regras de Contenção e Hierarquia entre Sites | *allowedParentSpec / allowedChildSpec em SiteSpec (TMF674)* |
| **REQ-MOD01-010** | Relações Topológicas A↔Z entre Sites | *relatedSite[] em GeographicSite (TMF674)* |
| **REQ-MOD01-011** | Visão de Mapa Georreferenciado | *Não é entidade TMF — funcionalidade de UI sobre TMF674+675* |
| **REQ-MOD01-012** | Eventos de Domínio do Módulo Geographic | *Event (TMF688) — vários tipos* |

### 5.1 Ordem de implementação sugerida

A ordem natural de construção respeita as dependências entre entidades:

- **Camada 1 (fundação geoespacial):** REQ-001 (Location) + REQ-002 (Address) + REQ-003 (SiteSpec). Sem estas três, nenhuma instância de Site pode existir.
- **Camada 2 (instâncias hierárquicas):** REQ-004 (Região) + REQ-005 (Grupo Funcional) + REQ-006 (Site) + REQ-007 (Sub-Site). É a operação CRUD efetiva sobre Sites.
- **Camada 3 (governança):** REQ-008 (Ciclo de Vida) + REQ-009 (Contenção). Endurece a operação do dia a dia.
- **Camada 4 (topologia e visualização):** REQ-010 (Relações A↔Z) + REQ-011 (Mapa). Eleva a operação para análise topológica.
- **Camada 5 (interoperabilidade):** REQ-012 (Eventos). Habilita módulos downstream e Data Lake — pode ser implementado em paralelo às camadas 2-4.


---

## 6. REQ-MOD01-001 — Cadastro de Geographic Location (ponto, área, linha)

> **Entidade TMF:** GeographicLocation (TMF675)  
> **Open API TMF:** TMF675 — Geographic Location Management API  
> **Prioridade:** Alta — entidade fundacional do módulo  
> **Status:** Em levantamento · Versão 1.0 — draft

### 6.1 Descrição

Uma GeographicLocation é a representação geoespacial pura de "onde algo está" no mundo físico. Pode ser um ponto (poste, CTO, equipamento individual), uma linha (traçado de cabo, rota de duto) ou uma área (zona de cobertura, polígono de uma cidade). É a entidade independente que provê coordenadas para qualquer outra entidade do Nexus que precise ser geolocalizada — Sites, Resources de planta externa, endereços postais.

### 6.2 Racional arquitetural

O design do TMF675 trata localização geográfica como entidade própria com ID, não como atributo embutido em outras entidades. Esta é uma decisão arquitetural importante: nos sistemas legados, latitude e longitude são campos do Site (Netwin, NetBox) ou atributos do metamodelo (Kuwaiba). O Nexus adota o modelo TMF675 porque: (a) a mesma localização pode ser referenciada por múltiplas entidades (um Site e um Endereço podem apontar para o mesmo ponto); (b) localizações são reutilizáveis em consultas geoespaciais sem replicação de dados; (c) suporta naturalmente geometrias complexas (linhas para cabos, polígonos para áreas de cobertura) que campos lat/long não conseguem expressar.

### 6.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicLocation (TMF675):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7 gerado pelo Nexus. |
| `href` | string | Não | URL canônica da entidade. |
| `geometryType` | enum | Sim | Point | LineString | Polygon. Padrão V.tal: Point para sites e equipamentos; LineString para cabos. |
| `geometry` | GeoJSON | Sim | Geometria conforme RFC 7946 (GeoJSON). Coordenadas em [longitude, latitude] — note a ordem invertida em relação ao senso comum. |
| `spatialRef` | string | Não | Sistema de referência espacial. Padrão V.tal: "EPSG:4326" (WGS84). |
| `accuracy` | string | Não | Indicação de precisão da coordenada (ex.: GPS, manual, derivado de endereço). |
| `referencePoint` | string | Não | Descrição textual auxiliar (ex.: "Em frente ao número 100, próximo ao poste de luz"). |
| `relatedEntity` | array<EntityRef> | Não | Lista de entidades que referenciam esta localização (back-reference para consulta). |
| `validFor` | TimePeriod | Não | Período de validade — permite versionar localizações ao longo do tempo. |

### 6.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "loc-018f8a4e-e51c-7c4d-91a9-2e3e6c2f4a13",
  "href": "/tmf-api/geographicLocationManagement/v4/geographicLocation/loc-018f...",
  "geometryType": "Point",
  "geometry": {
    "type": "Point",
    "coordinates": [-43.1809, -22.9035]
  },
  "spatialRef": "EPSG:4326",
  "accuracy": "GPS",
  "referencePoint": "Em frente ao numero 100, Rua Voluntarios da Patria",
  "validFor": {
    "startDateTime": "2026-06-26T10:00:00Z"
  }
}
```

### 6.5 Pré-condições

- O usuário possui permissão de escrita no módulo Geographic.
- Para LineString e Polygon, os pontos devem formar geometria válida (mínimo 2 pontos para linha, polígono fechado).

### 6.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Geographic Location** | Permitir criação de GeographicLocation com geometryType, geometry (GeoJSON), spatialRef e demais atributos. |
| **RF-002** | **Validação geométrica** | Validar geometria conforme RFC 7946: Point com [long, lat]; LineString com array de pontos ordenado; Polygon com anel fechado. |
| **RF-003** | **Validação de intervalo** | Validar latitude em [-90, 90] e longitude em [-180, 180] para todos os pontos da geometria. |
| **RF-004** | **Buscar por proximidade** | Suportar busca de localizações dentro de raio (em metros) de um ponto de referência, usando distância geodésica. |
| **RF-005** | **Buscar por bounding box** | Suportar busca de localizações contidas em um retângulo geográfico (minLong, minLat, maxLong, maxLat). |
| **RF-006** | **Buscar por interseção** | Suportar busca de localizações que intersectam um polígono dado (caso de uso: "todos os Sites na área de impacto X"). |
| **RF-007** | **Atualizar geometria** | Permitir atualização de geometria; mudanças geram evento TMF688 (GeographicLocationAttributeValueChangeEvent) para sistemas consumidores. |
| **RF-008** | **Excluir Location** | Bloquear exclusão de Location referenciada por entidades ativas (Site, Address, Resource); permitir soft-delete via validFor. |
| **RF-009** | **Consulta de referências** | Expor endpoint para listar todas as entidades que referenciam uma dada GeographicLocation. |
| **RF-010** | **Exportação GeoJSON** | Exportar localizações em formato GeoJSON nativo para integração com sistemas GIS externos. |

### 6.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Toda GeographicLocation deve ter geometria válida conforme RFC 7946 — geometrias malformadas são rejeitadas no save. |
| **RN-002** | O sistema de referência espacial padrão é EPSG:4326 (WGS84); outros sistemas podem ser registrados como metadado mas não são suportados em consultas geoespaciais nativas do MVP. |
| **RN-003** | Localizações nunca são excluídas fisicamente quando referenciadas — apenas marcadas com validFor.endDateTime. |
| **RN-004** | Para LineString, ordem dos pontos é significativa (define direção do traçado para cabos). |
| **RN-005** | Para Polygon, o anel exterior deve ser fechado (primeiro ponto = último ponto) e seguir orientação anti-horária. |
| **RN-006** | Buscas por proximidade usam distância geodésica (fórmula de Haversine ou equivalente), não distância euclidiana. |
| **RN-007** | Toda criação ou alteração gera evento TMF688 com correlation ID rastreável. |

### 6.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | Point criado com geometria {type:"Point", coordinates:[long,lat]} retorna 201 com ID e href; LineString com 5 pontos é aceito com mesmo padrão. |
| **CA-002** | **Validação RFC 7946** | Geometria malformada (Point sem coordinates, LineString com 1 ponto, Polygon não fechado) retorna 400 com mensagem específica do erro. |
| **CA-003** | **Validação de intervalo** | Longitude=181 ou latitude=-91 retornam 400 antes de qualquer persistência. |
| **CA-004** | **Busca por proximidade** | GET /geographicLocation?near=-43.18,-22.90&radius=1000 retorna localizações dentro de 1km, ordenadas por distância crescente. |
| **CA-005** | **Bounding box** | GET /geographicLocation?bbox=-43.20,-22.92,-43.16,-22.88 retorna apenas localizações dentro do retângulo informado. |
| **CA-006** | **Bloqueio de exclusão** | DELETE em Location referenciada retorna 409 com lista de referências; reativação com soft-delete é permitida. |
| **CA-007** | **Evento publicado** | Cada criação/alteração publica evento TMF688 no tópico geographic.location.v1 com payload conforme schema. |
| **CA-008** | **Export GeoJSON** | GET /geographicLocation com Accept: application/geo+json retorna FeatureCollection válida conforme RFC 7946. |

### 6.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Entidade de localização independente** | Não (lat/long no Site) | Atributo de GenericLocation no metamodelo | Campos lat/long no Site | **GeographicLocation como entidade própria conforme TMF675** |
| **Geometrias complexas (LineString, Polygon)** | Não suporta | Não suporta nativamente | Não suporta | **Suporte nativo via GeoJSON** |
| **Busca por proximidade** | Sim (Tolerância em m) | Não nativo | Não nativo | **Suporte nativo com distância geodésica** |
| **Reutilização de localização** | Não | Não | Não | **Localização única referenciada por N entidades** |


---

## 7. REQ-MOD01-002 — Cadastro de Geographic Address (endereço postal estruturado)

> **Entidade TMF:** GeographicAddress (TMF673)  
> **Open API TMF:** TMF673 — Geographic Address Management API  
> **Prioridade:** Alta — entidade fundacional do módulo  
> **Status:** Em levantamento · Versão 1.0 — draft

### 7.1 Descrição

Um GeographicAddress é um endereço postal estruturado: logradouro, número, complemento, bairro, cidade, estado, país, CEP. É a entidade canônica para correspondência, despacho técnico, integração com base de Logradouros e atendimento a regras regulatórias (Anatel, faturamento). Como entidade independente do TMF673, pode ser referenciada por múltiplos Sites e por Subscribers no Service Inventory.

### 7.2 Racional arquitetural

Endereço postal e geometria geográfica são conceitos distintos: o endereço é uma representação convencional humana (logradouro, número), enquanto a geometria é uma representação matemática (coordenadas). O TMF673 modela endereço como entidade própria que pode opcionalmente referenciar uma GeographicLocation — esta separação é importante porque: (a) o mesmo endereço pode ser geocodificado com diferentes precisões ao longo do tempo; (b) endereços têm validação cultural (formato, CEP, normalização) que coordenadas não têm; (c) a integração com a base Logradouros da V.tal (Geosite) é por endereço, não por coordenada. Os sistemas legados tratam endereço como tabela embutida no Site (Netwin) ou como campo texto livre (NetBox) ou como atributo no metamodelo (Kuwaiba) — todos modelos inferiores ao TMF673.

### 7.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicAddress (TMF673):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7 gerado pelo Nexus. |
| `href` | string | Não | URL canônica da entidade. |
| `streetType` | string | Não | Tipo de logradouro: Rua, Avenida, Travessa, Praça, Estrada. |
| `streetName` | string | Sim | Nome do logradouro sem o tipo. |
| `streetNr` | string | Não | Número do imóvel; pode conter alfanumérico (S/N, 100A). |
| `streetNrSuffix` | string | Não | Complemento do número (apto, bloco, sala). |
| `locality` | string | Não | Bairro. |
| `city` | string | Sim | Cidade. |
| `stateOrProvince` | string | Sim | Estado (UF em 2 letras para Brasil). |
| `country` | string | Sim | País (código ISO 3166-1 alpha-2; padrão "BR"). |
| `postcode` | string | Não | CEP no formato NNNNN-NNN. |
| `geographicLocation` | EntityRef | Não | Referência opcional para GeographicLocation (TMF675) com a geocodificação do endereço. |
| `geographicSubAddress` | array | Não | Sub-endereços (apartamento, sala, andar) — útil para condomínios. |
| `validFor` | TimePeriod | Não | Período de validade do endereço. |

### 7.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "addr-018f8a4e-9c3b-7c10-a1d2-9f0b3e7a5c12",
  "href": "/tmf-api/geographicAddressManagement/v4/geographicAddress/addr-018f...",
  "streetType": "Rua",
  "streetName": "Voluntarios da Patria",
  "streetNr": "100",
  "streetNrSuffix": "Bloco A",
  "locality": "Botafogo",
  "city": "Rio de Janeiro",
  "stateOrProvince": "RJ",
  "country": "BR",
  "postcode": "22270-170",
  "geographicLocation": {
    "id": "loc-018f8a4e-e51c-7c4d-91a9-2e3e6c2f4a13",
    "@referredType": "GeographicLocation"
  },
  "validFor": { "startDateTime": "2026-06-26T10:00:00Z" }
}
```

### 7.5 Pré-condições

- O usuário possui permissão de escrita no módulo Geographic.
- Para integração com Logradouros: a base Logradouros V.tal está disponível para lookup.

### 7.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Geographic Address** | Permitir criação de endereço com os campos do TMF673; validar obrigatórios (streetName, city, stateOrProvince, country). |
| **RF-002** | **Lookup em Logradouros** | Integrar o campo streetName com a base Logradouros V.tal para sugestão e padronização ao digitar. |
| **RF-003** | **Validação de CEP** | Validar formato do CEP brasileiro (NNNNN-NNN); opcionalmente validar contra base externa de CEPs. |
| **RF-004** | **Vinculação a Geographic Location** | Permitir associar opcionalmente uma GeographicLocation (TMF675) ao endereço para geocodificação. |
| **RF-005** | **Geocodificação automática** | Quando endereço é criado sem geographicLocation, oferecer geocodificação automática via serviço externo (com aprovação). |
| **RF-006** | **Sub-endereços** | Suportar geographicSubAddress (apartamento, sala, andar) para condomínios e edifícios comerciais. |
| **RF-007** | **Editar e versionar** | Permitir edição com versionamento via validFor; histórico de endereços anteriores preservado como entidades inativas. |
| **RF-008** | **Excluir endereço** | Bloquear exclusão de endereço referenciado por Site ou Subscriber ativo; permitir soft-delete. |
| **RF-009** | **Padronização (normalize)** | Endpoint dedicado para normalizar um endereço (uppercase, abreviações expandidas, CEP formatado) sem persistir. |
| **RF-010** | **Eventos** | Publicar evento TMF688 a cada criação/alteração de endereço. |

### 7.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Os campos streetName, city, stateOrProvince e country são obrigatórios. |
| **RN-002** | CEP, quando informado, deve seguir o formato NNNNN-NNN (8 dígitos com hífen). |
| **RN-003** | O código de país segue ISO 3166-1 alpha-2; padrão "BR". |
| **RN-004** | Endereços não são removidos fisicamente quando referenciados — apenas com validFor.endDateTime. |
| **RN-005** | A vinculação com GeographicLocation é opcional, mas recomendada para Sites — sites sem geocodificação não aparecem na visão de mapa. |
| **RN-006** | A normalização aplica regras V.tal: streetType em uppercase, abreviações padronizadas (Av., Tv., Pç.). |
| **RN-007** | Toda criação ou alteração gera entrada no Audit Trail e evento TMF688. |

### 7.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST com streetName="Voluntarios da Patria", city="Rio de Janeiro", stateOrProvince="RJ", country="BR" retorna 201 com ID. |
| **CA-002** | **Obrigatórios validados** | POST sem city retorna 400 com mensagem indicando o campo faltante. |
| **CA-003** | **Validação de CEP** | postcode="22270170" sem hífen é normalizado para "22270-170"; postcode="ABCDE-FGH" retorna 400. |
| **CA-004** | **Lookup Logradouros** | Endpoint GET /addresses/suggest?q=volunt retorna sugestões da base Logradouros com cidade e estado pré-preenchidos. |
| **CA-005** | **Geocodificação** | Endpoint POST /addresses/{id}/geocode dispara geocodificação e cria GeographicLocation vinculada. |
| **CA-006** | **Sub-endereços** | Criar endereço com geographicSubAddress=[{type:"apartamento", value:"301"}] persiste corretamente. |
| **CA-007** | **Versionamento** | Edição cria nova versão com validFor.startDateTime atual; versão anterior tem validFor.endDateTime preenchido. |
| **CA-008** | **Bloqueio de exclusão** | DELETE em endereço de Site ativo retorna 409 com lista de Sites referenciando. |

### 7.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Endereço como entidade própria** | Tabela embutida no Site | Atributo de texto no metamodelo | Dois campos texto no Site | **Entidade GeographicAddress conforme TMF673** |
| **Múltiplos endereços por Site** | Sim (tabela com principal) | Não | Não (2 campos texto) | **Sim — Site referencia N endereços** |
| **Integração Logradouros** | Sim (Geosite Logradouros) | Não | Não | **Integração reaproveitada via API de sugestão** |
| **Sub-endereços (apto, sala)** | Texto livre no campo | Não modelado | Texto livre | **Modelado via geographicSubAddress (TMF673)** |
| **Vinculação com geocodificação** | Não (campos juntos) | Não (atributos separados) | Não (campos juntos) | **Vinculação opcional via referência TMF675** |


---

## 8. REQ-MOD01-003 — Catálogo de Geographic Site Specification (tipos de site)

> **Entidade TMF:** GeographicSiteSpecification (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — pré-requisito de todos os requisitos de Site  
> **Status:** Em levantamento · Versão 1.0 — draft

### 8.1 Descrição

Uma GeographicSiteSpecification é a definição de um tipo de Site no catálogo do Nexus: Central Office, POP, Armário de Distribuição, Data Center, Ponto de Instalação, Andar, Sala, Cage. Define os atributos esperados, validações específicas, regras de contenção (quais tipos podem ser pai/filho) e campos customizados V.tal (CLLI, CN, Anel, SICOM). É o ponto de extensão do metamodelo para o domínio geográfico.

### 8.2 Racional arquitetural

O TMF674 introduz GeographicSiteSpecification como entidade do catálogo de Site Management — o equivalente de ResourceSpecification para o domínio de Resource. Esta separação entre instância (Site) e especificação (SiteSpecification) é central para um inventário extensível: novos tipos de Site podem ser introduzidos sem alteração de código, com seus próprios atributos e regras de contenção. Esta capacidade é a fusão de duas inspirações: o Containment Manager do Kuwaiba (regras de contenção configuráveis em runtime) e a tipagem polimórfica do Netwin (formulário muda conforme o tipo selecionado). O Nexus formaliza essa capacidade no padrão TMF674, eliminando o caráter implícito do Netwin e o caráter exclusivamente metamodel-driven do Kuwaiba.

### 8.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSiteSpecification (TMF674):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7. |
| `name` | string | Sim | Nome do tipo de site (ex.: "Central Office", "POP", "Armário", "Andar", "Sala"). |
| `code` | string | Sim | Código interno (ex.: "CO", "POP", "ARM", "AND", "SLA"). Único na plataforma. |
| `description` | string | Não | Descrição funcional do tipo de site. |
| `category` | enum | Sim | Region | FunctionalGroup | Site | SubSite. Determina o papel hierárquico. |
| `lifecycleStatus` | enum | Sim | Active | Retired — especificações descontinuadas não criam novos sites. |
| `specCharacteristic` | array<CharSpec> | Não | Lista de atributos customizados do tipo (CLLI, CN, Anel, capacidade etc.). |
| `validFor` | TimePeriod | Não | Período de validade da especificação. |
| `allowedParentSpec` | array<EntityRef> | Não | Lista de SiteSpecifications que podem ser pais deste tipo (catálogo de contenção). |
| `allowedChildSpec` | array<EntityRef> | Não | Lista de SiteSpecifications que podem ser filhos deste tipo. |

### 8.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "spec-central-office",
  "name": "Central Office",
  "code": "CO",
  "category": "Site",
  "lifecycleStatus": "Active",
  "description": "Central de telecomunicacoes principal da V.tal",
  "specCharacteristic": [
    { "name": "CLLI", "valueType": "string", "mandatory": true,
      "validator": "^[A-Z0-9]{11}$" },
    { "name": "CN", "valueType": "string", "mandatory": true,
      "configurable": false, "description": "Calculado por Regiao+Regional" },
    { "name": "Anel", "valueType": "string", "mandatory": false },
    { "name": "SICOM_ID", "valueType": "string", "mandatory": false }
  ],
  "allowedParentSpec": [
    { "id": "spec-region", "@referredType": "GeographicSiteSpecification" }
  ],
  "allowedChildSpec": [
    { "id": "spec-floor", "@referredType": "GeographicSiteSpecification" },
    { "id": "spec-room", "@referredType": "GeographicSiteSpecification" }
  ]
}
```

### 8.5 Pré-condições

- O usuário possui permissão de Administrador do Catálogo Geographic.

### 8.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar SiteSpecification** | Permitir criação de novo tipo de Site com nome, código, categoria e atributos customizados. |
| **RF-002** | **Catálogo de tipos base** | Pré-popular o catálogo com tipos canônicos V.tal: Region, FunctionalGroup, CentralOffice, POP, Cabinet, InstallationPoint, Floor, Room, Cage. |
| **RF-003** | **Atributos customizados** | Permitir definir specCharacteristics por tipo: nome, tipo (string/int/enum/date), obrigatório, valor padrão, validador (regex ou lookup). |
| **RF-004** | **Regras de contenção** | Configurar allowedParentSpec e allowedChildSpec para definir quais tipos podem se conter. |
| **RF-005** | **Versionamento** | Permitir versionar SiteSpecifications via validFor; especificações descontinuadas não criam novos sites mas mantêm sites existentes. |
| **RF-006** | **Editar SiteSpecification** | Editar nome, descrição e atributos; alteração de specCharacteristics não-obrigatórios é segura; obrigatórios novos exigem migração. |
| **RF-007** | **Excluir SiteSpecification** | Bloquear exclusão de SiteSpec com sites instanciados; permitir transição para lifecycleStatus=Retired. |
| **RF-008** | **Consultar contenção possível** | Endpoint GET /geographicSiteSpecification/{id}/allowedChildren retorna tipos aceitos como filhos para uso em formulários dinâmicos. |
| **RF-009** | **Eventos** | Publicar evento TMF688 a cada criação/alteração de especificação. |

### 8.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | O code da SiteSpecification deve ser único globalmente na plataforma. |
| **RN-002** | As 4 categorias base (Region, FunctionalGroup, Site, SubSite) determinam o papel hierárquico e não podem ser sobrescritas. |
| **RN-003** | specCharacteristic obrigatório só pode ser adicionado a SiteSpec sem sites instanciados — caso contrário, exige migração explícita. |
| **RN-004** | Regras de contenção (allowedParent/Child) são imutáveis para combinações já existentes — só podem ser flexibilizadas, não restringidas. |
| **RN-005** | SiteSpecification em status Retired não pode criar novos sites, mas sites existentes desse tipo continuam ativos. |
| **RN-006** | Toda alteração no catálogo gera registro no Audit Trail e evento TMF688. |

### 8.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST com name="POP Regional", code="POP-REG", category="Site" retorna 201 com ID. |
| **CA-002** | **Unicidade de code** | POST com code já existente retorna 409 com mensagem específica. |
| **CA-003** | **Atributos custom** | SpecCharacteristic [{name:"CLLI", type:"string", mandatory:true, validator:"^[A-Z0-9]{11}$"}] é aceito e aplicado a novos sites. |
| **CA-004** | **Contenção configurada** | SiteSpec "Floor" com allowedParentSpec=["CentralOffice","POP"] permite criar Floor apenas como filho desses tipos. |
| **CA-005** | **Bloqueio de exclusão** | DELETE em SiteSpec com sites instanciados retorna 409; PATCH para lifecycleStatus="Retired" é aceito. |
| **CA-006** | **Allowed children API** | GET /geographicSiteSpecification/{id}/allowedChildren retorna lista de SiteSpecs filhas permitidas com 200. |
| **CA-007** | **Migração de obrigatório** | Adicionar specCharacteristic obrigatório a SiteSpec com sites instanciados exige parâmetro migrationStrategy explícito. |
| **CA-008** | **Evento publicado** | Cada criação/alteração publica evento no tópico geographic.siteSpec.v1. |

### 8.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Catálogo de tipos formalizado** | Não (campo tipo no formulário) | Sim (Data Model Manager) | Parcial (modelo Django fixo) | **GeographicSiteSpecification conforme TMF674** |
| **Atributos customizados por tipo** | Campos hardcoded (CLLI, CN, Anel) | Sim (metamodelo) | Sim (Custom Fields) | **specCharacteristic versionado** |
| **Regras de contenção configuráveis** | Implícitas no formulário polimórfico | Sim (Containment Manager) | Hardcoded no modelo | **allowedParent/ChildSpec configuráveis** |
| **Versionamento do catálogo** | Não | Parcial | Não | **validFor + lifecycleStatus** |


---

## 9. REQ-MOD01-004 — Cadastro de Região Geográfica (GeographicSite administrativo)

> **Entidade TMF:** GeographicSite com siteType=Region (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta  
> **Status:** Em levantamento · Versão 1.0 — draft

### 9.1 Descrição

Uma Região Geográfica é a unidade de agrupamento hierárquico de natureza administrativa/geopolítica: Continente, País, Estado, Cidade, Regional V.tal, Bairro. No modelo TMF674, Regiões não são entidade separada — são GeographicSite com category="Region" no GeographicSiteSpecification. Esta decisão arquitetural unifica o tratamento de "onde" no modelo TMF e elimina a complexidade de manter duas hierarquias paralelas (Region + Site) como faz o NetBox.

### 9.2 Racional arquitetural

Na primeira versão do levantamento, modelamos Região como entidade separada (inspirada no NetBox Region). Após o alinhamento ao TMF674, fica claro que Região é apenas mais um tipo de GeographicSite — um Site administrativo que não tem equipamentos nem serviços, mas que serve de pai hierárquico para outros Sites. Esta unificação traz quatro benefícios: (a) uma única API (TMF674) cobre toda a hierarquia geográfica; (b) consultas hierárquicas usam o mesmo mecanismo (parentSite) para Região, Site e Sub-Site; (c) a extensibilidade do GeographicSiteSpecification se aplica também a Regiões (campos customizados para Regional V.tal, por exemplo); (d) elimina a confusão conceitual de "Região" no NetBox vs. "Site Group" no NetBox vs. "Region" como conceito do dia a dia.

### 9.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite com siteType=Region (TMF674):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `siteSpecification` | EntityRef | Sim | Referência para GeographicSiteSpecification com category="Region". |
| `name` | string | Sim | Nome da Região (ex.: "Brasil", "Rio de Janeiro", "Regional Sudeste V.tal"). |
| `code` | string | Sim | Código curto (ex.: "BR", "RJ", "REG-SE"). Único no nível hierárquico. |
| `parentSite` | EntityRef | Não | Referência ao GeographicSite pai (Região superior). Nulo para Região de topo. |
| `status` | enum | Sim | Active | Inactive — Regiões podem ser desativadas mas raramente excluídas. |
| `relatedParty` | array | Não | Responsáveis pela Região (ex.: gerente regional V.tal). |
| `characteristic` | array | Não | Valores dos specCharacteristics definidos na SiteSpecification (ex.: código IBGE, ISO 3166). |

### 9.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "site-region-rj",
  "name": "Rio de Janeiro",
  "code": "RJ",
  "siteSpecification": { "id": "spec-region", "@referredType": "GeographicSiteSpecification" },
  "parentSite": { "id": "site-region-br", "@referredType": "GeographicSite" },
  "status": "Active",
  "characteristic": [
    { "name": "ISO_CODE", "value": "BR-RJ" },
    { "name": "IBGE_CODE", "value": "33" }
  ]
}
```

### 9.5 Pré-condições

- Existe SiteSpecification com category="Region" no catálogo (REQ-MOD01-003).
- A Região pai, quando informada, já existe.

### 9.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Região** | Criar GeographicSite com siteSpecification de category=Region, nome, código, pai opcional e atributos. |
| **RF-002** | **Hierarquia n-níveis** | Suportar profundidade ilimitada via parentSite recursivo (Continente > País > Estado > Cidade > Regional). |
| **RF-003** | **Editar Região** | Editar nome, descrição, atributos; reassignar parentSite com validação de não-ciclo. |
| **RF-004** | **Excluir/Desativar** | Bloquear exclusão de Região com filhos ou Sites operacionais; permitir status=Inactive. |
| **RF-005** | **Listar e filtrar** | Suportar listagem em árvore e plana com filtros por código, nome, pai e status. |
| **RF-006** | **Contadores agregados** | Expor count de Sites e Sub-Sites descendentes por Região (acumulado na subárvore). |
| **RF-007** | **Hierarquia padrão V.tal** | Bootstrap automático da hierarquia base: Brasil > {26 UFs + DF} > principais regionais V.tal. |
| **RF-008** | **Eventos** | Publicar evento TMF688 a cada criação, alteração ou mudança de status. |

### 9.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Nome único dentro do mesmo parentSite (ou globalmente para Regiões de topo). |
| **RN-002** | Code único globalmente quando a Região é de topo; único por pai quando aninhada. |
| **RN-003** | Não é permitido ciclo na hierarquia — parentSite não pode apontar para descendente. |
| **RN-004** | Excluir Região com filhos é bloqueado; é necessário desativar primeiro os filhos ou reassignar. |
| **RN-005** | Regiões da hierarquia base V.tal (Brasil, UFs) não podem ser excluídas — apenas desativadas com aprovação especial. |
| **RN-006** | Toda alteração gera Audit Trail e evento TMF688. |

### 9.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST de Região "São Paulo" com parentSite=Brasil retorna 201 e a Região aparece na árvore. |
| **CA-002** | **Hierarquia correta** | GET /geographicSite?parentSite={id}&category=Region retorna Regiões filhas diretas. |
| **CA-003** | **Contagem agregada** | GET /geographicSite/{id}/descendantCount retorna {sites:N, subSites:M} para a subárvore. |
| **CA-004** | **Bloqueio de ciclo** | PATCH em Região tentando definir parentSite como seu próprio descendente retorna 400. |
| **CA-005** | **Bloqueio de exclusão** | DELETE em Região com Sites operacionais retorna 409 com lista de dependentes. |
| **CA-006** | **Status Inactive** | PATCH com status=Inactive em Região com filhos ativos exibe alerta e exige confirmação. |

### 9.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de Região** | Campo Região (dropdown) | Subclasse via metamodelo | Entidade Region MPTT | **GeographicSite com category=Region (unificado em TMF674)** |
| **Hierarquia n-níveis** | Região + Regional (2 nv.) | Sim (metamodelo) | Sim (MPTT) | **Sim (parentSite recursivo)** |
| **Contagem acumulada** | Não | Não | Sim (site_count) | **Sim (descendantCount endpoint)** |
| **Hierarquia base pré-populada** | Não | Não | Não | **Sim (Brasil + 27 UFs no bootstrap)** |


---

## 10. REQ-MOD01-005 — Classificação Funcional de Sites (siteType e grupo funcional)

> **Entidade TMF:** GeographicSite com siteType (TMF674) + grupo via relatedSite  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Média — habilita filtros operacionais e relatórios  
> **Status:** Em levantamento · Versão 1.0 — draft

### 10.1 Descrição

Além da hierarquia geográfica (REQ-004), Sites podem ser agrupados por função/papel operacional: Centrais de Borda, POPs de Distribuição Sudeste, Armários Rurais. Esta classificação é ortogonal à hierarquia geográfica — um mesmo POP é classificado por "onde está" (Regional Sudeste) e por "o que é" (POP de Distribuição). No modelo TMF674, isto é expresso de duas formas complementares: (a) siteType como atributo classificador do GeographicSite; (b) Grupo Funcional como GeographicSite com category="FunctionalGroup" referenciado via relatedSite.

### 10.2 Racional arquitetural

Aqui o Nexus se afasta deliberadamente do modelo NetBox (que trata Site Group como entidade separada paralela a Region). A análise mostra que Site Group é mais bem modelado como mais um tipo de GeographicSite (category="FunctionalGroup") — preservando a unificação no TMF674. Esta abordagem evita a duplicação de hierarquias (Region + SiteGroup como duas árvores) e habilita Grupos Funcionais com atributos customizados próprios (capacidade agregada, política de manutenção, SLA). O siteType é mantido como atributo direto do Site para consultas rápidas; o vínculo com FunctionalGroup permite agregação e governança.

### 10.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite com siteType (TMF674) + grupo via relatedSite:

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `siteType` | string | Não | Classificação direta (ex.: "CO", "POP-Distribuição", "Armário-Rural"). Derivada do code da siteSpecification + atributos. |
| `relatedSite` | array | Não | Vínculos com FunctionalGroups via {site, role:"memberOf"}. |
| `characteristic` | array | Não | Atributos de classificação funcional (capacidade, classe de serviço, função técnica). |

### 10.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "site-pop-rj-001",
  "name": "POP Botafogo",
  "siteType": "POP-Distribuicao",
  "siteSpecification": { "id": "spec-pop", "@referredType": "GeographicSiteSpecification" },
  "parentSite": { "id": "site-region-rj", "@referredType": "GeographicSite" },
  "relatedSite": [
    { "site": { "id": "site-fg-pops-borda", "@referredType": "GeographicSite" },
      "role": "memberOf" }
  ]
}
```

### 10.5 Pré-condições

- Existem GeographicSites do tipo FunctionalGroup criados no catálogo de regiões/grupos.

### 10.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Definir siteType** | Permitir associar siteType ao Site na criação/edição, baseado na SiteSpecification. |
| **RF-002** | **Vincular a FunctionalGroup** | Permitir vincular um Site a um ou mais GeographicSites do tipo FunctionalGroup via relatedSite. |
| **RF-003** | **Hierarquia de Grupos Funcionais** | Suportar hierarquia em FunctionalGroups (ex.: "POPs" > "POPs de Borda" > "POPs de Borda Sudeste"). |
| **RF-004** | **Filtragem por classificação** | Listar Sites filtrando por siteType e/ou por FunctionalGroup; combinação com filtro geográfico. |
| **RF-005** | **Agregação por grupo** | Expor agregados (contagem, soma de capacidade) por FunctionalGroup. |
| **RF-006** | **Auditoria de classificação** | Toda mudança de siteType ou vínculo com FunctionalGroup gera Audit Trail. |

### 10.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | siteType é livre mas recomendado vir de um conjunto canônico V.tal (preset). |
| **RN-002** | Um Site pode pertencer a múltiplos FunctionalGroups simultaneamente (relação N:N). |
| **RN-003** | FunctionalGroups podem ter atributos customizados próprios (capacidade total, política). |
| **RN-004** | Reassignar siteType de um Site exige Audit Trail e potencial revisão de regras associadas. |

### 10.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Filtro combinado** | GET /geographicSite?regionId=RJ&siteType=POP-Distribuicao retorna apenas POPs no RJ. |
| **CA-002** | **Vínculo a grupo** | POST /geographicSite/{id}/relatedSite com role=memberOf vincula Site a FunctionalGroup. |
| **CA-003** | **Múltiplos grupos** | Um Site pode aparecer em GET /geographicSite/{groupId}/members de mais de um grupo. |
| **CA-004** | **Agregado por grupo** | GET /geographicSite/{groupId}/aggregate retorna count e atributos agregados dos membros. |

### 10.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de Grupo de Site** | Campo tipo (texto) | Não (via metamodelo) | Entidade SiteGroup separada | **GeographicSite com category=FunctionalGroup (unificado em TMF674)** |
| **Classificação ortogonal** | Não (apenas tipo) | Via metamodelo | Sim (Region + SiteGroup) | **Sim (parentSite + relatedSite)** |
| **Múltiplos grupos por Site** | Não | Não | Não (1 grupo) | **Sim (relatedSite array)** |


---

## 11. REQ-MOD01-006 — Cadastro de Geographic Site (entidade central do módulo)

> **Entidade TMF:** GeographicSite (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Crítica — entidade central do módulo  
> **Status:** Em levantamento · Versão 1.0 — draft

### 11.1 Descrição

Um GeographicSite é a unidade principal de local físico da V.tal: Central Office, POP, Armário de Distribuição, Data Center, Ponto de Instalação GPON. É a entidade-âncora referenciada por: Resources (todo equipamento e cabo tem place = GeographicSite ou GeographicLocation); Services (todo SubscriberID tem um endereço de instalação); Orders (toda OS opera sobre Sites). Este requisito formaliza a entidade central do módulo Geographic conforme TMF674.

### 11.2 Racional arquitetural

Este é o requisito mais importante do módulo: GeographicSite é a entidade canônica do TMF674 e o ponto de referência para praticamente todos os outros módulos do Nexus. O design segue rigorosamente o TMF674: o Site referencia (não embute) sua localização geográfica (TMF675) e seu endereço postal (TMF673); seu tipo vem do catálogo (REQ-003); sua hierarquia é dada por parentSite. Esta separação é o que torna o modelo TMF superior aos sistemas legados — onde Site é um "objeto monolítico" com lat/long e endereço embutidos. A unificação de Site e Ponto de Instalação do Netwin em uma única entidade GeographicSite (diferenciados apenas pela siteSpecification) simplifica drasticamente o modelo. Os campos específicos V.tal (CLLI, CN, Anel, SICOM, Sitar) entram como characteristic baseado no specCharacteristic do catálogo.

### 11.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite (TMF674):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `id` | string | Sim | UUID v7 — identificador estável global. |
| `name` | string | Sim | Nome do Site. Único globalmente para Sites operacionais. |
| `code` | string | Não | Código curto V.tal (ex.: "RJ-BOT-CO-01"). |
| `siteSpecification` | EntityRef | Sim | Tipo de Site (TMF674 SiteSpec). |
| `parentSite` | EntityRef | Não | Site pai na hierarquia (Região para Sites, Site para Sub-Sites). |
| `status` | enum | Sim | Planned | InConstruction | Active | InDeactivation | Retired. |
| `statusDate` | datetime | Sim | Data da última mudança de status. |
| `place` | EntityRef | Não | Referência para GeographicLocation (TMF675). Recomendado para visualização em mapa. |
| `address` | array | Não | Referências a GeographicAddress (TMF673). Suporta múltiplos endereços com papel (principal, despacho, cobrança). |
| `relatedParty` | array | Não | Owners, operadores, Tenants relacionados. |
| `relatedSite` | array | Não | Relações com outros Sites (alimentação, backhaul, FunctionalGroup membership). |
| `characteristic` | array | Não | Valores dos specCharacteristics do tipo: CLLI, CN, Anel, SICOM_ID, Sitar etc. |
| `description` | string | Não | Descrição livre. |
| `validFor` | TimePeriod | Não | Período de validade (data de ativação até desativação). |

### 11.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "site-rj-bot-co-01",
  "name": "Central Botafogo",
  "code": "RJ-BOT-CO-01",
  "siteSpecification": { "id": "spec-central-office", "@referredType": "GeographicSiteSpecification" },
  "parentSite": { "id": "site-region-rj-cidade", "@referredType": "GeographicSite" },
  "status": "Active",
  "statusDate": "2026-01-15T08:30:00Z",
  "place": { "id": "loc-018f...", "@referredType": "GeographicLocation" },
  "address": [
    { "address": { "id": "addr-018f...", "@referredType": "GeographicAddress" },
      "role": "principal" }
  ],
  "relatedParty": [
    { "party": { "id": "party-vtal", "@referredType": "Organization" },
      "role": "owner" }
  ],
  "relatedSite": [
    { "site": { "id": "site-fg-pops-borda", "@referredType": "GeographicSite" },
      "role": "memberOf" }
  ],
  "characteristic": [
    { "name": "CLLI", "value": "RJBTFL01CO0" },
    { "name": "CN",   "value": "RJ-SE-01" },
    { "name": "Anel", "value": "AN-RJ-NORTE-01" },
    { "name": "SICOM_ID", "value": "12345" }
  ]
}
```

### 11.5 Pré-condições

- A siteSpecification (REQ-003) já existe no catálogo.
- O parentSite, quando informado, já existe e tem allowedChildSpec compatível.
- O endereço (TMF673) e a localização (TMF675), quando referenciados, já existem.

### 11.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Site** | Criar GeographicSite com siteSpecification, name, status inicial (Planned), opcionalmente place, address, parentSite. |
| **RF-002** | **Validação de tipo** | Verificar que parentSite tem siteSpecification.allowedChildSpec contendo o tipo do filho. |
| **RF-003** | **Atributos do specCharacteristic** | Validar characteristic do Site contra specCharacteristic do tipo: obrigatórios, validadores (regex, enum, range). |
| **RF-004** | **Múltiplos endereços** | Permitir associar N GeographicAddress com role distinto (principal, despacho, cobrança). Exatamente um pode ter role=principal. |
| **RF-005** | **Vinculação a localização** | Associar GeographicLocation via place; permitir geocodificação automática a partir do address principal. |
| **RF-006** | **Editar Site** | Editar todos os atributos com Audit Trail; campos calculados (CN) recomputados se base mudar. |
| **RF-007** | **Excluir/Desativar** | Bloquear exclusão de Site com Resources, Services ou Orders ativos; permitir transição para Retired via ciclo de vida (REQ-008). |
| **RF-008** | **Listar e filtrar** | Filtros por: status, siteSpecification, parentSite (recursivo), siteType, characteristic, proximidade (via place), bounding box. |
| **RF-009** | **Contadores** | Expor por Site: contagem de Sub-Sites, Resources vinculados, Services ativos, Orders pendentes. |
| **RF-010** | **Detalhamento (GET)** | Expor representação completa do Site incluindo place expandido, address expandido e descendentes. |
| **RF-011** | **Importação em massa** | Suportar importação em lote via CSV com validação completa (catálogo, contenção, atributos). |
| **RF-012** | **Eventos** | Publicar TMF688 em cada criação, atualização e mudança de status (CreateEvent, AttributeValueChangeEvent, StateChangeEvent). |

### 11.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | name é único globalmente para Sites com status != Retired. |
| **RN-002** | siteSpecification, name e status são obrigatórios na criação. |
| **RN-003** | parentSite deve ter siteSpecification.allowedChildSpec compatível — se não compatível, criação é rejeitada. |
| **RN-004** | characteristics declaradas mandatory no specCharacteristic do tipo são obrigatórias na criação do Site. |
| **RN-005** | characteristics com configurable=false (ex.: CN) são derivadas pelo sistema, não aceitam edição manual. |
| **RN-006** | Site não pode ser excluído fisicamente quando tem Resources, Services ou Orders ativos; apenas Retired. |
| **RN-007** | Site pode ter no máximo um endereço com role=principal. |
| **RN-008** | Toda criação, edição ou mudança de status gera evento TMF688 e Audit Trail. |
| **RN-009** | statusDate é atualizado automaticamente a cada mudança de status, não aceita edição manual. |

### 11.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST de Site com siteSpec="CO", name único, characteristic [{name:"CLLI",value:"RJBTFL01CO0"}] retorna 201 com ID e href. |
| **CA-002** | **Validação de contenção** | POST com parentSite incompatível (ex.: Andar como filho direto de Região) retorna 400 com mensagem explicando. |
| **CA-003** | **Obrigatório de spec** | POST sem CLLI em SiteSpec que o exige retorna 400 indicando o atributo faltante. |
| **CA-004** | **Validador de spec** | CLLI com 5 caracteres falha no validador regex e retorna 400. |
| **CA-005** | **Cálculo de CN** | CN é preenchido automaticamente baseado em Região e Regional; PATCH manual em CN é rejeitado. |
| **CA-006** | **Múltiplos endereços** | Criação com 2 endereços (principal + despacho) é aceita; tentativa de 2 principais retorna 400. |
| **CA-007** | **Filtros combinados** | GET /geographicSite?status=Active&siteSpecification.id=spec-co&characteristic.Anel=AN-RJ-01 retorna apenas matches exatos. |
| **CA-008** | **Bloqueio de exclusão** | DELETE em Site com Resources ativos retorna 409 com contagem de dependentes. |
| **CA-009** | **Evento de criação** | POST bem-sucedido publica TMF688 GeographicSiteCreateEvent no tópico geographic.site.v1. |
| **CA-010** | **Importação em lote** | POST /geographicSite/bulk com 1000 sites valida individualmente; retorna relatório com sucessos e falhas detalhadas. |

### 11.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem Site** | Site + Ponto Instalação (2 entidades) | Subclasse de GenericLocation | Entidade Site | **GeographicSite (entidade única tipada)** |
| **Endereço** | Tabela embutida (múltiplos) | Atributo texto | Campos texto | **Referência a GeographicAddress (TMF673)** |
| **Coordenadas** | Campos lat/long no Site | Atributos lat/long | Campos lat/long | **Referência a GeographicLocation (TMF675)** |
| **Campos V.tal (CLLI, CN, Anel)** | Campos hardcoded no formulário | Atributos do metamodelo | Custom Fields | **characteristics conforme specCharacteristic** |
| **Contenção validada** | Implícita no formulário polimórfico | Containment Manager | Hardcoded | **allowedChildSpec validado em runtime** |
| **Eventos de domínio** | Não | Não | Webhooks (limitado) | **TMF688 Create/Update/StateChange** |


---

## 12. REQ-MOD01-007 — Sub-Sites (andares, salas, cages como GeographicSite)

> **Entidade TMF:** GeographicSite com category=SubSite (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — habilita rastreabilidade física de equipamentos  
> **Status:** Em levantamento · Versão 1.0 — draft

### 12.1 Descrição

Sub-Sites são subdivisões internas de Sites: andares, salas técnicas, cages, zonas. Permitem que equipamentos sejam posicionados com granularidade dentro de um Site. Conforme decisão arquitetural documentada na visão geral, Sub-Sites são modelados como GeographicSite com category="SubSite" no specSpecification, e não como entidade separada — preservando a unificação no TMF674. Esta abordagem é diferente do NetBox (que tem "Location" como entidade separada) e elimina a complexidade conceitual de manter dois tipos de entidade.

### 12.2 Racional arquitetural

A decisão de modelar Sub-Sites como mais um tipo de GeographicSite traz consistência ao módulo: as mesmas APIs (TMF674), mesmas regras (parentSite, allowedChildSpec, characteristics) e os mesmos eventos servem para Sites e Sub-Sites. Equipamentos posicionados em Sub-Sites usam o mesmo mecanismo (place = GeographicSite) sem precisar referenciar uma entidade Location separada. A profundidade típica esperada para V.tal: Central > Andar > Sala > Cage — 4 níveis de Sub-Site dentro de um Site, mas o modelo não impõe limite.

### 12.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite com category=SubSite (TMF674):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `siteSpecification` | EntityRef | Sim | Referência a SiteSpec com category="SubSite" (Floor, Room, Cage etc.). |
| `parentSite` | EntityRef | Sim | Para Sub-Sites, parentSite é obrigatório. |
| `characteristic` | array | Não | Atributos específicos: piso elevado, capacidade U total, classe de ambiente (TIA-942), restrição de acesso. |
| `place` | EntityRef | Não | GeographicLocation própria (raro — usualmente Sub-Sites herdam place do pai). Útil para Cages com coordenadas precisas em DCs grandes. |

### 12.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "site-rj-bot-co-01-floor-3",
  "name": "Andar 3 - Equipamentos GPON",
  "siteSpecification": { "id": "spec-floor", "@referredType": "GeographicSiteSpecification" },
  "parentSite": { "id": "site-rj-bot-co-01", "@referredType": "GeographicSite" },
  "status": "Active",
  "statusDate": "2026-01-15T09:00:00Z",
  "characteristic": [
    { "name": "Area_m2", "value": 250 },
    { "name": "Capacidade_U", "value": 800 },
    { "name": "RaisedFloor", "value": true },
    { "name": "TIA942_Class", "value": "Tier-III" }
  ]
}
```

### 12.5 Pré-condições

- O Site pai existe e está em status que permite sub-divisão (Active, InConstruction).
- A siteSpecification do Sub-Site (Floor, Room, Cage) existe e tem allowedParentSpec compatível.

### 12.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar Sub-Site** | Criar GeographicSite com siteSpec de category=SubSite, parentSite obrigatório, characteristics específicas. |
| **RF-002** | **Hierarquia em árvore** | Suportar profundidade ilimitada de Sub-Sites: Site > Floor > Room > Cage > ... |
| **RF-003** | **Validação Site-coerente** | Sub-Site deve ter sempre parentSite com mesmo Site raiz; mover Sub-Site entre Sites é restrito. |
| **RF-004** | **Visualização hierárquica** | Expor árvore de Sub-Sites de um Site via endpoint dedicado (GET /geographicSite/{id}/tree). |
| **RF-005** | **Capacidade física** | Suportar characteristic de capacidade (m², U total, kVA) para planejamento. |
| **RF-006** | **Restrição de Resource placement** | Validar (no módulo Resource Domain) que Resources colocados em Sub-Site têm tipo compatível. |
| **RF-007** | **Eventos** | Publicar TMF688 a cada criação/alteração de Sub-Site. |

### 12.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Sub-Sites têm parentSite obrigatório — Sub-Site órfão é inválido. |
| **RN-002** | Mover Sub-Site para outro Site raiz é operação especial (com confirmação) e exige validação dos Resources nele contidos. |
| **RN-003** | Sub-Site não pode ter status diferente do permitido pelo Site raiz (Sub-Site Active dentro de Site Retired é inválido). |
| **RN-004** | Nome do Sub-Site é único dentro do mesmo parentSite. |
| **RN-005** | Excluir Sub-Site com Resources é bloqueado; permite-se transição para Retired. |
| **RN-006** | Toda alteração gera evento TMF688 e Audit Trail. |

### 12.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação válida** | POST de Sub-Site "Sala 301" com parentSite=Floor-3 e siteSpec=spec-room retorna 201. |
| **CA-002** | **Parent obrigatório** | POST de Sub-Site sem parentSite retorna 400 com mensagem específica. |
| **CA-003** | **Hierarquia respeitada** | POST de Cage com parentSite=Floor (sem Room intermediária) é rejeitado se spec não permite. |
| **CA-004** | **Árvore expandida** | GET /geographicSite/{id}/tree retorna estrutura aninhada do Site com todos os Sub-Sites. |
| **CA-005** | **Move entre Sites** | PATCH com parentSite de outro Site retorna 409 (operação proibida no MVP). |
| **CA-006** | **Bloqueio de exclusão** | DELETE em Sub-Site com Resources retorna 409 com lista de Resources. |

### 12.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem Sub-Site** | Não possui | Subclasse Room/Building | Entidade Location MPTT | **GeographicSite com category=SubSite (unificado)** |
| **Hierarquia interna** | Não possui | Sim (metamodelo) | Sim (MPTT por Site) | **Sim (parentSite recursivo)** |
| **Atributos físicos** | Não modelado | Atributo metamodelo (hasRaisedFloor) | Custom Fields | **characteristics (Area, Capacidade, etc.)** |
| **Integridade cross-obj** | Não aplicável | Não modelada | Sim (validações Django) | **Sim (validado no módulo Resource)** |


---

## 13. REQ-MOD01-008 — Ciclo de Vida do Site (status, transições e histórico)

> **Entidade TMF:** GeographicSite.status + StateChangeEvent (TMF674 + TMF688)  
> **Open API TMF:** TMF674 + TMF688 — Event Management  
> **Prioridade:** Alta  
> **Status:** Em levantamento · Versão 1.0 — draft

### 13.1 Descrição

O ciclo de vida de um Site descreve sua evolução do planejamento à desativação: Planned, InConstruction, Active, InDeactivation, Retired. Cada estado representa uma fase operacional com regras específicas: Sites Planned não recebem Services ativos; Sites Retired não recebem novos Resources; transições obedecem ordem topológica (não se pode ir direto de Planned para Retired). O Nexus implementa ciclo de vida com histórico completo de transições, ausente em todos os sistemas legados analisados.

### 13.2 Racional arquitetural

A ausência de histórico de transições nos sistemas analisados é uma limitação séria: o Netwin guarda apenas o estado atual (campo Estado ciclo de vida) com a data da última transição; o Kuwaiba e o NetBox não modelam ciclo de vida formal. O Nexus implementa histórico via eventos TMF688 (StateChangeEvent), o que naturalmente preserva a sequência completa sem necessidade de tabela dedicada. Cada mudança de status é um evento imutável publicado no Event Store. Esta abordagem é alinhada ao princípio de Event Sourcing parcial declarado na visão geral do produto.

### 13.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite.status + StateChangeEvent (TMF674 + TMF688):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `status` | enum | Sim | Planned | InConstruction | Active | InDeactivation | Retired. |
| `statusDate` | datetime | Sim | Data/hora da última transição de status. |
| `statusReason` | string | Não | Motivo da transição (texto livre ou enum). |
| `statusChangeUser` | EntityRef | Não | Usuário que realizou a transição. |

### 13.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
// Exemplo de StateChangeEvent (TMF688) publicado:
{
  "eventId": "evt-018f8a6e-2c12-7c0a-b1d4-1e7a3b5c9d22",
  "eventType": "GeographicSiteStateChangeEvent",
  "eventTime": "2026-06-26T14:32:18Z",
  "source": "/tmf-api/geographicSiteManagement/v4/geographicSite/site-rj-bot-co-01",
  "event": {
    "geographicSite": {
      "id": "site-rj-bot-co-01",
      "@referredType": "GeographicSite"
    },
    "previousStatus": "InConstruction",
    "newStatus": "Active",
    "statusReason": "Obra finalizada e equipamentos comissionados",
    "statusChangeUser": {
      "id": "user-ops-rj-12",
      "@referredType": "Individual"
    }
  }
}
```

### 13.5 Pré-condições

- O Site existe.
- O usuário tem permissão para a transição específica (RBAC granular).

### 13.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Estados canônicos** | Suportar 5 estados: Planned, InConstruction, Active, InDeactivation, Retired. |
| **RF-002** | **Transições válidas** | Configurar matriz de transições permitidas: Planned→InConstruction→Active→InDeactivation→Retired; saltos não permitidos. |
| **RF-003** | **Histórico via eventos** | Cada transição publica StateChangeEvent TMF688 com timestamp, usuário, status anterior e novo. |
| **RF-004** | **Consulta de histórico** | Endpoint GET /geographicSite/{id}/history retorna sequência cronológica de transições. |
| **RF-005** | **Guard de transição** | Bloquear transições inválidas (ex.: Planned → Retired) com mensagem clara. |
| **RF-006** | **Restrição de Service** | Bloquear ativação de Service em Sites com status != Active (validação no módulo Service Domain consultando este Site). |
| **RF-007** | **Restrição de Resource** | Bloquear criação de novos Resources em Sites com status Retired (validação no módulo Resource Domain). |
| **RF-008** | **Aviso pré-desativação** | Ao iniciar transição para InDeactivation, listar Resources, Services e Orders ativos que serão impactados. |
| **RF-009** | **Reativação** | Permitir transição de Retired para Active apenas com aprovação especial (RBAC + Audit). |

### 13.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Status inicial padrão na criação: Planned. |
| **RN-002** | Transições permitidas: Planned → InConstruction ou Retired (cancelamento); InConstruction → Active, Planned (rollback) ou Retired; Active → InDeactivation; InDeactivation → Retired ou Active (reverter); Retired → Active apenas com reativação especial e aprovação. |
| **RN-003** | Toda transição registra statusReason (recomendado) e statusChangeUser. |
| **RN-004** | Eventos StateChangeEvent são imutáveis — nunca são deletados ou editados. |
| **RN-005** | Transição Retired→Active exige role Administrador Geographic + comentário obrigatório. |
| **RN-006** | Site em InDeactivation com Services ativos só pode ir para Retired quando os Services migrarem ou cancelarem. |

### 13.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Transição válida** | PATCH /geographicSite/{id} com status=Active a partir de InConstruction é aceito; status e statusDate atualizados. |
| **CA-002** | **Transição inválida** | PATCH com status=Retired a partir de Planned retorna 400 com mensagem da regra violada. |
| **CA-003** | **Evento publicado** | Toda transição válida publica StateChangeEvent TMF688 no tópico geographic.site.lifecycle.v1. |
| **CA-004** | **Histórico completo** | GET /geographicSite/{id}/history retorna 200 com array de transições em ordem cronológica. |
| **CA-005** | **Aviso pré-desativação** | PATCH com status=InDeactivation em Site com Services retorna 200 mas inclui warnings com lista de Services. |
| **CA-006** | **Bloqueio de Service** | POST de Service em Site com status=Planned é bloqueado (validação cross-module). |
| **CA-007** | **Reativação especial** | PATCH Retired→Active sem role apropriado retorna 403; com role correto + statusReason é aceito. |

### 13.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Estados de ciclo de vida** | Estado ciclo de vida (texto) | Não modelado | Status com choices | **5 estados canônicos (TMF + V.tal)** |
| **Histórico de transições** | Não (só estado atual) | Audit Trail global | Não (apenas estado atual) | **Sim via TMF688 StateChangeEvent** |
| **Matriz de transições** | Não validada | Não modelada | Não validada | **Matriz configurável validada em runtime** |
| **Guards cross-module** | Não | Não | Não | **Sim (Resource e Service consultam status)** |
| **Reativação controlada** | Permitido livremente | Não modelada | Permitido livremente | **Requer RBAC + Audit + statusReason** |


---

## 14. REQ-MOD01-009 — Regras de Contenção e Hierarquia entre Sites

> **Entidade TMF:** allowedParentSpec / allowedChildSpec em SiteSpec (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — governança da hierarquia geográfica  
> **Status:** Em levantamento · Versão 1.0 — draft

### 14.1 Descrição

As regras de contenção definem quais tipos de Site podem ser pai/filho de quais — ex.: Floor só pode ser filho de CentralOffice, POP ou DataCenter; Room só pode ser filho de Floor; Cage só pode ser filho de Room. Estas regras são parte do catálogo (REQ-003) e são validadas em runtime na criação e edição de Sites. Diferentemente da abordagem implícita do Netwin e da abordagem hardcoded do NetBox, o Nexus expõe estas regras como configuração administrável, inspirado no Containment Manager do Kuwaiba.

### 14.2 Racional arquitetural

A escolha de tornar regras de contenção parte do catálogo (e não regras hardcoded em código) é uma decisão arquitetural deliberada que privilegia extensibilidade. Os benefícios concretos: (a) novos tipos de Site podem ser adicionados pela operação sem release; (b) regras podem ser flexibilizadas (não restringidas) em runtime conforme evolução do negócio; (c) formulários de criação adaptam-se dinamicamente consultando allowedChildSpec via API. A API de consulta (allowedChildren) é o que permite UIs reativas e formulários polimórficos sem código duplicado.

### 14.3 Mapeamento de atributos TMF

Atributos canônicos da entidade allowedParentSpec / allowedChildSpec em SiteSpec (TMF674):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `allowedParentSpec` | array<EntityRef> | Não | Em GeographicSiteSpecification: lista de SiteSpecs que podem ser pais deste tipo. |
| `allowedChildSpec` | array<EntityRef> | Não | Em GeographicSiteSpecification: lista de SiteSpecs que podem ser filhos deste tipo. |
| `containmentRule` | array | Não | Regras estendidas opcionais: cardinalidade (min/max), exclusividade. |

### 14.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
// Exemplo: SiteSpec Floor com regras de contenção
{
  "id": "spec-floor",
  "name": "Floor",
  "code": "FLR",
  "category": "SubSite",
  "allowedParentSpec": [
    { "id": "spec-central-office", "@referredType": "GeographicSiteSpecification" },
    { "id": "spec-pop",            "@referredType": "GeographicSiteSpecification" },
    { "id": "spec-data-center",    "@referredType": "GeographicSiteSpecification" }
  ],
  "allowedChildSpec": [
    { "id": "spec-room", "@referredType": "GeographicSiteSpecification" }
  ],
  "containmentRule": [
    { "rule": "maxChildrenOfType",
      "params": { "childSpec": "spec-room", "max": 50 } }
  ]
}
```

### 14.5 Pré-condições

- O catálogo de SiteSpecifications (REQ-003) está populado.
- O usuário tem permissão de configuração de catálogo Geographic.

### 14.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Configurar contenção** | Permitir definir allowedParentSpec e allowedChildSpec ao criar/editar SiteSpec. |
| **RF-002** | **Validação em runtime** | Validar na criação/edição de Site que (a) Site tem siteSpec.allowedParentSpec contendo o tipo do pai, OU (b) parentSite.siteSpec.allowedChildSpec contém o tipo do filho. |
| **RF-003** | **API allowedChildren** | Endpoint GET /geographicSiteSpecification/{id}/allowedChildren retorna SiteSpecs filhas permitidas para uso em formulários dinâmicos. |
| **RF-004** | **Hierarquia base imutável** | Bootstrap define regras-base intocáveis: Region→Region (recursivo), Region→Site (CO, POP, Cabinet etc.), Site→SubSite. |
| **RF-005** | **Prevenção de ciclo** | Impedir criação ou alteração de parentSite que cause ciclo na hierarquia. |
| **RF-006** | **Análise de impacto** | Antes de remover regra de contenção, calcular e exibir impacto (quantos Sites existentes violariam a nova regra). |
| **RF-007** | **Eventos de catálogo** | Publicar TMF688 a cada alteração de regras de contenção. |

### 14.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Regras de contenção são parte da SiteSpecification — herdadas por todos os Sites do tipo. |
| **RN-002** | Hierarquia base (Region recursiva, Site, SubSite) é protegida — alterações exigem aprovação especial. |
| **RN-003** | Não é permitido ciclo: um Site não pode ter como ancestral nenhum de seus descendentes. |
| **RN-004** | Adição de novas regras (flexibilização) é livre; remoção (restrição) exige análise de impacto. |
| **RN-005** | A API allowedChildren responde em < 200ms para uso interativo em formulários. |
| **RN-006** | Toda alteração de regra de contenção é registrada no Audit Trail e publica evento. |

### 14.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Validação aplicada** | POST de Floor com parentSite=Region (não permitido pelas regras) retorna 400 explicando a regra violada. |
| **CA-002** | **API allowedChildren** | GET /geographicSiteSpecification/spec-co/allowedChildren retorna [spec-floor, spec-room] com 200. |
| **CA-003** | **Prevenção de ciclo** | PATCH /geographicSite/{id} com parentSite causando ciclo retorna 400 com path detectado. |
| **CA-004** | **Impacto de remoção** | DELETE de regra com impacto retorna 409 e exige confirmação via parâmetro forceWithImpact=true. |
| **CA-005** | **Evento de catálogo** | Alteração de allowedChildSpec publica evento no tópico geographic.siteSpec.containment.v1. |

### 14.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Catálogo de contenção** | Implícito no formulário | Containment Manager (UI) | Hardcoded no model Django | **allowedParent/ChildSpec configuráveis (TMF674)** |
| **Validação em runtime** | Implícita por tipo | getPossibleChildren API | Save validator | **Validação canônica na criação/edição** |
| **Prevenção de ciclo** | Não validado | Validado | Validado | **Validado via traversal de parentSite** |
| **Análise de impacto** | Não possui | Não possui | Não possui | **Sim antes de remoção de regra** |


---

## 15. REQ-MOD01-010 — Relações Topológicas A↔Z entre Sites

> **Entidade TMF:** relatedSite[] em GeographicSite (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — fundação para análise de impacto e desativação segura  
> **Status:** Em levantamento · Versão 1.0 — draft

### 15.1 Descrição

As relações topológicas modelam dependências entre Sites: alimentação, backhaul, redundância, contenção física, roteamento preferencial. Diferentemente de parentSite (que é hierárquico estrito), relatedSite é um array N:N com role e relationshipType — permitindo grafo arbitrário de relações tipadas. Habilita análise de impacto ("desativar este Site afeta quais Sites?"), planejamento de redundância e visão topológica da rede V.tal.

### 15.2 Racional arquitetural

O Netwin é o mais maduro nesta capacidade — sua aba "Relações" cobre exatamente este caso de uso. O Kuwaiba modela relações especiais entre objetos físicos (endpoint, container, mirror) mas não generaliza para Sites. O NetBox depende indiretamente de Circuit Terminations para topologia entre Sites. O TMF674 oferece o atributo relatedSite com role e relationshipType — modelo limpo e canônico. O Nexus implementa o catálogo de tipos de relação como entidade própria (RelationshipType) com suporte a relação inversa automática (ex.: "feeds" ↔ "fedBy"), o que evita duplicação manual e mantém consistência.

### 15.3 Mapeamento de atributos TMF

Atributos canônicos da entidade relatedSite[] em GeographicSite (TMF674):

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `relatedSite` | array<SiteRelationship> | Não | Lista de relações deste Site com outros. |
| `SiteRelationship.site` | EntityRef | Sim | Site relacionado (polo Z). |
| `SiteRelationship.role` | enum | Sim | Papel deste Site na relação: source | target | peer | memberOf. |
| `SiteRelationship.relationshipType` | string | Sim | Tipo da relação (vem do catálogo de RelationshipType): feeds, isFedBy, peersWith, contains, memberOf. |
| `SiteRelationship.description` | string | Não | Descrição livre da relação específica. |
| `SiteRelationship.validFor` | TimePeriod | Não | Período de validade (relações podem ter início/fim datados). |

### 15.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
// Catálogo: tipos de relação com inversos
{
  "RelationshipTypes": [
    { "code": "feeds",      "inverse": "isFedBy",   "symmetric": false },
    { "code": "isFedBy",    "inverse": "feeds",     "symmetric": false },
    { "code": "peersWith",  "inverse": "peersWith", "symmetric": true  },
    { "code": "memberOf",   "inverse": "contains",  "symmetric": false }
  ]
}

// Exemplo em GeographicSite:
{
  "id": "site-rj-cabinet-001",
  "name": "Armario AR-RJ-001",
  "relatedSite": [
    { "site": { "id": "site-rj-bot-co-01", "@referredType": "GeographicSite" },
      "role": "target",
      "relationshipType": "isFedBy",
      "description": "Alimentacao GPON via cabo CB-001",
      "validFor": { "startDateTime": "2025-03-10T00:00:00Z" } }
  ]
}
```

### 15.5 Pré-condições

- Os Sites A e Z já existem.
- O catálogo de RelationshipType está configurado (com pares inversos definidos).
- O usuário tem permissão de escrita no módulo Geographic.

### 15.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Criar relação A→Z** | Adicionar entrada em relatedSite[] do Site A apontando para Site Z com role e relationshipType. |
| **RF-002** | **Catálogo de RelationshipType** | Manter catálogo configurável de tipos: feeds, isFedBy (inverso), peersWith (simétrico), memberOf, isPartOf. |
| **RF-003** | **Relação inversa automática** | Ao criar A→Z com tipo que tem inverso definido, criar automaticamente Z→A com tipo inverso. |
| **RF-004** | **Editar relação** | Permitir editar relationshipType, role, description, validFor de uma relação existente. |
| **RF-005** | **Excluir relação** | Excluir relação remove ambos os sentidos (A→Z e Z→A); preservar histórico via validFor.endDateTime. |
| **RF-006** | **Listar relações de um Site** | GET /geographicSite/{id}/relatedSite retorna todas as relações (entrada e saída). |
| **RF-007** | **Análise de impacto** | Endpoint GET /geographicSite/{id}/impact retorna Sites dependentes (que recebem feeds, backhaul deste Site). |
| **RF-008** | **Visualização em grafo** | Expor endpoint /graph com nós (Sites) e arestas (relações) para renderização de grafo topológico. |
| **RF-009** | **Validação no ciclo de vida** | Ao iniciar desativação de Site, listar Sites dependentes (acionado por REQ-008 RF-008). |
| **RF-010** | **Eventos** | Publicar TMF688 a cada criação, alteração ou remoção de relação. |

### 15.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Não é permitida autorrelação — Site não pode ter relatedSite apontando para si mesmo. |
| **RN-002** | relationshipType é obrigatório e deve existir no catálogo de RelationshipType. |
| **RN-003** | Para tipos com inverso definido, a relação Z→A é criada automaticamente ao criar A→Z (mantida coerente). |
| **RN-004** | Múltiplas relações entre o mesmo par de Sites são permitidas desde que tipos sejam distintos. |
| **RN-005** | Excluir Site cascateia a exclusão lógica de todas as suas relações (validFor.endDateTime preenchido). |
| **RN-006** | Análise de impacto é não-transitiva por padrão — segue apenas um salto, com opção depth=N para travessia profunda. |
| **RN-007** | Toda alteração de relação gera evento TMF688 e Audit Trail. |

### 15.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Criação de relação** | POST /geographicSite/{idA}/relatedSite com {site:idZ, role:source, relationshipType:feeds} cria relação e a inversa em Z (fedBy). |
| **CA-002** | **Autorrelação** | POST com site=idA (mesmo ID) retorna 400. |
| **CA-003** | **Tipo inexistente** | POST com relationshipType="xyz" não cadastrado retorna 400. |
| **CA-004** | **Edição** | PATCH em relação existente atualiza ambos os sentidos consistentemente. |
| **CA-005** | **Análise de impacto** | GET /geographicSite/{id}/impact retorna lista de Sites dependentes com tipo de dependência. |
| **CA-006** | **Visão de grafo** | GET /geographicSite/graph?center={id}&depth=2 retorna subgrafo até 2 saltos. |
| **CA-007** | **Aviso de desativação** | PATCH status=InDeactivation em Site com dependentes retorna warning com lista de dependentes. |
| **CA-008** | **Evento publicado** | Cada criação/alteração publica evento no tópico geographic.site.relationship.v1. |

### 15.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Modelagem de relação A↔Z** | Aba Relações (tabela) | Relações especiais entre objetos | Via Circuit Terminations | **relatedSite array (TMF674)** |
| **Catálogo de tipos de relação** | Dropdown fixo no formulário | Não possui | Não possui | **RelationshipType configurável com pares inversos** |
| **Relação inversa automática** | Não | Não | Não | **Sim — criada automaticamente** |
| **Análise de impacto** | Não | Não nativa | Não nativa | **Endpoint /impact com depth configurável** |
| **Visão em grafo** | Não | Não | Não | **Endpoint /graph com subgrafo** |


---

## 16. REQ-MOD01-011 — Visão de Mapa Georreferenciado

> **Entidade TMF:** Não é entidade TMF — funcionalidade de UI sobre TMF674+675  
> **Open API TMF:** TMF674 + TMF675 (consultas geoespaciais)  
> **Prioridade:** Alta — diferenciação operacional  
> **Status:** Em levantamento · Versão 1.0 — draft

### 16.1 Descrição

A visão de mapa exibe Sites e (em fases futuras) Resources georreferenciados em camada cartográfica interativa. Habilita filtros visuais por tipo, status, hierarquia e proximidade; suporta sincronização bidirecional (mover marcador atualiza place do Site, e vice-versa); integra com a base cartográfica V.tal existente (Geosite OSP). Funcionalidade transversal que materializa o valor das entidades TMF673/674/675 para o usuário operacional.

### 16.2 Racional arquitetural

O syncGeoPosition do Kuwaiba é a melhor implementação observada — mover um nó no mapa atualiza coordenadas no inventário de forma transacional. Esta capacidade é reaproveitada no Nexus, com a diferença de que a sincronização atualiza a GeographicLocation referenciada pelo Site (não atributos embutidos), preservando o modelo TMF675. A integração com o Geosite OSP existente da V.tal (que já tem base cartográfica e camadas pré-configuradas) elimina a necessidade de reconstruir essa infraestrutura.

### 16.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
// Resposta /map/sites em GeoJSON FeatureCollection
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-43.1809, -22.9035] },
      "properties": {
        "id": "site-rj-bot-co-01",
        "name": "Central Botafogo",
        "siteType": "CO",
        "status": "Active",
        "code": "RJ-BOT-CO-01"
      }
    }
  ]
}
```

### 16.5 Pré-condições

- O usuário possui permissão de visualização no módulo Geographic.
- Os Sites a exibir possuem place referenciando GeographicLocation válida.
- A base cartográfica V.tal (Geosite OSP) está disponível e configurada.

### 16.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Exibição de Sites em mapa** | Renderizar Sites com place válido em camada cartográfica; marcadores diferenciados por tipo e status. |
| **RF-002** | **Filtros visuais** | Filtrar Sites no mapa por: status, siteSpecification, Região (parentSite recursivo), siteType, characteristic. |
| **RF-003** | **Bounding box dinâmico** | Carregar apenas Sites visíveis na viewport atual do mapa para performance em alta densidade. |
| **RF-004** | **Cluster em zoom-out** | Agrupar marcadores próximos em clusters numerados quando zoom < threshold configurável. |
| **RF-005** | **Detalhamento por clique** | Clique no marcador exibe popup com name, type, status, code, atributos principais e link para detalhamento. |
| **RF-006** | **Sincronização bidirecional** | Permitir mover marcador no mapa para atualizar coordenadas; alterações em formulário refletem em tempo real no mapa. |
| **RF-007** | **Camadas de visualização** | Suportar camadas configuráveis: hierarquia geográfica (limites de Regiões), Sites por tipo, relações topológicas como linhas. |
| **RF-008** | **Busca por proximidade** | Tool de medição: clicar em ponto para listar Sites dentro de raio configurável. |
| **RF-009** | **Exportação** | Exportar visão atual como imagem (PNG) ou dados (GeoJSON). |
| **RF-010** | **Integração Geosite OSP** | Reaproveitar base cartográfica e camadas pré-existentes do Geosite OSP da V.tal. |

### 16.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Sites sem place válido não aparecem no mapa, mas são listados em relatório de completude. |
| **RN-002** | A sincronização bidirecional atualiza a GeographicLocation referenciada pelo Site, não atributos do Site diretamente. |
| **RN-003** | Movimentação de Site no mapa exige confirmação se o Site tem status=Active (mudança de coordenadas de Site ativo é evento crítico). |
| **RN-004** | A viewport é limitada à área de operação V.tal (Brasil + ajustes futuros); pan além desses limites é restrito. |
| **RN-005** | Clusters de marcadores agrupam Sites por proximidade e mostram contagem; clique no cluster faz zoom para ver individuais. |
| **RN-006** | Toda movimentação de Site via mapa gera Audit Trail e evento TMF688 AttributeValueChangeEvent sobre place. |

### 16.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Renderização** | GET /map/sites?bbox=... retorna FeatureCollection GeoJSON com Sites na bounding box. |
| **CA-002** | **Filtros** | Aplicar filtro siteSpec=CO e status=Active reduz marcadores apenas a Centrais ativas. |
| **CA-003** | **Cluster** | Em zoom out abaixo de 8, marcadores próximos são agrupados em clusters numerados. |
| **CA-004** | **Sincronização** | Mover marcador no mapa dispara PATCH em GeographicLocation com novas coordenadas e atualiza Site em tempo real. |
| **CA-005** | **Confirmação para Active** | Mover Site com status=Active exige modal de confirmação com motivo da mudança. |
| **CA-006** | **Busca por proximidade** | Clique em ponto + raio 500m lista Sites dentro do raio com distância ao ponto. |
| **CA-007** | **Exportação GeoJSON** | Export da viewport gera arquivo com Sites visíveis em formato FeatureCollection. |

### 16.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Visão de mapa nativa** | Sim (Geosite OSP) | Sim (OSP Module) | Não nativa | **Sim (reaproveita Geosite OSP)** |
| **Sincronização bidirecional** | Não | Sim (syncGeoPosition) | Não | **Sim (atualiza GeographicLocation)** |
| **Filtros visuais** | Filtros básicos | Filtros básicos | Não nativa | **Filtros combinados completos** |
| **Clusterização** | Não | Limitada | Não nativa | **Sim (configurável por zoom)** |
| **Busca por proximidade no mapa** | Sim | Sim | Não nativa | **Sim** |


---

## 17. REQ-MOD01-012 — Eventos de Domínio do Módulo Geographic

> **Entidade TMF:** Event (TMF688) — vários tipos  
> **Open API TMF:** TMF688 — Event Management API  
> **Prioridade:** Alta — pré-requisito do módulo Analytics & Events  
> **Status:** Em levantamento · Versão 1.0 — draft

### 17.1 Descrição

Toda mudança de estado relevante em entidades do módulo Geographic (Location, Address, SiteSpec, Site, SubSite, relações) gera evento canônico TMF688 publicado em barramento de mensageria (Kafka). Estes eventos alimentam: Data Lake corporativo V.tal, sistemas downstream que precisam reagir (faturamento, OSS de provisionamento), e auditoria assíncrona. Este requisito formaliza o catálogo de eventos publicados pelo módulo Geographic.

### 17.2 Racional arquitetural

A publicação de eventos canônicos TMF688 é um dos pilares arquiteturais do Nexus (visão geral seção 9). Sem ela, o Nexus seria um sistema de cadastro isolado. O TMF688 define os tipos canônicos de evento: CreateEvent, AttributeValueChangeEvent, StateChangeEvent, DeleteEvent. Cada módulo declara seu catálogo de eventos publicados, e este requisito é o catálogo específico do módulo Geographic. A publicação deve ser transacional com a operação de escrita (outbox pattern) para garantir consistência entre estado persistido e eventos publicados.

### 17.3 Mapeamento de atributos TMF

Atributos canônicos da entidade Event (TMF688) — vários tipos:

| Atributo TMF | Tipo | Obrigatório | Observação V.tal |
|---|---|:---:|---|
| `eventId` | string | Sim | UUID v7 único do evento. |
| `eventType` | string | Sim | Nome canônico do tipo de evento (ex.: GeographicSiteCreateEvent). |
| `eventTime` | datetime | Sim | Timestamp ISO 8601 com timezone. |
| `source` | string | Sim | URL da entidade que gerou o evento. |
| `correlationId` | string | Não | ID para correlação com a transação originadora. |
| `event` | object | Sim | Payload específico do tipo de evento (referência à entidade, estados envolvidos etc.). |

### 17.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
// Catálogo de eventos publicados pelo módulo Geographic

// GeographicLocation:
//   GeographicLocationCreateEvent
//   GeographicLocationAttributeValueChangeEvent
//   GeographicLocationDeleteEvent       (soft-delete)

// GeographicAddress:
//   GeographicAddressCreateEvent
//   GeographicAddressAttributeValueChangeEvent
//   GeographicAddressDeleteEvent        (soft-delete)

// GeographicSiteSpecification:
//   GeographicSiteSpecCreateEvent
//   GeographicSiteSpecAttributeValueChangeEvent
//   GeographicSiteSpecContainmentChangeEvent

// GeographicSite (inclui Sub-Sites):
//   GeographicSiteCreateEvent
//   GeographicSiteAttributeValueChangeEvent
//   GeographicSiteStateChangeEvent
//   GeographicSiteRelationshipChangeEvent
//   GeographicSiteDeleteEvent           (soft-delete)

// Exemplo de payload (CreateEvent):
{
  "eventId": "evt-018f8b...",
  "eventType": "GeographicSiteCreateEvent",
  "eventTime": "2026-06-26T15:00:00Z",
  "source": "/tmf-api/geographicSiteManagement/v4/geographicSite/site-rj-bot-co-01",
  "correlationId": "txn-018f8b...",
  "event": {
    "geographicSite": {
      "id": "site-rj-bot-co-01",
      "@referredType": "GeographicSite"
    }
  }
}
```

### 17.5 Pré-condições

- O barramento Kafka está disponível.
- Os tópicos do módulo Geographic estão criados com retention adequada.

### 17.6 Requisitos Funcionais

| ID | Nome | Descrição |
|---|---|---|
| **RF-001** | **Publicação transacional** | Toda escrita em entidade do módulo publica evento correspondente no mesmo commit (outbox pattern). |
| **RF-002** | **Catálogo de eventos** | Manter catálogo formal dos eventos publicados pelo módulo (lista abaixo). |
| **RF-003** | **Tópicos canônicos** | Publicar em tópicos versionados: geographic.site.v1, geographic.site.lifecycle.v1, geographic.location.v1, geographic.address.v1, geographic.siteSpec.v1. |
| **RF-004** | **Schema Registry** | Schemas dos eventos publicados em Avro/JSON Schema no Schema Registry V.tal. |
| **RF-005** | **Retry e dead letter** | Falha de publicação aciona retry exponencial; após N tentativas, evento vai para dead letter topic para análise. |
| **RF-006** | **Idempotência** | Eventos têm eventId único; consumidores podem deduplicar por eventId. |
| **RF-007** | **Correlation tracking** | Eventos carregam correlationId quando originados de OS ou request rastreável. |
| **RF-008** | **Catálogo público** | Endpoint /events/catalog expõe lista de eventos publicados pelo módulo com schema e exemplos. |

### 17.7 Regras de Negócio

| ID | Regra de Negócio |
|---|---|
| **RN-001** | Eventos são imutáveis após publicação — nunca são editados, apenas compensados por eventos subsequentes. |
| **RN-002** | Publicação é parte da transação de escrita (outbox pattern) — sucesso da escrita implica sucesso da publicação. |
| **RN-003** | Falha de publicação no commit aciona rollback da escrita. |
| **RN-004** | Schemas de evento são versionados; mudanças breaking exigem nova versão de tópico. |
| **RN-005** | Retention dos tópicos: 30 dias quente (Kafka), arquivado em Data Lake para análise histórica. |
| **RN-006** | Eventos não contêm dados sensíveis em texto claro — apenas referências por ID. |

### 17.8 Critérios de Aceite

| ID | Critério | Resultado Esperado |
|---|---|---|
| **CA-001** | **Publicação no commit** | Criação de Site bem-sucedida publica GeographicSiteCreateEvent no tópico geographic.site.v1. |
| **CA-002** | **Outbox pattern** | Falha de publicação na transação reverte a escrita do Site (testado com Kafka indisponível). |
| **CA-003** | **Schema válido** | Eventos publicados validam contra schema registrado; mensagens inválidas vão para dead letter. |
| **CA-004** | **Idempotência** | Reprocessamento de mesmo evento pelo consumidor não causa efeito colateral (eventId deduplicado). |
| **CA-005** | **Catálogo público** | GET /events/catalog retorna 200 com lista de tipos de evento, schemas e exemplos. |

### 17.9 Mapeamento contra sistemas de referência

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|
| **Publicação de eventos canônicos** | Não publica | Não publica | Webhooks (limitado) | **TMF688 nativo em todas as operações** |
| **Outbox pattern** | N/A | N/A | Não usa | **Sim — consistência transacional** |
| **Schema Registry** | N/A | N/A | Não usa | **Sim — Avro/JSON Schema versionado** |
| **Tópicos versionados** | N/A | N/A | Endpoints únicos | **Tópicos por entidade com versão (v1, v2)** |

---

## 18. Contratos com outros módulos do Nexus

O módulo Geographic é a fundação referenciada por praticamente todos os outros módulos. Os contratos de integração:

| Módulo consumidor | Tipo de consumo | Detalhe do contrato |
|---|---|---|
| **Módulo 2 — Resource Domain** | Síncrono (referência) + Assíncrono (eventos) | Todo Resource tem place referenciando GeographicSite ou GeographicLocation. Eventos de StateChange disparam validação de status do Site. |
| **Módulo 3 — Service Domain** | Síncrono (referência) + Assíncrono (eventos) | Services têm installationAddress referenciando GeographicAddress. Validação de status do Site para ativação. |
| **Módulo 4 — Order & Fulfillment** | Síncrono (referência) + Síncrono (Service Feasibility) | Orders operam sobre Sites e Addresses. Service Feasibility (TMF645) consulta Sites por endereço/coordenada. |
| **Módulo 5 — Process Orchestration** | Síncrono (BPMN tasks) | Workflows de aprovação para mudanças críticas (ex.: desativação de CO) acionam tasks que operam sobre Sites. |
| **Módulo 6 — Party & Tenant** | Síncrono (referência) | Sites têm relatedParty com referência a Party (Owner, Tenant). Validação de existência da Party no momento da escrita. |
| **Módulo 7 — Analytics & Events** | Assíncrono (consumidor de eventos) | Todos os eventos TMF688 publicados pelo módulo Geographic são consumidos pelo Data Lake e por dashboards. |
| **Módulo 8 — Platform & Administration** | Síncrono (RBAC, Audit) | Todas as operações de escrita passam por RBAC granular e geram Audit Trail global. |

---

## 19. Questões em aberto

| ID | Questão | Status / Decisão | Responsável |
|---|---|---|---|
| **Q-001** | Quais são exatamente os SiteSpecifications pré-populados no bootstrap? Lista canônica V.tal precisa ser fechada (CO, POP, Armário, Ponto de Instalação, Andar, Sala, Cage — outros?). | *Aberta* | *Produto + Engenharia V.tal* |
| **Q-002** | O cálculo do campo CN é determinístico a partir de Região + Regional, ou tem exceções? Precisa de matriz de derivação documentada. | *Aberta* | *Engenharia V.tal* |
| **Q-003** | CLLI é obrigatório para todos os Sites de tipo CO ou apenas para subconjunto (por exemplo, apenas centrais ativas em interconexão)? | *Aberta* | *Engenharia V.tal + Regulatório* |
| **Q-004** | Quais são os RelationshipTypes do catálogo inicial? Lista mínima: feeds/isFedBy, peersWith, memberOf/contains. Há outros tipos críticos V.tal? | *Aberta* | *Operações V.tal* |
| **Q-005** | A integração com Geosite Logradouros é via API REST existente ou requer expor nova interface no Geosite? | *Aberta* | *Arquitetura + Geosite* |
| **Q-006** | A migração de Sites do Netwin para o Nexus preserva os IDs existentes ou gera novos UUID? Impacto em referências externas. | ✅ **Decidido (Jun/2026):** o Nexus **sempre gera seus próprios UUIDs v7** como identificadores canônicos. IDs legados são preservados como characteristics do grupo `_origin` na entidade (ver seção 19.1). O Nexus é agnóstico à origem — mesma estrutura serve Netwin, Geosite, NetworkCore, OZMAP ou qualquer outro sistema sem alteração de schema. | *Arquitetura + Migração* |
| **Q-007** | O syncGeoPosition deve ser síncrono (PATCH com confirmação) ou assíncrono (atualização via evento)? Trade-off de UX vs. performance. | *Aberta* | *Arquitetura Nexus + Produto* |
| **Q-008** | O catálogo de eventos publicados em produção deve ter quais SLAs de disponibilidade e latência fim-a-fim? | *Aberta* | *Arquitetura + Plataforma* |
| **Q-009** | Geocodificação automática usa qual provedor (Google, OpenStreetMap, base interna V.tal)? Custo e licenciamento. | *Aberta* | *Produto + GIS V.tal* |
| **Q-010** | A profundidade máxima da hierarquia de Sub-Sites tem limite prático? Caso de uso típico: CO > Andar > Sala > Cage (4 níveis); algum caso ultrapassa? | *Aberta* | *Engenharia V.tal* |

### 19.1 Decisão de migração — Identidade e proveniência de entidades

> **Princípio arquitetural (Jun/2026):** O Nexus é agnóstico à origem de seus dados. Todo identificador canônico é UUID v7 gerado pelo próprio Nexus, independente do sistema de origem. IDs legados são preservados como atributos customizados (`characteristic`) no grupo convencional `_origin`, exclusivamente para fins de rastreabilidade histórica, auditoria e suporte ao período de dual-running.

**Motivação:** Durante o período de dual-running (Netwin ainda ativo + Nexus em produção paralela), equipes de operação precisam correlacionar entidades entre sistemas ("qual Site no Nexus corresponde ao Location #4521 do Netwin?"). O grupo `_origin` resolve isso sem comprometer a integridade do modelo — o Nexus nunca depende de um ID legado para operar.

**Sistemas cobertos por esta decisão:**

| Sistema de origem | Contexto |
|---|---|
| Netwin (Openlabs) | Migração de Sites/Locais — Região 1 e 2 V.tal |
| Hexagon/Octave NetworkCore | Migração de Sites da Região 2 (planta externa) |
| Geosite / Geosite Logradouros | Migração de endereços e localizações geográficas |
| OZMAP | Futura integração Um Telecom (pós-M&A) |
| UMBOX | Futura integração Um Telecom (pós-M&A) |

**Grupo canônico `_origin` para GeographicSite, GeographicAddress e GeographicLocation:**

| Characteristic | Tipo | Obrigatório na migração | Descrição |
|---|---|:---:|---|
| `_origin.system` | string | Sim | Nome do sistema de origem (ex.: `Netwin`, `Geosite`, `NetworkCore`, `OZMAP`). |
| `_origin.id` | string | Sim | Identificador da entidade no sistema de origem (ex.: `"SITE-4521"`, `"LOC-00312"`). |
| `_origin.entity` | string | Sim | Nome do tipo de entidade no sistema de origem (ex.: `"Location"`, `"Node"`, `"Site"`). |
| `_origin.migratedAt` | datetime | Sim | Timestamp ISO 8601 da migração. |
| `_origin.migratedBy` | string | Sim | Identificador do job de migração (ex.: `"migration-job-netwin-wave1-v2"`). |
| `_origin.url` | string | Não | URL ou deep link para a entidade no sistema de origem (quando disponível). |
| `_origin.extra` | JSON string | Não | Atributos adicionais do sistema de origem que não têm correspondência no Nexus, preservados como JSON serializado para auditoria. |

**Exemplo de GeographicSite migrado do Netwin:**

```json
{
  "id": "site-018fa3c2-7e9d-7a01-bc34-1d4f2e3a9c88",
  "name": "Central Botafogo",
  "siteSpecification": { "id": "spec-central-office" },
  "status": "Active",
  "characteristic": [
    { "name": "CLLI",           "value": "RJBTFL01CO0" },
    { "name": "CN",             "value": "RJ-SE-01" },
    { "name": "_origin.system",     "value": "Netwin" },
    { "name": "_origin.id",         "value": "SITE-4521" },
    { "name": "_origin.entity",     "value": "Location" },
    { "name": "_origin.migratedAt", "value": "2026-09-15T03:00:00Z" },
    { "name": "_origin.migratedBy", "value": "migration-job-netwin-wave1-v2" }
  ]
}
```

**Capacidades habilitadas pelo grupo `_origin`:**

- **Consulta por ID legado:** `GET /geographicSite?characteristic._origin.system=Netwin&characteristic._origin.id=SITE-4521` retorna o Site correspondente no Nexus.
- **Relatório de migração:** consulta agregada `?characteristic._origin.system=Netwin` lista todas as entidades migradas daquele sistema, com data e job.
- **Suporte ao dual-running:** equipes de operação podem correlacionar tickets abertos no sistema legado com a entidade correspondente no Nexus durante o período de coexistência.
- **Auditoria permanente:** mesmo após o descomissionamento do sistema legado, o histórico de origem fica preservado no Nexus para fins regulatórios e rastreabilidade.

**Regras de negócio do grupo `_origin`:**

- `_origin.*` são characteristics somente-leitura após a criação — não podem ser editados pela operação normal, apenas por job de migração autenticado.
- Uma entidade pode ter múltiplos grupos `_origin` (para casos de migração em fases, ou quando o dado passou por dois sistemas antes de chegar ao Nexus: ex.: OZMAP → Netwin → Nexus).
- `_origin.*` não são validados pelo `specCharacteristic` da SiteSpecification — são transversais a todos os tipos.
- `_origin.extra` aceita qualquer JSON serializado como string, sem validação de schema — preservação bruta para auditoria.

---

## 20. Controle de revisões

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | Junho 2026 | Produto — V.tal Nexus | Versão inicial do HLD do Módulo 1 — Nexus Geographic, alinhada a TMF673/674/675 e ao documento âncora VTN-HLD-OVERVIEW-001. |
| 1.1 | Junho 2026 | Produto — V.tal Nexus | Resolução de Q-006 (estratégia de migração): definição do princípio de agnósticidade à origem, grupo canônico `_origin` para todas as entidades geográficas, tabela de sistemas cobertos, payload de exemplo e regras de negócio. Adicionada seção 19.1. |

---

*V.tal Nexus — Documento Confidencial — Uso Interno*
