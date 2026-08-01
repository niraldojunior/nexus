# Backlog técnico

> Estado em julho de 2026. Este backlog registra capacidades de runtime ainda necessárias para aderência aos HLDs. A revisão documental não autoriza a implementação desses itens.

## 1. Convenções

- **Prioridade:** P0 bloqueia uma regra canônica ou contrato transversal; P1 completa comportamento funcional essencial; P2 amplia escala, operação ou experiência.
- **Estado:** `Concluído`, `Parcial`, `Pendente` ou `Superado`.
- **Origem:** o REQ é a chave global; RF e CA são os subitens do próprio requisito indicados na matriz de aderência do HLD.
- Um item só muda para `Concluído` quando o critério de aceite possui código e teste aprovado.

## 2. Geographic (`DEV-GEO-*`)

| ID | Prioridade | Estado | Origem REQ/RF/CA | Comportamento ausente | Contrato afetado | Dependência ou bloqueador | Evidência do estado atual | Critério de aceite testável |
|---|---|---|---|---|---|---|---|---|
| DEV-GEO-001 | P1 | Parcial | REQ-MOD01-001, seus RF/CA | Consultas por raio/interseção, índice espacial e export GeoJSON em escala. | TMF675 e repositório Geo | Q-ARQ-001 | `GeoService`, `IGeoRepository`, rotas TMF675 e `geo.unit.spec.ts` cobrem CRUD e geometrias básicas. | Testes de contrato comprovam raio/interseção corretos, paginação determinística e export válido para Point, LineString e Polygon. |
| DEV-GEO-002 | P1 | Parcial | REQ-MOD01-002, seus RF/CA | Sugestão, normalização e geocodificação de endereço via Geosite, com versionamento. | TMF673 e integração Geosite | Q-GEO-005 | CRUD TMF673 e vínculo Address→Location existem. | Teste integrado cria endereço a partir de sugestão, preserva a fonte e trata indisponibilidade sem criar registro parcial. |
| DEV-GEO-003 | P0 | Parcial | REQ-MOD01-003 e 009, seus RF/CA | Catálogo extensível de SiteSpecification, lifecycle e `allowedChildren` dinâmico. | TMF674 Catalog e validação de contenção | DEV-X-002, DEV-X-004 | Backend agora governa `code`, `lifecycleStatus`, bootstrap de 9 tipos, containment normalizado, impacto de mudança e ciclo ancestral; faltam somente RBAC/auditoria transacional e outbox produtivo. | Uma nova spec e sua regra pai/filho são criadas por API, aplicadas sem alteração de código, `allowedChildren` é resolvido em runtime e ciclo ancestral retorna 409. |
| DEV-GEO-004 | P1 | Parcial | REQ-MOD01-004–010, seus RF/CA | Hierarquia completa, classificações, filtros, transições, histórico, relações governadas e análise de impacto. | TMF674 Inventory e workspace Geo | Q-GEO-002, Q-GEO-004, Q-GEO-008, Q-GEO-010 | Árvore lazy, busca, relatedSite e eventos básicos estão em `GeoService` e no frontend Geo. | Suíte cobre ciclos, profundidade, filtros combinados, transições inválidas, inversos e impacto, com histórico auditável. |
| DEV-GEO-005 | P2 | Parcial | REQ-MOD01-011, seus RF/CA | Sincronização de coordenadas, camadas Geosite, proximidade e export PNG/GeoJSON. | `/v1/geo/tree/viewport` e `GeoPage` | Q-GEO-005, Q-GEO-007 | Mapa, árvore sincronizada, cluster e viewport por bbox/escala estão implementados. | E2E comprova seleção bidirecional árvore↔mapa, camadas, proximidade e export fiel ao viewport. |
| DEV-GEO-006 | P1 | Pendente | REQ-MOD01-002 e 006, seus RF/CA | Importação e alteração em massa com validação por item, idempotência e relatório. | TMF673/674 bulk proposto | DEV-X-001, DEV-X-002 | Não há contrato bulk no backend atual. | Lote misto produz resultado por item, não duplica retry idempotente e publica eventos apenas para commits efetivos. |
| DEV-GEO-007 | P1 | Pendente | REQ-MOD01-013, seus RF/CA | Digitalização e edição de geometria no navegador: desenho de LineString/Polygon, snap, split/merge, rascunho, import GeoJSON/WKT e auditoria da geometria anterior. | TMF675 e editor de mapa em `web/src` | Q-GEO-011, DEV-GEO-005 | `GeoPage` e `useGeoTree` exibem e posicionam features, mas nenhuma tela cria ou altera vértices de LineString/Polygon. | Traçar linha de duto com snap em duas caixas, salvar e reabrir com os mesmos vértices apenas no navegador; auto-interseção retorna 422; import GeoJSON devolve relatório por item. |

## 3. Resource (`DEV-RES-*`)

| ID | Prioridade | Estado | Origem REQ/RF/CA | Comportamento ausente | Contrato afetado | Dependência ou bloqueador | Evidência do estado atual | Critério de aceite testável |
|---|---|---|---|---|---|---|---|---|
| DEV-RES-001 | P0 | Parcial | REQ-MOD02-001–004, seus RF/CA | Lifecycle e governança completos de category, candidate, specification, characteristics, functions e fabricante PartyRef. | TMF634 e catálogo TMF664 | Q-RES-001, DEV-X-004 | CRUD principal TMF634/664, bootstrap, UI e testes existem; ResourceCategory é somente leitura. | Testes de API governam publicação/versionamento e permitem extensão sem hardcode, auditada por tenant. |
| DEV-RES-002 | P1 | Parcial | REQ-MOD02-005–011, seus RF/CA | Bulk, histórico e invariantes especializadas de OSP, lifecycle e características validadas. | TMF639 Physical/LogicalResource | Q-RES-007, DEV-RES-006 | CRUD, filtros, paginação, workspace e relações genéricas estão ativos. | Suíte cria e valida poste, duto, CTO, splitter, cabo, fiber e splice; rejeita capacidade, continuidade e transições inválidas. |
| DEV-RES-003 | P0 | Pendente | REQ-MOD02-012, seus RF/CA | Path computation ponta a ponta, métricas ópticas, raiz comum, cache e visualização. | Endpoint de path proposto; nenhum endpoint está publicado | Q-RES-004, Q-RES-010, DEV-X-005 | Não existe rota ou serviço de path computation. | Grafo de teste OLT→ONT retorna caminho ordenado e métricas; ruptura, ciclo e cache invalidado possuem casos aprovados. |
| DEV-RES-004 | P1 | Parcial | REQ-MOD02-013–019, seus RF/CA | Rack elevation, slots, cards, ports, energia, conexões e front/rear port com restrições físicas. | TMF639 Inside Plant | MOD05, Q-RES-011, DEV-RES-006 | Resources e relações genéricas representam os objetos, sem invariantes dedicadas. | E2E instala equipamento em U livre, conecta portas/energia e rejeita colisão, incompatibilidade e sobrecapacidade. |
| DEV-RES-005 | P1 | Parcial | REQ-MOD02-020–023, seus RF/CA | IPAM, VRF/RT, VLAN, ASN e MPLS Label com pools, unicidade e alocação concorrente. | TMF639 LogicalResource | Q-RES-008 | O inventário lógico e a UI persistem tipos genéricos. | Testes concorrentes impedem sobreposição/duplicidade e comprovam allocate, reserve, release e consultas por escopo. |
| DEV-RES-006 | P0 | Pendente | REQ-MOD02-007, 018 e 024, seus RF/CA | Bootstrap + CRUD de RelationshipType, inversos, simetria, cardinalidade, audit e validação em writes. | ResourceRelationshipType e TMF639 | Q-RES-012, DEV-X-002 | `ResourceService` aceita string livre e o catálogo persistido não possui API de governança. | Tipo criado por API passa a validar relações; tipo inválido falha; inverso/evento/auditoria são comprovados por testes. |
| DEV-RES-007 | P0 | Pendente | REQ-MOD02-026, seus RF/CA | Infraestrutura subterrânea modelada como banco de dutos, duto e sub-duto, com endpoints A/Z em estruturas reais, ocupação derivada e consulta de cabos por trecho. | TMF639 Outside Plant e contenção de recursos | Q-RES-014, DEV-RES-002, DEV-RES-006 | `REQ-MOD02-008` trata duto como recurso plano com `capacity_cables` e `cables_installed` digitados; não há contenção banco→duto→sub-duto nem endpoints. | Banco de 4 vias entre duas caixas aceita 2 cabos, deriva o trecho A↔Z sem entidade intermediária, rejeita duto sem endpoint (422) e 5º cabo em duto de 4 vias (409). |
| DEV-RES-008 | P1 | Pendente | REQ-MOD02-027, seus RF/CA | Motor de integridade e completude: catálogo de regras por API, varredura agendada e sob demanda, findings com ciclo de vida, score por Região/Site e evento em severidade alta. | TMF639, TMF688 e relatórios operacionais | DEV-X-002, DEV-RES-007 | Validações existentes atuam apenas no write; base carregada por script não é varrida por nenhuma rotina. | Massa com duto sem endpoint Z gera finding de severidade alta com evento; score cai e se recupera após correção; regra criada por API vale no scan seguinte sem release. |
| DEV-RES-009 | P1 | Pendente | REQ-MOD02-028, seus RF/CA | Materialização de filhos a partir da Specification em uma transação, com pré-visualização, nomenclatura configurável e import em massa idempotente. | TMF634 Specification e TMF639 Inventory | DEV-RES-001, DEV-RES-002 | Criar uma CTO completa exige 10 chamadas sequenciais; `childTemplate` não existe na Specification. | POST único cria CTO-16P com splitter e 16 portas nomeadas idêntico ao caminho manual; falha em filho não persiste nada; retry de import de 500 itens não duplica. |

## 4. Service (`DEV-SVC-*`)

| ID | Prioridade | Estado | Origem REQ/RF/CA | Comportamento ausente | Contrato afetado | Dependência ou bloqueador | Evidência do estado atual | Critério de aceite testável |
|---|---|---|---|---|---|---|---|---|
| DEV-SVC-001 | P0 | Parcial | REQ-MOD03-001–003, seus RF/CA | Lifecycle/versionamento, regras de publicação, characteristics e visibilidade por tenant no catálogo. | TMF633 | Q-SVC-001, DEV-X-004 | CRUD de specification, category e candidate, filtros, UI e testes estão ativos. | Catálogo versionado publica somente candidate válido, aplica tenant e rejeita characteristics fora da spec. |
| DEV-SVC-002 | P1 | Parcial | REQ-MOD03-004, 005 e 010, seus RF/CA | Bulk, `fields`, histórico semântico, transições/razões e papéis A/Z/re-home. | TMF638 e workspace Service | DEV-X-001, DEV-X-002 | CRUD, filtros, paginação, workspace, UI e eventos básicos existem. | Testes de contrato cobrem bulk idempotente, projeção, histórico, transições e alteração geográfica sem vínculo órfão. |
| DEV-SVC-003 | P0 | Parcial | REQ-MOD03-006 e 011, seus RF/CA | SubscriberID Nexus-native com autoridade, faixa, unicidade, tenant e reconciliação legado. | TMF638 CFS e Party/Tenant | Q-SVC-002, MOD06 | CFS exige SubscriberID, mas recebe valor externo sem geração/governança nativa. | Criação concorrente nunca duplica ID; tenant e `_origin` ficam rastreáveis; reconciliação detecta conflito. |
| DEV-SVC-004 | P0 | Parcial | REQ-MOD03-005 e 007–009, seus RF/CA | Invariantes CFS/RFS, capacidade/compartilhamento, ciclos, impacto reverso e propagação de estado. | TMF638, TMF688 e Resource Inventory | Q-SVC-004, Q-SVC-006, Q-SVC-007, MOD05 | O código exige CFS→RFS→Resource e proíbe Resource direto no CFS. | Suíte rejeita ciclo e referência inválida, calcula impacto Resource→RFS→CFS e aplica a política de estado aprovada. |
| DEV-SVC-005 | P1 | Parcial | REQ-MOD03-012–014, seus RF/CA | Specs, características e cenários completos para Bitstream GPON, EILD/L2/L3VPN e CloudVoIP. | TMF633/638 e contratos de produto | Q-SVC-001, Q-SVC-004, Q-SVC-005 | O modelo genérico e a UI representam os três cenários, sem aceite end-to-end canônico. | Fixtures e E2E criam cada produto com CFS/RFS/Resource/place/Party corretos e validam SLA/bundle/perfis. |
| DEV-SVC-006 | P0 | Pendente | REQ-MOD03-015, seus RF/CA | Bootstrap + CRUD de RelationshipType, inversos, audit, eventos e validação de serviceRelationship. | TMF638 ServiceRelationshipType | Q-SVC-005, DEV-X-002 | `ServiceService` aceita string livre e não consulta catálogo governado. | Tipo criado por API controla writes; inválido falha; inverso, audit e evento têm testes aprovados. |

## 5. Transversal (`DEV-X-*`)

| ID | Prioridade | Estado | Origem REQ/RF/CA | Comportamento ausente | Contrato afetado | Dependência ou bloqueador | Evidência do estado atual | Critério de aceite testável |
|---|---|---|---|---|---|---|---|---|
| DEV-X-001 | P0 | Pendente | C5; REQ-MOD01-001, MOD02-001/005, MOD03-001/004 e seus RF/CA | UUID v7 Nexus-native e grupo `_origin` somente-leitura, pesquisável e auditável. | IDs e characteristics de Geo/Resource/Service | Estratégia de migração | IDs atuais não garantem v7 e `_origin` não possui política transversal implementada. | Testes verificam ordenação temporal v7, importação idempotente e PATCH 403 em `_origin` fora de `MigrationJob`. |
| DEV-X-002 | P0 | Parcial | C7; REQ-MOD01-012, MOD02-025, MOD03-016 e seus RF/CA | Outbox transacional, relay, Schema Registry, idempotência, DLQ e reprocessamento. | TMF688 transversal | Q-GEO-008; infraestrutura de eventos | `tmf_event` registra e expõe eventos, mas não há outbox/registry/DLQ. | Teste de falha entre commit e publicação não perde evento; retry não duplica; schema incompatível e DLQ são exercitados. |
| DEV-X-003 | P0 | Parcial | C9; REQ-MOD01-010, seus RF/CA | Catálogo transversal e governado de RelationshipTypes, inclusive Geographic. | Geo/Resource/Service relationships | Q-GEO-004, DEV-RES-006, DEV-SVC-006 | Relações Geo possuem operações, porém os tipos não são administrados por contrato comum. | Bootstrap e CRUD auditado validam tipo, inverso, simetria e cardinalidade nos três módulos. |
| DEV-X-004 | P0 | Parcial | C8; REQ-MOD02-001/004 e MOD03-002/003/006, seus RF/CA | Isolamento por tenant, RBAC, auditoria e `relatedParty` obrigatório nos writes aplicáveis. | HTTP, persistência e segurança | MOD06/MOD08 | Party lookup existe, mas a autorização/segregação não cobre todos os contratos. | Testes de segurança impedem leitura/write cross-tenant, exigem role e registram ator, tenant e alteração. |
| DEV-X-005 | P1 | Pendente | C10; REQ-MOD02-012, seus RF/CA | Adapter Oracle e Property Graph para path computation, mantendo domínio portável. | Persistência Resource e graph | Q-ARQ-001, Q-RES-004 | Runtime atual usa Neon Postgres; Oracle é arquitetura-alvo. | Testes de contrato rodam nos adapters aprovados e benchmark atende ao SLO de path sem mudar o domínio. |

## 6. Reconciliação do backlog anterior

| Item anterior | Estado | Destino ou justificativa |
|---|---|---|
| P0-001 — alinhar system design ao cânone | Concluído | `docs/3-system-design/` já registra Oracle como alvo e Neon Postgres como estado atual. |
| P0-002 — contrato transversal de eventos | Parcial | Consolidado em DEV-X-002. |
| P0-003 — modelo físico Oracle | Pendente | Consolidado em DEV-X-005 e no plano de dados. |
| P0-004 / P1-001 — SQLite local e suíte dupla | Superado | O baseline atual é Neon Postgres; portabilidade futura permanece em DEV-X-005. |
| P0-006 — pipeline `_origin` | Pendente | Consolidado em DEV-X-001. |
| P0-007 / P0-008 — bootstraps Geo/Resource | Parcial | Consolidados em DEV-GEO-003 e DEV-RES-001. |
| P0-009 — RBAC/audit | Pendente | Consolidado em DEV-X-004. |
| P0-010 — SLOs | Parcial | Mantido em `non-functional-requirements.md`; critérios específicos aparecem nos DEV afetados. |
| P0-011 — Geosite Logradouros | Pendente | Consolidado em DEV-GEO-002. |
| P0-012 / P1-009 — Property Graph e cache | Pendente | Consolidados em DEV-RES-003 e DEV-X-005. |
| P1-002–P1-006 — decisões Geographic | Parcial | Questões seguem no registro central; implementação em DEV-GEO-002–005. |
| P1-007–P1-010 — decisões Resource | Parcial | Questões seguem no registro central; implementação em DEV-RES-002–005. |
| P1-011–P1-015 — decisões Service | Parcial | Questões seguem no registro central; implementação em DEV-SVC-001–005. |
| P2-001 — preencher business rules | Concluído | C1–C10 estão centralizadas em `business-rules.md`. |
| P2-002 — preencher glossário | Concluído | Glossário canônico está preenchido. |
| P2-003 — corrigir status do MOD03 | Concluído | Overview distingue base implementada de aderência completa. |
| P1-016 / P2-004 — design system | Parcial | A UI de produção é `web/src`; dívida visual permanece fora dos HLDs de domínio. |
| P0-005, P2-005–P2-007 | Pendente | Permanecem nos planos dos módulos/plataforma correspondentes; não são gaps exclusivos dos 53 requisitos. |

## 7. Pontos de controle transversais

| Ponto de controle | Aplicação | Backlog |
|---|---|---|
| Catálogo extensível | Specifications, Characteristics e RelationshipTypes | DEV-GEO-003, DEV-RES-001/006, DEV-SVC-001/006, DEV-X-003 |
| Eventos/outbox | Geo, Resource, Service e módulos futuros | DEV-X-002 |
| Identidade e proveniência | Entidades e catálogos importados | DEV-X-001 |
| RBAC, Audit e multi-tenancy | Todos os writes | DEV-X-004 |
| Persistência e grafo alvo | Oracle e Property Graph | DEV-X-005, DEV-RES-003 |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
