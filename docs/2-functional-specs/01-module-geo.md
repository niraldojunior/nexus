# V.TAL NEXUS — Network Inventory Platform

## HLD Módulo 1 · Nexus Geographic

**Geographic Site, Address & Location Management**

TMFC014 · TMF673 / TMF674 / TMF675

| Campo                   | Valor                          |
| ----------------------- | ------------------------------ |
| **Document Reference**  | VTN-HLD-MOD01-GEO              |
| **Versão**              | 1.23 — draft                   |
| **Data**                | Agosto 2026                    |
| **Documento âncora**    | VTN-HLD-OVERVIEW-001           |
| **TMFC coberto**        | TMFC014 — Geographic Site Mgmt |
| **Open APIs**           | TMF673, TMF674, TMF675, TMF688 |
| **Requisitos cobertos** | REQ-MOD01-001 a REQ-MOD01-018  |
| **Status**              | Em elaboração                  |

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
- Digitalização e edição de geometria (Point, LineString, Polygon) no navegador, sem cliente desktop.
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

### 2.3 Aderência ao codebase atual

O HLD descreve o contrato funcional alvo. A tabela abaixo registra o estado verificado no backend, persistência, frontend e testes em julho de 2026. `Parcial` significa que existe uma base executável, mas ao menos um RF/CA obrigatório, requisito de escala ou regra canônica ainda não está entregue.

| Requisito         | Estado           | Evidência atual                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Gap principal                                                                                                                                                                                                     | Bloqueador                                                                                                           | Backlog                                                                                                              |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **REQ-MOD01-001** | Parcial          | `GeoService`, `IGeoRepository`, rotas TMF675 e `geo.unit.spec.ts` validam e persistem Point/LineString/Polygon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Consultas por raio/interseção, export GeoJSON, índice espacial e UUID v7.                                                                                                                                         | `D-ARQ-001`                                                                                                          | [#130](https://github.com/niraldojunior/nexus/issues/130), [#157](https://github.com/niraldojunior/nexus/issues/157) |
| **REQ-MOD01-002** | Parcial          | CRUD TMF673, vínculo com Location e testes de rota estão ativos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Sugestão/geocodificação Geosite, versionamento e carga em massa.                                                                                                                                                  | [#105](https://github.com/niraldojunior/nexus/issues/105)                                                            | [#131](https://github.com/niraldojunior/nexus/issues/131), [#135](https://github.com/niraldojunior/nexus/issues/135) |
| **REQ-MOD01-003** | Parcial          | CRUD de SiteSpecification e regras de contenção são exercitados em `geo.unit.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Categorias continuam fechadas no tipo TypeScript; falta lifecycle e consulta `allowedChildren`.                                                                                                                   | `D-GEO-003`                                                                                                          | [#132](https://github.com/niraldojunior/nexus/issues/132)                                                            |
| **REQ-MOD01-004** | Parcial          | Região é representável por SiteSpecification e a árvore expõe raízes/filhos paginados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Filtros próprios, contadores acumulados e invariantes administrativas.                                                                                                                                            | `D-GEO-003`, [#102](https://github.com/niraldojunior/nexus/issues/102)                                               | [#133](https://github.com/niraldojunior/nexus/issues/133)                                                            |
| **REQ-MOD01-005** | Parcial          | `relatedSite` e specs permitem classificação e agrupamento básico.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `siteType`, consulta de membros, filtros combinados e agregações de grupo.                                                                                                                                        | [#104](https://github.com/niraldojunior/nexus/issues/104)                                                            | [#133](https://github.com/niraldojunior/nexus/issues/133)                                                            |
| **REQ-MOD01-006** | Parcial          | CRUD TMF674, `/v1/geo/workspace/site-at-address`, busca e frontend Geo estão testados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Filtros completos, bulk, múltiplos endereços e características governadas pelo catálogo.                                                                                                                          | `D-GEO-003`                                                                                                          | [#133](https://github.com/niraldojunior/nexus/issues/133), [#135](https://github.com/niraldojunior/nexus/issues/135) |
| **REQ-MOD01-007** | Parcial          | `/v1/geo/tree/roots`, `children` e `search` entregam navegação lazy com contagens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Árvore completa dedicada, profundidade/ciclos e operações específicas de Sub-Site.                                                                                                                                | [#108](https://github.com/niraldojunior/nexus/issues/108)                                                            | [#133](https://github.com/niraldojunior/nexus/issues/133)                                                            |
| **REQ-MOD01-008** | Parcial          | PATCH de status gera TMF688 e `/v1/geo/sites/{id}/events` expõe histórico bruto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Máquina de transições, `statusDate`, histórico semântico e retenção.                                                                                                                                              | [#107](https://github.com/niraldojunior/nexus/issues/107)                                                            | [#133](https://github.com/niraldojunior/nexus/issues/133), [#158](https://github.com/niraldojunior/nexus/issues/158) |
| **REQ-MOD01-009** | Parcial          | `validateContainment` verifica pares pai/filho configurados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Prevenção de ciclos ancestrais e API dinâmica de filhos permitidos.                                                                                                                                               | `D-GEO-003`                                                                                                          | [#132](https://github.com/niraldojunior/nexus/issues/132), [#133](https://github.com/niraldojunior/nexus/issues/133) |
| **REQ-MOD01-010** | Parcial          | Criação, listagem e remoção de `relatedSite` persistem e publicam eventos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Tipos governados, inversos automáticos, impact analysis e subgrafo.                                                                                                                                               | [#104](https://github.com/niraldojunior/nexus/issues/104)                                                            | [#133](https://github.com/niraldojunior/nexus/issues/133), [#159](https://github.com/niraldojunior/nexus/issues/159) |
| **REQ-MOD01-011** | Parcial          | `GeoPage`, Google Maps, árvore sincronizada, camada de cobertura GPON por escala (REQ-MOD01-014), `/v1/geo/tree/viewport` exibem Sites e infraestrutura passiva por bbox/escala, e o controle de camadas (`MapLayerControl`, `useMapLayers`, `useViewportInfra`) liga/desliga fetch + render por grupo (`mapLayers.test.ts`, `MapLayerControl.test.tsx`, casos `include` em `geo.integration.spec.ts`).                                                                                                                                                                                                                   | Sync de coordenadas, camadas Geosite, proximidade e exportação PNG/GeoJSON.                                                                                                                                       | [#105](https://github.com/niraldojunior/nexus/issues/105), [#106](https://github.com/niraldojunior/nexus/issues/106) | [#134](https://github.com/niraldojunior/nexus/issues/134)                                                            |
| **REQ-MOD01-012** | Parcial          | Mudanças Geo persistem eventos consultáveis e cobertos por testes unitários/integrados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Outbox transacional, Schema Registry, catálogo público, DLQ e UUID v7.                                                                                                                                            | [#107](https://github.com/niraldojunior/nexus/issues/107)                                                            | [#158](https://github.com/niraldojunior/nexus/issues/158)                                                            |
| **REQ-MOD01-013** | Não implementado | `GeoPage` e o mapa exibem e selecionam feições; nenhuma tela cria ou altera vértices.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Editor de geometria completo: desenho, vértices, snap, split/merge, rascunho, import e histórico.                                                                                                                 | [#109](https://github.com/niraldojunior/nexus/issues/109)                                                            | [#136](https://github.com/niraldojunior/nexus/issues/136), [#134](https://github.com/niraldojunior/nexus/issues/134) |
| **REQ-MOD01-014** | Implementado     | `coverage-grid.ts`, `coverage-service.ts` (incl. `coverageForPoint`, consulta inversa ponto→célula/áreas), `/v1/geo/coverage`, `GET /v1/geo/coverage/by-resource/:id`, `scripts/build-gpon-coverage.mjs` e a camada `CoverageOverlay` no `GeoPage`, com `geo.coverage.unit.spec.ts`, `geo.integration.spec.ts` e `coverageColor.test.ts`.                                                                                                                                                                                                                                                                                 | Takeup (portas ocupadas/totais) por bairro e regeneração incremental/orquestrada da grade.                                                                                                                        | —                                                                                                                    | [#137](https://github.com/niraldojunior/nexus/issues/137)                                                            |
| **REQ-MOD01-015** | Implementado     | `GeoProjectRepository` (com `status` cascateado e `note`/`geonetAddressId` por local, e o vínculo `geo_project_site` preservado após o término — não mais apagado), rotas `/v1/geo/projects/*` em `app.ts` (terminar cascateia para `Active`, não `Retired`; projeto terminado é imutável), exclusão de locais de projeto em `GeoTreeService` restrita a projeto em curso (`PROJECT_SITE_EXCLUSION_SQL`), `HierarchySidebar`/`ProjectListView`/`ProjectDetailPanel`/`SitePanel` no frontend, com `geo-project.unit.spec.ts`, o novo caso "terminar libera os locais" em `geo.integration.spec.ts` e testes de componente. | Promoção explícita de um local de projeto para o inventário sem soft-terminar o Site (hoje só ocorre por exclusão).                                                                                               | —                                                                                                                    | [#138](https://github.com/niraldojunior/nexus/issues/138)                                                            |
| **REQ-MOD01-016** | Implementado     | `SitePanel`/`SiteOverviewTab`/`SiteSubSitesTab`/`SiteResourcesTab`/`SiteHistoryTab`/`SiteAddressModal` no frontend, rotas `GET /v1/geo/sites/:id/origin` e `POST`/`DELETE /v1/geo/sites/:siteId/resources[/:resourceId]` em `app.ts`, `sourceSystem`/`sourceRef`/`accuracyLevel` em `GeographicLocation`/`GeographicAddress` e `note` em `GeographicSite`, com `resource.unit.spec.ts` (desvínculo `placeId: null`), `geo.integration.spec.ts` (Origem + vínculo/desvínculo de recurso) e testes de componente (`SitePanel`, `SiteOverviewTab`, `SiteAddressModal`).                                                      | Aba Sub-locais e Recursos sem teste de componente dedicado (cobertas por integração de rota); reconciliação de fontes divergentes de endereço (GEONET × Google) ainda não estendida de Endereço avulso para Site. | —                                                                                                                    | [#139](https://github.com/niraldojunior/nexus/issues/139)                                                            |
| **REQ-MOD01-017** | Implementado     | `project-area-grid.ts`, `scripts/build-project-areas.mjs`, `GeoProjectRepository.listAreas`/`replaceAreas`, `GeoTreeService.projectSitesInViewport`, rotas `GET /v1/geo/projects/:id/areas` e `/sites` com bbox/limit em `app.ts`, e a camada `ProjectAreaOverlay` no `GeoPage`, com `geo-project-area.unit.spec.ts`, o novo caso em `geo.integration.spec.ts` e `projectAreaColor.test.ts`. Gerado e validado contra o projeto real "Onitel - Novo Gama" (3.514 locais).                                                                                                                                                 | Geração é só por script (sem botão na UI) e não recalcula sozinha ao criar/remover local do projeto depois de gerada.                                                                                             | —                                                                                                                    | [#140](https://github.com/niraldojunior/nexus/issues/140)                                                            |
| **REQ-MOD01-018** | Parcial          | `site_role` em `tmf_geographic_site_specification` (bootstrap, validação `createSpec`/`updateSpec`, `TypeManagementModal`), `GeographicSubAddress` em `tmf_geographic_address` (`SiteAddressModal`, `formatAddress`), migração `INSTALLATION_POINT → CUSTOMER_SITE` e o grupo "Locais" do seletor de camadas do mapa reorganizado por papel, com `geo.unit.spec.ts`, `mapLayers.test.ts` e testes de componente.                                                                                                                                                                                                          | Installation Point como `PhysicalResource` de primeira classe (Módulo 2); filtro de camadas por papel roda só no cliente, sem coluna `site_role` em `geo_map_feature`.                                            | [#110](https://github.com/niraldojunior/nexus/issues/110), [#111](https://github.com/niraldojunior/nexus/issues/111) | [#141](https://github.com/niraldojunior/nexus/issues/141)                                                            |

---

## 3. Modelo conceitual TMF

O módulo Geographic implementa o TMFC014 expondo três entidades canônicas que se referenciam, conforme o modelo de informação do TM Forum:

| Entidade                        | API    | Papel no modelo                                                                                                                                                                                                       |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GeographicLocation**          | TMF675 | Representação geoespacial pura (Point, LineString, Polygon). Independente de qualquer outra entidade. É referenciada por endereços e sites para indicar onde estão fisicamente no mundo.                              |
| **GeographicAddress**           | TMF673 | Endereço postal estruturado (logradouro, número, CEP, cidade, estado, país). Entidade independente que pode opcionalmente referenciar uma GeographicLocation para sua geocodificação.                                 |
| **GeographicSite**              | TMF674 | Local físico (Central, POP, Armário, andar, sala). Entidade central do módulo. Referencia GeographicLocation (place) e GeographicAddress (address). Tem hierarquia (parentSite) e relações topológicas (relatedSite). |
| **GeographicSiteSpecification** | TMF674 | Especificação de tipo de Site (Catálogo). Define atributos esperados, validações e regras de contenção (allowedParent/Child). É o ponto de extensão do metamodelo.                                                    |

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

### 4.7 Fidelidade física — zero entidades artificiais

Todo objeto que o usuário cadastra corresponde a algo que existe no mundo: um site, um endereço, uma geometria. Adjacências, trechos e arestas de grafo são **derivados** das entidades e de suas relações — nunca cadastrados como objeto próprio. Se o modelo exige inventar um registro apenas para amarrar outros dois, o modelo está errado.

O contraexemplo está documentado em `inspirations/geosite-legado.md`: para representar infraestrutura subterrânea, o sistema legado exige cadastrar _arcos_ — arestas do grafo expostas como objeto de cadastro. Nas palavras da operação, "o arco nem existe". A consequência prática é dupla: complexidade de cadastro e uma classe de inconsistência silenciosa, em que os objetos artificiais existem e o objeto real não.

### 4.8 Operação 100% web, sem cliente desktop

Toda operação de cadastro do módulo — inclusive digitalização de geometria — é executável no navegador, sem instalação, plugin ou licença por estação. Nenhum requisito pode depender de ferramenta externa para completar um fluxo. O critério de aceite de qualquer funcionalidade geoespacial inclui a execução em navegador padrão (REQ-MOD01-013).

---

## 5. Resumo dos requisitos do módulo

O módulo Geographic é composto por 16 requisitos, organizados conforme o fluxo natural de modelagem TMF: primeiro as entidades geoespaciais base (Location, Address), depois o catálogo (SiteSpecification), depois as instâncias (Region, Site, Sub-Site, ciclo de vida), depois as relações (contenção, topologia A↔Z) e finalmente as funcionalidades transversais (mapa, eventos, edição geoespacial, cobertura agregada por bairro, projetos de trabalho, painel unificado de Local).

| ID                | Título                                                         | Entidade TMF principal                                                               |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **REQ-MOD01-001** | Cadastro de Geographic Location (ponto, área, linha)           | _GeographicLocation (TMF675)_                                                        |
| **REQ-MOD01-002** | Cadastro de Geographic Address (endereço postal estruturado)   | _GeographicAddress (TMF673)_                                                         |
| **REQ-MOD01-003** | Catálogo de Geographic Site Specification (tipos de site)      | _GeographicSiteSpecification (TMF674)_                                               |
| **REQ-MOD01-004** | Cadastro de Região Geográfica (GeographicSite administrativo)  | _GeographicSite com siteType=Region (TMF674)_                                        |
| **REQ-MOD01-005** | Classificação Funcional de Sites (siteType e grupo funcional)  | _GeographicSite com siteType (TMF674) + grupo via relatedSite_                       |
| **REQ-MOD01-006** | Cadastro de Geographic Site (entidade central do módulo)       | _GeographicSite (TMF674)_                                                            |
| **REQ-MOD01-007** | Sub-Sites (andares, salas, cages como GeographicSite)          | _GeographicSite com category=SubSite (TMF674)_                                       |
| **REQ-MOD01-008** | Ciclo de Vida do Site (status, transições e histórico)         | _GeographicSite.status + StateChangeEvent (TMF674 + TMF688)_                         |
| **REQ-MOD01-009** | Regras de Contenção e Hierarquia entre Sites                   | _allowedParentSpec / allowedChildSpec em SiteSpec (TMF674)_                          |
| **REQ-MOD01-010** | Relações Topológicas A↔Z entre Sites                           | _relatedSite[] em GeographicSite (TMF674)_                                           |
| **REQ-MOD01-011** | Visão de Mapa Georreferenciado                                 | _Não é entidade TMF — funcionalidade de UI sobre TMF674+675_                         |
| **REQ-MOD01-012** | Eventos de Domínio do Módulo Geographic                        | _Event (TMF688) — vários tipos_                                                      |
| **REQ-MOD01-013** | Digitalização e edição de geometria no navegador               | _GeographicLocation (TMF675) — operação de edição_                                   |
| **REQ-MOD01-014** | Cobertura GPON por bairro (mapa de calor)                      | _GeographicLocation (TMF675) — polígono de cobertura agregado_                       |
| **REQ-MOD01-015** | Projetos de Trabalho (coleções de locais fora da Hierarquia)   | _GeographicSite (TMF674) — `geo_project`/`geo_project_site` são plataforma, não TMF_ |
| **REQ-MOD01-016** | Painel Unificado de Local                                      | _GeographicSite (TMF674) — reaproveitado sem alteração de forma_                     |
| **REQ-MOD01-017** | Manchas de Concentração e Dispersão de Projeto                 | _GeographicLocation (TMF675) — polígono de agrupamento espacial_                     |
| **REQ-MOD01-018** | Papel do site e Sub-endereço (siteRole + GeographicSubAddress) | _GeographicSiteSpecification.siteRole (TMF674) + GeographicSubAddress (TMF673)_      |

### 5.1 Ordem de implementação sugerida

A ordem natural de construção respeita as dependências entre entidades:

- **Camada 1 (fundação geoespacial):** REQ-001 (Location) + REQ-002 (Address) + REQ-003 (SiteSpec). Sem estas três, nenhuma instância de Site pode existir.
- **Camada 2 (instâncias hierárquicas):** REQ-004 (Região) + REQ-005 (Grupo Funcional) + REQ-006 (Site) + REQ-007 (Sub-Site). É a operação CRUD efetiva sobre Sites.
- **Camada 3 (governança):** REQ-008 (Ciclo de Vida) + REQ-009 (Contenção). Endurece a operação do dia a dia.
- **Camada 4 (topologia e visualização):** REQ-010 (Relações A↔Z) + REQ-011 (Mapa) + REQ-013 (Edição de geometria) + REQ-014 (Cobertura GPON por bairro). Eleva a operação para análise topológica, torna o cadastro geoespacial autossuficiente no navegador e dá leitura de densidade/disponibilidade da planta em qualquer escala.
- **Camada 5 (interoperabilidade):** REQ-012 (Eventos). Habilita módulos downstream e Data Lake — pode ser implementado em paralelo às camadas 2-4.
- **Camada 6 (workspace de trabalho):** REQ-015 (Projetos de Trabalho) + REQ-016 (Painel Unificado de Local). REQ-016 depende de REQ-006 e REQ-015 já existirem — consolida os fluxos de criação/edição dos dois numa única tela, sem novo tipo de entidade.

---

## 6. REQ-MOD01-001 — Cadastro de Geographic Location (ponto, área, linha)

> **Entidade TMF:** GeographicLocation (TMF675)  
> **Open API TMF:** TMF675 — Geographic Location Management API  
> **Prioridade:** Alta — entidade fundacional do módulo  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 6.1 Descrição

Uma GeographicLocation é a representação geoespacial pura de "onde algo está" no mundo físico. Pode ser um ponto (poste, CTO, equipamento individual), uma linha (traçado de cabo, rota de duto) ou uma área (zona de cobertura, polígono de uma cidade). É a entidade independente que provê coordenadas para qualquer outra entidade do Nexus que precise ser geolocalizada — Sites, Resources de planta externa, endereços postais.

### 6.2 Racional arquitetural

O design do TMF675 trata localização geográfica como entidade própria com ID, não como atributo embutido em outras entidades. Esta é uma decisão arquitetural importante: nos sistemas legados, latitude e longitude são campos do Site (Netwin, NetBox) ou atributos do metamodelo (Kuwaiba). O Nexus adota o modelo TMF675 porque: (a) a mesma localização pode ser referenciada por múltiplas entidades (um Site e um Endereço podem apontar para o mesmo ponto); (b) localizações são reutilizáveis em consultas geoespaciais sem replicação de dados; (c) suporta naturalmente geometrias complexas (linhas para cabos, polígonos para áreas de cobertura) que campos lat/long não conseguem expressar.

### 6.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicLocation (TMF675):

| Atributo TMF     | Tipo             | Obrigatório | Observação V.tal                                                                                                                |
| ---------------- | ---------------- | :---------: | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string           |     Sim     | UUID v7 gerado pelo Nexus.                                                                                                      |
| `href`           | string           |     Não     | URL canônica da entidade.                                                                                                       |
| `geometryType`   | enum             |     Sim     | Point                                                                                                                           | LineString | Polygon. Padrão V.tal: Point para sites e equipamentos; LineString para cabos. |
| `geometry`       | GeoJSON          |     Sim     | Geometria conforme RFC 7946 (GeoJSON). Coordenadas em [longitude, latitude] — note a ordem invertida em relação ao senso comum. |
| `spatialRef`     | string           |     Não     | Sistema de referência espacial. Padrão V.tal: "EPSG:4326" (WGS84).                                                              |
| `accuracy`       | string           |     Não     | Indicação de precisão da coordenada (ex.: GPS, manual, derivado de endereço).                                                   |
| `referencePoint` | string           |     Não     | Descrição textual auxiliar (ex.: "Em frente ao número 100, próximo ao poste de luz").                                           |
| `relatedEntity`  | array<EntityRef> |     Não     | Lista de entidades que referenciam esta localização (back-reference para consulta).                                             |
| `validFor`       | TimePeriod       |     Não     | Período de validade — permite versionar localizações ao longo do tempo.                                                         |

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

| ID         | Nome                          | Descrição                                                                                                                                 |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Criar Geographic Location** | Permitir criação de GeographicLocation com geometryType, geometry (GeoJSON), spatialRef e demais atributos.                               |
| **RF-002** | **Validação geométrica**      | Validar geometria conforme RFC 7946: Point com [long, lat]; LineString com array de pontos ordenado; Polygon com anel fechado.            |
| **RF-003** | **Validação de intervalo**    | Validar latitude em [-90, 90] e longitude em [-180, 180] para todos os pontos da geometria.                                               |
| **RF-004** | **Buscar por proximidade**    | Suportar busca de localizações dentro de raio (em metros) de um ponto de referência, usando distância geodésica.                          |
| **RF-005** | **Buscar por bounding box**   | Suportar busca de localizações contidas em um retângulo geográfico (minLong, minLat, maxLong, maxLat).                                    |
| **RF-006** | **Buscar por interseção**     | Suportar busca de localizações que intersectam um polígono dado (caso de uso: "todos os Sites na área de impacto X").                     |
| **RF-007** | **Atualizar geometria**       | Permitir atualização de geometria; mudanças geram evento TMF688 (GeographicLocationAttributeValueChangeEvent) para sistemas consumidores. |
| **RF-008** | **Excluir Location**          | Bloquear exclusão de Location referenciada por entidades ativas (Site, Address, Resource); permitir soft-delete via validFor.             |
| **RF-009** | **Consulta de referências**   | Expor endpoint para listar todas as entidades que referenciam uma dada GeographicLocation.                                                |
| **RF-010** | **Exportação GeoJSON**        | Exportar localizações em formato GeoJSON nativo para integração com sistemas GIS externos.                                                |

### 6.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Toda GeographicLocation deve ter geometria válida conforme RFC 7946 — geometrias malformadas são rejeitadas no save.                                                              |
| **RN-002** | O sistema de referência espacial padrão é EPSG:4326 (WGS84); outros sistemas podem ser registrados como metadado mas não são suportados em consultas geoespaciais nativas do MVP. |
| **RN-003** | Localizações nunca são excluídas fisicamente quando referenciadas — apenas marcadas com validFor.endDateTime.                                                                     |
| **RN-004** | Para LineString, ordem dos pontos é significativa (define direção do traçado para cabos).                                                                                         |
| **RN-005** | Para Polygon, o anel exterior deve ser fechado (primeiro ponto = último ponto) e seguir orientação anti-horária.                                                                  |
| **RN-006** | Buscas por proximidade usam distância geodésica (fórmula de Haversine ou equivalente), não distância euclidiana.                                                                  |
| **RN-007** | Toda criação ou alteração gera evento TMF688 com correlation ID rastreável.                                                                                                       |

### 6.8 Critérios de Aceite

| ID         | Critério                   | Resultado Esperado                                                                                                                              |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Criação válida**         | Point criado com geometria {type:"Point", coordinates:[long,lat]} retorna 201 com ID e href; LineString com 5 pontos é aceito com mesmo padrão. |
| **CA-002** | **Validação RFC 7946**     | Geometria malformada (Point sem coordinates, LineString com 1 ponto, Polygon não fechado) retorna 400 com mensagem específica do erro.          |
| **CA-003** | **Validação de intervalo** | Longitude=181 ou latitude=-91 retornam 400 antes de qualquer persistência.                                                                      |
| **CA-004** | **Busca por proximidade**  | GET /geographicLocation?near=-43.18,-22.90&radius=1000 retorna localizações dentro de 1km, ordenadas por distância crescente.                   |
| **CA-005** | **Bounding box**           | GET /geographicLocation?bbox=-43.20,-22.92,-43.16,-22.88 retorna apenas localizações dentro do retângulo informado.                             |
| **CA-006** | **Bloqueio de exclusão**   | DELETE em Location referenciada retorna 409 com lista de referências; reativação com soft-delete é permitida.                                   |
| **CA-007** | **Evento publicado**       | Cada criação/alteração publica evento TMF688 no tópico geographic.location.v1 com payload conforme schema.                                      |
| **CA-008** | **Export GeoJSON**         | GET /geographicLocation com Accept: application/geo+json retorna FeatureCollection válida conforme RFC 7946.                                    |

### 6.9 Mapeamento contra sistemas de referência

| Capacidade                                     | Netwin                           | Kuwaiba                                   | NetBox                           | Decisão Nexus                                                |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| **Entidade de localização independente**       | Não identificado no levantamento | Atributo de GenericLocation no metamodelo | Campos lat/long no Site          | **GeographicLocation como entidade própria conforme TMF675** |
| **Geometrias complexas (LineString, Polygon)** | Não identificado no levantamento | Não identificado no levantamento          | Não identificado no levantamento | **Suporte nativo via GeoJSON**                               |
| **Busca por proximidade**                      | Sim (Tolerância em m)            | Não identificado no levantamento          | Não identificado no levantamento | **Suporte nativo com distância geodésica**                   |
| **Reutilização de localização**                | Não identificado no levantamento | Não identificado no levantamento          | Não identificado no levantamento | **Localização única referenciada por N entidades**           |

---

## 7. REQ-MOD01-002 — Cadastro de Geographic Address (endereço postal estruturado)

> **Entidade TMF:** GeographicAddress (TMF673)  
> **Open API TMF:** TMF673 — Geographic Address Management API  
> **Prioridade:** Alta — entidade fundacional do módulo  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 7.1 Descrição

Um GeographicAddress é um endereço postal estruturado: logradouro, número, complemento, bairro, cidade, estado, país, CEP. É a entidade canônica para correspondência, despacho técnico, integração com base de Logradouros e atendimento a regras regulatórias (Anatel, faturamento). Como entidade independente do TMF673, pode ser referenciada por múltiplos Sites e por Subscribers no Service Inventory.

### 7.2 Racional arquitetural

Endereço postal e geometria geográfica são conceitos distintos: o endereço é uma representação convencional humana (logradouro, número), enquanto a geometria é uma representação matemática (coordenadas). O TMF673 modela endereço como entidade própria que pode opcionalmente referenciar uma GeographicLocation — esta separação é importante porque: (a) o mesmo endereço pode ser geocodificado com diferentes precisões ao longo do tempo; (b) endereços têm validação cultural (formato, CEP, normalização) que coordenadas não têm; (c) a integração com a base Logradouros da V.tal (Geosite) é por endereço, não por coordenada. Os sistemas legados tratam endereço como tabela embutida no Site (Netwin) ou como campo texto livre (NetBox) ou como atributo no metamodelo (Kuwaiba) — todos modelos inferiores ao TMF673.

### 7.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicAddress (TMF673):

| Atributo TMF           | Tipo       | Obrigatório | Observação V.tal                                                                       |
| ---------------------- | ---------- | :---------: | -------------------------------------------------------------------------------------- |
| `id`                   | string     |     Sim     | UUID v7 gerado pelo Nexus.                                                             |
| `href`                 | string     |     Não     | URL canônica da entidade.                                                              |
| `streetType`           | string     |     Não     | Tipo de logradouro: Rua, Avenida, Travessa, Praça, Estrada.                            |
| `streetName`           | string     |     Sim     | Nome do logradouro sem o tipo.                                                         |
| `streetNr`             | string     |     Não     | Número do imóvel; pode conter alfanumérico (S/N, 100A).                                |
| `streetNrSuffix`       | string     |     Não     | Complemento do número (apto, bloco, sala).                                             |
| `locality`             | string     |     Não     | Bairro.                                                                                |
| `city`                 | string     |     Sim     | Cidade.                                                                                |
| `stateOrProvince`      | string     |     Sim     | Estado (UF em 2 letras para Brasil).                                                   |
| `country`              | string     |     Sim     | País (código ISO 3166-1 alpha-2; padrão "BR").                                         |
| `postcode`             | string     |     Não     | CEP no formato NNNNN-NNN.                                                              |
| `geographicLocation`   | EntityRef  |     Não     | Referência opcional para GeographicLocation (TMF675) com a geocodificação do endereço. |
| `geographicSubAddress` | array      |     Não     | Sub-endereços (apartamento, sala, andar) — útil para condomínios.                      |
| `validFor`             | TimePeriod |     Não     | Período de validade do endereço.                                                       |

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

| ID         | Nome                                 | Descrição                                                                                                                |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **RF-001** | **Criar Geographic Address**         | Permitir criação de endereço com os campos do TMF673; validar obrigatórios (streetName, city, stateOrProvince, country). |
| **RF-002** | **Lookup em Logradouros**            | Integrar o campo streetName com a base Logradouros V.tal para sugestão e padronização ao digitar.                        |
| **RF-003** | **Validação de CEP**                 | Validar formato do CEP brasileiro (NNNNN-NNN); opcionalmente validar contra base externa de CEPs.                        |
| **RF-004** | **Vinculação a Geographic Location** | Permitir associar opcionalmente uma GeographicLocation (TMF675) ao endereço para geocodificação.                         |
| **RF-005** | **Geocodificação automática**        | Quando endereço é criado sem geographicLocation, oferecer geocodificação automática via serviço externo (com aprovação). |
| **RF-006** | **Sub-endereços**                    | Suportar geographicSubAddress (apartamento, sala, andar) para condomínios e edifícios comerciais.                        |
| **RF-007** | **Editar e versionar**               | Permitir edição com versionamento via validFor; histórico de endereços anteriores preservado como entidades inativas.    |
| **RF-008** | **Excluir endereço**                 | Bloquear exclusão de endereço referenciado por Site ou Subscriber ativo; permitir soft-delete.                           |
| **RF-009** | **Padronização (normalize)**         | Endpoint dedicado para normalizar um endereço (uppercase, abreviações expandidas, CEP formatado) sem persistir.          |
| **RF-010** | **Eventos**                          | Publicar evento TMF688 a cada criação/alteração de endereço.                                                             |

### 7.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **RN-001** | Os campos streetName, city, stateOrProvince e country são obrigatórios.                                                              |
| **RN-002** | CEP, quando informado, deve seguir o formato NNNNN-NNN (8 dígitos com hífen).                                                        |
| **RN-003** | O código de país segue ISO 3166-1 alpha-2; padrão "BR".                                                                              |
| **RN-004** | Endereços não são removidos fisicamente quando referenciados — apenas com validFor.endDateTime.                                      |
| **RN-005** | A vinculação com GeographicLocation é opcional, mas recomendada para Sites — sites sem geocodificação não aparecem na visão de mapa. |
| **RN-006** | A normalização aplica regras V.tal: streetType em uppercase, abreviações padronizadas (Av., Tv., Pç.).                               |
| **RN-007** | Toda criação ou alteração gera entrada no Audit Trail e evento TMF688.                                                               |

### 7.8 Critérios de Aceite

| ID         | Critério                   | Resultado Esperado                                                                                                         |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Criação válida**         | POST com streetName="Voluntarios da Patria", city="Rio de Janeiro", stateOrProvince="RJ", country="BR" retorna 201 com ID. |
| **CA-002** | **Obrigatórios validados** | POST sem city retorna 400 com mensagem indicando o campo faltante.                                                         |
| **CA-003** | **Validação de CEP**       | postcode="22270170" sem hífen é normalizado para "22270-170"; postcode="ABCDE-FGH" retorna 400.                            |
| **CA-004** | **Lookup Logradouros**     | Endpoint GET /addresses/suggest?q=volunt retorna sugestões da base Logradouros com cidade e estado pré-preenchidos.        |
| **CA-005** | **Geocodificação**         | Endpoint POST /addresses/{id}/geocode dispara geocodificação e cria GeographicLocation vinculada.                          |
| **CA-006** | **Sub-endereços**          | Criar endereço com geographicSubAddress=[{type:"apartamento", value:"301"}] persiste corretamente.                         |
| **CA-007** | **Versionamento**          | Edição cria nova versão com validFor.startDateTime atual; versão anterior tem validFor.endDateTime preenchido.             |
| **CA-008** | **Bloqueio de exclusão**   | DELETE em endereço de Site ativo retorna 409 com lista de Sites referenciando.                                             |

### 7.9 Mapeamento contra sistemas de referência

| Capacidade                         | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                    |
| ---------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | ------------------------------------------------ |
| **Endereço como entidade própria** | Tabela embutida no Site          | Atributo de texto no metamodelo  | Dois campos texto no Site        | **Entidade GeographicAddress conforme TMF673**   |
| **Múltiplos endereços por Site**   | Sim (tabela com principal)       | Não identificado no levantamento | Não identificado no levantamento | **Sim — Site referencia N endereços**            |
| **Integração Logradouros**         | Sim (Geosite Logradouros)        | Não identificado no levantamento | Não identificado no levantamento | **Integração reaproveitada via API de sugestão** |
| **Sub-endereços (apto, sala)**     | Texto livre no campo             | Não identificado no levantamento | Texto livre                      | **Modelado via geographicSubAddress (TMF673)**   |
| **Vinculação com geocodificação**  | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Vinculação opcional via referência TMF675**    |

---

## 8. REQ-MOD01-003 — Catálogo de Geographic Site Specification (tipos de site)

> **Entidade TMF:** GeographicSiteSpecification (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — pré-requisito de todos os requisitos de Site  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 8.1 Descrição

Uma GeographicSiteSpecification é a definição de um tipo de Site no catálogo do Nexus: Central Office, POP, Armário de Distribuição, Data Center, Ponto de Instalação, Andar, Sala, Cage. Define os atributos esperados, validações específicas, regras de contenção (quais tipos podem ser pai/filho) e campos customizados V.tal (CLLI, CN, Anel, SICOM). É o ponto de extensão do metamodelo para o domínio geográfico.

### 8.2 Racional arquitetural

O TMF674 introduz GeographicSiteSpecification como entidade do catálogo de Site Management — o equivalente de ResourceSpecification para o domínio de Resource. Esta separação entre instância (Site) e especificação (SiteSpecification) é central para um inventário extensível: novos tipos de Site podem ser introduzidos sem alteração de código, com seus próprios atributos e regras de contenção. Esta capacidade é a fusão de duas inspirações: o Containment Manager do Kuwaiba (regras de contenção configuráveis em runtime) e a tipagem polimórfica do Netwin (formulário muda conforme o tipo selecionado). O Nexus formaliza essa capacidade no padrão TMF674, eliminando o caráter implícito do Netwin e o caráter exclusivamente metamodel-driven do Kuwaiba.

### 8.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSiteSpecification (TMF674):

| Atributo TMF         | Tipo             | Obrigatório | Observação V.tal                                                                   |
| -------------------- | ---------------- | :---------: | ---------------------------------------------------------------------------------- |
| `id`                 | string           |     Sim     | UUID v7.                                                                           |
| `name`               | string           |     Sim     | Nome do tipo de site (ex.: "Central Office", "POP", "Armário", "Andar", "Sala").   |
| `code`               | string           |     Sim     | Código interno (ex.: "CO", "POP", "ARM", "AND", "SLA"). Único na plataforma.       |
| `description`        | string           |     Não     | Descrição funcional do tipo de site.                                               |
| `category`           | enum             |     Sim     | Region                                                                             | FunctionalGroup                                                | Site | SubSite. Determina o papel hierárquico. |
| `lifecycleStatus`    | enum             |     Sim     | Active                                                                             | Retired — especificações descontinuadas não criam novos sites. |
| `specCharacteristic` | array<CharSpec>  |     Não     | Lista de atributos customizados do tipo (CLLI, CN, Anel, capacidade etc.).         |
| `validFor`           | TimePeriod       |     Não     | Período de validade da especificação.                                              |
| `allowedParentSpec`  | array<EntityRef> |     Não     | Lista de SiteSpecifications que podem ser pais deste tipo (catálogo de contenção). |
| `allowedChildSpec`   | array<EntityRef> |     Não     | Lista de SiteSpecifications que podem ser filhos deste tipo.                       |

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
    { "name": "CLLI", "valueType": "string", "mandatory": true, "validator": "^[A-Z0-9]{11}$" },
    {
      "name": "CN",
      "valueType": "string",
      "mandatory": true,
      "configurable": false,
      "description": "Calculado por Regiao+Regional"
    },
    { "name": "Anel", "valueType": "string", "mandatory": false },
    { "name": "SICOM_ID", "valueType": "string", "mandatory": false }
  ],
  "allowedParentSpec": [{ "id": "spec-region", "@referredType": "GeographicSiteSpecification" }],
  "allowedChildSpec": [
    { "id": "spec-floor", "@referredType": "GeographicSiteSpecification" },
    { "id": "spec-room", "@referredType": "GeographicSiteSpecification" }
  ]
}
```

### 8.5 Pré-condições

- O usuário possui permissão de Administrador do Catálogo Geographic.

### 8.6 Requisitos Funcionais

| ID         | Nome                             | Descrição                                                                                                                                     |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Criar SiteSpecification**      | Permitir criação de novo tipo de Site com nome, código, categoria e atributos customizados.                                                   |
| **RF-002** | **Catálogo de tipos base**       | Pré-popular o catálogo com tipos canônicos V.tal: Region, FunctionalGroup, CentralOffice, POP, Cabinet, InstallationPoint, Floor, Room, Cage. |
| **RF-003** | **Atributos customizados**       | Permitir definir specCharacteristics por tipo: nome, tipo (string/int/enum/date), obrigatório, valor padrão, validador (regex ou lookup).     |
| **RF-004** | **Regras de contenção**          | Configurar allowedParentSpec e allowedChildSpec para definir quais tipos podem se conter.                                                     |
| **RF-005** | **Versionamento**                | Permitir versionar SiteSpecifications via validFor; especificações descontinuadas não criam novos sites mas mantêm sites existentes.          |
| **RF-006** | **Editar SiteSpecification**     | Editar nome, descrição e atributos; alteração de specCharacteristics não-obrigatórios é segura; obrigatórios novos exigem migração.           |
| **RF-007** | **Excluir SiteSpecification**    | Bloquear exclusão de SiteSpec com sites instanciados; permitir transição para lifecycleStatus=Retired.                                        |
| **RF-008** | **Consultar contenção possível** | Endpoint GET /geographicSiteSpecification/{id}/allowedChildren retorna tipos aceitos como filhos para uso em formulários dinâmicos.           |
| **RF-009** | **Eventos**                      | Publicar evento TMF688 a cada criação/alteração de especificação.                                                                             |

### 8.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | O code da SiteSpecification deve ser único globalmente na plataforma.                                                                   |
| **RN-002** | As 4 categorias base (Region, FunctionalGroup, Site, SubSite) determinam o papel hierárquico e não podem ser sobrescritas.              |
| **RN-003** | specCharacteristic obrigatório só pode ser adicionado a SiteSpec sem sites instanciados — caso contrário, exige migração explícita.     |
| **RN-004** | Regras de contenção (allowedParent/Child) são imutáveis para combinações já existentes — só podem ser flexibilizadas, não restringidas. |
| **RN-005** | SiteSpecification em status Retired não pode criar novos sites, mas sites existentes desse tipo continuam ativos.                       |
| **RN-006** | Toda alteração no catálogo gera registro no Audit Trail e evento TMF688.                                                                |

### 8.8 Critérios de Aceite

| ID         | Critério                    | Resultado Esperado                                                                                                               |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Criação válida**          | POST com name="POP Regional", code="POP-REG", category="Site" retorna 201 com ID.                                                |
| **CA-002** | **Unicidade de code**       | POST com code já existente retorna 409 com mensagem específica.                                                                  |
| **CA-003** | **Atributos custom**        | SpecCharacteristic [{name:"CLLI", type:"string", mandatory:true, validator:"^[A-Z0-9]{11}$"}] é aceito e aplicado a novos sites. |
| **CA-004** | **Contenção configurada**   | SiteSpec "Floor" com allowedParentSpec=["CentralOffice","POP"] permite criar Floor apenas como filho desses tipos.               |
| **CA-005** | **Bloqueio de exclusão**    | DELETE em SiteSpec com sites instanciados retorna 409; PATCH para lifecycleStatus="Retired" é aceito.                            |
| **CA-006** | **Allowed children API**    | GET /geographicSiteSpecification/{id}/allowedChildren retorna lista de SiteSpecs filhas permitidas com 200.                      |
| **CA-007** | **Migração de obrigatório** | Adicionar specCharacteristic obrigatório a SiteSpec com sites instanciados exige parâmetro migrationStrategy explícito.          |
| **CA-008** | **Evento publicado**        | Cada criação/alteração publica evento no tópico geographic.siteSpec.v1.                                                          |

### 8.9 Mapeamento contra sistemas de referência

| Capacidade                            | Netwin                               | Kuwaiba                   | NetBox                           | Decisão Nexus                                   |
| ------------------------------------- | ------------------------------------ | ------------------------- | -------------------------------- | ----------------------------------------------- |
| **Catálogo de tipos formalizado**     | Não identificado no levantamento     | Sim (Data Model Manager)  | Parcial (modelo Django fixo)     | **GeographicSiteSpecification conforme TMF674** |
| **Atributos customizados por tipo**   | Campos hardcoded (CLLI, CN, Anel)    | Sim (metamodelo)          | Sim (Custom Fields)              | **specCharacteristic versionado**               |
| **Regras de contenção configuráveis** | Implícitas no formulário polimórfico | Sim (Containment Manager) | Hardcoded no modelo              | **allowedParent/ChildSpec configuráveis**       |
| **Versionamento do catálogo**         | Não identificado no levantamento     | Parcial                   | Não identificado no levantamento | **validFor + lifecycleStatus**                  |

---

## 9. REQ-MOD01-004 — Cadastro de Região Geográfica (GeographicSite administrativo)

> **Entidade TMF:** GeographicSite com siteType=Region (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 9.1 Descrição

Uma Região Geográfica é a unidade de agrupamento hierárquico de natureza administrativa/geopolítica: Continente, País, Estado, Cidade, Regional V.tal, Bairro. No modelo TMF674, Regiões não são entidade separada — são GeographicSite com category="Region" no GeographicSiteSpecification. Esta decisão arquitetural unifica o tratamento de "onde" no modelo TMF e elimina a complexidade de manter duas hierarquias paralelas (Region + Site) como faz o NetBox.

### 9.2 Racional arquitetural

Na primeira versão do levantamento, modelamos Região como entidade separada (inspirada no NetBox Region). Após o alinhamento ao TMF674, fica claro que Região é apenas mais um tipo de GeographicSite — um Site administrativo que não tem equipamentos nem serviços, mas que serve de pai hierárquico para outros Sites. Esta unificação traz quatro benefícios: (a) uma única API (TMF674) cobre toda a hierarquia geográfica; (b) consultas hierárquicas usam o mesmo mecanismo (parentSite) para Região, Site e Sub-Site; (c) a extensibilidade do GeographicSiteSpecification se aplica também a Regiões (campos customizados para Regional V.tal, por exemplo); (d) elimina a confusão conceitual de "Região" no NetBox vs. "Site Group" no NetBox vs. "Region" como conceito do dia a dia.

### 9.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite com siteType=Region (TMF674):

| Atributo TMF        | Tipo      | Obrigatório | Observação V.tal                                                                             |
| ------------------- | --------- | :---------: | -------------------------------------------------------------------------------------------- |
| `siteSpecification` | EntityRef |     Sim     | Referência para GeographicSiteSpecification com category="Region".                           |
| `name`              | string    |     Sim     | Nome da Região (ex.: "Brasil", "Rio de Janeiro", "Regional Sudeste V.tal").                  |
| `code`              | string    |     Sim     | Código curto (ex.: "BR", "RJ", "REG-SE"). Único no nível hierárquico.                        |
| `parentSite`        | EntityRef |     Não     | Referência ao GeographicSite pai (Região superior). Nulo para Região de topo.                |
| `status`            | enum      |     Sim     | Active                                                                                       | Inactive — Regiões podem ser desativadas mas raramente excluídas. |
| `relatedParty`      | array     |     Não     | Responsáveis pela Região (ex.: gerente regional V.tal).                                      |
| `characteristic`    | array     |     Não     | Valores dos specCharacteristics definidos na SiteSpecification (ex.: código IBGE, ISO 3166). |

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

| ID         | Nome                        | Descrição                                                                                                  |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Criar Região**            | Criar GeographicSite com siteSpecification de category=Region, nome, código, pai opcional e atributos.     |
| **RF-002** | **Hierarquia n-níveis**     | Suportar profundidade ilimitada via parentSite recursivo (Continente > País > Estado > Cidade > Regional). |
| **RF-003** | **Editar Região**           | Editar nome, descrição, atributos; reassignar parentSite com validação de não-ciclo.                       |
| **RF-004** | **Excluir/Desativar**       | Bloquear exclusão de Região com filhos ou Sites operacionais; permitir status=Inactive.                    |
| **RF-005** | **Listar e filtrar**        | Suportar listagem em árvore e plana com filtros por código, nome, pai e status.                            |
| **RF-006** | **Contadores agregados**    | Expor count de Sites e Sub-Sites descendentes por Região (acumulado na subárvore).                         |
| **RF-007** | **Hierarquia padrão V.tal** | Bootstrap automático da hierarquia base: Brasil > {26 UFs + DF} > principais regionais V.tal.              |
| **RF-008** | **Eventos**                 | Publicar evento TMF688 a cada criação, alteração ou mudança de status.                                     |

### 9.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Nome único dentro do mesmo parentSite (ou globalmente para Regiões de topo).                                        |
| **RN-002** | Code único globalmente quando a Região é de topo; único por pai quando aninhada.                                    |
| **RN-003** | Não é permitido ciclo na hierarquia — parentSite não pode apontar para descendente.                                 |
| **RN-004** | Excluir Região com filhos é bloqueado; é necessário desativar primeiro os filhos ou reassignar.                     |
| **RN-005** | Regiões da hierarquia base V.tal (Brasil, UFs) não podem ser excluídas — apenas desativadas com aprovação especial. |
| **RN-006** | Toda alteração gera Audit Trail e evento TMF688.                                                                    |

### 9.8 Critérios de Aceite

| ID         | Critério                 | Resultado Esperado                                                                         |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| **CA-001** | **Criação válida**       | POST de Região "São Paulo" com parentSite=Brasil retorna 201 e a Região aparece na árvore. |
| **CA-002** | **Hierarquia correta**   | GET /geographicSite?parentSite={id}&category=Region retorna Regiões filhas diretas.        |
| **CA-003** | **Contagem agregada**    | GET /geographicSite/{id}/descendantCount retorna {sites:N, subSites:M} para a subárvore.   |
| **CA-004** | **Bloqueio de ciclo**    | PATCH em Região tentando definir parentSite como seu próprio descendente retorna 400.      |
| **CA-005** | **Bloqueio de exclusão** | DELETE em Região com Sites operacionais retorna 409 com lista de dependentes.              |
| **CA-006** | **Status Inactive**      | PATCH com status=Inactive em Região com filhos ativos exibe alerta e exige confirmação.    |

### 9.9 Mapeamento contra sistemas de referência

| Capacidade                       | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                                |
| -------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| **Modelagem de Região**          | Campo Região (dropdown)          | Subclasse via metamodelo         | Entidade Region MPTT             | **GeographicSite com category=Region (unificado em TMF674)** |
| **Hierarquia n-níveis**          | Região + Regional (2 nv.)        | Sim (metamodelo)                 | Sim (MPTT)                       | **Sim (parentSite recursivo)**                               |
| **Contagem acumulada**           | Não identificado no levantamento | Não identificado no levantamento | Sim (site_count)                 | **Sim (descendantCount endpoint)**                           |
| **Hierarquia base pré-populada** | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim (Brasil + 27 UFs no bootstrap)**                       |

---

## 10. REQ-MOD01-005 — Classificação Funcional de Sites (siteType e grupo funcional)

> **Entidade TMF:** GeographicSite com siteType (TMF674) + grupo via relatedSite  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Média — habilita filtros operacionais e relatórios  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 10.1 Descrição

Além da hierarquia geográfica (REQ-004), Sites podem ser agrupados por função/papel operacional: Centrais de Borda, POPs de Distribuição Sudeste, Armários Rurais. Esta classificação é ortogonal à hierarquia geográfica — um mesmo POP é classificado por "onde está" (Regional Sudeste) e por "o que é" (POP de Distribuição). No modelo TMF674, isto é expresso de duas formas complementares: (a) siteType como atributo classificador do GeographicSite; (b) Grupo Funcional como GeographicSite com category="FunctionalGroup" referenciado via relatedSite.

### 10.2 Racional arquitetural

Aqui o Nexus se afasta deliberadamente do modelo NetBox (que trata Site Group como entidade separada paralela a Region). A análise mostra que Site Group é mais bem modelado como mais um tipo de GeographicSite (category="FunctionalGroup") — preservando a unificação no TMF674. Esta abordagem evita a duplicação de hierarquias (Region + SiteGroup como duas árvores) e habilita Grupos Funcionais com atributos customizados próprios (capacidade agregada, política de manutenção, SLA). O siteType é mantido como atributo direto do Site para consultas rápidas; o vínculo com FunctionalGroup permite agregação e governança.

### 10.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite com siteType (TMF674) + grupo via relatedSite:

| Atributo TMF     | Tipo   | Obrigatório | Observação V.tal                                                                                                          |
| ---------------- | ------ | :---------: | ------------------------------------------------------------------------------------------------------------------------- |
| `siteType`       | string |     Não     | Classificação direta (ex.: "CO", "POP-Distribuição", "Armário-Rural"). Derivada do code da siteSpecification + atributos. |
| `relatedSite`    | array  |     Não     | Vínculos com FunctionalGroups via {site, role:"memberOf"}.                                                                |
| `characteristic` | array  |     Não     | Atributos de classificação funcional (capacidade, classe de serviço, função técnica).                                     |

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
    {
      "site": { "id": "site-fg-pops-borda", "@referredType": "GeographicSite" },
      "role": "memberOf"
    }
  ]
}
```

### 10.5 Pré-condições

- Existem GeographicSites do tipo FunctionalGroup criados no catálogo de regiões/grupos.

### 10.6 Requisitos Funcionais

| ID         | Nome                                | Descrição                                                                                          |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| **RF-001** | **Definir siteType**                | Permitir associar siteType ao Site na criação/edição, baseado na SiteSpecification.                |
| **RF-002** | **Vincular a FunctionalGroup**      | Permitir vincular um Site a um ou mais GeographicSites do tipo FunctionalGroup via relatedSite.    |
| **RF-003** | **Hierarquia de Grupos Funcionais** | Suportar hierarquia em FunctionalGroups (ex.: "POPs" > "POPs de Borda" > "POPs de Borda Sudeste"). |
| **RF-004** | **Filtragem por classificação**     | Listar Sites filtrando por siteType e/ou por FunctionalGroup; combinação com filtro geográfico.    |
| **RF-005** | **Agregação por grupo**             | Expor agregados (contagem, soma de capacidade) por FunctionalGroup.                                |
| **RF-006** | **Auditoria de classificação**      | Toda mudança de siteType ou vínculo com FunctionalGroup gera Audit Trail.                          |

### 10.7 Regras de Negócio

| ID         | Regra de Negócio                                                                           |
| ---------- | ------------------------------------------------------------------------------------------ |
| **RN-001** | siteType é livre mas recomendado vir de um conjunto canônico V.tal (preset).               |
| **RN-002** | Um Site pode pertencer a múltiplos FunctionalGroups simultaneamente (relação N:N).         |
| **RN-003** | FunctionalGroups podem ter atributos customizados próprios (capacidade total, política).   |
| **RN-004** | Reassignar siteType de um Site exige Audit Trail e potencial revisão de regras associadas. |

### 10.8 Critérios de Aceite

| ID         | Critério               | Resultado Esperado                                                                       |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| **CA-001** | **Filtro combinado**   | GET /geographicSite?regionId=RJ&siteType=POP-Distribuicao retorna apenas POPs no RJ.     |
| **CA-002** | **Vínculo a grupo**    | POST /geographicSite/{id}/relatedSite com role=memberOf vincula Site a FunctionalGroup.  |
| **CA-003** | **Múltiplos grupos**   | Um Site pode aparecer em GET /geographicSite/{groupId}/members de mais de um grupo.      |
| **CA-004** | **Agregado por grupo** | GET /geographicSite/{groupId}/aggregate retorna count e atributos agregados dos membros. |

### 10.9 Mapeamento contra sistemas de referência

| Capacidade                     | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                                         |
| ------------------------------ | -------------------------------- | -------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| **Modelagem de Grupo de Site** | Campo tipo (texto)               | Não identificado no levantamento | Entidade SiteGroup separada      | **GeographicSite com category=FunctionalGroup (unificado em TMF674)** |
| **Classificação ortogonal**    | Não identificado no levantamento | Via metamodelo                   | Sim (Region + SiteGroup)         | **Sim (parentSite + relatedSite)**                                    |
| **Múltiplos grupos por Site**  | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim (relatedSite array)**                                           |

---

## 11. REQ-MOD01-006 — Cadastro de Geographic Site (entidade central do módulo)

> **Entidade TMF:** GeographicSite (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Crítica — entidade central do módulo  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 11.1 Descrição

Um GeographicSite é a unidade principal de local físico da V.tal: Central Office, POP, Armário de Distribuição, Data Center, Ponto de Instalação GPON. É a entidade-âncora referenciada por: Resources (todo equipamento e cabo tem place = GeographicSite ou GeographicLocation); Services (todo SubscriberID tem um endereço de instalação); Orders (toda OS opera sobre Sites). Este requisito formaliza a entidade central do módulo Geographic conforme TMF674.

### 11.2 Racional arquitetural

Este é o requisito mais importante do módulo: GeographicSite é a entidade canônica do TMF674 e o ponto de referência para praticamente todos os outros módulos do Nexus. O design segue rigorosamente o TMF674: o Site referencia (não embute) sua localização geográfica (TMF675) e seu endereço postal (TMF673); seu tipo vem do catálogo (REQ-003); sua hierarquia é dada por parentSite. Esta separação é o que torna o modelo TMF superior aos sistemas legados — onde Site é um "objeto monolítico" com lat/long e endereço embutidos. A unificação de Site e Ponto de Instalação do Netwin em uma única entidade GeographicSite (diferenciados apenas pela siteSpecification) simplifica drasticamente o modelo. Os campos específicos V.tal (CLLI, CN, Anel, SICOM, Sitar) entram como characteristic baseado no specCharacteristic do catálogo.

### 11.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite (TMF674):

| Atributo TMF        | Tipo       | Obrigatório | Observação V.tal                                                                                                 |
| ------------------- | ---------- | :---------: | ---------------------------------------------------------------------------------------------------------------- |
| `id`                | string     |     Sim     | UUID v7 — identificador estável global.                                                                          |
| `name`              | string     |     Sim     | Nome do Site. Único globalmente para Sites operacionais.                                                         |
| `code`              | string     |     Não     | Código curto V.tal (ex.: "RJ-BOT-CO-01").                                                                        |
| `siteSpecification` | EntityRef  |     Sim     | Tipo de Site (TMF674 SiteSpec).                                                                                  |
| `parentSite`        | EntityRef  |     Não     | Site pai na hierarquia (Região para Sites, Site para Sub-Sites).                                                 |
| `status`            | enum       |     Sim     | Planned                                                                                                          | InConstruction | Active | InDeactivation | Retired. |
| `statusDate`        | datetime   |     Sim     | Data da última mudança de status.                                                                                |
| `place`             | EntityRef  |     Não     | Referência para GeographicLocation (TMF675). Recomendado para visualização em mapa.                              |
| `address`           | array      |     Não     | Referências a GeographicAddress (TMF673). Suporta múltiplos endereços com papel (principal, despacho, cobrança). |
| `relatedParty`      | array      |     Não     | Owners, operadores, Tenants relacionados.                                                                        |
| `relatedSite`       | array      |     Não     | Relações com outros Sites (alimentação, backhaul, FunctionalGroup membership).                                   |
| `characteristic`    | array      |     Não     | Valores dos specCharacteristics do tipo: CLLI, CN, Anel, SICOM_ID, Sitar etc.                                    |
| `description`       | string     |     Não     | Descrição livre.                                                                                                 |
| `validFor`          | TimePeriod |     Não     | Período de validade (data de ativação até desativação).                                                          |

### 11.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "site-rj-bot-co-01",
  "name": "Central Botafogo",
  "code": "RJ-BOT-CO-01",
  "siteSpecification": {
    "id": "spec-central-office",
    "@referredType": "GeographicSiteSpecification"
  },
  "parentSite": { "id": "site-region-rj-cidade", "@referredType": "GeographicSite" },
  "status": "Active",
  "statusDate": "2026-01-15T08:30:00Z",
  "place": { "id": "loc-018f...", "@referredType": "GeographicLocation" },
  "address": [
    {
      "address": { "id": "addr-018f...", "@referredType": "GeographicAddress" },
      "role": "principal"
    }
  ],
  "relatedParty": [
    { "party": { "id": "party-vtal", "@referredType": "Organization" }, "role": "owner" }
  ],
  "relatedSite": [
    {
      "site": { "id": "site-fg-pops-borda", "@referredType": "GeographicSite" },
      "role": "memberOf"
    }
  ],
  "characteristic": [
    { "name": "CLLI", "value": "RJBTFL01CO0" },
    { "name": "CN", "value": "RJ-SE-01" },
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

| ID         | Nome                                | Descrição                                                                                                                        |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Criar Site**                      | Criar GeographicSite com siteSpecification, name, status inicial (Planned), opcionalmente place, address, parentSite.            |
| **RF-002** | **Validação de tipo**               | Verificar que parentSite tem siteSpecification.allowedChildSpec contendo o tipo do filho.                                        |
| **RF-003** | **Atributos do specCharacteristic** | Validar characteristic do Site contra specCharacteristic do tipo: obrigatórios, validadores (regex, enum, range).                |
| **RF-004** | **Múltiplos endereços**             | Permitir associar N GeographicAddress com role distinto (principal, despacho, cobrança). Exatamente um pode ter role=principal.  |
| **RF-005** | **Vinculação a localização**        | Associar GeographicLocation via place; permitir geocodificação automática a partir do address principal.                         |
| **RF-006** | **Editar Site**                     | Editar todos os atributos com Audit Trail; campos calculados (CN) recomputados se base mudar.                                    |
| **RF-007** | **Excluir/Desativar**               | Bloquear exclusão de Site com Resources, Services ou Orders ativos; permitir transição para Retired via ciclo de vida (REQ-008). |
| **RF-008** | **Listar e filtrar**                | Filtros por: status, siteSpecification, parentSite (recursivo), siteType, characteristic, proximidade (via place), bounding box. |
| **RF-009** | **Contadores**                      | Expor por Site: contagem de Sub-Sites, Resources vinculados, Services ativos, Orders pendentes.                                  |
| **RF-010** | **Detalhamento (GET)**              | Expor representação completa do Site incluindo place expandido, address expandido e descendentes.                                |
| **RF-011** | **Importação em massa**             | Suportar importação em lote via CSV com validação completa (catálogo, contenção, atributos).                                     |
| **RF-012** | **Eventos**                         | Publicar TMF688 em cada criação, atualização e mudança de status (CreateEvent, AttributeValueChangeEvent, StateChangeEvent).     |

### 11.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **RN-001** | name é único globalmente para Sites com status != Retired.                                                  |
| **RN-002** | siteSpecification, name e status são obrigatórios na criação.                                               |
| **RN-003** | parentSite deve ter siteSpecification.allowedChildSpec compatível — se não compatível, criação é rejeitada. |
| **RN-004** | characteristics declaradas mandatory no specCharacteristic do tipo são obrigatórias na criação do Site.     |
| **RN-005** | characteristics com configurable=false (ex.: CN) são derivadas pelo sistema, não aceitam edição manual.     |
| **RN-006** | Site não pode ser excluído fisicamente quando tem Resources, Services ou Orders ativos; apenas Retired.     |
| **RN-007** | Site pode ter no máximo um endereço com role=principal.                                                     |
| **RN-008** | Toda criação, edição ou mudança de status gera evento TMF688 e Audit Trail.                                 |
| **RN-009** | statusDate é atualizado automaticamente a cada mudança de status, não aceita edição manual.                 |

### 11.8 Critérios de Aceite

| ID         | Critério                   | Resultado Esperado                                                                                                         |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Criação válida**         | POST de Site com siteSpec="CO", name único, characteristic [{name:"CLLI",value:"RJBTFL01CO0"}] retorna 201 com ID e href.  |
| **CA-002** | **Validação de contenção** | POST com parentSite incompatível (ex.: Andar como filho direto de Região) retorna 400 com mensagem explicando.             |
| **CA-003** | **Obrigatório de spec**    | POST sem CLLI em SiteSpec que o exige retorna 400 indicando o atributo faltante.                                           |
| **CA-004** | **Validador de spec**      | CLLI com 5 caracteres falha no validador regex e retorna 400.                                                              |
| **CA-005** | **Cálculo de CN**          | CN é preenchido automaticamente baseado em Região e Regional; PATCH manual em CN é rejeitado.                              |
| **CA-006** | **Múltiplos endereços**    | Criação com 2 endereços (principal + despacho) é aceita; tentativa de 2 principais retorna 400.                            |
| **CA-007** | **Filtros combinados**     | GET /geographicSite?status=Active&siteSpecification.id=spec-co&characteristic.Anel=AN-RJ-01 retorna apenas matches exatos. |
| **CA-008** | **Bloqueio de exclusão**   | DELETE em Site com Resources ativos retorna 409 com contagem de dependentes.                                               |
| **CA-009** | **Evento de criação**      | POST bem-sucedido publica TMF688 GeographicSiteCreateEvent no tópico geographic.site.v1.                                   |
| **CA-010** | **Importação em lote**     | POST /geographicSite/bulk com 1000 sites valida individualmente; retorna relatório com sucessos e falhas detalhadas.       |

### 11.9 Mapeamento contra sistemas de referência

| Capacidade                        | Netwin                                | Kuwaiba                          | NetBox              | Decisão Nexus                                   |
| --------------------------------- | ------------------------------------- | -------------------------------- | ------------------- | ----------------------------------------------- |
| **Modelagem Site**                | Site + Ponto Instalação (2 entidades) | Subclasse de GenericLocation     | Entidade Site       | **GeographicSite (entidade única tipada)**      |
| **Endereço**                      | Tabela embutida (múltiplos)           | Atributo texto                   | Campos texto        | **Referência a GeographicAddress (TMF673)**     |
| **Coordenadas**                   | Campos lat/long no Site               | Atributos lat/long               | Campos lat/long     | **Referência a GeographicLocation (TMF675)**    |
| **Campos V.tal (CLLI, CN, Anel)** | Campos hardcoded no formulário        | Atributos do metamodelo          | Custom Fields       | **characteristics conforme specCharacteristic** |
| **Contenção validada**            | Implícita no formulário polimórfico   | Containment Manager              | Hardcoded           | **allowedChildSpec validado em runtime**        |
| **Eventos de domínio**            | Não identificado no levantamento      | Não identificado no levantamento | Webhooks (limitado) | **TMF688 Create/Update/StateChange**            |

---

## 12. REQ-MOD01-007 — Sub-Sites (andares, salas, cages como GeographicSite)

> **Entidade TMF:** GeographicSite com category=SubSite (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — habilita rastreabilidade física de equipamentos  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 12.1 Descrição

Sub-Sites são subdivisões internas de Sites: andares, salas técnicas, cages, zonas. Permitem que equipamentos sejam posicionados com granularidade dentro de um Site. Conforme decisão arquitetural documentada na visão geral, Sub-Sites são modelados como GeographicSite com category="SubSite" no specSpecification, e não como entidade separada — preservando a unificação no TMF674. Esta abordagem é diferente do NetBox (que tem "Location" como entidade separada) e elimina a complexidade conceitual de manter dois tipos de entidade.

### 12.2 Racional arquitetural

A decisão de modelar Sub-Sites como mais um tipo de GeographicSite traz consistência ao módulo: as mesmas APIs (TMF674), mesmas regras (parentSite, allowedChildSpec, characteristics) e os mesmos eventos servem para Sites e Sub-Sites. Equipamentos posicionados em Sub-Sites usam o mesmo mecanismo (place = GeographicSite) sem precisar referenciar uma entidade Location separada. A profundidade típica esperada para V.tal: Central > Andar > Sala > Cage — 4 níveis de Sub-Site dentro de um Site, mas o modelo não impõe limite.

### 12.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite com category=SubSite (TMF674):

| Atributo TMF        | Tipo      | Obrigatório | Observação V.tal                                                                                                                       |
| ------------------- | --------- | :---------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| `siteSpecification` | EntityRef |     Sim     | Referência a SiteSpec com category="SubSite" (Floor, Room, Cage etc.).                                                                 |
| `parentSite`        | EntityRef |     Sim     | Para Sub-Sites, parentSite é obrigatório.                                                                                              |
| `characteristic`    | array     |     Não     | Atributos específicos: piso elevado, capacidade U total, classe de ambiente (TIA-942), restrição de acesso.                            |
| `place`             | EntityRef |     Não     | GeographicLocation própria (raro — usualmente Sub-Sites herdam place do pai). Útil para Cages com coordenadas precisas em DCs grandes. |

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

| ID         | Nome                                | Descrição                                                                                                   |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Criar Sub-Site**                  | Criar GeographicSite com siteSpec de category=SubSite, parentSite obrigatório, characteristics específicas. |
| **RF-002** | **Hierarquia em árvore**            | Suportar profundidade ilimitada de Sub-Sites: Site > Floor > Room > Cage > ...                              |
| **RF-003** | **Validação Site-coerente**         | Sub-Site deve ter sempre parentSite com mesmo Site raiz; mover Sub-Site entre Sites é restrito.             |
| **RF-004** | **Visualização hierárquica**        | Expor árvore de Sub-Sites de um Site via endpoint dedicado (GET /geographicSite/{id}/tree).                 |
| **RF-005** | **Capacidade física**               | Suportar characteristic de capacidade (m², U total, kVA) para planejamento.                                 |
| **RF-006** | **Restrição de Resource placement** | Validar (no módulo Resource Domain) que Resources colocados em Sub-Site têm tipo compatível.                |
| **RF-007** | **Eventos**                         | Publicar TMF688 a cada criação/alteração de Sub-Site.                                                       |

### 12.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Sub-Sites têm parentSite obrigatório — Sub-Site órfão é inválido.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **RN-002** | Mover Sub-Site para outro Site raiz é operação especial (com confirmação) e exige validação dos Resources nele contidos.                                                                                                                                                                                                                                                                                                                                                                 |
| **RN-003** | Sub-Site não pode ter status diferente do permitido pelo Site raiz (Sub-Site Active dentro de Site Retired é inválido).                                                                                                                                                                                                                                                                                                                                                                  |
| **RN-004** | Nome do Sub-Site é único dentro do mesmo parentSite.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **RN-005** | Excluir Sub-Site com Resources é bloqueado; permite-se transição para Retired.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **RN-006** | Toda alteração gera evento TMF688 e Audit Trail.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **RN-007** | Sub-Sites não figuram no mapa nem na árvore de navegação de Locais; são acessados pelo painel de detalhe do Site pai, na aba "Sub-locais". A mesma regra vale para o recurso `Splitter` (Módulo 2 — Resource): ele reaproveita a Location da caixa que o contém e some do mapa/árvore, listado no painel de detalhe do recurso pai como "Recursos internos". A árvore faz _pass-through_ sobre o Splitter — o que pende dele sobe um nível, para nada ficar inalcançável pela navegação. |

### 12.8 Critérios de Aceite

| ID         | Critério                  | Resultado Esperado                                                                          |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| **CA-001** | **Criação válida**        | POST de Sub-Site "Sala 301" com parentSite=Floor-3 e siteSpec=spec-room retorna 201.        |
| **CA-002** | **Parent obrigatório**    | POST de Sub-Site sem parentSite retorna 400 com mensagem específica.                        |
| **CA-003** | **Hierarquia respeitada** | POST de Cage com parentSite=Floor (sem Room intermediária) é rejeitado se spec não permite. |
| **CA-004** | **Árvore expandida**      | GET /geographicSite/{id}/tree retorna estrutura aninhada do Site com todos os Sub-Sites.    |
| **CA-005** | **Move entre Sites**      | PATCH com parentSite de outro Site retorna 409 (operação proibida no MVP).                  |
| **CA-006** | **Bloqueio de exclusão**  | DELETE em Sub-Site com Resources retorna 409 com lista de Resources.                        |

### 12.9 Mapeamento contra sistemas de referência

| Capacidade                | Netwin                           | Kuwaiba                              | NetBox                  | Decisão Nexus                                       |
| ------------------------- | -------------------------------- | ------------------------------------ | ----------------------- | --------------------------------------------------- |
| **Modelagem Sub-Site**    | Não identificado no levantamento | Subclasse Room/Building              | Entidade Location MPTT  | **GeographicSite com category=SubSite (unificado)** |
| **Hierarquia interna**    | Não identificado no levantamento | Sim (metamodelo)                     | Sim (MPTT por Site)     | **Sim (parentSite recursivo)**                      |
| **Atributos físicos**     | Não identificado no levantamento | Atributo metamodelo (hasRaisedFloor) | Custom Fields           | **characteristics (Area, Capacidade, etc.)**        |
| **Integridade cross-obj** | Não identificado no levantamento | Não identificado no levantamento     | Sim (validações Django) | **Sim (validado no módulo Resource)**               |

---

## 13. REQ-MOD01-008 — Ciclo de Vida do Site (status, transições e histórico)

> **Entidade TMF:** GeographicSite.status + StateChangeEvent (TMF674 + TMF688)  
> **Open API TMF:** TMF674 + TMF688 — Event Management  
> **Prioridade:** Alta  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 13.1 Descrição

O ciclo de vida de um Site descreve sua evolução do planejamento à desativação: Planned, InConstruction, Active, InDeactivation, Retired. Cada estado representa uma fase operacional com regras específicas: Sites Planned não recebem Services ativos; Sites Retired não recebem novos Resources; transições obedecem ordem topológica (não se pode ir direto de Planned para Retired). O Nexus implementa ciclo de vida com histórico completo de transições, ausente em todos os sistemas legados analisados.

### 13.2 Racional arquitetural

A ausência de histórico de transições nos sistemas analisados é uma limitação séria: o Netwin guarda apenas o estado atual (campo Estado ciclo de vida) com a data da última transição; o Kuwaiba e o NetBox não modelam ciclo de vida formal. O Nexus implementa histórico via eventos TMF688 (StateChangeEvent), o que naturalmente preserva a sequência completa sem necessidade de tabela dedicada. Cada mudança de status é um evento imutável publicado no Event Store. Esta abordagem é alinhada ao princípio de Event Sourcing parcial declarado na visão geral do produto.

### 13.3 Mapeamento de atributos TMF

Atributos canônicos da entidade GeographicSite.status + StateChangeEvent (TMF674 + TMF688):

| Atributo TMF       | Tipo      | Obrigatório | Observação V.tal                           |
| ------------------ | --------- | :---------: | ------------------------------------------ |
| `status`           | enum      |     Sim     | Planned                                    | InConstruction | Active | InDeactivation | Retired. |
| `statusDate`       | datetime  |     Sim     | Data/hora da última transição de status.   |
| `statusReason`     | string    |     Não     | Motivo da transição (texto livre ou enum). |
| `statusChangeUser` | EntityRef |     Não     | Usuário que realizou a transição.          |

### 13.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
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

| ID         | Nome                      | Descrição                                                                                                                |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **RF-001** | **Estados canônicos**     | Suportar 5 estados: Planned, InConstruction, Active, InDeactivation, Retired.                                            |
| **RF-002** | **Transições válidas**    | Configurar matriz de transições permitidas: Planned→InConstruction→Active→InDeactivation→Retired; saltos não permitidos. |
| **RF-003** | **Histórico via eventos** | Cada transição publica StateChangeEvent TMF688 com timestamp, usuário, status anterior e novo.                           |
| **RF-004** | **Consulta de histórico** | Endpoint GET /geographicSite/{id}/history retorna sequência cronológica de transições.                                   |
| **RF-005** | **Guard de transição**    | Bloquear transições inválidas (ex.: Planned → Retired) com mensagem clara.                                               |
| **RF-006** | **Restrição de Service**  | Bloquear ativação de Service em Sites com status != Active (validação no módulo Service Domain consultando este Site).   |
| **RF-007** | **Restrição de Resource** | Bloquear criação de novos Resources em Sites com status Retired (validação no módulo Resource Domain).                   |
| **RF-008** | **Aviso pré-desativação** | Ao iniciar transição para InDeactivation, listar Resources, Services e Orders ativos que serão impactados.               |
| **RF-009** | **Reativação**            | Permitir transição de Retired para Active apenas com aprovação especial (RBAC + Audit).                                  |

### 13.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Status inicial padrão na criação: Planned.                                                                                                                                                                                                                              |
| **RN-002** | Transições permitidas: Planned → InConstruction ou Retired (cancelamento); InConstruction → Active, Planned (rollback) ou Retired; Active → InDeactivation; InDeactivation → Retired ou Active (reverter); Retired → Active apenas com reativação especial e aprovação. |
| **RN-003** | Toda transição registra statusReason (recomendado) e statusChangeUser.                                                                                                                                                                                                  |
| **RN-004** | Eventos StateChangeEvent são imutáveis — nunca são deletados ou editados.                                                                                                                                                                                               |
| **RN-005** | Transição Retired→Active exige role Administrador Geographic + comentário obrigatório.                                                                                                                                                                                  |
| **RN-006** | Site em InDeactivation com Services ativos só pode ir para Retired quando os Services migrarem ou cancelarem.                                                                                                                                                           |

### 13.8 Critérios de Aceite

| ID         | Critério                  | Resultado Esperado                                                                                                 |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **CA-001** | **Transição válida**      | PATCH /geographicSite/{id} com status=Active a partir de InConstruction é aceito; status e statusDate atualizados. |
| **CA-002** | **Transição inválida**    | PATCH com status=Retired a partir de Planned retorna 400 com mensagem da regra violada.                            |
| **CA-003** | **Evento publicado**      | Toda transição válida publica StateChangeEvent TMF688 no tópico geographic.site.lifecycle.v1.                      |
| **CA-004** | **Histórico completo**    | GET /geographicSite/{id}/history retorna 200 com array de transições em ordem cronológica.                         |
| **CA-005** | **Aviso pré-desativação** | PATCH com status=InDeactivation em Site com Services retorna 200 mas inclui warnings com lista de Services.        |
| **CA-006** | **Bloqueio de Service**   | POST de Service em Site com status=Planned é bloqueado (validação cross-module).                                   |
| **CA-007** | **Reativação especial**   | PATCH Retired→Active sem role apropriado retorna 403; com role correto + statusReason é aceito.                    |

### 13.9 Mapeamento contra sistemas de referência

| Capacidade                   | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                 |
| ---------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | --------------------------------------------- |
| **Estados de ciclo de vida** | Estado ciclo de vida (texto)     | Não identificado no levantamento | Status com choices               | **5 estados canônicos (TMF + V.tal)**         |
| **Histórico de transições**  | Não identificado no levantamento | Audit Trail global               | Não identificado no levantamento | **Sim via TMF688 StateChangeEvent**           |
| **Matriz de transições**     | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Matriz configurável validada em runtime**   |
| **Guards cross-module**      | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim (Resource e Service consultam status)** |
| **Reativação controlada**    | Permitido livremente             | Não identificado no levantamento | Permitido livremente             | **Requer RBAC + Audit + statusReason**        |

---

## 14. REQ-MOD01-009 — Regras de Contenção e Hierarquia entre Sites

> **Entidade TMF:** allowedParentSpec / allowedChildSpec em SiteSpec (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — governança da hierarquia geográfica  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 14.1 Descrição

As regras de contenção definem quais tipos de Site podem ser pai/filho de quais — ex.: Floor só pode ser filho de CentralOffice, POP ou DataCenter; Room só pode ser filho de Floor; Cage só pode ser filho de Room. Estas regras são parte do catálogo (REQ-003) e são validadas em runtime na criação e edição de Sites. Diferentemente da abordagem implícita do Netwin e da abordagem hardcoded do NetBox, o Nexus expõe estas regras como configuração administrável, inspirado no Containment Manager do Kuwaiba.

### 14.2 Racional arquitetural

A escolha de tornar regras de contenção parte do catálogo (e não regras hardcoded em código) é uma decisão arquitetural deliberada que privilegia extensibilidade. Os benefícios concretos: (a) novos tipos de Site podem ser adicionados pela operação sem release; (b) regras podem ser flexibilizadas (não restringidas) em runtime conforme evolução do negócio; (c) formulários de criação adaptam-se dinamicamente consultando allowedChildSpec via API. A API de consulta (allowedChildren) é o que permite UIs reativas e formulários polimórficos sem código duplicado.

### 14.3 Mapeamento de atributos TMF

Atributos canônicos da entidade allowedParentSpec / allowedChildSpec em SiteSpec (TMF674):

| Atributo TMF        | Tipo             | Obrigatório | Observação V.tal                                                                    |
| ------------------- | ---------------- | :---------: | ----------------------------------------------------------------------------------- |
| `allowedParentSpec` | array<EntityRef> |     Não     | Em GeographicSiteSpecification: lista de SiteSpecs que podem ser pais deste tipo.   |
| `allowedChildSpec`  | array<EntityRef> |     Não     | Em GeographicSiteSpecification: lista de SiteSpecs que podem ser filhos deste tipo. |
| `containmentRule`   | array            |     Não     | Regras estendidas opcionais: cardinalidade (min/max), exclusividade.                |

### 14.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "id": "spec-floor",
  "name": "Floor",
  "code": "FLR",
  "category": "SubSite",
  "allowedParentSpec": [
    { "id": "spec-central-office", "@referredType": "GeographicSiteSpecification" },
    { "id": "spec-pop", "@referredType": "GeographicSiteSpecification" },
    { "id": "spec-data-center", "@referredType": "GeographicSiteSpecification" }
  ],
  "allowedChildSpec": [{ "id": "spec-room", "@referredType": "GeographicSiteSpecification" }],
  "containmentRule": [
    { "rule": "maxChildrenOfType", "params": { "childSpec": "spec-room", "max": 50 } }
  ]
}
```

### 14.5 Pré-condições

- O catálogo de SiteSpecifications (REQ-003) está populado.
- O usuário tem permissão de configuração de catálogo Geographic.

### 14.6 Requisitos Funcionais

| ID         | Nome                         | Descrição                                                                                                                                                                 |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Configurar contenção**     | Permitir definir allowedParentSpec e allowedChildSpec ao criar/editar SiteSpec.                                                                                           |
| **RF-002** | **Validação em runtime**     | Validar na criação/edição de Site que (a) Site tem siteSpec.allowedParentSpec contendo o tipo do pai, OU (b) parentSite.siteSpec.allowedChildSpec contém o tipo do filho. |
| **RF-003** | **API allowedChildren**      | Endpoint GET /geographicSiteSpecification/{id}/allowedChildren retorna SiteSpecs filhas permitidas para uso em formulários dinâmicos.                                     |
| **RF-004** | **Hierarquia base imutável** | Bootstrap define regras-base intocáveis: Region→Region (recursivo), Region→Site (CO, POP, Cabinet etc.), Site→SubSite.                                                    |
| **RF-005** | **Prevenção de ciclo**       | Impedir criação ou alteração de parentSite que cause ciclo na hierarquia.                                                                                                 |
| **RF-006** | **Análise de impacto**       | Antes de remover regra de contenção, calcular e exibir impacto (quantos Sites existentes violariam a nova regra).                                                         |
| **RF-007** | **Eventos de catálogo**      | Publicar TMF688 a cada alteração de regras de contenção.                                                                                                                  |

### 14.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| **RN-001** | Regras de contenção são parte da SiteSpecification — herdadas por todos os Sites do tipo.             |
| **RN-002** | Hierarquia base (Region recursiva, Site, SubSite) é protegida — alterações exigem aprovação especial. |
| **RN-003** | Não é permitido ciclo: um Site não pode ter como ancestral nenhum de seus descendentes.               |
| **RN-004** | Adição de novas regras (flexibilização) é livre; remoção (restrição) exige análise de impacto.        |
| **RN-005** | A API allowedChildren responde em < 200ms para uso interativo em formulários.                         |
| **RN-006** | Toda alteração de regra de contenção é registrada no Audit Trail e publica evento.                    |

### 14.8 Critérios de Aceite

| ID         | Critério                | Resultado Esperado                                                                                       |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Validação aplicada**  | POST de Floor com parentSite=Region (não permitido pelas regras) retorna 400 explicando a regra violada. |
| **CA-002** | **API allowedChildren** | GET /geographicSiteSpecification/spec-co/allowedChildren retorna [spec-floor, spec-room] com 200.        |
| **CA-003** | **Prevenção de ciclo**  | PATCH /geographicSite/{id} com parentSite causando ciclo retorna 400 com path detectado.                 |
| **CA-004** | **Impacto de remoção**  | DELETE de regra com impacto retorna 409 e exige confirmação via parâmetro forceWithImpact=true.          |
| **CA-005** | **Evento de catálogo**  | Alteração de allowedChildSpec publica evento no tópico geographic.siteSpec.containment.v1.               |

### 14.9 Mapeamento contra sistemas de referência

| Capacidade                | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                      |
| ------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | -------------------------------------------------- |
| **Catálogo de contenção** | Implícito no formulário          | Containment Manager (UI)         | Hardcoded no model Django        | **allowedParent/ChildSpec configuráveis (TMF674)** |
| **Validação em runtime**  | Implícita por tipo               | getPossibleChildren API          | Save validator                   | **Validação canônica na criação/edição**           |
| **Prevenção de ciclo**    | Não identificado no levantamento | Validado                         | Validado                         | **Validado via traversal de parentSite**           |
| **Análise de impacto**    | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim antes de remoção de regra**                  |

---

## 15. REQ-MOD01-010 — Relações Topológicas A↔Z entre Sites

> **Entidade TMF:** relatedSite[] em GeographicSite (TMF674)  
> **Open API TMF:** TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — fundação para análise de impacto e desativação segura  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 15.1 Descrição

As relações topológicas modelam dependências entre Sites: alimentação, backhaul, redundância, contenção física, roteamento preferencial. Diferentemente de parentSite (que é hierárquico estrito), relatedSite é um array N:N com role e relationshipType — permitindo grafo arbitrário de relações tipadas. Habilita análise de impacto ("desativar este Site afeta quais Sites?"), planejamento de redundância e visão topológica da rede V.tal.

### 15.2 Racional arquitetural

O Netwin é o mais maduro nesta capacidade — sua aba "Relações" cobre exatamente este caso de uso. O Kuwaiba modela relações especiais entre objetos físicos (endpoint, container, mirror) mas não generaliza para Sites. O NetBox depende indiretamente de Circuit Terminations para topologia entre Sites. O TMF674 oferece o atributo relatedSite com role e relationshipType — modelo limpo e canônico. O Nexus implementa o catálogo de tipos de relação como entidade própria (RelationshipType) com suporte a relação inversa automática (ex.: "feeds" ↔ "fedBy"), o que evita duplicação manual e mantém consistência.

### 15.3 Mapeamento de atributos TMF

Atributos canônicos da entidade relatedSite[] em GeographicSite (TMF674):

| Atributo TMF                        | Tipo                    | Obrigatório | Observação V.tal                                                                                      |
| ----------------------------------- | ----------------------- | :---------: | ----------------------------------------------------------------------------------------------------- |
| `relatedSite`                       | array<SiteRelationship> |     Não     | Lista de relações deste Site com outros.                                                              |
| `SiteRelationship.site`             | EntityRef               |     Sim     | Site relacionado (polo Z).                                                                            |
| `SiteRelationship.role`             | enum                    |     Sim     | Papel deste Site na relação: source                                                                   | target | peer | memberOf. |
| `SiteRelationship.relationshipType` | string                  |     Sim     | Tipo da relação (vem do catálogo de RelationshipType): feeds, isFedBy, peersWith, contains, memberOf. |
| `SiteRelationship.description`      | string                  |     Não     | Descrição livre da relação específica.                                                                |
| `SiteRelationship.validFor`         | TimePeriod              |     Não     | Período de validade (relações podem ter início/fim datados).                                          |

### 15.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
{
  "relationshipTypes": [
    { "code": "feeds", "inverse": "isFedBy", "symmetric": false },
    { "code": "isFedBy", "inverse": "feeds", "symmetric": false },
    { "code": "peersWith", "inverse": "peersWith", "symmetric": true },
    { "code": "memberOf", "inverse": "contains", "symmetric": false }
  ],
  "geographicSite": {
    "id": "site-rj-cabinet-001",
    "name": "Armario AR-RJ-001",
    "relatedSite": [
      {
        "site": { "id": "site-rj-bot-co-01", "@referredType": "GeographicSite" },
        "role": "target",
        "relationshipType": "isFedBy",
        "description": "Alimentacao GPON via cabo CB-001",
        "validFor": { "startDateTime": "2025-03-10T00:00:00Z" }
      }
    ]
  }
}
```

### 15.5 Pré-condições

- Os Sites A e Z já existem.
- O catálogo de RelationshipType está configurado (com pares inversos definidos).
- O usuário tem permissão de escrita no módulo Geographic.

### 15.6 Requisitos Funcionais

| ID         | Nome                             | Descrição                                                                                                    |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **RF-001** | **Criar relação A→Z**            | Adicionar entrada em relatedSite[] do Site A apontando para Site Z com role e relationshipType.              |
| **RF-002** | **Catálogo de RelationshipType** | Manter catálogo configurável de tipos: feeds, isFedBy (inverso), peersWith (simétrico), memberOf, isPartOf.  |
| **RF-003** | **Relação inversa automática**   | Ao criar A→Z com tipo que tem inverso definido, criar automaticamente Z→A com tipo inverso.                  |
| **RF-004** | **Editar relação**               | Permitir editar relationshipType, role, description, validFor de uma relação existente.                      |
| **RF-005** | **Excluir relação**              | Excluir relação remove ambos os sentidos (A→Z e Z→A); preservar histórico via validFor.endDateTime.          |
| **RF-006** | **Listar relações de um Site**   | GET /geographicSite/{id}/relatedSite retorna todas as relações (entrada e saída).                            |
| **RF-007** | **Análise de impacto**           | Endpoint GET /geographicSite/{id}/impact retorna Sites dependentes (que recebem feeds, backhaul deste Site). |
| **RF-008** | **Visualização em grafo**        | Expor endpoint /graph com nós (Sites) e arestas (relações) para renderização de grafo topológico.            |
| **RF-009** | **Validação no ciclo de vida**   | Ao iniciar desativação de Site, listar Sites dependentes (acionado por REQ-008 RF-008).                      |
| **RF-010** | **Eventos**                      | Publicar TMF688 a cada criação, alteração ou remoção de relação.                                             |

### 15.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **RN-001** | Não é permitida autorrelação — Site não pode ter relatedSite apontando para si mesmo.                              |
| **RN-002** | relationshipType é obrigatório e deve existir no catálogo de RelationshipType.                                     |
| **RN-003** | Para tipos com inverso definido, a relação Z→A é criada automaticamente ao criar A→Z (mantida coerente).           |
| **RN-004** | Múltiplas relações entre o mesmo par de Sites são permitidas desde que tipos sejam distintos.                      |
| **RN-005** | Excluir Site cascateia a exclusão lógica de todas as suas relações (validFor.endDateTime preenchido).              |
| **RN-006** | Análise de impacto é não-transitiva por padrão — segue apenas um salto, com opção depth=N para travessia profunda. |
| **RN-007** | Toda alteração de relação gera evento TMF688 e Audit Trail.                                                        |

### 15.8 Critérios de Aceite

| ID         | Critério                 | Resultado Esperado                                                                                                                |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Criação de relação**   | POST /geographicSite/{idA}/relatedSite com {site:idZ, role:source, relationshipType:feeds} cria relação e a inversa em Z (fedBy). |
| **CA-002** | **Autorrelação**         | POST com site=idA (mesmo ID) retorna 400.                                                                                         |
| **CA-003** | **Tipo inexistente**     | POST com relationshipType="xyz" não cadastrado retorna 400.                                                                       |
| **CA-004** | **Edição**               | PATCH em relação existente atualiza ambos os sentidos consistentemente.                                                           |
| **CA-005** | **Análise de impacto**   | GET /geographicSite/{id}/impact retorna lista de Sites dependentes com tipo de dependência.                                       |
| **CA-006** | **Visão de grafo**       | GET /geographicSite/graph?center={id}&depth=2 retorna subgrafo até 2 saltos.                                                      |
| **CA-007** | **Aviso de desativação** | PATCH status=InDeactivation em Site com dependentes retorna warning com lista de dependentes.                                     |
| **CA-008** | **Evento publicado**     | Cada criação/alteração publica evento no tópico geographic.site.relationship.v1.                                                  |

### 15.9 Mapeamento contra sistemas de referência

| Capacidade                       | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                        |
| -------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | ---------------------------------------------------- |
| **Modelagem de relação A↔Z**     | Aba Relações (tabela)            | Relações especiais entre objetos | Via Circuit Terminations         | **relatedSite array (TMF674)**                       |
| **Catálogo de tipos de relação** | Dropdown fixo no formulário      | Não identificado no levantamento | Não identificado no levantamento | **RelationshipType configurável com pares inversos** |
| **Relação inversa automática**   | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim — criada automaticamente**                     |
| **Análise de impacto**           | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Endpoint /impact com depth configurável**          |
| **Visão em grafo**               | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Endpoint /graph com subgrafo**                     |

---

## 16. REQ-MOD01-011 — Visão de Mapa Georreferenciado

> **Entidade TMF:** Não é entidade TMF — funcionalidade de UI sobre TMF674+675  
> **Open API TMF:** TMF674 + TMF675 (consultas geoespaciais)  
> **Prioridade:** Alta — diferenciação operacional  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.20 — draft

### 16.1 Descrição

A visão de mapa exibe Sites e (em fases futuras) Resources georreferenciados em camada cartográfica interativa. Habilita filtros visuais por tipo, status, hierarquia e proximidade; suporta sincronização bidirecional (mover marcador atualiza place do Site, e vice-versa); integra com a base cartográfica V.tal existente (Geosite OSP). Funcionalidade transversal que materializa o valor das entidades TMF673/674/675 para o usuário operacional.

### 16.2 Racional arquitetural

O syncGeoPosition do Kuwaiba é a melhor implementação observada — mover um nó no mapa atualiza coordenadas no inventário de forma transacional. Esta capacidade é reaproveitada no Nexus, com a diferença de que a sincronização atualiza a GeographicLocation referenciada pelo Site (não atributos embutidos), preservando o modelo TMF675. A integração com o Geosite OSP existente da V.tal (que já tem base cartográfica e camadas pré-configuradas) elimina a necessidade de reconstruir essa infraestrutura.

### 16.3 Mapeamento de atributos TMF

| Atributo                           | Tipo      |    Obrigatório    | Observação V.tal                                                            |
| ---------------------------------- | --------- | :---------------: | --------------------------------------------------------------------------- |
| `GeographicSite.place`             | EntityRef | Sim para exibição | Referência a GeographicLocation; a geometria nunca é embutida no Site.      |
| `GeographicLocation.geometry`      | GeoJSON   |        Sim        | Point para Sites; Resources na mesma viewport também podem usar LineString. |
| `GeographicSite.status`            | enum      |        Sim        | Determina status visual e filtros do mapa.                                  |
| `GeographicSite.siteSpecification` | EntityRef |        Sim        | Determina classe, ícone e filtros operacionais.                             |

### 16.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
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

| ID         | Nome                                           | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Exibição de Sites em mapa**                  | Renderizar Sites com place válido em camada cartográfica; marcadores diferenciados por tipo e status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **RF-002** | **Filtros visuais**                            | Filtrar Sites no mapa por: status, siteSpecification, Região (parentSite recursivo), siteType, characteristic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **RF-003** | **Bounding box dinâmico**                      | Carregar apenas Sites visíveis na viewport atual do mapa para performance em alta densidade.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **RF-004** | **Camadas por escala (cobertura em zoom-out)** | Em vez de agrupar marcadores em clusters numerados, o mapa troca de representação por escala: em detalhe (≤ 20 m) exibe a planta individual em tamanho cheio; em 50 m a planta aparece reduzida junto da camada de cobertura GPON por bairro (REQ-MOD01-014); de 50 m para cima só a cobertura aparece, com grade de calor fina (≤ 500 m), grade grossa (≤ 10 km) e polígonos de bairro (> 10 km). As Estações encolhem entre 5 e 50 km e somem acima de 50 km. "Planta individual" inclui, desde REQ-MOD01-016, qualquer `GeographicSite` que não seja CO/Estação (POP, CDO, Ponto de Instalação…) — só o CO tem visibilidade garantida em qualquer escala; os demais seguem a mesma régua de um Recurso. Desde a Fase 2 do issue #53, `GeoTreeService.roots()` (fonte da Hierarquia — UF → Município → Estações) só traz `GeographicSite` de código `CO` ou `POP`, não mais qualquer Site raiz de `category = 'Site'`: no alvo declarado de 4MM sites (majoritariamente Customer Site/HP-HC de atendimento), listar/agregar isso na árvore de navegação nunca escalaria. Cabinet, Installation Point, Customer Site e Condominium saem da Hierarquia mas seguem visíveis no mapa (`sitesInViewport`, que continua com `category = 'Site'`) e na busca (`search`, idem).                                                                                                                                                                                                                          |
| **RF-005** | **Detalhamento por clique**                    | Clique no marcador exibe popup com name, type, status, code, atributos principais e link para detalhamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **RF-006** | **Sincronização bidirecional**                 | Permitir mover marcador no mapa para atualizar coordenadas; alterações em formulário refletem em tempo real no mapa. Criação e edição de vértices de LineString/Polygon são tratadas em REQ-MOD01-013.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **RF-007** | **Camadas de visualização**                    | Suportar camadas configuráveis: hierarquia geográfica (limites de Regiões), Sites por tipo, relações topológicas como linhas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **RF-008** | **Busca por proximidade**                      | Tool de medição: clicar em ponto para listar Sites dentro de raio configurável.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **RF-009** | **Exportação**                                 | Exportar visão atual como imagem (PNG) ou dados (GeoJSON).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **RF-010** | **Integração Geosite OSP**                     | Reaproveitar base cartográfica e camadas pré-existentes do Geosite OSP da V.tal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **RF-011** | **Controle de camadas do mapa**                | Realiza o RF-007 com um controle flutuante no canto superior direito do mapa (aberto/fechado, no mesmo cromo dos demais controles — MUB, GPS), agrupado em Locais (Estações · Pontos e sub-locais), Cobertura GPON e Recursos (Caixas e equipamentos · Cabos e dutos). Desligar uma camada corta a **requisição**, não só o desenho: `GET /v1/geo/tree/viewport` ganha `include` (lista de `sites`\|`resource-points`\|`resource-lines`) e `GET /v1/geo/coverage` deixa de ser chamado com a camada de Cobertura desligada. Estações são exceção — vêm sempre de `roots()` (a Hierarquia já as usa); desligar a camada afeta só o desenho. A escolha persiste em `localStorage` (client-side, sem entidade TMF nem endpoint) e o item aberto no painel de detalhe permanece visível mesmo com a camada dele desligada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **RF-012** | **Seleção de base cartográfica (MUB)**         | Controle flutuante no canto inferior esquerdo com quatro opções de base: **Mapa** (roadmap, POI comercial e ícones de POI ocultos), **Satélite** (hybrid), **Branco** (roadmap com `styles` que zeram vias, água, POI e limite de lote, mantendo apenas os rótulos de município/bairro em cinza tênue para orientação — existe para as manchas de Cobertura GPON, REQ-MOD01-014, e de Projeto, REQ-MOD01-017, lerem sem competir com a cor do basemap) e **Geonet** (item visível com selo "em breve", ainda sem fonte de tiles — não selecionável). Com duas opções selecionáveis o controle troca direto num clique; com três ou mais (caso atual), abre uma lista de cartões. Duplo clique no botão pula direto para o próximo MUB selecionável (ordem do catálogo, com wrap-around e pulando o Geonet), sem precisar abrir a lista. A escolha não persiste entre sessões — ao contrário do RF-011, não há entidade nem `localStorage` envolvidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **RF-013** | **Filtro de escopo da busca**                  | A barra de pesquisa (RF-005/histórico) ganha um ícone de filtro — só o ícone, sem rótulo, para não competir com o campo de texto — que abre uma lista flutuante com 6 modos: **Pesquisa geral** (default, Locais + Recursos do inventário + Endereço lado a lado, comportamento de sempre), **Apenas Endereço** (só Google Places, inventário não é consultado), **Apenas Infraestrutura** (Postes, Dutos, Caixas Subterrâneas e Torres — mesmo vocabulário do grupo "Infraestrutura Civil" do RF-011), **Apenas Locais** (só Estações), **Apenas CTOs** e **Apenas Cabos** (Backbone, Distribuição, Drop, Fibra). O modo ativo troca o ícone exibido na barra e destaca o **fundo do próprio botão de filtro** (não a barra inteira — a área de texto permanece branca) em amarelo-claro (`app-accent-soft`), sinalizando que a busca está restrita. O filtro é aplicado no servidor: `GET /v1/geo/tree/search` ganha os parâmetros opcionais `kinds` (`site`\|`resource`, CSV) e `types` (códigos de `ResourceType`, CSV), consumidos por `GeoTreeService.search` antes do `LIMIT` da busca — filtrar depois devolveria lista vazia na maioria das buscas restritas. Os recentes (histórico com o campo vazio) também são filtrados pelo escopo ativo. A escolha persiste em `localStorage` (mesmo padrão do RF-011) e retoma na próxima sessão. O dropdown de resultados/histórico fecha em `Escape` ou clique em qualquer ponto fora da barra (antes, só `Escape` com o campo focado fechava). |

### 16.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Sites sem place válido não aparecem no mapa e são detectados pela regra "Site sem place" do motor de integridade (REQ-MOD02-027), não por um relatório próprio do mapa. |
| **RN-002** | A sincronização bidirecional atualiza a GeographicLocation referenciada pelo Site, não atributos do Site diretamente.                                                   |
| **RN-003** | Movimentação de Site no mapa exige confirmação se o Site tem status=Active (mudança de coordenadas de Site ativo é evento crítico).                                     |
| **RN-004** | A viewport é limitada à área de operação V.tal (Brasil + ajustes futuros); pan além desses limites é restrito.                                                          |
| **RN-005** | Clusters de marcadores agrupam Sites por proximidade e mostram contagem; clique no cluster faz zoom para ver individuais.                                               |
| **RN-006** | Toda movimentação de Site via mapa gera Audit Trail e evento TMF688 AttributeValueChangeEvent sobre place.                                                              |

### 16.8 Critérios de Aceite

| ID         | Critério                      | Resultado Esperado                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Renderização**              | GET /map/sites?bbox=... retorna FeatureCollection GeoJSON com Sites na bounding box.                                                                                                                                                                                                                                                                                                                                |
| **CA-002** | **Filtros**                   | Aplicar filtro siteSpec=CO e status=Active reduz marcadores apenas a Centrais ativas.                                                                                                                                                                                                                                                                                                                               |
| **CA-003** | **Cluster**                   | Em zoom out abaixo de 8, marcadores próximos são agrupados em clusters numerados.                                                                                                                                                                                                                                                                                                                                   |
| **CA-004** | **Sincronização**             | Mover marcador no mapa dispara PATCH em GeographicLocation com novas coordenadas e atualiza Site em tempo real.                                                                                                                                                                                                                                                                                                     |
| **CA-005** | **Confirmação para Active**   | Mover Site com status=Active exige modal de confirmação com motivo da mudança.                                                                                                                                                                                                                                                                                                                                      |
| **CA-006** | **Busca por proximidade**     | Clique em ponto + raio 500m lista Sites dentro do raio com distância ao ponto.                                                                                                                                                                                                                                                                                                                                      |
| **CA-007** | **Exportação GeoJSON**        | Export da viewport gera arquivo com Sites visíveis em formato FeatureCollection.                                                                                                                                                                                                                                                                                                                                    |
| **CA-008** | **Controle de camadas**       | Desligar o grupo Recursos faz `GET /v1/geo/tree/viewport` sair sem `resource-points`/`resource-lines` em `include` (ou não ser chamado, com Locais também desligado); desligar Cobertura GPON não dispara `GET /v1/geo/coverage`. Religar uma camada refaz a busca sem exigir pan/zoom do mapa.                                                                                                                     |
| **CA-013** | **Filtro de escopo da busca** | Escolher "Apenas CTOs" e digitar um termo faz `GET /v1/geo/tree/search` sair com `kinds=resource&types=CTO`; o resultado não traz Estação nem Cabo. Escolher "Apenas Endereço" não dispara `fetchTreeSearch` nenhuma; os demais modos restritos a Recurso não disparam `fetchAddressPredictions`. Recarregar a página com um modo não-geral ativo mantém o mesmo modo selecionado (persistência em `localStorage`). |

### 16.9 Mapeamento contra sistemas de referência

| Capacidade                             | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                                              |
| -------------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| **Visão de mapa nativa**               | Sim (Geosite OSP)                | Sim (OSP Module)                 | Não identificado no levantamento | **Sim (reaproveita Geosite OSP)**                                          |
| **Sincronização bidirecional**         | Não identificado no levantamento | Sim (syncGeoPosition)            | Não identificado no levantamento | **Sim (atualiza GeographicLocation)**                                      |
| **Filtros visuais**                    | Filtros básicos                  | Filtros básicos                  | Não identificado no levantamento | **Filtros combinados completos**                                           |
| **Clusterização**                      | Não identificado no levantamento | Limitada                         | Não identificado no levantamento | **Sim (configurável por zoom)**                                            |
| **Busca por proximidade no mapa**      | Sim                              | Sim                              | Não identificado no levantamento | **Sim**                                                                    |
| **Controle de camadas ligar/desligar** | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim (Locais/Cobertura/Recursos, corta fetch, persiste em localStorage)** |

---

## 17. REQ-MOD01-012 — Eventos de Domínio do Módulo Geographic

> **Entidade TMF:** Event (TMF688) — vários tipos  
> **Open API TMF:** TMF688 — Event Management API  
> **Prioridade:** Alta — pré-requisito do módulo Analytics & Events  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.2 — draft

### 17.1 Descrição

Toda mudança de estado relevante em entidades do módulo Geographic (Location, Address, SiteSpec, Site, SubSite, relações) gera evento canônico TMF688 publicado em barramento de mensageria (Kafka). Estes eventos alimentam: Data Lake corporativo V.tal, sistemas downstream que precisam reagir (faturamento, OSS de provisionamento), e auditoria assíncrona. Este requisito formaliza o catálogo de eventos publicados pelo módulo Geographic.

### 17.2 Racional arquitetural

A publicação de eventos canônicos TMF688 é um dos pilares arquiteturais do Nexus (visão geral seção 9). Sem ela, o Nexus seria um sistema de cadastro isolado. O TMF688 define os tipos canônicos de evento: CreateEvent, AttributeValueChangeEvent, StateChangeEvent, DeleteEvent. Cada módulo declara seu catálogo de eventos publicados, e este requisito é o catálogo específico do módulo Geographic. A publicação deve ser transacional com a operação de escrita (outbox pattern) para garantir consistência entre estado persistido e eventos publicados.

### 17.3 Mapeamento de atributos TMF

Atributos canônicos da entidade Event (TMF688) — vários tipos:

| Atributo TMF    | Tipo     | Obrigatório | Observação V.tal                                                                       |
| --------------- | -------- | :---------: | -------------------------------------------------------------------------------------- |
| `eventId`       | string   |     Sim     | UUID v7 único do evento.                                                               |
| `eventType`     | string   |     Sim     | Nome canônico do tipo de evento (ex.: GeographicSiteCreateEvent).                      |
| `eventTime`     | datetime |     Sim     | Timestamp ISO 8601 com timezone.                                                       |
| `source`        | string   |     Sim     | URL da entidade que gerou o evento.                                                    |
| `correlationId` | string   |     Não     | ID para correlação com a transação originadora.                                        |
| `event`         | object   |     Sim     | Payload específico do tipo de evento (referência à entidade, estados envolvidos etc.). |

### 17.4 Exemplo de payload

Exemplo ilustrativo da representação JSON da entidade conforme o contrato TMF:

```json
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

| ID         | Nome                        | Descrição                                                                                                                                                 |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Publicação transacional** | Toda escrita em entidade do módulo publica evento correspondente no mesmo commit (outbox pattern).                                                        |
| **RF-002** | **Catálogo de eventos**     | Manter catálogo formal dos eventos publicados pelo módulo (lista abaixo).                                                                                 |
| **RF-003** | **Tópicos canônicos**       | Publicar em tópicos versionados: geographic.site.v1, geographic.site.lifecycle.v1, geographic.location.v1, geographic.address.v1, geographic.siteSpec.v1. |
| **RF-004** | **Schema Registry**         | Schemas dos eventos publicados em Avro/JSON Schema no Schema Registry V.tal.                                                                              |
| **RF-005** | **Retry e dead letter**     | Falha de publicação aciona retry exponencial; após N tentativas, evento vai para dead letter topic para análise.                                          |
| **RF-006** | **Idempotência**            | Eventos têm eventId único; consumidores podem deduplicar por eventId.                                                                                     |
| **RF-007** | **Correlation tracking**    | Eventos carregam correlationId quando originados de OS ou request rastreável.                                                                             |
| **RF-008** | **Catálogo público**        | Endpoint /events/catalog expõe lista de eventos publicados pelo módulo com schema e exemplos.                                                             |

### 17.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Eventos são imutáveis após publicação — nunca são editados, apenas compensados por eventos subsequentes.        |
| **RN-002** | Publicação é parte da transação de escrita (outbox pattern) — sucesso da escrita implica sucesso da publicação. |
| **RN-003** | Falha de publicação no commit aciona rollback da escrita.                                                       |
| **RN-004** | Schemas de evento são versionados; mudanças breaking exigem nova versão de tópico.                              |
| **RN-005** | Retention dos tópicos: 30 dias quente (Kafka), arquivado em Data Lake para análise histórica.                   |
| **RN-006** | Eventos não contêm dados sensíveis em texto claro — apenas referências por ID.                                  |

### 17.8 Critérios de Aceite

| ID         | Critério                 | Resultado Esperado                                                                                |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| **CA-001** | **Publicação no commit** | Criação de Site bem-sucedida publica GeographicSiteCreateEvent no tópico geographic.site.v1.      |
| **CA-002** | **Outbox pattern**       | Falha de publicação na transação reverte a escrita do Site (testado com Kafka indisponível).      |
| **CA-003** | **Schema válido**        | Eventos publicados validam contra schema registrado; mensagens inválidas vão para dead letter.    |
| **CA-004** | **Idempotência**         | Reprocessamento de mesmo evento pelo consumidor não causa efeito colateral (eventId deduplicado). |
| **CA-005** | **Catálogo público**     | GET /events/catalog retorna 200 com lista de tipos de evento, schemas e exemplos.                 |

### 17.9 Mapeamento contra sistemas de referência

| Capacidade                          | Netwin                           | Kuwaiba                          | NetBox                           | Decisão Nexus                                |
| ----------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- | -------------------------------------------- |
| **Publicação de eventos canônicos** | Não identificado no levantamento | Não identificado no levantamento | Webhooks (limitado)              | **TMF688 nativo em todas as operações**      |
| **Outbox pattern**                  | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim — consistência transacional**          |
| **Schema Registry**                 | Não identificado no levantamento | Não identificado no levantamento | Não identificado no levantamento | **Sim — Avro/JSON Schema versionado**        |
| **Tópicos versionados**             | Não identificado no levantamento | Não identificado no levantamento | Endpoints únicos                 | **Tópicos por entidade com versão (v1, v2)** |

---

## 18. REQ-MOD01-013 — Digitalização e edição de geometria no navegador

> **Entidade TMF:** GeographicLocation (TMF675)  
> **Open API TMF:** TMF675 — Geographic Location Management API  
> **Prioridade:** Alta — remove a dependência de cliente desktop na operação de campo  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.3 — draft

### 18.1 Descrição

O módulo Geographic provê a ferramenta de **desenho e edição de geometria dentro do navegador**: traçar uma linha de duto, corrigir o trajeto de um cabo, ajustar o polígono de uma área de cobertura, reposicionar um ponto. A edição incide sempre sobre a `GeographicLocation` referenciada pela entidade — Site (REQ-MOD01-006) ou Resource de OSP (REQ-MOD02-008, REQ-MOD02-010, REQ-MOD02-026) — e nunca sobre atributos embutidos na entidade que a referencia.

Este requisito é a contraparte de edição do REQ-MOD01-011: o mapa exibe e reposiciona marcadores; aqui a geometria é criada e alterada vértice a vértice, incluindo LineString e Polygon.

### 18.2 Racional arquitetural

A consulta operacional registrada em `inspirations/geosite-legado.md` documenta um caso concreto: uma demanda em Minas Gerais parou porque desenhar uma linha de duto não estava disponível no cliente web do Geosite-Legado e o cliente desktop exigia instalação e licença. A fronteira web/desktop não caiu sobre um recurso acessório — caiu sobre digitalização de geometria, que é operação corriqueira de planta externa.

Daí o princípio §4.8: nenhum fluxo de cadastro pode depender de software instalado por estação. A consequência de modelagem é que a edição de geometria precisa ser um **contrato de API sobre TMF675**, não um recurso de uma ferramenta específica: a mesma operação é executável pela interface web, por integração ou por carga em massa (REQ-MOD01-002, REQ-MOD02-028).

O Kuwaiba oferece o `syncGeoPosition` (mover um nó atualiza a coordenada de forma transacional) — reaproveitado no REQ-MOD01-011 para Point. Este requisito estende o mesmo princípio transacional para geometrias de mais de um vértice, onde a operação relevante deixa de ser "mover" e passa a ser "traçar, dividir, emendar e corrigir".

### 18.3 Mapeamento de atributos TMF

| Atributo                          | Tipo       | Obrigatório | Observação V.tal                                                                                          |
| --------------------------------- | ---------- | :---------: | --------------------------------------------------------------------------------------------------------- |
| `GeographicLocation.geometry`     | GeoJSON    |     Sim     | Point, LineString ou Polygon. Alvo único da edição.                                                       |
| `GeographicLocation.geometryType` | enum       |     Sim     | Não pode mudar de tipo em edição — mudar de LineString para Polygon exige nova Location.                  |
| `GeographicLocation.accuracy`     | string     |     Não     | Passa a `desenho-manual` quando os vértices vêm do editor, distinguindo de coordenada levantada em campo. |
| `GeographicLocation.spatialRef`   | string     |     Sim     | Sempre WGS84 (EPSG:4326); conversão de outros sistemas é responsabilidade do import.                      |
| `GeographicLocation.validFor`     | TimePeriod |     Não     | Encerramento da geometria anterior quando a edição é versionada.                                          |

### 18.4 Exemplo de payload

```json
[
  {
    "id": "loc-linestring-mg-duto-0042",
    "@type": "GeographicLocation",
    "geometryType": "LineString",
    "spatialRef": "EPSG:4326",
    "accuracy": "desenho-manual",
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [-43.9412, -19.9218],
        [-43.9407, -19.9221],
        [-43.9399, -19.9226],
        [-43.9391, -19.923]
      ]
    },
    "validFor": { "startDateTime": "2026-08-01T14:20:00Z" }
  },
  {
    "editSession": {
      "targetLocation": "loc-linestring-mg-duto-0042",
      "snappedTo": [
        { "id": "res-caixa-mg-bh-0117", "@referredType": "Resource", "vertexIndex": 0 },
        { "id": "res-caixa-mg-bh-0118", "@referredType": "Resource", "vertexIndex": 3 }
      ],
      "reason": "cadastro de duto novo — projeto BH-2026-114",
      "draft": false
    }
  }
]
```

### 18.5 Pré-condições

- O usuário possui permissão de edição geoespacial sobre o tipo de entidade alvo (RBAC do Módulo 8).
- A `GeographicLocation` alvo existe (REQ-MOD01-001) ou está sendo criada no mesmo fluxo.
- A base cartográfica está disponível para referência visual (REQ-MOD01-011).

### 18.6 Requisitos Funcionais

| ID         | Nome                            | Descrição                                                                                                   |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Desenhar geometria**          | Criar Point, LineString e Polygon no mapa, vértice a vértice, gerando a GeographicLocation correspondente.  |
| **RF-002** | **Editar vértices**             | Inserir, mover e remover vértices de geometria existente, preservando o `id` da Location.                   |
| **RF-003** | **Snap a feições existentes**   | Ancorar vértice em Site, poste, caixa ou vértice de outra geometria, com tolerância configurável em metros. |
| **RF-004** | **Split e merge de LineString** | Dividir uma linha em duas Locations num vértice escolhido e emendar duas linhas contíguas em uma.           |
| **RF-005** | **Medição durante o traçado**   | Exibir comprimento acumulado e por segmento enquanto o usuário desenha.                                     |
| **RF-006** | **Undo / redo**                 | Desfazer e refazer operações dentro da sessão de edição antes de salvar.                                    |
| **RF-007** | **Rascunho**                    | Salvar a geometria como rascunho não publicado, retomável depois, sem afetar a Location vigente.            |
| **RF-008** | **Import de geometria**         | Colar ou importar GeoJSON e WKT, com validação e relatório por feição.                                      |
| **RF-009** | **Motivo e histórico**          | Registrar motivo da alteração e preservar a geometria anterior consultável.                                 |
| **RF-010** | **Edição sem instalação**       | Todo o fluxo executa em navegador padrão, sem plugin, applet, cliente desktop ou licença por estação.       |

### 18.7 Regras de Negócio

| ID         | Regra de Negócio                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | Geometria inválida é rejeitada no save: LineString com menos de 2 vértices, Polygon não fechado, auto-interseção e coordenada fora dos limites de operação. |
| **RN-002** | A edição altera a `GeographicLocation`; a entidade que a referencia (Site ou Resource) não tem geometria própria.                                           |
| **RN-003** | Editar geometria de entidade com status `Active` exige motivo declarado e publica `AttributeValueChangeEvent` (TMF688).                                     |
| **RN-004** | Toda edição registra ator, timestamp, geometria anterior e motivo — Audit Trail obrigatório, sem exceção para carga em massa.                               |
| **RN-005** | O tipo de geometria é imutável na edição; converter Point em LineString exige criar nova Location e reapontar a referência.                                 |
| **RN-006** | Rascunho não participa de consultas operacionais, mapa público nem cálculo de trajeto até ser publicado.                                                    |
| **RN-007** | Import assume WGS84; arquivo em outro sistema de referência é rejeitado com mensagem explícita, nunca reprojetado silenciosamente.                          |
| **RN-008** | Snap não move a feição ancorada — apenas copia sua coordenada para o vértice em edição.                                                                     |

### 18.8 Critérios de Aceite

| ID         | Critério                     | Resultado Esperado                                                                                                                                               |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | **Traçar linha de duto**     | Desenhar LineString de 6 vértices com snap em duas caixas subterrâneas, salvar e reabrir devolve os mesmos vértices — usando apenas o navegador, sem instalação. |
| **CA-002** | **Geometria inválida**       | Salvar LineString com auto-interseção retorna 422 com o índice do segmento problemático.                                                                         |
| **CA-003** | **Split**                    | Dividir uma linha de 800 m em um vértice gera duas Locations cuja soma de comprimento equivale à original.                                                       |
| **CA-004** | **Edição de entidade ativa** | Editar geometria de Site `Active` sem motivo retorna 400; com motivo, publica AttributeValueChangeEvent.                                                         |
| **CA-005** | **Rascunho**                 | Geometria salva como rascunho não aparece no mapa operacional e é retomável na sessão seguinte.                                                                  |
| **CA-006** | **Import GeoJSON**           | Import de arquivo com 50 feições devolve relatório por item, aceitando as válidas e listando as rejeitadas com o motivo.                                         |
| **CA-007** | **Histórico**                | Após duas edições, a consulta de histórico devolve as duas geometrias anteriores com ator, motivo e timestamp.                                                   |

### 18.9 Mapeamento contra sistemas de referência

| Capacidade                           | Netwin                                 | Kuwaiba                          | NetBox                           | Decisão Nexus                                             |
| ------------------------------------ | -------------------------------------- | -------------------------------- | -------------------------------- | --------------------------------------------------------- |
| **Digitalização de geometria**       | Sim, via GISMaps (Outside Plant / OSP) | Sim, no módulo OSP               | Não identificado no levantamento | **Editor nativo web sobre TMF675, sem cliente instalado** |
| **Edição de vértices de LineString** | Sim (traçado de rede exterior)         | Não identificado no levantamento | Não identificado no levantamento | **Sim, com split, merge e undo/redo**                     |
| **Snap a feições existentes**        | Não identificado no levantamento       | Não identificado no levantamento | Não identificado no levantamento | **Sim, tolerância configurável em metros**                |
| **Sincronização mapa ↔ inventário**  | Não identificado no levantamento       | Sim (`syncGeoPosition`)          | Não identificado no levantamento | **Sim, transacional sobre GeographicLocation**            |
| **Rascunho antes de publicar**       | Estado de projeto no cadastro          | Não identificado no levantamento | Não identificado no levantamento | **Sim, invisível à operação até publicar**                |
| **Import GeoJSON/WKT**               | Data Manager (importação)              | Não identificado no levantamento | Sim, via API/scripts             | **Sim, com relatório por feição e SRID fixo**             |

---

## 19. REQ-MOD01-014 — Cobertura GPON por bairro (mapa de calor)

> **Entidade TMF:** GeographicLocation (TMF675) — polígono de cobertura; não cria entidade nova  
> **Open API TMF:** TMF675 — consulta geoespacial de áreas de cobertura  
> **Prioridade:** Média — leitura operacional agregada da planta  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.23 — draft

### 19.1 Descrição

Acima da escala de detalhe, o mapa (REQ-MOD01-011) deixa de desenhar recurso a recurso e passa a mostrar a **cobertura GPON**: uma camada térmica por bairro que responde a "onde há planta óptica disponível?" em qualquer escala acima de 100 m. Cada CDO (caixa de distribuição óptica, cadastrada como PhysicalResource `CTO` cujo nome começa em "CDO") cobre um raio de 200 m lineares; a consolidação desses perímetros forma o polígono de cobertura de cada bairro. O contorno do polígono é suavizado por corner-cutting (Chaikin) tanto na geração quanto no traçado do canvas, para a silhueta ler como mancha fluida em vez da escada da grade. A cor mede **disponibilidade** — verde onde predominam CDOs ativas, vermelho onde predominam bloqueadas — e a intensidade mede **densidade** de CDOs. Substitui os antigos clusters numerados (bolas azuis), que poluíam a visão de cidade/estado sem informar nada sobre a rede.

### 19.2 Racional arquitetural

A cobertura é uma **área geográfica**, não um serviço nem um recurso: é a projeção espacial de "até onde a planta alcança". Por isso o polígono do bairro é uma `GeographicLocation` (TMF675, `geometryType: Polygon`) — o mesmo caso de uso já previsto no REQ-MOD01-001 ("zona de cobertura, polígono de uma cidade"). Não é `Service` (C4: cobertura não é Home Connected) nem `Resource` (C3-a: serviço/área referencia recurso, não o contém). A geometria é **derivada** da posição das CDOs: um artefato regenerável, não um cadastro manual — mora ao lado do inventário, alimentado por um job de recomputação (`scripts/build-gpon-coverage.mjs`).

O campo de calor fino (grade de 50 m em Web Mercator, EPSG:3857) fica numa **projeção de leitura** própria (`geo_gpon_coverage_cell`), agregável por zoom (50 m → 250 m → polígono de bairro) sem inflar a tabela de Locations nem exigir interseção de polígono em tempo de consulta. As estatísticas de cada bairro (contagem real de CDOs, disponibilidade, área coberta) viajam como `characteristic` tipada no grupo `_coverage` (C1 — extensão V.tal via característica, nunca campo hardcoded).

### 19.3 Mapeamento de atributos TMF

| Atributo                                     | Tipo    | Obrigatório | Observação V.tal                                                                                                                            |
| -------------------------------------------- | ------- | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GeographicLocation.geometryType`            | enum    |     Sim     | `Polygon` — anel externo do bairro + buracos.                                                                                               |
| `GeographicLocation.geometry`                | GeoJSON |     Sim     | Polígono do componente conexo da cobertura do bairro (RFC 7946).                                                                            |
| `GeographicLocation.referencePoint`          | string  |     Não     | Token de escopo `GPON:<uf>\|<city>\|<bairro>` — idempotência da regeneração.                                                                |
| `characteristic._coverage.neighborhood`      | string  |     Sim     | Nome do bairro (rótulo do balão).                                                                                                           |
| `characteristic._coverage.cdoTotal`          | integer |     Sim     | Contagem **real** de CDOs do bairro (não a soma de células).                                                                                |
| `characteristic._coverage.cdoAvailable`      | integer |     Sim     | CDOs ativas (disponíveis).                                                                                                                  |
| `characteristic._coverage.availabilityRatio` | decimal |     Sim     | `cdoAvailable / cdoTotal`, base da cor.                                                                                                     |
| `characteristic._coverage.coveredAreaKm2`    | decimal |     Não     | Área coberta pelo bairro, em km².                                                                                                           |
| `characteristic._coverage.radiusMeters`      | integer |     Não     | Raio de cobertura por CDO (200 m).                                                                                                          |
| `characteristic._coverage.smoothIterations`  | integer |     Não     | Iterações de corner-cutting (Chaikin) aplicadas ao contorno; 0 = escada crua.                                                               |
| `characteristic._coverage.minComponentCells` | integer |     Não     | Piso de células (grade fina) abaixo do qual um componente conexo não vira polígono — descarta fragmentos de fronteira entre bairros densos. |

### 19.4 Exemplo de payload

Exemplo ilustrativo do polígono de cobertura de um bairro conforme o contrato TMF675:

```json
{
  "id": "loc-018f9c21-7a10-7b3e-9c44-2f7a1b9e0c31",
  "href": "/tmf-api/geographicLocationManagement/v4/geographicLocation/loc-018f9c21",
  "geometryType": "Polygon",
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [-43.1101, -22.9075],
        [-43.1004, -22.9075],
        [-43.1004, -22.9012],
        [-43.1101, -22.9012],
        [-43.1101, -22.9075]
      ]
    ]
  },
  "spatialRef": "EPSG:4326",
  "referencePoint": "GPON:RJ|Niteroi|Icarai",
  "characteristic": [
    { "group": "_coverage", "name": "kind", "value": "GponCoverage", "valueType": "string" },
    { "group": "_coverage", "name": "neighborhood", "value": "Icarai", "valueType": "string" },
    { "group": "_coverage", "name": "city", "value": "Niteroi", "valueType": "string" },
    { "group": "_coverage", "name": "uf", "value": "RJ", "valueType": "string" },
    { "group": "_coverage", "name": "cdoTotal", "value": 1904, "valueType": "integer" },
    { "group": "_coverage", "name": "cdoAvailable", "value": 1421, "valueType": "integer" },
    { "group": "_coverage", "name": "availabilityRatio", "value": 0.7464, "valueType": "decimal" },
    { "group": "_coverage", "name": "coveredAreaKm2", "value": 3.67, "valueType": "decimal" },
    { "group": "_coverage", "name": "radiusMeters", "value": 200, "valueType": "integer" },
    { "group": "_coverage", "name": "smoothIterations", "value": 2, "valueType": "integer" },
    { "group": "_coverage", "name": "minComponentCells", "value": 6, "valueType": "integer" }
  ]
}
```

### 19.5 Pré-condições

- As CDOs do município estão inventariadas como PhysicalResource `CTO` com `place` referenciando uma `GeographicLocation` do tipo Point (REQ-MOD01-001, REQ-MOD02-008).
- O endereço de cada CDO (REQ-MOD01-002) traz `locality` (bairro); na ausência, a CDO entra em "Sem bairro".
- A base cartográfica do mapa (REQ-MOD01-011) está disponível para sobrepor a camada de calor.

### 19.6 Requisitos Funcionais

| ID         | Nome                             | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Consolidação por raio**        | Consolidar o disco de 200 m de cada CDO numa grade de 50 m e, por bairro, no polígono de cobertura (componente conexo).                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **RF-002** | **Cor por disponibilidade**      | Colorir a mancha de vermelho (indisponível) a verde (disponível) pela razão `cdoAvailable/cdoTotal`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **RF-003** | **Intensidade por densidade**    | Modular o alfa da célula pela densidade de CDOs, sem tapar o mapa base.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **RF-004** | **Camadas por zoom**             | Servir grade fina (≤ 500 m), grade grossa de 250 m (≤ 10 km) e polígonos de bairro (> 10 km), por bbox.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **RF-005** | **Balão de hover**               | Ao passar o cursor sobre a mancha, exibir bairro, município, total de CDOs, disponíveis/indisponíveis, % de disponibilidade e área coberta.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **RF-006** | **Regeneração por escopo**       | Recomputar a cobertura de um município substituindo a geração anterior daquele escopo, de forma idempotente.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **RF-007** | **Takeup (evolução)**            | Reservar `portsTotal`/`portsUsed` por bairro para, no futuro, exibir portas ocupadas sobre o total.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **RF-008** | **Suavização do contorno**       | Arredondar os cantos do polígono (corner-cutting/Chaikin) na geração e no traçado do canvas, para a silhueta ler como mancha fluida em vez da escada da grade.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **RF-009** | **Descarte de fragmento**        | Não gerar polígono para um componente conexo menor que `minComponentCells` — sobra de fronteira entre bairros densos que o algoritmo do bairro dominante (RN-001/RF-001) deixa para o bairro perdedor, sem valor visual próprio.                                                                                                                                                                                                                                                                                                                                      |
| **RF-010** | **Consulta inversa por recurso** | `GET /v1/geo/coverage/by-resource/{id}` resolve o `place` do Resource (via `GeoTreeService`, que já hidrata geometria para os três tipos de `place`) e devolve a célula fina e as áreas (`neighborhood`/`city`/`uf`) que contêm aquele ponto — o inverso da consulta por bbox de viewport (RF-004); 404 se o recurso não tiver geometria de ponto. A aba **Cobertura** do painel de Resource consome a consulta sob demanda para todo Resource de geometria `Point`, mostrando célula, disponibilidade e áreas, sem reclassificar cobertura como Resource ou Service. |

### 19.7 Regras de Negócio

| ID         | Nome                            | Descrição                                                                                                                                                                                         |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | **Só CDO gera cobertura**       | Apenas PhysicalResource `CTO` com nome iniciado em "CDO" entra; CEO/CEOS (caixas de emenda) ficam de fora.                                                                                        |
| **RN-002** | **Disponível = ativo**          | `status = active` conta como disponível; `suspended`/Bloqueada como indisponível; `terminated` não entra (C6).                                                                                    |
| **RN-003** | **Cobertura não é Service**     | A área de cobertura é `GeographicLocation` (TMF675); nunca `CustomerFacingService` (C4) nem `Resource` (C3-a).                                                                                    |
| **RN-004** | **Estatística é contagem real** | Os números do balão vêm da contagem real de CDOs do bairro, não da soma de células (que multiplica de propósito no campo de densidade); o descarte de fragmento (RF-009) não afeta essa contagem. |
| **RN-005** | **Artefato regenerável**        | O polígono e a grade são derivados: a regeneração por escopo pode apagá-los fisicamente e recriá-los — exceção consciente a C6, restrita a artefato de leitura.                                   |

### 19.8 Critérios de Aceite

| ID         | Critério                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | Rodar o job para um município produz um polígono por bairro (componente conexo) e a grade fina correspondente, com a contagem de CDOs conferindo com o inventário.                                |
| **CA-002** | De 50 m para cima o mapa mostra a mancha térmica e nenhum cluster numerado aparece em escala alguma.                                                                                              |
| **CA-003** | A cor de um bairro majoritariamente bloqueado tende ao vermelho; a de um majoritariamente ativo, ao verde.                                                                                        |
| **CA-004** | O hover sobre a mancha abre o balão com bairro, município e os números de CDOs/disponibilidade.                                                                                                   |
| **CA-005** | Entre 5 e 50 km as Estações aparecem como pontos pequenos; acima de 50 km somem, restando só a cobertura.                                                                                         |
| **CA-006** | Regenerar o mesmo município duas vezes não duplica polígonos nem células (idempotência por escopo).                                                                                               |
| **CA-007** | Numa área com bairros densos e adjacentes, nenhum polígono minúsculo (fragmento de fronteira sem CDO próprio visível) aparece isolado no mapa; a estatística do bairro perdedor continua correta. |

### 19.9 Mapeamento contra sistemas de referência

| Capacidade                               | Netwin                                        | Kuwaiba                                            | NetBox                                                    | Decisão Nexus                                                                         |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Mapa de calor de densidade de planta** | Consulta de planta por região na visão de OSP | Geometrias de área no metamodelo, sem calor pronto | Trabalha em prefixos/sites IP, sem camada óptica dedicada | **Grade de 50 m consolidando o raio de 200 m das CDOs**                               |
| **Polígono de cobertura por área**       | Áreas de atendimento no cadastro de OSP       | Modelagem de áreas via geometrias                  | Não identificado no levantamento                          | **Polígono de bairro (TMF675) por componente conexo, com corner-cutting no contorno** |
| **Disponibilidade colorida por status**  | Legenda de status na planta exterior          | Estado do nó no metamodelo                         | Status de dispositivo/site                                | **Rampa vermelho→verde por razão de CDOs ativas**                                     |
| **Agregação por zoom**                   | Níveis de detalhe na visão de OSP             | Não identificado no levantamento                   | Não identificado no levantamento                          | **Fino (50 m) → grosso (250 m) → polígono de bairro**                                 |
| **Takeup de portas por área**            | Ocupação por caixa no cadastro                | Portas modeladas no metamodelo                     | Portas/interfaces por dispositivo                         | **Reservado (`portsTotal`/`portsUsed`) para evolução**                                |

---

## 20. REQ-MOD01-015 — Projetos de Trabalho (coleções de locais fora da Hierarquia)

> **Entidade TMF:** GeographicSite (TMF674) — reaproveitado sem alteração; `geo_project`/`geo_project_site` são projeção de plataforma, não TMF  
> **Open API TMF:** TMF674 — o local do projeto nasce pelo mesmo contrato de Site (REQ-MOD01-006)  
> **Prioridade:** Média — ferramenta de trabalho de campo/planejamento, fora do caminho crítico de provisionamento  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.17 — draft

### 20.1 Descrição

A página Locais ganha uma segunda aba na doca de navegação, ao lado da Hierarquia: **Projetos**, no espírito do painel "Salvos" do Google Maps. Um Projeto é uma coleção nomeada — com ícone e descrição — de locais criados exclusivamente para aquele recorte de trabalho (um levantamento de campo, uma proposta de expansão, um estudo de viabilidade em lote). Diferente de um Site cadastrado pela Hierarquia, um local de Projeto nasce **invisível** na árvore de navegação, na busca e no mapa geral: só aparece com o Projeto que o contém aberto na doca. Título e descrição do Projeto são editados inline — perder o foco do campo já salva, sem botão dedicado. Excluir o Projeto ou um de seus locais não apaga nada fisicamente (C6): encerra (`Retired`) os Sites vinculados e remove só o vínculo de plataforma. A visão em Combos, redundante com a árvore, é removida nesta mesma revisão.

### 20.2 Racional arquitetural

Um Projeto **não é uma entidade TMF**. É uma projeção de plataforma — como o histórico de busca (REQ-MOD01-011) e a grade de cobertura GPON (REQ-MOD01-014) — que vive em tabelas próprias (`geo_project`, `geo_project_site`), fala com o banco direto e nunca passa pelo `IGeoRepository` nem pelo contrato TMF674. O que ele contém, porém, **é** TMF puro: cada local de um Projeto é um `GeographicSite` (TMF674) real, criado pelo mesmo caso de uso de cadastro guiado por endereço que qualquer outro Site (REQ-MOD01-006) — a diferença é só a linha de vínculo em `geo_project_site` e um predicado de exclusão (`NOT EXISTS` sobre esse vínculo) nas consultas que alimentam a Hierarquia e a busca (REQ-MOD01-011). Não existe um segundo modelo de dado para "local provisório": o mesmo Site que hoje vive escondido num Projeto pode, a qualquer momento, virar Site de produção — basta que o vínculo em `geo_project_site` deixe de existir. Hoje isso só acontece por exclusão (que soft-termina o Site); uma promoção explícita para o inventário sem terminar o Site é extensão futura (ver §27).

Escopo do Projeto é o **tenant** (C8), não o usuário: qualquer pessoa autorizada no tenant vê e edita os mesmos Projetos — é um caderno de equipe, não uma lista pessoal.

### 20.3 Mapeamento de atributos TMF

| Atributo                                 | Tipo   | Obrigatório | Observação V.tal                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------ | :---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GeographicSite.*`                       | —      |      —      | Sem alteração de forma alguma no contrato TMF674 (REQ-MOD01-006) — o local de projeto é um Site comum.                                                                                                                                                          |
| `geo_project.name`                       | string |     Sim     | Nome do projeto; default `"Projeto sem título"` na criação. Não é atributo TMF — coluna de plataforma.                                                                                                                                                          |
| `geo_project.description`                | string |     Não     | Descrição livre, editada inline.                                                                                                                                                                                                                                |
| `geo_project.iconDataUrl`                | string |     Não     | Ícone carregado pelo usuário, reduzido no navegador para ~128×128 antes do envio.                                                                                                                                                                               |
| `geo_project.tenantId`                   | string |     Sim     | Escopo do Projeto (C8) — sem `userId`: visível a todo o tenant.                                                                                                                                                                                                 |
| `geo_project.status`                     | string |     Sim     | `planned \| active \| suspended \| terminated` (vocabulário de `GeoStatus`). Unidade de estado do projeto — mudar aqui cascateia (best-effort) para o status de cada `GeographicSite` vinculado, via `GeoService.transitionSite`. Default `planned` na criação. |
| `geo_project_site.projectId` / `.siteId` | string |     Sim     | Vínculo N:N entre o Projeto e o `GeographicSite` que ele contém; `position` ordena a lista exibida.                                                                                                                                                             |
| `geo_project_site.note`                  | string |     Não     | Observação de trabalho do local, editada inline na aba Visão geral. Não é `characteristic` (C1) — anotação de plataforma, como o restante desta tabela; não acompanha o Site se ele for promovido ao inventário fora do projeto.                                |
| `geo_project_site.geonetAddressId`       | string |     Sim     | Id do endereço no GEONET que originou o local — a base de endereçamento canônica da V.tal. Todo local de projeto nasce amarrado a um candidato GEONET real, escolhido por busca ou por um ponto no mapa reconsultado no GEONET.                                 |

### 20.4 Exemplo de payload

Não há um novo `@type` TMF: a criação de um local de projeto devolve exatamente o payload de `GeographicSite` do REQ-MOD01-006, pela mesma forma de `POST /v1/geo/workspace/site-at-address`. O que muda é a projeção de plataforma que descreve o Projeto em si:

```json
{
  "id": "prj-018f9c40-2b11-7c9a-8e21-3a5f0d7c1122",
  "tenantId": "vtal-rj",
  "name": "Expansão Icaraí — levantamento",
  "description": "Pontos candidatos a CDO para o projeto de adensamento do Q3.",
  "iconDataUrl": "data:image/webp;base64,UklGRi4A...",
  "createdBy": "niraldo.junior@vtal.com.br",
  "siteCount": 12,
  "createdAt": "2026-08-10T13:04:00Z",
  "updatedAt": "2026-08-14T09:22:11Z"
}
```

### 20.5 Pré-condições

- O catálogo de `GeographicSiteSpecification` (REQ-MOD01-003) já tem ao menos um tipo de categoria `Site` publicado — é o que o formulário de local do projeto oferece no seletor de tipo.
- O cadastro guiado por endereço (REQ-MOD01-006, `POST /v1/geo/workspace/site-at-address`) está disponível — é o caso de uso que o Projeto reaproveita para criar cada local.
- A Hierarquia (REQ-MOD01-011) já filtra por `status NOT IN ('Retired', 'terminated')` — o predicado de exclusão de projeto se soma a esse filtro, não o substitui.

### 20.6 Requisitos Funcionais

| ID         | Nome                                                   | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Duas abas na doca**                                  | A doca de Locais mostra Hierarquia e Projetos como abas irmãs; a visão em Combos é removida (a árvore passa a ser o único modo de navegação hierárquica).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **RF-002** | **Criar e abrir**                                      | "+ Novo Projeto" cria o registro (nome default) e abre direto o painel de detalhe dele.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **RF-003** | **Título e descrição inline**                          | Título e descrição são editados no próprio painel; perder o foco do campo grava via `PATCH`, sem botão de salvar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **RF-004** | **Ícone carregável**                                   | Clicar no ícone do projeto abre o seletor de arquivo do sistema operacional; a imagem é reduzida no navegador antes do envio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **RF-005** | **Lista de locais com scroll próprio**                 | O painel do projeto lista os locais vinculados em área com rolagem independente do cabeçalho (título/descrição); "Adicionar Local" é a primeira linha da lista.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **RF-006** | **Local exclusivo do projeto**                         | Um local criado por "Adicionar Local" vira `GeographicSite`, fica fora da árvore/busca/mapa geral e só aparece com o projeto aberto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **RF-007** | **Endereço obrigatoriamente GEONET**                   | O formulário de novo local só aceita um endereço com ID real do GEONET — por busca (autocomplete GEONET) ou por um ponto escolhido no mapa, cujo endereço reverso (Google) é reconsultado no GEONET para o usuário confirmar um candidato. Sem candidato GEONET escolhido, não há como salvar.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **RF-008** | **Enquadramento automático**                           | Ao abrir um projeto, o mapa voa para enquadrar todos os seus locais (um único ponto: aproxima nele; dois ou mais: enquadra o retângulo que os contém).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **RF-009** | **Exclusão em cascata soft, em massa**                 | Excluir o projeto (menu ⋯) ou um local dele encerra (`Retired`) cada `GeographicSite` envolvido antes de apagar o vínculo de plataforma — nunca o contrário, para nenhum local ficar órfão e visível sem querer. A operação roda em conjunto (`GeoService.transitionProjectSites`), não num laço por local — um projeto com dezenas de milhares de locais (ex.: carga em massa) responde em segundos, não trava a requisição (issue #58). Havendo local com dependência ativa (filho/relacionamento/recurso/serviço/ordem), ele fica de fora e o projeto (com todos os vínculos) é **mantido** — nunca apagado pela metade; o retorno traz quantos locais foram encerrados e quantos ficaram bloqueados. |
| **RF-010** | **Status do projeto herdado em cascata, até terminar** | Uma combo de status ao lado da descrição do projeto substitui a edição de status por local **enquanto o projeto está em curso**; mudar o status tenta transicionar (best-effort) cada `GeographicSite` vinculado para o mesmo status — quem não pode seguir (`SITE_STATUS_TRANSITIONS`) fica para trás e o painel avisa quantos. Mudar para **Terminado** é a exceção: cascateia para `Active` (não para o `Retired` que a tradução direta de status daria), liberando os locais com vida própria; a combo então some do painel do projeto (RN-009) — o Site passa a ter seu próprio controle de Status no painel unificado de Local (REQ-MOD01-016).                                                    |
| **RF-011** | **Janela de consulta do local, lado a lado**           | Clicar num local da lista abre, ao lado do painel do projeto (não o substitui), o mesmo painel unificado de Local do REQ-MOD01-016 — estilo Salvos → Listas do Google Maps. No mobile as duas telas se substituem, como antes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **RF-012** | **Clique no pin abre a mesma janela**                  | Clicar no pin de um local do Projeto no mapa abre a mesma janela de consulta do RF-011 (lado a lado com o painel do projeto), independentemente de o local estar na página carregada do painel — cobre também o pin buscado por bbox quando o projeto tem manchas geradas (REQ-MOD01-017 RF-004/RF-007).                                                                                                                                                                                                                                                                                                                                                                                                 |

### 20.7 Regras de Negócio

| ID         | Nome                                                                      | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | **Projeto não é TMF**                                                     | `geo_project`/`geo_project_site` são tabelas de plataforma; nenhuma API `/tmf-api/*` as expõe — só `/v1/geo/projects/*`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **RN-002** | **Local de projeto é Site real**                                          | Todo local criado num projeto é um `GeographicSite` (TMF674) válido, sujeito às mesmas regras de status, contenção e auditoria de qualquer Site (REQ-MOD01-006, -008, -009).                                                                                                                                                                                                                                                                                                                                                |
| **RN-003** | **Visibilidade condicionada ao vínculo, e ao projeto estar em curso**     | Um Site some da Hierarquia/busca/mapa geral enquanto (e só enquanto) existir a linha correspondente em `geo_project_site` **e** o projeto dono ainda não tiver terminado — a exclusão é dirigida pelo dado (`p.status <> 'terminated'`), não por uma flag na entidade. O vínculo em si não é apagado quando o projeto termina (RN-009); só deixa de esconder o Site.                                                                                                                                                        |
| **RN-004** | **Escopo de tenant, não de usuário**                                      | Projetos são visíveis e editáveis por qualquer ator autorizado do tenant (C8); não há isolamento por usuário.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **RN-005** | **Soft-terminate sempre precede o desvínculo; bloqueio mantém o projeto** | Nenhuma rota de exclusão remove a linha de `geo_project_site` antes de confirmar a transição do Site para `Retired` (C6). Diferente de uma falha isolada (que abortava tudo antes desta revisão), um local com dependência ativa é reportado e simplesmente **fica de fora** — os demais são encerrados normalmente e o projeto só é apagado quando nenhum local ficou bloqueado; `DELETE /v1/geo/projects/:id` responde 200 com `{ deleted, retired, skipped, blocked, blockedSiteIds? }` em vez do antigo 204 silencioso. |
| **RN-006** | **Reposicionar fica fora do escopo**                                      | Editar nome/tipo/observação de um local de projeto já criado é suportado; mover o ponto no mapa é REQ-MOD01-013 e não é tratado por este requisito.                                                                                                                                                                                                                                                                                                                                                                         |
| **RN-007** | **Status do local é derivado do projeto, enquanto ele está em curso**     | `POST /v1/geo/projects/:id/sites` ignora qualquer `status` enviado pelo cliente e usa o status atual do projeto; enquanto o projeto não termina, não existe rota para editar o status de um local isoladamente — só a cascata do PATCH de projeto (RF-010) o move, respeitando `SITE_STATUS_TRANSITIONS` (nenhuma regra canônica de transição é reaberta ou contornada). Terminado o projeto, o Site ganha controle de status independente no painel unificado de Local (REQ-MOD01-016).                                    |
| **RN-008** | **Local sem ID Geonet não é criado**                                      | `POST /v1/geo/projects/:id/sites` responde 400 (`GEO_PROJECT_SITE_GEONET_ADDRESS_REQUIRED`) sem um `geonetAddressId` no corpo — não existe local de projeto sem endereço GEONET de origem.                                                                                                                                                                                                                                                                                                                                  |
| **RN-009** | **Terminar libera os locais; projeto terminado é imutável**               | `PATCH /v1/geo/projects/:id` para `status: 'terminated'` cascateia cada `GeographicSite` vinculado para `Active` (não `Retired`) — o local passa a ter vida própria, e o projeto de origem vira informação histórica (Origem, REQ-MOD01-016), sem apagar o vínculo em `geo_project_site`. Qualquer tentativa posterior de mudar o status de um projeto já terminado responde 409 `GEO_PROJECT_TERMINATED_IMMUTABLE`.                                                                                                        |
| **RN-010** | **Evento-resumo em vez de um evento por local**                           | A exclusão/cascata em massa (RF-009/RF-010) grava **um** evento `GeographicSiteBulkStatusChangeEvent` (TMF688) e **uma** linha de auditoria por operação — não um evento por `GeographicSite` — mesmo trade-off já aceito pelos scripts de carga em massa (`scripts/sites_carregar.mjs`), inevitável na escala de dezenas de milhares de locais. Cada Site ainda ganha sua própria linha em `tmf_geographic_site_status_history`.                                                                                           |

### 20.8 Critérios de Aceite

| ID         | Critério                                                                                                           | Resultado Esperado                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | Criar um projeto e adicionar um local por endereço                                                                 | O local aparece na lista do projeto e como pin no mapa; a árvore da Hierarquia e a busca não o encontram.                                                                                    |
| **CA-002** | Editar o título do projeto e clicar fora do campo                                                                  | O nome persiste (recarregar a página mantém o valor) sem qualquer clique em botão de salvar.                                                                                                 |
| **CA-003** | Carregar um ícone grande (vários MB)                                                                               | O ícone aparece reduzido no painel e na lista; o `PATCH` enviado ao servidor tem poucos KB, não o arquivo original.                                                                          |
| **CA-004** | Excluir um local do projeto                                                                                        | O local some da lista e do mapa; consultar o Site por `GET /v1/geo/sites/:id` mostra `status: Retired`.                                                                                      |
| **CA-005** | Excluir o projeto inteiro pelo menu ⋯                                                                              | Todos os locais vinculados ficam `Retired`; o projeto some da lista de Projetos. Um projeto com dezenas de milhares de locais (carga em massa) responde em segundos, não trava a requisição. |
| **CA-011** | Excluir um projeto com um local em dependência ativa (ex.: relacionamento)                                         | O local livre fica `Retired`, o local bloqueado permanece como estava; o projeto e todos os vínculos continuam existindo (não é apagado pela metade); a resposta traz `blocked: 1`.          |
| **CA-006** | Abrir um projeto com 3+ locais espalhados                                                                          | A câmera enquadra todos os pins sem exigir zoom manual.                                                                                                                                      |
| **CA-007** | Mudar o status do projeto de Planejado para Ativo                                                                  | Todos os `GeographicSite` vinculados passam a `Active`; se algum não puder (dependência bloqueante), o painel avisa quantos locais ficaram para trás, sem abortar os demais.                 |
| **CA-008** | Tentar criar um local sem escolher um candidato GEONET                                                             | "Criar local" permanece desabilitado; a chamada `POST` correspondente, se forçada, responde 400 `GEO_PROJECT_SITE_GEONET_ADDRESS_REQUIRED`.                                                  |
| **CA-009** | Mudar o status do projeto para Terminado                                                                           | Todos os `GeographicSite` vinculados passam a `Active` (não `Retired`); a combo de status some do painel do projeto; os locais voltam a aparecer na Hierarquia/busca/mapa geral.             |
| **CA-010** | Tentar mudar o status de um projeto já Terminado                                                                   | A chamada `PATCH` responde 409 `GEO_PROJECT_TERMINATED_IMMUTABLE`; a combo de status não é mais oferecida na UI.                                                                             |
| **CA-012** | Abrir um projeto com manchas geradas, aproximar até ≤ 50 m e clicar num pin fora da página de 200 locais do painel | O painel de Local abre ao lado do painel do projeto (RF-012); a doca não volta para a Hierarquia.                                                                                            |

### 20.9 Mapeamento contra sistemas de referência

| Capacidade                                                                              | Netwin                                                                                                                                                                                                                       | Kuwaiba                                                                                                                                   | NetBox                            | Decisão Nexus                                                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agrupador nomeado associável a locais**                                               | Sim — módulo "Projetos" (OSP/Utilitários do NOSSIS, evolução do Netwin): lista Nome/Criado por, `+ adicionar`, campo "Projeto" opcional no formulário de Site/Ponto de Instalação, e um "projeto ativo" de escopo de sessão. | Aproximação em **Pools** — criação e organização de pools customizados de objetos; não descrito como agrupador de locais especificamente. | Não identificado no levantamento. | Projeto (REQ-MOD01-015), compartilhado por tenant (C8), não por sessão.                                                                      |
| **Local criado dentro do agrupador fica oculto do inventário geral até ação explícita** | Não identificado no levantamento — o "Projeto" do NOSSIS é só um agrupador opcional sobre Sites/Pontos de Instalação **já visíveis** nos módulos LOCAIS/OSP; a fonte não descreve ocultação.                                 | Não identificado no levantamento.                                                                                                         | Não identificado no levantamento. | Sim — `GeographicSite` vinculado a um projeto é excluído por predicado da árvore/busca até o vínculo ser desfeito.                           |
| **Acesso rápido a itens recorrentes (favoritos)**                                       | Não identificado no levantamento (distinto do "projeto ativo" de sessão, que contextualiza operações, não é atalho de leitura).                                                                                              | Sim — **Favorites**, acesso rápido a objetos usados com frequência.                                                                       | Não identificado no levantamento. | Fora do escopo deste requisito — o Nexus já cobre isso com o histórico de busca (REQ-MOD01-011); Projeto é workspace de criação, não atalho. |
| **Criação de entidade fora do fluxo de cadastro padrão**                                | Sim — o Projeto do NOSSIS é uma das vias indiretas de criação dentro do OSP (ao lado do Importador DXF), mas associa Sites já cadastrados por LOCAIS; não cria o Site em si.                                                 | Não identificado no levantamento.                                                                                                         | Não identificado no levantamento. | O local do projeto **é** criado pelo mesmo cadastro guiado por endereço do REQ-MOD01-006 — sem via de criação paralela.                      |

---

## 21. REQ-MOD01-016 — Painel Unificado de Local

> **Entidade TMF:** GeographicSite (TMF674) — reaproveitado sem alteração de forma; GeographicLocation (TMF675) e GeographicAddress (TMF673) ganham atributos de procedência
> **Open API TMF:** TMF673, TMF674, TMF675 — mesmos contratos de REQ-MOD01-002/006, sem novo `@type`
> **Prioridade:** Alta — elimina três telas divergentes para a mesma entidade e fecha lacunas de UX
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.11 — draft

### 21.1 Descrição

Até esta revisão, um `GeographicSite` podia ser criado e consultado por três caminhos distintos e visualmente diferentes: o formulário de criação de um local de Projeto de trabalho (`ProjectSitePanel`, modo criação), a janela de consulta do mesmo local depois de criado (`ProjectSitePanel`, modo consulta) e o painel de um local independente da Hierarquia (`SiteDetailBody`, com abas Visão geral/Sub-locais/Recursos/Topologia/Ciclo de vida) — mais um quarto caminho, o assistente de 3 passos (`GuidedSignupModal`), alcançável só pelo botão de criar sub-local. Cada um mostrava um subconjunto diferente dos mesmos campos, com rótulos e fluxos próprios.

Este requisito substitui os quatro por um único **painel de Local** (`SitePanel`), usado tanto dentro quanto fora de um Projeto de trabalho (REQ-MOD01-015), em dois modos:

- **Criação** — nome, tipo, e endereço obrigatório escolhido por busca com autocomplete (GEONET por padrão, ou Google Maps), com o mesmo requisito de candidato real do RN-008 do REQ-MOD01-015 quando o local nasce dentro de um projeto.
- **Consulta** — foto de Street View, título e tipo editáveis no cabeçalho, e quatro abas: **Visão Geral** (Status, Local Pai, Endereço, Origem, Observação, todos editáveis inline por clique), **Sub-locais** (árvore recursiva com criação/abertura/exclusão), **Recursos** (vínculo e desvínculo de `PhysicalResource`/`LogicalResource`) e **Histórico** (log de auditoria traduzido).

Abrir um sub-local pela aba Sub-locais faz o próprio painel "assumir" o sub-local — sem trocar de rota nem remontar a doca — com o botão voltar (‹) desempilhando um nível de cada vez. A aba **Topologia** do antigo `SiteDetailBody` (relações `relatedSite` A↔Z) sai da UI nesta revisão — o dado e a rota `/v1/geo/sites/:id/relationships` (REQ-MOD01-010) continuam intactos, sem tela própria.

### 21.2 Racional arquitetural

Um Site é um Site, dentro ou fora de um Projeto de trabalho — a divergência de telas nunca refletiu uma diferença real de modelo, só o acidente histórico de o REQ-MOD01-015 ter chegado depois do painel de Hierarquia e ganho sua própria casca. Consolidar num único componente (`SitePanel`, com as abas em componentes irmãos `SiteOverviewTab`/`SiteSubSitesTab`/`SiteResourcesTab`/`SiteHistoryTab`) elimina a divergência de campos entre as três telas antigas e estabelece um único lugar para evoluir o formulário de Local no futuro.

A aba Recursos preserva a fronteira Geo↔Resource (C2/C3): o painel nunca edita um `PhysicalResource`/`LogicalResource` diretamente — as rotas `POST/DELETE /v1/geo/sites/:siteId/resources[/:resourceId]` só resolvem o tipo do recurso e delegam a `ResourceService.updatePhysicalResource`/`updateLogicalResource` (vincular ou desvincular, `placeId: null`) ou a `deletePhysicalResource`/`deleteLogicalResource` (soft-terminate, C6) quando o usuário escolhe excluir em vez de só desvincular.

A Origem do Site (import/projeto/manual) é resolvida em cascata por `GET /v1/geo/sites/:id/origin`: primeiro a characteristic `_origin.system` (C5, cargas de migração), depois o vínculo em `geo_project_site` — que sobrevive ao término do projeto (REQ-MOD01-015 RF-010 revisado nesta versão) e por isso continua respondendo `project` mesmo com o local já liberado —, e por último o autor do evento de criação em `tmf_audit_log`, para cadastro manual pela UI.

Endereço deixa de ser só um texto: o modal de edição grava explicitamente **de onde** a coordenada/endereço vieram (`sourceSystem`/`sourceRef`, novo em Location e Address) e **quão precisos** são (`accuracyLevel`, normalização de `accuracy` em `high|medium|low|unknown`) — pré-requisito para o texto do endereço mostrar a base entre parênteses (ex. "Rua Cinco de Julho, 237, Niterói, RJ, 24220110 (geonet)") e para uma futura política de reconciliação entre fontes divergentes (REQ-MOD01-002 RN-003, já existente para o painel de Endereço avulso) se estender a Sites.

### 21.3 Mapeamento de atributos TMF

| Atributo                                     | Tipo   | Obrigatório | Observação V.tal                                                                                                                                                                                                   |
| -------------------------------------------- | ------ | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GeographicSite.*`                           | —      |      —      | Sem alteração de contrato — o painel unificado consome o mesmo TMF674 do REQ-MOD01-006.                                                                                                                            |
| `GeographicSite.note`                        | string |     Não     | Observação livre (aba Visão Geral); atributo comum, não `characteristic` (C1 não se aplica — anotação de trabalho, não extensão de domínio). Substitui `geo_project_site.note`, migrada nesta revisão.             |
| `GeographicLocation.sourceSystem`            | string |     Não     | `GEONET \| GOOGLE_MAPS \| NETWIN \| GEOSITE \| NETWORKCORE \| GEOPLEX \| MANUAL` — de onde veio a coordenada.                                                                                                      |
| `GeographicLocation.sourceRef`               | string |     Não     | Referência na fonte (id GEONET, `placeId` do Google, id do registro legado).                                                                                                                                       |
| `GeographicLocation.accuracyLevel`           | string |     Não     | `high \| medium \| low \| unknown` — normalização de `accuracy` (que continua guardando o texto cru, ex. "ROOFTOP", "ENDEREÇO COMPLETO"), derivada dos mesmos ranques de precisão já usados no painel de Endereço. |
| `GeographicAddress.sourceSystem`/`sourceRef` | string |     Não     | Mesmo par de Location, na mesma gravação (o modal de endereço grava os dois juntos).                                                                                                                               |

### 21.4 Exemplo de payload

O local em si continua sendo o `GeographicSite` do REQ-MOD01-006 — o que muda é a Location/Address que ele referencia:

```json
{
  "@type": "GeographicSite",
  "id": "018f9c40-2b11-7c9a-8e21-3a5f0d7c1122",
  "name": "CDO Rua Miguel de Frias, 380",
  "status": "Active",
  "note": "Poste com sinalização danificada — reforçar identificação na próxima visita.",
  "place": { "id": "loc-1", "@referredType": "GeographicLocation" },
  "address": { "id": "addr-1", "@referredType": "GeographicAddress" },
  "siteSpecification": { "id": "spec-cdo", "@referredType": "GeographicSiteSpecification" }
}
```

```json
{
  "@type": "GeographicLocation",
  "id": "loc-1",
  "geometryType": "Point",
  "geometry": { "type": "Point", "coordinates": [-43.1004, -22.8963] },
  "accuracy": "ENDEREÇO COMPLETO",
  "sourceSystem": "GEONET",
  "sourceRef": "geonet-addr-48213",
  "accuracyLevel": "high"
}
```

### 21.5 Pré-condições

- O cadastro guiado por endereço (REQ-MOD01-006, `POST /v1/geo/workspace/site-at-address`) e os Projetos de trabalho (REQ-MOD01-015) já estão disponíveis — o painel reaproveita os dois casos de uso, sem via de criação paralela.
- O catálogo de `GeographicSiteSpecification` (REQ-MOD01-003) tem `allowedParentSpecIds`/`allowedChildSpecIds` povoados — é o que restringe as opções de Local Pai (aba Visão Geral) e de tipo de sub-local (aba Sub-locais) ao que a contenção do backend (`validateContainment`) de fato aceita.
- O log de auditoria (`tmf_audit_log`, já emitido por todo `create`/`update`/`transition` de Site) está disponível — é a fonte única da aba Histórico e do fallback de Origem `manual`.

### 21.6 Requisitos Funcionais

| ID         | Nome                                      | Descrição                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Painel único, dois modos**              | Criação e consulta de qualquer `GeographicSite`, dentro ou fora de um Projeto de trabalho, passam pelo mesmo componente (`SitePanel`) — sem tela alternativa.                                                                                                                 |
| **RF-002** | **Cabeçalho com tipo e nome editáveis**   | A barra de título traz uma combo de tipo acima do nome (input inline, grava no blur) — mesmo padrão em criação e consulta.                                                                                                                                                    |
| **RF-003** | **Quatro abas na consulta**               | Visão Geral · Sub-locais · Recursos · Histórico — sem a aba Topologia (RN-006).                                                                                                                                                                                               |
| **RF-004** | **Status editável por clique, com trava** | O campo Status mostra um selo estático; clicar troca por uma combo que grava no `change`. Enquanto o Site pertence a um Projeto de trabalho em curso (não terminado), o campo é somente leitura com a nota "herdado do projeto X" (RN-007 do REQ-MOD01-015).                  |
| **RF-005** | **Local Pai por autocomplete validado**   | Clicar no campo Local Pai abre um texto com sugestões filtradas pela contenção da spec atual; só grava ao clicar numa sugestão — texto livre nunca confirma uma mudança.                                                                                                      |
| **RF-006** | **Endereço editável por modal com base**  | Endereço mostra o texto formatado com a fonte entre parênteses; um botão abre um modal com combo de base de referência (GEONET padrão, ou Google Maps), autocomplete da base escolhida, e Localização/Precisão só leitura — visíveis apenas depois de um candidato escolhido. |
| **RF-007** | **Sub-locais em árvore recursiva**        | A aba Sub-locais lista a hierarquia interna do Site (sala → gaveta, por exemplo) com criação na raiz ou sob um nó existente, abertura (o painel assume o sub-local) e exclusão (soft-terminate) por um menu de ações no nó.                                                   |
| **RF-008** | **Vínculo e desvínculo de Recurso**       | A aba Recursos lista os `PhysicalResource`/`LogicalResource` do Site, agrupados por planta; um campo de busca vincula um recurso existente, e a lixeira no hover pergunta se é para desvincular (recurso continua existindo) ou também excluir (soft-terminate).              |
| **RF-009** | **Histórico traduzido**                   | A aba Histórico lista o log de auditoria do Site, com o que mudou (diff dos campos rastreados), quando e por quem — sem expor o JSON bruto de `before`/`after`.                                                                                                               |
| **RF-010** | **Origem somente leitura**                | A aba Visão Geral mostra a origem do Site em uma das três formas fixas: "Importação Sistema {sistema}", "Projeto {nome}" ou "Cadastro Livre usuário {ator}" — nunca editável.                                                                                                 |

### 21.7 Regras de Negócio

| ID         | Nome                                               | Descrição                                                                                                                                                                                                                                              |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RN-001** | **Endereço sempre grava procedência**              | Salvar pelo modal de endereço grava `sourceSystem`/`sourceRef` em Location e Address, e `accuracyLevel` em Location — nunca só a geometria/texto crus.                                                                                                 |
| **RN-002** | **Desvincular recurso não o exclui**               | `DELETE /v1/geo/sites/:siteId/resources/:resourceId?mode=unlink` limpa `place`/`placeType` do recurso (`placeId: null`) sem alterar seu `status`; só `mode=terminate` soft-termina (C6), delegando a `ResourceService.deletePhysical/LogicalResource`. |
| **RN-003** | **Sub-local herda endereço do pai**                | Um sub-local criado pela aba Sub-locais nunca recebe endereço/localização próprios — herda `placeId`/`addressId` do Site pai, como já valia para sub-local pelo REQ-MOD01-007.                                                                         |
| **RN-004** | **Exclusão de sub-local é soft-terminate**         | O menu de ações "Excluir" transiciona o sub-local para `Retired` via `PATCH /v1/geo/sites/:id` com `statusReason` — nunca DELETE físico (C6).                                                                                                          |
| **RN-005** | **Origem é resolvida em cascata, nunca combinada** | `_origin.system` vence se presente; senão o vínculo de projeto (mesmo depois de terminado); senão o autor do evento de criação. As três formas são mutuamente exclusivas — nunca mais de uma aparece ao mesmo tempo.                                   |
| **RN-006** | **Topologia sai da UI, não do modelo**             | A aba Topologia do antigo `SiteDetailBody` é removida; `relatedSite` e a rota `/v1/geo/sites/:id/relationships` (REQ-MOD01-010) continuam funcionando sem tela própria neste requisito.                                                                |

### 21.8 Critérios de Aceite

| ID         | Critério                                                                        | Resultado Esperado                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CA-001** | Abrir um Site pela Hierarquia, pela busca e por um local de Projeto em curso    | As três origens abrem a mesma casca (`SitePanel`), com o Status travado só na terceira, enquanto o projeto de origem não terminou.                                             |
| **CA-002** | Editar o nome e o tipo no cabeçalho                                             | Os dois persistem via `PATCH /v1/geo/sites/:id`, sem exigir um botão de salvar dedicado.                                                                                       |
| **CA-003** | Trocar a base de referência do modal de endereço de GEONET para Google Maps     | O autocomplete passa a consultar o Google (`fetchAddressPredictions`), não o GEONET; a Precisão exibida usa o vocabulário do Google (`location_type`).                         |
| **CA-004** | Salvar um endereço escolhido no modal                                           | O texto na Visão Geral passa a exibir a base entre parênteses; `tmf_geographic_address.source_system`/`source_ref` e `tmf_geographic_location.accuracy_level` gravam no banco. |
| **CA-005** | Criar um sub-local e abri-lo pela aba Sub-locais                                | O painel assume o sub-local (mesmo componente, sem navegação de página); o botão voltar (‹) retorna ao Site pai.                                                               |
| **CA-006** | Vincular um recurso existente pela busca da aba Recursos, depois desvinculá-lo  | O recurso aparece na lista após vincular; ao desvincular (não excluir), ele some da lista do Site mas continua acessível pelo módulo Resource.                                 |
| **CA-007** | Consultar a aba Histórico de um Site recém-criado e depois editado              | Aparecem ao menos duas entradas — "Local criado" e o diff do campo editado —, cada uma com data e autor.                                                                       |
| **CA-008** | Consultar a Origem de um Site carregado por migração, um de Projeto e um manual | Os três textos batem exatamente com RF-010, sem ambiguidade entre as formas.                                                                                                   |

### 21.9 Mapeamento contra sistemas de referência

| Capacidade                                                                               | Netwin                                                                                                                                                                        | Kuwaiba                                                                                                                 | NetBox                                                                                          | Decisão Nexus                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Um único cadastro/edição para o mesmo tipo de local, sem tela alternativa por origem** | Não identificado no levantamento — o módulo Inside Plant descreve gestão de sala/bastidor/equipamento, sem contraste explícito entre um fluxo "de projeto" e um fluxo avulso. | Não identificado no levantamento.                                                                                       | Não identificado no levantamento.                                                               | Painel único (`SitePanel`) para os dois fluxos, com a única diferença sendo a trava de Status enquanto o Projeto de origem está em curso (REQ-MOD01-015).                  |
| **Hierarquia interna de local (sala, andar, gaveta) navegável a partir do local pai**    | Sim — Inside Plant cobre "gestão das plantas de sala, bastidores e equipamentos", com importação de plantas de edifício.                                                      | Sim — `Building`/`Room` no metamodelo de classes hierárquicas, com atributos próprios por tipo (`Room.hasRaisedFloor`). | Não identificado no levantamento.                                                               | Aba Sub-locais em árvore recursiva, um nível por chamada, mesmo padrão da Hierarquia geral (REQ-MOD01-011) — sem endereço próprio por sub-local (RN-003).                  |
| **Trilha de auditoria de mudanças, consultável por objeto**                              | Não identificado no levantamento.                                                                                                                                             | Sim — **Audit Trail** (submenu de Administration): "rastreia mudanças globais e suporta auditoria de modificações".     | Sim — **Change Log** (grupo Logging): "histórico de mudanças para auditoria e rastreabilidade". | Aba Histórico sobre `tmf_audit_log`, já emitido por toda mutação de Site (REQ-MOD01-008/012) — este requisito só lhe dá uma tela traduzida, sem novo mecanismo de captura. |
| **Registro de qual fonte externa originou um dado de endereço/coordenada**               | Não identificado no levantamento.                                                                                                                                             | Não identificado no levantamento.                                                                                       | Não identificado no levantamento.                                                               | `sourceSystem`/`sourceRef`/`accuracyLevel` em Location/Address (§21.3) — extensão própria do Nexus, sem precedente identificado nos três sistemas de referência.           |

---

## 22. REQ-MOD01-017 — Manchas de Concentração e Dispersão de Projeto

> **Entidade TMF:** GeographicLocation (TMF675) — polígono de agrupamento espacial; não cria entidade nova  
> **Open API TMF:** TMF675 — consulta geoespacial de área de agrupamento  
> **Prioridade:** Média — leitura operacional de um Projeto de trabalho carregado em massa  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.17 — draft

### 22.1 Descrição

Um Projeto de trabalho (REQ-MOD01-015) carregado em massa acumula dezenas de milhares de `GeographicSite` — "Onitel - Brasília" tem 25.507 locais vinculados. Olhar pin a pin não revela onde a planta está de fato concentrada nem onde há erro de coordenada/cadastro: locais isolados, longe de todo o resto, que um mapa de pontos individuais esconde no meio do ruído visual. Este requisito agrupa espacialmente os locais de um projeto por proximidade (raio de 200 m, mesma técnica do REQ-MOD01-014): um componente conexo com **5 locais ou mais** vira mancha de **concentração** (azul); abaixo disso, mancha de **dispersão** (roxo) — candidata a erro de coordenada, e o alvo de inspeção. Rodando o algoritmo contra a carga real do projeto de exemplo "Onitel - Novo Gama" (3.514 locais, 3.321 com coordenada válida), o agrupamento produziu 11 concentrações (3.213 locais) e 78 dispersões (108 locais) — entre as dispersões, duas continham coordenadas em outro continente (Arkansas/EUA e Áustria), exatamente o tipo de erro que a técnica existe para expor.

Com manchas geradas para um projeto, o mapa deixa de desenhar um marcador por local em qualquer escala: as manchas ficam visíveis sempre, e o local individual só aparece em ≤ 50 m — a mesma régua já usada pela infra passiva sem projeto (REQ-MOD01-011 RF-004) — buscado por bbox da região visível, não pela lista completa do projeto.

### 22.2 Racional arquitetural

A mancha é uma **área geográfica derivada**, não um serviço nem um recurso: é a projeção espacial de "onde o cadastro deste projeto está concentrado". Por isso o polígono é uma `GeographicLocation` (TMF675, `geometryType: Polygon`) — o mesmo caso de uso do REQ-MOD01-001 e a mesma forma da cobertura GPON (REQ-MOD01-014). Não é `Service` (C4) nem `Resource` (C3-a). É um artefato **regenerável**, gerado por `scripts/build-project-areas.mjs`, reaproveitando o núcleo puro de `coverage-grid.ts` (grade Mercator, componente conexo, traçado suavizado por Chaikin/Douglas-Peucker) através de `project-area-grid.ts` — a única diferença de algoritmo é que aqui não há "bairro": todos os locais do projeto disputam o mesmo espaço sob uma única chave sintética, e o critério de corte concentração/dispersão é a **contagem de locais** do componente, não a contagem de células.

O vínculo entre o projeto e cada mancha vive em `geo_project_area` — tabela de plataforma gêmea de `geo_project_site` (kind, contagem de locais, amostra de ids, centroide, área), não uma `characteristic` TMF (C1 não se aplica: é extensão de plataforma sobre o vínculo, não sobre a entidade TMF). Como a cobertura GPON, a geração é idempotente por escopo (aqui, por projeto): cada execução do script apaga as manchas anteriores DAQUELE projeto e regrava — exceção consciente a C6, restrita a artefato de leitura regenerável.

### 22.3 Mapeamento de atributos TMF

| Atributo                            | Tipo    | Obrigatório | Observação V.tal                                                                                        |
| ----------------------------------- | ------- | :---------: | ------------------------------------------------------------------------------------------------------- |
| `GeographicLocation.geometryType`   | enum    |     Sim     | `Polygon` — anel externo do componente conexo (sem buracos, na prática).                                |
| `GeographicLocation.geometry`       | GeoJSON |     Sim     | Polígono suavizado da mancha (RFC 7946), mesmo traçado de `coverage-grid.ts`.                           |
| `GeographicLocation.referencePoint` | string  |     Não     | Token de escopo `PROJECT:<projectId>` — idempotência da regeneração por projeto.                        |
| `geo_project_area.kind`             | enum    |     Sim     | `concentration` (≥ 5 locais) \| `dispersion` (< 5 locais) — extensão de plataforma, não characteristic. |
| `geo_project_area.site_count`       | integer |     Sim     | Contagem real de `GeographicSite` do componente.                                                        |
| `geo_project_area.site_ids`         | JSON    |     Não     | Amostra de até 50 ids de Site do componente — diagnóstico de dispersão.                                 |
| `geo_project_area.centroid_lng/lat` | decimal |     Não     | Centroide dos locais do componente (não do polígono) — ponto de referência do balão de hover.           |
| `geo_project_area.area_km2`         | decimal |     Não     | Área aproximada da mancha, em km².                                                                      |

### 22.4 Exemplo de payload

Exemplo ilustrativo de uma mancha de concentração conforme o contrato TMF675, com o vínculo de plataforma `geo_project_area` representado à parte (não é `characteristic`):

```json
{
  "location": {
    "id": "6da12fb8-8c96-4fe6-ad65-0a3c3fe20bd5",
    "href": "/tmf-api/geographicLocationManagement/v4/geographicLocation/6da12fb8-8c96-4fe6-ad65-0a3c3fe20bd5",
    "geometryType": "Polygon",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [-48.033031, -16.080796],
          [-48.032806, -16.080688],
          [-48.032104, -16.079258],
          [-48.031178, -16.079663],
          [-48.033031, -16.080796]
        ]
      ]
    },
    "spatialRef": "EPSG:4326",
    "referencePoint": "PROJECT:01a00f2c-9750-7aeb-a595-3650735d0590"
  },
  "projectArea": {
    "projectId": "01a00f2c-9750-7aeb-a595-3650735d0590",
    "locationId": "6da12fb8-8c96-4fe6-ad65-0a3c3fe20bd5",
    "kind": "concentration",
    "siteCount": 3024,
    "centroid": [-48.0331, -16.0808],
    "areaKm2": 1.14
  }
}
```

### 22.5 Pré-condições

- O Projeto tem locais vinculados (`geo_project_site`) com `GeographicLocation` do tipo `Point` — locais sem geometria válida são descartados do agrupamento e reportados pelo script.
- A geração é **por script**, não automática: `scripts/build-project-areas.mjs --project "<nome>" --apply` roda sob demanda; criar/remover um local do projeto depois de gerado não regenera a mancha sozinho (ver gap em §2.3/[#140](https://github.com/niraldojunior/nexus/issues/140)).

### 22.6 Requisitos Funcionais

| ID         | Nome                             | Descrição                                                                                                                                                                             |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-001** | **Consolidação por raio**        | Consolidar os locais do projeto por proximidade (raio de 200 m em grade Mercator de 50 m) num componente conexo por mancha.                                                           |
| **RF-002** | **Classificação por contagem**   | Classificar cada componente como `concentration` (≥ 5 locais) ou `dispersion` (< 5 locais, inclusive um único local isolado).                                                         |
| **RF-003** | **Manchas em qualquer escala**   | Com manchas geradas, desenhar o polígono de cada mancha no mapa em qualquer escala — nunca só acima de um piso, ao contrário da cobertura GPON (REQ-MOD01-014).                       |
| **RF-004** | **Local individual só de perto** | Com manchas geradas, o pin de local do projeto só entra no mapa em ≤ 50 m (mesma régua de `PASSIVE_INFRA_MAX_SCALE_METERS`), buscado por bbox da viewport.                            |
| **RF-005** | **Balão de hover**               | Ao passar o cursor sobre a mancha, exibir a classe (Concentração/Dispersão) e a contagem de locais.                                                                                   |
| **RF-006** | **Regeneração por projeto**      | Recomputar as manchas de um projeto substituindo a geração anterior daquele projeto, de forma idempotente.                                                                            |
| **RF-007** | **Lista paginada do painel**     | Com manchas geradas, a lista de locais do painel do Projeto vira uma página (não a lista inteira); o total exibido é `project.siteCount`, com aviso de quantos estão sendo mostrados. |

### 22.7 Regras de Negócio

| ID         | Nome                                   | Descrição                                                                                                                                                   |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | **Mancha não é Service nem Resource**  | A mancha é `GeographicLocation` (TMF675); nunca `CustomerFacingService` (C4) nem `Resource` (C3-a).                                                         |
| **RN-002** | **Vínculo é plataforma, não TMF**      | `geo_project_area` é extensão de plataforma sobre o vínculo projeto↔mancha (como `geo_project_site.note`), não uma `characteristic` TMF (C1 não se aplica). |
| **RN-003** | **Artefato regenerável**               | O polígono e o vínculo são derivados: a regeneração por projeto apaga e recria — exceção consciente a C6, restrita a artefato de leitura.                   |
| **RN-004** | **Sem manchas, comportamento intacto** | Um projeto sem manchas geradas mantém o comportamento anterior ao requisito: todos os locais listados e desenhados como pin, em qualquer escala.            |

### 22.8 Critérios de Aceite

| ID         | Critério                                                                                 | Resultado Esperado                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | Rodar o script para um projeto com locais espalhados                                     | Produz manchas classificadas corretamente pelo limiar de 5 locais, sem local órfão sem mancha (grade não-degenerada). |
| **CA-002** | Abrir um projeto com manchas geradas em qualquer escala de mapa (estado, cidade, quadra) | As manchas aparecem em todas; nenhum pin individual aparece acima de 50 m.                                            |
| **CA-003** | Aproximar o mapa até ≤ 50 m com um projeto de manchas aberto                             | Os pins dos locais daquela região aparecem, buscados por bbox — não a lista inteira do projeto.                       |
| **CA-004** | Passar o cursor sobre uma mancha                                                         | O balão mostra a classe (Concentração/Dispersão) e a contagem de locais.                                              |
| **CA-005** | Rodar o script duas vezes seguidas para o mesmo projeto                                  | O número de manchas e vínculos não dobra (idempotência por projeto).                                                  |
| **CA-006** | Abrir um projeto sem manchas geradas                                                     | Comportamento inalterado: todos os locais listados e desenhados em qualquer escala (RN-004).                          |

### 22.9 Mapeamento contra sistemas de referência

| Capacidade                                                        | Netwin                                                                                                                                                    | Kuwaiba                                                                                                    | NetBox                            | Decisão Nexus                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Agrupamento espacial dos locais de um projeto por proximidade** | Não identificado no levantamento.                                                                                                                         | Não identificado no levantamento — `SiteGroup` é agrupamento lógico/operacional, não estatístico-espacial. | Não identificado no levantamento. | **Grade de 50 m consolidando o raio de 200 m entre locais do mesmo projeto (mesma técnica do REQ-MOD01-014)**          |
| **Detecção de outlier/erro de coordenada pós-cadastro**           | Validação de **intervalo** no formulário de cadastro (longitude/latitude dentro de -180/180 e -90/90), mas não detecção de outlier espacial após a carga. | Não identificado no levantamento.                                                                          | Não identificado no levantamento. | **Componente conexo com < 5 locais vira mancha de dispersão — sinaliza outlier sem exigir varredura manual pin a pin** |
| **Camada de agregação substituindo pin individual em escala**     | Não identificado no levantamento.                                                                                                                         | Não identificado no levantamento.                                                                          | Não identificado no levantamento. | **Manchas visíveis em qualquer escala; pin individual só em ≤ 50 m, buscado por bbox (mesma régua da infra passiva)**  |

---

## 23. REQ-MOD01-018 — Papel do site e Sub-endereço (siteRole + GeographicSubAddress)

> **Entidade TMF:** GeographicSiteSpecification.siteRole (TMF674) + GeographicSubAddress (TMF673)  
> **Open API TMF:** TMF673 — Geographic Address Management API · TMF674 — Geographic Site Management API  
> **Prioridade:** Alta — corrige distinção conceitual usada por viabilidade, take rate e cadastro de MDU  
> **Status funcional:** Especificado · **Implementação:** ver §2.3 · **Versão:** 1.18 — draft

### 23.1 Descrição

O cadastro Geo tipava um `GeographicSite` por um único eixo — `category` (`Region | FunctionalGroup | Site | SubSite`), que é **estrutural**: diz onde o nó cabe na hierarquia, não o que ele é. Um Central Office, um condomínio e a casa de um assinante eram todos `category: 'Site'`, indistinguíveis. Este requisito introduz o eixo **funcional**, `siteRole` (`grouping | network | property | service`), na `GeographicSiteSpecification` — Network Site (CO, POP, armário: infraestrutura de rede) ≠ Property Site (condomínio/MDU: imóvel) ≠ Service Site (a unidade atendida). Introduz também `GeographicSubAddress` (TMF673) em `GeographicAddress`, para localizar torre/bloco/andar/unidade dentro do endereço único de um condomínio, e migra `INSTALLATION_POINT` — cadastrado incorretamente como site spec — para `CUSTOMER_SITE`, o novo tipo com `siteRole: 'service'`.

### 23.2 Racional arquitetural

`siteRole` vive na **spec**, não no site — herda de C1 (extensão via catálogo, nunca campo hardcoded): o papel de um Site é uma propriedade do seu tipo, resolvida uma vez no bootstrap/CRUD de `GeographicSiteSpecification`, não recalculada por instância. Dois casos motivam a decisão: a casa unifamiliar, onde um `CUSTOMER_SITE` (`service`) pendura direto numa `REGION` com um único `GeographicAddress`; e o MDU 3×10, onde `CONDOMINIUM`/`BLOCK` (`property`) agrupam múltiplos `CUSTOMER_SITE` (`service`) sob o mesmo endereço, diferenciados por `GeographicSubAddress` (torre → andar → unidade, em cascata). Sem o segundo eixo, não há como reaproveitar viabilidade e infraestrutura interna do prédio, nem medir take rate por MDU.

`INSTALLATION_POINT` conceitualmente não é um lugar: é recurso de rede, capacidade reservável com ciclo de vida próprio (`projected → built → available → reserved → in_use → decommissioned`), hoje sem modelagem equivalente no Módulo 2 (dívida registrada em [#110](https://github.com/niraldojunior/nexus/issues/110)). A spec foi aposentada — `lifecycleStatus: Retired`, C6, nunca DELETE físico — e o cadastro existente migrado para `CUSTOMER_SITE` via script dedicado, rodando em Postgres e Oracle.

### 23.3 Mapeamento de atributos TMF

| Atributo                               | Tipo   | Obrigatório | Observação V.tal                                                                                                             |
| -------------------------------------- | ------ | :---------: | ---------------------------------------------------------------------------------------------------------------------------- |
| `GeographicSiteSpecification.siteRole` | enum   |     Sim     | `grouping` \| `network` \| `property` \| `service` — default resolvido por `category` quando ausente (specs legadas/ad-hoc). |
| `GeographicAddress.subAddress`         | array  |     Não     | Lista de `GeographicSubAddress`, em cascata (torre → andar → unidade).                                                       |
| `GeographicSubAddress.type`            | enum   |     Sim     | `building` \| `tower` \| `block` \| `floor` \| `unit`.                                                                       |
| `GeographicSubAddress.name`            | string |     Não     | Rótulo livre (ex.: "Torre B").                                                                                               |
| `GeographicSubAddress.subUnitNumber`   | string |     Não     | Número da unidade (ex.: "704").                                                                                              |
| `GeographicSubAddress.levelNumber`     | string |     Não     | Número do pavimento (ex.: "7").                                                                                              |

### 23.4 Exemplo de payload

Exemplo ilustrativo de uma `GeographicSiteSpecification` com `siteRole` e de um `GeographicAddress` com `subAddress` em cascata, conforme os contratos TMF674/TMF673:

```json
{
  "siteSpecification": {
    "id": "spec-customer-site",
    "@type": "GeographicSiteSpecification",
    "name": "Customer Site",
    "code": "CUSTOMER_SITE",
    "category": "Site",
    "siteRole": "service",
    "lifecycleStatus": "Active"
  },
  "address": {
    "id": "addr-mdu-3x10",
    "@type": "GeographicAddress",
    "street": "Rua Cinco de Julho",
    "streetNr": "237",
    "city": "Niterói",
    "stateOrProvince": "RJ",
    "postcode": "24220110",
    "subAddress": [
      { "@type": "GeographicSubAddress", "type": "tower", "name": "Torre B" },
      { "@type": "GeographicSubAddress", "type": "floor", "levelNumber": "7" },
      { "@type": "GeographicSubAddress", "type": "unit", "subUnitNumber": "704" }
    ]
  }
}
```

### 23.5 Pré-condições

- Existe pelo menos uma `GeographicSiteSpecification` bootstrapada com `siteRole` resolvido (ver REQ-MOD01-003).
- Para a migração `INSTALLATION_POINT → CUSTOMER_SITE`, o backend já subiu ao menos uma vez com o bootstrap desta fase, materializando a spec `CUSTOMER_SITE`.

### 23.6 Requisitos Funcionais

| ID         | Nome                                    | Descrição                                                                                                                                              |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RF-001** | **Papel na spec**                       | Toda `GeographicSiteSpecification` carrega `siteRole`, resolvido no bootstrap e validado em `createSpec`/`updateSpec`.                                 |
| **RF-002** | **Combo de papel no catálogo**          | `TypeManagementModal` expõe combo "Papel do site" na criação e coluna "Papel" na listagem de tipos.                                                    |
| **RF-003** | **Sub-endereço em cascata**             | `GeographicAddress` aceita lista de `GeographicSubAddress` (torre/bloco/andar/unidade), validada contra a lista fechada TMF.                           |
| **RF-004** | **Formulário de sub-endereço**          | `SiteAddressModal` expõe campos Torre/Bloco/Andar/Unidade, opcionais e independentes do endereço buscado.                                              |
| **RF-005** | **Endereço formatado com sub-endereço** | `formatAddress` concatena o sub-endereço ao endereço base (ex.: "Rua X, 100, Niterói, RJ — Torre B · 7º · ap. 704").                                   |
| **RF-006** | **Migração de Installation Point**      | Script dedicado migra sites de `INSTALLATION_POINT` para `CUSTOMER_SITE` em Postgres e Oracle, dry-run por padrão.                                     |
| **RF-007** | **Seletor de camadas por papel**        | O grupo "Locais" do seletor de camadas do mapa roteia cada Site por `siteRole` (Sites de Rede/Imóveis/Sites de Serviço/Sub-locais), 100% em português. |

### 23.7 Regras de Negócio

| ID         | Nome                                    | Descrição                                                                                                            |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **RN-001** | **Papel vive na spec**                  | `siteRole` é atributo da `GeographicSiteSpecification`, nunca do `GeographicSite` — instância herda o papel do tipo. |
| **RN-002** | **Installation Point nunca é excluído** | A spec `INSTALLATION_POINT` permanece no catálogo com `lifecycleStatus: Retired` (C6) — nunca DELETE físico.         |
| **RN-003** | **Sub-endereço não substitui Address**  | `GeographicSubAddress` é sempre subordinado a um `GeographicAddress`; nunca existe isoladamente.                     |
| **RN-004** | **Nome de coluna reservado**            | A coluna de persistência é `site_role`, nunca `role` — palavra reservada no Oracle.                                  |

### 23.8 Critérios de Aceite

| ID         | Critério                                                      | Resultado Esperado                                                                                                                |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **CA-001** | Criar uma spec sem informar `siteRole` explicitamente         | `siteRole` é resolvido pelo default de `category` (`Region`/`FunctionalGroup` → `grouping`, resto → `network`).                   |
| **CA-002** | Gravar um `GeographicAddress` com `subAddress` de três níveis | Round-trip preserva os três itens na ordem gravada; `formatAddress` concatena os três.                                            |
| **CA-003** | Rodar o script de migração em dry-run e depois com `--apply`  | Dry-run só reporta contagem; `--apply` reaponta os sites, corrige `geo_map_feature.sublabel` e não deixa regra de contenção órfã. |
| **CA-004** | Abrir o seletor de camadas do mapa                            | O grupo "Locais" mostra Sites de Rede/Imóveis/Sites de Serviço/Sub-locais, sem código cru de spec em inglês.                      |

### 23.9 Mapeamento contra sistemas de referência

| Capacidade                                                  | Netwin                                                                      | Kuwaiba                                                                      | NetBox                            | Decisão Nexus                                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Distinção entre site de rede, imóvel e unidade atendida** | Tipagem única por tabela de tipos, sem eixo funcional separado.             | Não identificado no levantamento — `GenericObjectList` não separa por papel. | Não identificado no levantamento. | **Eixo `siteRole` ortogonal a `category` na `GeographicSiteSpecification` (grouping/network/property/service)**                                                              |
| **Sub-endereço de MDU (torre/bloco/andar/unidade)**         | Campos livres de complemento no cadastro de endereço, sem estrutura tipada. | Não identificado no levantamento.                                            | Não identificado no levantamento. | **`GeographicSubAddress` (TMF673) em cascata, tipado e validado contra lista fechada**                                                                                       |
| **Installation Point como local vs. como recurso**          | PI é local cadastrado como Site, sem ciclo de vida de recurso reservável.   | Não identificado no levantamento.                                            | Não identificado no levantamento. | **PI aposentado como site spec (C6); migrado para `CUSTOMER_SITE`; PI como `PhysicalResource` fica como dívida ([#110](https://github.com/niraldojunior/nexus/issues/110))** |

---

## 24. Cenários ilustrativos da modelagem

### 24.1 Cenário A — Home Passed até Home Connected

```text
GeographicAddress + GeographicLocation (HP)
  └─ TMF645 consulta viabilidade, sem criar Service
      └─ contratação cria InstallationPoint (GeographicSite)
          └─ ONT (PhysicalResource) referencia o endereço via place
              └─ RFS referencia ONT/porta/VLAN
                  └─ CFS referencia o RFS e o Tenant ISP
```

O cenário valida C4, a separação Address/Location/Site e a regra de referência entre Geo, Resource e Service.

### 24.2 Cenário B — Central, sala, Rack e cadeia GPON

```text
Central (GeographicSite)
└─ Sala de transmissão (GeographicSite/SubSite)
   └─ Rack (PhysicalResource) — fronteira C2
      └─ OLT → Card → Port → DIO → Cable → Splitter → CTO → ONT
         └─ RFS de acesso → CFS wholesale
```

O cenário valida a hierarquia de Sub-Sites, a fronteira Geo↔Resource no Rack e a navegação conjunta árvore/mapa já existente no frontend.

### 24.3 Padrões reaproveitáveis

- Address, Location e Site são entidades distintas; referências substituem duplicação.
- A árvore Geo termina antes do Rack; infraestrutura passiva e equipamentos são Resources.
- Home Passed permanece em Geo e Qualification; Service só nasce no Home Connected.
- A viewport pode combinar Sites e Resources sem fundir seus modelos de domínio.

---

## 25. Síntese arquitetural do módulo

- **Geo é a fonte do “onde”.** Address, Location e Site têm identidades e ciclos de vida próprios.
- **Catálogo governa a estrutura.** SiteSpecification define características e contenção; enums fechados no código são dívida registrada.
- **Resource apenas referencia Geo.** A ponte canônica é `place`; o Rack permanece a fronteira com o Módulo 2.
- **Mapa e árvore são projeções.** A UI atual combina hierarquia, busca e viewport sem alterar o contrato TMF.
- **Escala e confiabilidade ainda são alvo.** Spatial, UUID v7, `_origin` e outbox permanecem no backlog transversal.

---

## 26. Contratos com outros módulos do Nexus

O módulo Geographic é a fundação referenciada por praticamente todos os outros módulos. Os contratos de integração:

| Módulo consumidor                        | Tipo de consumo                                        | Detalhe do contrato                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Módulo 2 — Resource Domain**           | Síncrono (referência) + Assíncrono (eventos)           | Todo Resource tem place referenciando GeographicSite ou GeographicLocation. Eventos de StateChange disparam validação de status do Site. |
| **Módulo 3 — Service Domain**            | Síncrono (referência) + Assíncrono (eventos)           | Services têm installationAddress referenciando GeographicAddress. Validação de status do Site para ativação.                             |
| **Módulo 4 — Order & Fulfillment**       | Síncrono (referência) + Síncrono (Service Feasibility) | Orders operam sobre Sites e Addresses. Service Feasibility (TMF645) consulta Sites por endereço/coordenada.                              |
| **Módulo 5 — Process Orchestration**     | Síncrono (BPMN tasks)                                  | Workflows de aprovação para mudanças críticas (ex.: desativação de CO) acionam tasks que operam sobre Sites.                             |
| **Módulo 6 — Party & Tenant**            | Síncrono (referência)                                  | Sites têm relatedParty com referência a Party (Owner, Tenant). Validação de existência da Party no momento da escrita.                   |
| **Módulo 7 — Analytics & Events**        | Assíncrono (consumidor de eventos)                     | Todos os eventos TMF688 publicados pelo módulo Geographic são consumidos pelo Data Lake e por dashboards.                                |
| **Módulo 8 — Platform & Administration** | Síncrono (RBAC, Audit)                                 | Todas as operações de escrita passam por RBAC granular e geram Audit Trail global.                                                       |

---

## 27. Questões em aberto

O backlog único de questões e lacunas vive no GitHub Issues do repositório, com as labels
`tipo:decisão` e `mod:geo`:
[github.com/niraldojunior/nexus/issues?q=is:open+label:mod:geo](https://github.com/niraldojunior/nexus/issues?q=is%3Aopen+label%3Amod%3Ageo).
Esta seção não replica estados; ver §2.3 para o vínculo de cada requisito com a issue que o bloqueia.

### 26.1 Decisões resolvidas

| ID            | Decisão                                                                                                                                                                   | Impacto                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **D-GEO-001** | O Nexus gera UUID v7 próprio e preserva IDs legados em `_origin`.                                                                                                         | Aplica-se a Site, Address e Location; detalhamento na seção 26.2.                                                                  |
| **D-GEO-002** | O provedor de geocodificação é o Geosite Logradouros.                                                                                                                     | Resolve uma questão antiga já superada; a interface técnica continua em [#105](https://github.com/niraldojunior/nexus/issues/105). |
| **D-GEO-003** | `SiteSpecifications` do bootstrap fechadas em 31/07/2026: `Region`, `FunctionalGroup`, `Central Office`, `POP`, `Cabinet`, `InstallationPoint`, `Floor`, `Room` e `Cage`. | Resolve a antiga `D-GEO-003`.                                                                                                      |

### 26.2 D-GEO-001 — Identidade e proveniência de entidades

> **Princípio arquitetural (Jun/2026):** O Nexus é agnóstico à origem de seus dados. Todo identificador canônico é UUID v7 gerado pelo próprio Nexus, independente do sistema de origem. IDs legados são preservados como atributos customizados (`characteristic`) no grupo convencional `_origin`, exclusivamente para fins de rastreabilidade histórica, auditoria e suporte ao período de dual-running.

**Motivação:** Durante o período de dual-running (Netwin ainda ativo + Nexus em produção paralela), equipes de operação precisam correlacionar entidades entre sistemas ("qual Site no Nexus corresponde ao Location #4521 do Netwin?"). O grupo `_origin` resolve isso sem comprometer a integridade do modelo — o Nexus nunca depende de um ID legado para operar.

**Sistemas cobertos por esta decisão:**

| Sistema de origem             | Contexto                                         |
| ----------------------------- | ------------------------------------------------ |
| Netwin (Openlabs)             | Migração de Sites/Locais — Região 1 e 2 V.tal    |
| Hexagon/Octave NetworkCore    | Migração de Sites da Região 2 (planta externa)   |
| Geosite / Geosite Logradouros | Migração de endereços e localizações geográficas |
| OZMAP                         | Futura integração Um Telecom (pós-M&A)           |
| UMBOX                         | Futura integração Um Telecom (pós-M&A)           |

**Grupo canônico `_origin` para GeographicSite, GeographicAddress e GeographicLocation:**

| Characteristic       | Tipo        | Obrigatório na migração | Descrição                                                                                                                         |
| -------------------- | ----------- | :---------------------: | --------------------------------------------------------------------------------------------------------------------------------- |
| `_origin.system`     | string      |           Sim           | Nome do sistema de origem (ex.: `Netwin`, `Geosite`, `NetworkCore`, `OZMAP`).                                                     |
| `_origin.id`         | string      |           Sim           | Identificador da entidade no sistema de origem (ex.: `"SITE-4521"`, `"LOC-00312"`).                                               |
| `_origin.entity`     | string      |           Sim           | Nome do tipo de entidade no sistema de origem (ex.: `"Location"`, `"Node"`, `"Site"`).                                            |
| `_origin.migratedAt` | datetime    |           Sim           | Timestamp ISO 8601 da migração.                                                                                                   |
| `_origin.migratedBy` | string      |           Sim           | Identificador do job de migração (ex.: `"migration-job-netwin-wave1-v2"`).                                                        |
| `_origin.url`        | string      |           Não           | URL ou deep link para a entidade no sistema de origem (quando disponível).                                                        |
| `_origin.extra`      | JSON string |           Não           | Atributos adicionais do sistema de origem que não têm correspondência no Nexus, preservados como JSON serializado para auditoria. |

**Exemplo de GeographicSite migrado do Netwin:**

```json
{
  "id": "site-018fa3c2-7e9d-7a01-bc34-1d4f2e3a9c88",
  "name": "Central Botafogo",
  "siteSpecification": { "id": "spec-central-office" },
  "status": "Active",
  "characteristic": [
    { "name": "CLLI", "value": "RJBTFL01CO0" },
    { "name": "CN", "value": "RJ-SE-01" },
    { "name": "_origin.system", "value": "Netwin" },
    { "name": "_origin.id", "value": "SITE-4521" },
    { "name": "_origin.entity", "value": "Location" },
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

## 28. Controle de revisões

| Versão | Data        | Autor                    | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0    | Junho 2026  | Produto — V.tal Nexus    | Versão inicial do HLD do Módulo 1 — Nexus Geographic, alinhada a TMF673/674/675 e ao documento âncora VTN-HLD-OVERVIEW-001.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1.1    | Junho 2026  | Produto — V.tal Nexus    | Formalização de D-GEO-001 (estratégia de migração): definição do princípio de agnósticidade à origem, grupo canônico `_origin` para todas as entidades geográficas, tabela de sistemas cobertos, payload de exemplo e regras de negócio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.2    | Julho 2026  | Engenharia — V.tal Nexus | Revisão de convergência com o codebase: matriz de aderência dos 12 requisitos, cenários e síntese arquitetural, anatomia normalizada, JSON válido, questões namespaced e gaps ligados ao backlog `DEV-*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.3    | Agosto 2026 | Produto — V.tal Nexus    | Incorporação da consulta operacional de OSP (`inspirations/geosite-legado.md`): princípios 4.7 (fidelidade física — zero entidades artificiais) e 4.8 (operação 100% web), novo REQ-MOD01-013 (digitalização e edição de geometria no navegador), [#109](https://github.com/niraldojunior/nexus/issues/109), RN-001 do mapa redirecionada ao motor de integridade (REQ-MOD02-027) e backlog [#136](https://github.com/niraldojunior/nexus/issues/136).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.4    | Agosto 2026 | Engenharia — V.tal Nexus | Novo RN-007 (§12.7): mapa e árvore de navegação escondem Sub-Site e o recurso `Splitter` (Módulo 2), com pass-through do splitter para o primeiro descendente visível; os dois continuam acessíveis pelo painel de detalhe do local/recurso pai. `GeoTreeService.children` ganha o parâmetro `scope` (`'tree'` default para navegação, `'all'` para os painéis de detalhe).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1.5    | Agosto 2026 | Engenharia — V.tal Nexus | Novo REQ-MOD01-014 (Cobertura GPON por bairro): mapa de calor de disponibilidade/densidade derivado do raio de 300 m das CDOs, com polígono de bairro em TMF675 e grade de leitura `geo_gpon_coverage_cell` agregável por zoom. RF-004 do REQ-MOD01-011 substitui os clusters numerados pela troca de camadas por escala (planta → cobertura → polígono), com Estações que encolhem em 5–50 km e somem acima de 50 km. Seções 19–23 renumeradas para 20–24.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1.6    | Agosto 2026 | Engenharia — V.tal Nexus | Novo RF-008 (§19.6): suavização do contorno do polígono de cobertura por corner-cutting (Chaikin), na geração (`coverage-grid.ts`) e no traçado do canvas (`CoverageOverlay.ts`), eliminando o serrilhado da grade. Nova característica `_coverage.smoothIterations`. Correção dos números de §19 (raio real das CDOs é 200 m, célula de traçado é 50 m, agregação grossa é 250 m — desatualizados desde a v1.5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.7    | Agosto 2026 | Engenharia — V.tal Nexus | Novo RF-009/RN-004/CA-007 (§19.6-19.8): descarta componente conexo abaixo de `minComponentCells` — fragmento de fronteira que o bairro dominante por célula (RN-001) deixa para o bairro perdedor em áreas densas, sem CDO visível próprio, poluindo o mapa. Nova característica `_coverage.minComponentCells`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.8    | Agosto 2026 | Engenharia — V.tal Nexus | Novo REQ-MOD01-015 (Projetos de Trabalho): aba "Projetos" na doca de Locais, no espírito do painel "Salvos" do Google Maps — coleções de `GeographicSite` criadas exclusivamente para um recorte de trabalho, ocultas da árvore/busca/mapa geral (tabelas de plataforma `geo_project`/`geo_project_site`, não-TMF), com exclusão soft (`Retired`, C6) em cascata. A visão em Combos é removida — a árvore passa a ser o único modo de navegação hierárquica. Seções 20–24 renumeradas para 21–25.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.9    | Agosto 2026 | Engenharia — V.tal Nexus | Reposicionamento das faixas de escala do RF-004 (REQ-MOD01-011)/CA-002 (REQ-MOD01-014): cobertura GPON passa a ser visível de 50 m para cima (antes 100 m); a planta individual (recursos + cabos) só entra em 50 m, reduzida, e assume sozinha em ≤ 20 m, em tamanho cheio (antes ≤ 200 m, sem redução até 100 m). Legenda da cobertura troca "Indisponível" por "Suspenso" no extremo vermelho da rampa, alinhado ao rótulo PT-BR de `suspended` usado no resto do app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.10   | Agosto 2026 | Engenharia — V.tal Nexus | REQ-MOD01-015 (Projetos de Trabalho) revisado após uso real: (a) novo `geo_project.status` — o projeto vira a unidade de estado, e mudar seu status cascateia best-effort para os `GeographicSite` vinculados (RF-010/RN-007), removendo a edição de status por local (RN-006 corrigida); (b) o local de projeto passa a exigir um ID real do GEONET (busca ou reverse geocode reconsultado no GEONET) — RF-007 reescrito, novo RN-008 e coluna `geo_project_site.geonet_address_id`; (c) nova coluna `geo_project_site.note` para observação de trabalho por local; (d) o clique num local agora abre uma janela de consulta lado a lado com o painel do projeto (Street View, título/tipo editáveis, abas Visão geral/Endereço), estilo Salvos → Listas do Google Maps — novo RF-011; (e) correções de UX: botão de excluir local no hover da lista, selo de status na lista de projetos, redimensionamento do ícone do projeto por `contain` (não corta a imagem), tipo de local pré-selecionado ao reabrir um local salvo, e placeholder da busca da página trocado para "Pesquise no Nexus".                                                                                                                                                                                                                                                            |
| 1.11   | Agosto 2026 | Engenharia — V.tal Nexus | Novo REQ-MOD01-016 (Painel Unificado de Local): substitui os três/quatro fluxos divergentes de criação/edição de Site (`ProjectSitePanel` criação e consulta, `SiteDetailBody`, `GuidedSignupModal`) por um único `SitePanel`, com abas Visão Geral/Sub-locais/Recursos/Histórico — a aba Topologia sai da UI (RN-006), sem remover o dado. REQ-MOD01-015 revisado: (a) RF-010 corrigido — terminar o projeto agora **libera** os `GeographicSite` vinculados (`Active`, vida própria) em vez de encerrá-los (`Retired`); projeto terminado é imutável; (b) `PROJECT_SITE_EXCLUSION_SQL` só esconde local de projeto **em curso** — um Site liberado volta à Hierarquia/busca/mapa geral; (c) o vínculo `geo_project_site` passa a sobreviver ao término, sustentando a nova Origem do painel. Novas colunas `source_system`/`source_ref`/`accuracy_level` em `tmf_geographic_location`, `source_system`/`source_ref` em `tmf_geographic_address` e `note` em `tmf_geographic_site` (migrado de `geo_project_site.note`). Correção do RF-004 (REQ-MOD01-011): só CO/Estação é visível no mapa em qualquer escala — qualquer outro tipo de Site passa a seguir a régua de escala de um Recurso (`GeoTreeService.sitesInViewport`), corrigindo a poluição visual de Pontos de Instalação em escala de estado. Seções 21–25 renumeradas para 22–26.             |
| 1.12   | Agosto 2026 | Engenharia — V.tal Nexus | Correção de escala do REQ-MOD01-015 (issue #58): um projeto com dezenas de milhares de locais vinculados (carga em massa) nunca terminava de ser excluído — o laço um-a-um de `GeoService.transitionSite` (12 idas ao banco por local) não fechava a requisição antes de o cliente desistir, deixando o projeto pela metade. Novo `GeoService.transitionProjectSites` substitui o laço por operações em conjunto (`IGeoRepository.listBlockedSiteIds`/`bulkTransitionSites`); RF-009 e RN-005 revisados — local com dependência ativa fica de fora e o **projeto é mantido** (nunca apagado pela metade); novo RN-010 documenta o evento-resumo (TMF688) em vez de um evento por local, mesmo trade-off já aceito pelas cargas em massa. `DELETE /v1/geo/projects/:id` responde 200 com `{ deleted, retired, skipped, blocked, blockedSiteIds? }` em vez do antigo 204 silencioso; novo CA-011.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.13   | Agosto 2026 | Engenharia — V.tal Nexus | Novo REQ-MOD01-017 (Manchas de Concentração e Dispersão de Projeto): agrupamento espacial dos locais de um Projeto (REQ-MOD01-015) por proximidade (raio de 200 m, mesma técnica do REQ-MOD01-014) em manchas de concentração (≥ 5 locais, azul) e dispersão (< 5 locais, roxo — candidata a erro de coordenada/cadastro), geradas por `scripts/build-project-areas.mjs` e vinculadas ao projeto via `geo_project_area`. Com manchas geradas, o mapa passa a exibi-las em qualquer escala e só busca/desenha os locais individuais em ≤ 50 m (mesma régua da infra passiva do REQ-MOD01-011), por bbox — `GET /v1/geo/projects/:id/sites` ganha parâmetros `minLng/minLat/maxLng/maxLat`/`limit` e novo `GET /v1/geo/projects/:id/areas`; o painel de Projeto passa a mostrar `project.siteCount` (total real) em vez do tamanho da página carregada quando há manchas. Validado contra o projeto real "Onitel - Novo Gama" (3.514 locais, 3.321 com coordenada válida): 11 concentrações e 78 dispersões, expondo coordenadas cadastradas fora do Brasil entre as dispersões. Seções 22–26 renumeradas para 23–27.                                                                                                                                                                                                                                          |
| 1.14   | Agosto 2026 | Engenharia — V.tal Nexus | Novo RF-011/CA-008 do REQ-MOD01-011 (Controle de camadas do mapa): controle flutuante no canto superior direito do mapa, agrupado em Locais (Estações · Pontos e sub-locais), Cobertura GPON e Recursos (Caixas e equipamentos · Cabos e dutos) — `MapLayerControl`/`useMapLayers` no frontend, persistido em `localStorage`. Desligar uma camada corta a requisição, não só o desenho: `GET /v1/geo/tree/viewport` ganha o parâmetro `include` (`sites`\|`resource-points`\|`resource-lines`), consumido em `GeoTreeService.resourcesInViewport`/`sitesInViewport`; `GET /v1/geo/coverage` deixa de ser chamado com a camada de Cobertura desligada. Novo hook `useViewportInfra` substitui o fetch que antes vivia preso ao callback de `idle` do mapa — religar uma camada agora refaz a busca sem exigir pan/zoom. Item aberto no painel de detalhe permanece visível mesmo com a camada dele desligada.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1.15   | Agosto 2026 | Engenharia — V.tal Nexus | Correção do REQ-MOD01-015: clicar no pin de um local de Projeto no mapa não abria o painel de consulta — o roteamento do clique (`GeoPage.selectNodeFromMap`) checava um `Set` derivado só da página de 200 locais do painel, que não cobre os pins buscados por bbox quando o projeto tem manchas geradas (REQ-MOD01-017). Novo RF-012: o vínculo de projeto passa a ser carimbado no próprio nó (`ProjectSite.projectId`, `geoProjectApi.fetchProjectSites`) em vez de reconstruído por lista. Correção adjacente: `DetailTarget` (painel comum de Local) deixa de depender do catálogo `sites` (só specs "container", ver §2.3) para resolver o Site clicado — um Site de spec folha (Ponto de Instalação, Cabinet) ou o local de um projeto **terminado** clicado no mapa não abria painel nenhum; agora resolve por id via `useSiteDetail`, como o próprio `SitePanel` já fazia. Novo CA-012.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.16   | Agosto 2026 | Engenharia — V.tal Nexus | Novo RF-012 do REQ-MOD01-011 (Seleção de base cartográfica/MUB): quarta opção de basemap **Branco** (`styles` que zeram vias, água, POI e limite de lote, mantendo rótulo de município/bairro em cinza tênue) para as manchas de Cobertura GPON (REQ-MOD01-014) e de Projeto (REQ-MOD01-017) lerem sem competir com a cor do basemap; item **Geonet** listado com selo "em breve", ainda não selecionável. `BASE_MAP_LAYERS` (`MapBaseLayerSelector`) passa a carregar o `mapStyles` por opção, e o `GoogleMapInstance.setOptions` (novo em `googleMaps.ts`) aplica o estilo na troca — antes só `setMapTypeId` era chamado, insuficiente entre Mapa e Branco (os dois usam `roadmap`). Duplo clique no botão do MUB cicla direto para o próximo selecionável (wrap-around, pulando o Geonet), sem abrir a lista.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.17   | Agosto 2026 | Engenharia — V.tal Nexus | Painel de Projeto organizado em Locais, Infraestrutura, Recursos, Cobertura e Pesquisar. Vínculo histórico explícito para Resources, arquivamento terminal, paginação e busca combinada; Cobertura expõe Resources por mancha.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1.18   | Agosto 2026 | Engenharia — V.tal Nexus | Novo REQ-MOD01-018 (Papel do site e Sub-endereço): eixo funcional `siteRole` (`grouping\|network\|property\|service`) na `GeographicSiteSpecification`, ortogonal a `category` — Network Site/Property Site/Service Site em vez de tudo `category: 'Site'`. Novo `GeographicSubAddress` (TMF673) em `GeographicAddress`, para torre/bloco/andar/unidade de um MDU. `INSTALLATION_POINT` aposentado como site spec (`lifecycleStatus: Retired`, C6) — cadastro existente migrado para `CUSTOMER_SITE` via script dedicado. Grupo "Locais" do seletor de camadas do mapa (REQ-MOD01-011) reorganizado por `siteRole` em vez de categoria estrutural. Nova decisão canônica C11 em `business-rules.md`. Seções 23–27 renumeradas para 24–28.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.19   | Agosto 2026 | Engenharia — V.tal Nexus | Novo RF-013/CA-013 do REQ-MOD01-011 (Filtro de escopo da busca): ícone de filtro na barra de pesquisa abre 6 modos (Pesquisa geral · Apenas Endereço · Apenas Infraestrutura · Apenas Locais · Apenas CTOs · Apenas Cabos) — `GeoSearchBar`/`geoSearchScope.ts` no frontend, persistido em `localStorage`. `GET /v1/geo/tree/search` ganha `kinds`/`types`, consumidos por `GeoTreeService.search` antes do `LIMIT` (filtrar depois devolveria lista vazia nas buscas restritas); histórico ("Recentes") também filtrado pelo escopo ativo. Só o fundo do botão de filtro fica amarelo-claro fora do modo geral — a área de texto permanece branca. Dropdown de resultados/histórico passa a fechar em clique fora da barra, além de `Escape` (antes só fechava com o campo focado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1.20   | Agosto 2026 | Engenharia — V.tal Nexus | Fase 2 do issue #53 (consultas O(n²) de projetos e árvore de recursos): (a) RF-004 corrigido — `GeoTreeService.roots()` (fonte da Hierarquia) só traz `GeographicSite` de código `CO`/`POP`, não mais qualquer Site raiz de `category = 'Site'` (Cabinet, Installation Point, Customer Site, Condominium saem da árvore, seguem no mapa e na busca); UF/Município passam a ser agregados no banco (`listStationGroupCounts`), não mais trazidos inteiros para JS. `sitePathPrefix`/`pathTo` sobem `parent_site_id` até achar o ancestral CO/POP em vez de assumir que o Site do recurso já é a Estação. (b) `childrenOfSite`/`childrenOfResource` não materializam mais a fonte de recursos duas vezes por página (uma para contar, outra para as linhas) — `COUNT(*) OVER()` numa fonte magra (`siteResourceIdSource`, só id/entity_type), hidratada só para os ids da página (`hydrateSiteResourceRows`). (c) `GET /v1/geo/projects/:id/sites` passa a usar `GeoTreeService.projectSitePage` (um JOIN direto em `geo_project_site`, com `total` real do servidor) em vez do par `listSiteLinksPage`+`sitesByIds`; PATCH/DELETE de um local de projeto trocam `listSiteIds` (lista inteira) por `hasSiteLink` (checagem O(1)). Painel de Projeto ganha "Carregar mais" (mesmo padrão da Hierarquia) em vez de mostrar `sites.length` como se fosse o total. |
| 1.21   | Agosto 2026 | Engenharia — V.tal Nexus | Migração do backlog documental para GitHub Issues: questões pendentes e lacunas passam a ser rastreadas por issue, com labels `tipo:decisão`/`tipo:lacuna` e `mod:geo`. §27 aponta para o filtro de issues em vez de tabela local; a questão do catálogo de bootstrap foi resolvida como `D-GEO-003`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.22   | Agosto 2026 | Engenharia — V.tal Nexus | Fase 4 do issue [#171](https://github.com/niraldojunior/nexus/issues/171): consulta inversa de cobertura GPON — novo `coverageForPoint` em `GeoCoverageService` e rota `GET /v1/geo/coverage/by-resource/:id` (REQ-MOD01-014/RF-010), resolvendo o ponto do recurso via `GeoTreeService` e devolvendo célula fina + áreas (`neighborhood`/`city`/`uf`) que o contêm; 404 para recurso sem geometria de ponto. "Setor Censitário" (IBGE) fica fora do escopo — sem geometria própria no modelo hoje.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1.23   | Agosto 2026 | Engenharia — V.tal Nexus | Consolidação das Fases 3 e 4 do issue [#171](https://github.com/niraldojunior/nexus/issues/171): o painel de CTO incorpora a aba **Portas** com drill-down empilhado para portas de splitter materializadas; todo Resource com geometria `Point` incorpora a aba **Cobertura**, que consulta sob demanda a célula e as áreas da cobertura GPON. A UI preserva a fronteira canônica: cobertura continua Geographic read model (TMF675), não Resource ou Service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
