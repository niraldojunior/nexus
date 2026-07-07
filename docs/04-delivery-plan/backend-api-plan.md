# Plano De APIs Do Backend

> Base documental: `AGENTS.md`, `docs/01-functional-specs/01-modulo-geo.md`, `docs/01-functional-specs/02-modulo-resource.md`, `docs/01-functional-specs/03-modulo-service.md`, `docs/02-system-design/*`, `docs/04-delivery-plan/*` e o estado atual do backend em `src/shared/http/app.ts`, `src/shared/persistence/sqlite-database.ts` e `src/modules/geo/*`.


Atualizacao de status: em 07/07/2026, o backend local ja expoe Geo, Party, Resource, Service, TMF645, TMF641, TMF652 e TMF688 com persistencia SQLite e testes de integracao.

Este plano organiza a entrega das APIs do backend do V.tal Nexus em uma sequÃªncia implementÃ¡vel, preservando o cÃƒÂ¢none TMF-first, as fronteiras Geo/Resource/Service e o modelo de persistÃƒÂªncia local em SQLite como adapter de desenvolvimento.

O objetivo nÃƒÂ£o ÃƒÂ© inventar um backend paralelo. Ãƒâ€° transformar o que jÃƒÂ¡ estÃƒÂ¡ no repositÃƒÂ³rio em um conjunto de contratos HTTP, repositÃƒÂ³rios, eventos e testes que permita evoluir do estado atual para os mÃƒÂ³dulos canÃƒÂ´nicos do Nexus.

## 2. Estado Atual Do Backend

| Componente | SituaÃƒÂ§ÃƒÂ£o atual | Leitura tÃƒÂ©cnica |
|---|---|---|
| HTTP entrypoint | `src/shared/http/app.ts` centraliza as rotas | O backend ainda estÃƒÂ¡ concentrado em um roteador ÃƒÂºnico, com Geo jÃƒÂ¡ exposto em `/tmf-api/...` e rotas legadas `v1`. |
| MÃƒÂ³dulo Geo | Implementado em `src/modules/geo/*` | Serve como referÃƒÂªncia de padrÃƒÂ£o para serviÃƒÂ§os, repositÃƒÂ³rios e contratos TMF no backend. |
| PersistÃƒÂªncia | SQLite inicializada em `src/shared/persistence/sqlite-database.ts` | O schema jÃƒÂ¡ antecipa Resource, Service e Event, mas parte das APIs ainda nÃƒÂ£o existe. |
| Event store | Tabela `tmf_event` criada | HÃƒÂ¡ base fÃƒÂ­sica para TMF688, mas ainda falta a API pÃƒÂºblica compartilhada. |
| Resource / Service / Party / Order | Implementados em `src/modules/*` | Os contratos canonicos ja existem no backend local, incluindo TMF645, TMF641 e TMF652, com eventos e testes. |

## 3. PrincÃƒÂ­pios De ImplementaÃƒÂ§ÃƒÂ£o

| ID | PrincÃƒÂ­pio | Regra prÃƒÂ¡tica |
|---|---|---|
| P-01 | TMF-first | Todo payload e entidade seguem o modelo canÃƒÂ´nico TMF; extensÃƒÂµes V.tal entram como `characteristic`. |
| P-02 | Fronteiras canÃƒÂ´nicas | Geo referencia Resource via `place`; Service referencia Resource via `supportingResource`; CFS nÃƒÂ£o referencia Resource diretamente. |
| P-03 | Event-driven | Toda escrita relevante publica evento TMF688 via outbox ou mecanismo equivalente. |
| P-04 | Soft-delete / soft-terminate | Nada ÃƒÂ© removido fisicamente se a entidade for auditÃƒÂ¡vel. |
| P-05 | `_origin` read-only | IDs legados sÃƒÂ£o preservados apenas como proveniÃƒÂªncia. |
| P-06 | CatÃƒÂ¡logos extensÃƒÂ­veis | Specs, RelationshipTypes e similares precisam nascer com bootstrap e CRUD governado. |
| P-07 | Party antes de Service | `relatedParty` ÃƒÂ© transversal; Party/Tenant deve existir antes de fechar Resource e Service. |
| P-08 | Order fica por ÃƒÂºltimo | TMF645 / TMF641 / TMF652 dependem de Geo, Resource, Service e Party estabilizados. |

## 4. SequÃƒÂªncia Recomendada

### 4.1 Foundation Compartilhada

| Ordem | Entrega | Resultado esperado |
|---|---|---|
| 1 | Criar tipos comuns em `src/shared/tmf/` | `TimePeriod`, `Characteristic`, `RelatedParty`, `EntityRef`, paginaÃƒÂ§ÃƒÂ£o, filtros e envelopes de evento. |
| 2 | Criar `EventService` e `SqliteEventRepository` | A tabela `tmf_event` passa a ter API pÃƒÂºblica e consulta canÃƒÂ´nica. |
| 3 | Padronizar helpers HTTP | `GET list`, `GET by id`, `POST`, `PATCH`, `DELETE` lÃƒÂ³gico e resoluÃƒÂ§ÃƒÂ£o de aliases `/tmf-api/...`. |
| 4 | Extrair roteamento por mÃƒÂ³dulo | `app.ts` deixa de concentrar regras de domÃƒÂ­nio e passa a orquestrar handlers. |

### 4.2 Party Primeiro

| Ordem | API | Entrega mÃƒÂ­nima |
|---|---|---|
| 1 | TMF632 Party Management | `Individual`, `Organization`, `PartyRef`, CRUD, lookup por documento/nome, soft-delete lÃƒÂ³gico. |
| 2 | TMF669 Party Role | `tenant`, `subscriber`, `owner`, `manufacturer`, `vendor`, `provider`. |
| 3 | PersistÃƒÂªncia | Tabelas `tmf_party`, `tmf_party_role`, `tmf_party_relationship`. |
| 4 | Eventos | `PartyCreateEvent`, `PartyAttributeValueChangeEvent`, `PartyRoleCreateEvent`. |

### 4.3 Resource Domain

| Ordem | API | Entrega mÃƒÂ­nima |
|---|---|---|
| 1 | TMF634 Resource Catalog | `ResourceSpecification`, `ResourceFunctionSpecification`, `ResourceCategory` se necessÃƒÂ¡rio. |
| 2 | TMF639 Resource Inventory | `PhysicalResource`, `LogicalResource`, `resourceRelationship`, `place` e `relatedParty`. |
| 3 | TMF664 Resource Function Activation | Registrar solicitaÃƒÂ§ÃƒÂ£o de ativaÃƒÂ§ÃƒÂ£o, mudar estado operacional e emitir evento. |
| 4 | PersistÃƒÂªncia | ReforÃƒÂ§ar tabelas de Resource, relaÃƒÂ§ÃƒÂµes e chaves de referÃƒÂªncia a Geo/Party. |

### 4.4 Service Domain

| Ordem | API | Entrega mÃƒÂ­nima |
|---|---|---|
| 1 | TMF633 Service Catalog | `ServiceSpecification`, `ServiceCategory`, `ServiceCandidate`. |
| 2 | TMF638 Service Inventory | `CustomerFacingService`, `ResourceFacingService`, `supportingResource`, `supportingService`, `serviceRelationship`, `relatedParty`. |
| 3 | Regras de fronteira | CFS usa `supportingService`; RFS usa `supportingResource`; CFS nunca referencia Resource diretamente. |
| 4 | PersistÃƒÂªncia | Ajustar o schema para expor `/service` unificado com `@type`. |

### 4.5 Order E Qualification

| Ordem | API | Entrega mÃƒÂ­nima |
|---|---|---|
| 1 | TMF645 Service Qualification | Consulta viabilidade por `GeographicAddress` ou coordenada; nÃƒÂ£o cria Service. |
| 2 | TMF641 Service Ordering | Cria ordem, referencia `serviceOrderItem` e pode criar/alterar Service ao concluir. |
| 3 | TMF652 Resource Order | Reserva/alocacao simples de Resource, com create/modify/delete via `resourceOrderItem`. |
| 4 | PersistÃƒÂªncia | Tabelas `tmf_service_qualification`, `tmf_service_order`, `tmf_resource_order` e itens de ordem. |

### 4.6 Process, Document E Analytics

| Ordem | API | Entrega mÃƒÂ­nima |
|---|---|---|
| 1 | TMF701 Process Flow | `ProcessFlow`, `ProcessFlowStep`, estados `acknowledged`, `inProgress`, `completed`, `failed`, `cancelled`. |
| 2 | TMF724 Document Management | Metadados de documento, vÃƒÂ­nculo com entidades e URL/armazenamento local no MVP. |
| 3 | TMF688 Event Management completo | Consolida eventos de Geo, Party, Resource, Service, Order e Process em uma API canÃƒÂ´nica. |

## 5. Mapa De APIs Por DomÃƒÂ­nio

| DomÃƒÂ­nio | Open API TMF | Rotas canÃƒÂ´nicas |
|---|---|---|
| Geo | TMF673 / TMF674 / TMF675 | `/tmf-api/geographicAddressManagement/v4/geographicAddress`, `/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification`, `/tmf-api/geographicSiteManagement/v4/geographicSite`, `/tmf-api/geographicLocationManagement/v4/geographicLocation` |
| Event | TMF688 | `/tmf-api/eventManagement/v4/event` |
| Party | TMF632 | `/tmf-api/partyManagement/v4/party` |
| Party Role | TMF669 | `/tmf-api/partyRoleManagement/v4/partyRole` |
| Resource Catalog | TMF634 | `/tmf-api/resourceCatalogManagement/v4/resourceSpecification`, `/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification` |
| Resource Inventory | TMF639 | `/tmf-api/resourceInventoryManagement/v4/resource` |
| Resource Activation | TMF664 | `/tmf-api/resourceFunctionActivation/v4/resourceFunction` |
| Service Catalog | TMF633 | `/tmf-api/serviceCatalogManagement/v4/serviceSpecification`, `/tmf-api/serviceCatalogManagement/v4/serviceCategory`, `/tmf-api/serviceCatalogManagement/v4/serviceCandidate` |
| Service Inventory | TMF638 | `/tmf-api/serviceInventoryManagement/v4/service` |
| Service Qualification | TMF645 | `/tmf-api/serviceQualificationManagement/v4/serviceQualification` |
| Service Ordering | TMF641 | `/tmf-api/serviceOrderingManagement/v4/serviceOrder` |
| Resource Ordering | TMF652 | `/tmf-api/resourceOrderingManagement/v4/resourceOrder` |
| Process Flow | TMF701 | `/tmf-api/processFlowManagement/v4/processFlow` |
| Document | TMF724 | `/tmf-api/documentManagement/v4/document` |

## 6. Modelo De Dados MÃƒÂ­nimo Por Etapa

### 6.1 Tabelas JÃƒÂ¡ Preparadas

| Tabela | Uso |
|---|---|
| `tmf_geographic_location` | Base geoespacial do MÃƒÂ³dulo 1. |
| `tmf_geographic_address` | EndereÃƒÂ§o canÃƒÂ´nico e referÃƒÂªncia de viabilidade. |
| `tmf_geographic_site_specification` | CatÃƒÂ¡logo de tipos de site. |
| `tmf_geographic_site` | Site e sub-site. |
| `tmf_resource_specification` | CatÃƒÂ¡logo de Resource. |
| `tmf_physical_resource` | InventÃƒÂ¡rio fÃƒÂ­sico. |
| `tmf_logical_resource` | InventÃƒÂ¡rio lÃƒÂ³gico. |
| `tmf_service_specification` | CatÃƒÂ¡logo de Service. |
| `tmf_customer_facing_service` | InventÃƒÂ¡rio CFS. |
| `tmf_resource_facing_service` | InventÃƒÂ¡rio RFS. |
| `tmf_event` | Event store transversal. |

### 6.2 Tabelas A Adicionar

| Etapa | Tabelas novas |
|---|---|
| Party | `tmf_party`, `tmf_party_role`, `tmf_party_relationship` |
| Orders | `tmf_service_qualification`, `tmf_service_order`, `tmf_resource_order` |
| Process | `tmf_process_flow`, `tmf_process_flow_step` |
| Document | `tmf_document` |

## 7. Regras Transversais De API

| Regra | Diretriz |
|---|---|
| Listagem | Todas as APIs de inventÃƒÂ¡rio precisam suportar lista, filtro bÃƒÂ¡sico e paginaÃƒÂ§ÃƒÂ£o. |
| Busca | Party, Resource e Service precisam de lookup por identificadores de negÃƒÂ³cio relevantes. |
| Resposta | `@type` e `@referredType` devem aparecer sempre que o contrato TMF exigir referÃƒÂªncia. |
| Erro | Erros devem manter cÃƒÂ³digo e mensagem consistentes com a exceÃƒÂ§ÃƒÂ£o de domÃƒÂ­nio. |
| Escrita | `POST`, `PATCH` e `DELETE` lÃƒÂ³gico precisam publicar evento. |
| ProveniÃƒÂªncia | `_origin` entra como `characteristic` somente leitura, nunca como campo hardcoded. |
| RelaÃƒÂ§ÃƒÂµes | `relatedParty`, `supportingResource`, `supportingService` e `place` sÃƒÂ£o referÃƒÂªncias canÃƒÂ´nicas, nÃƒÂ£o cÃƒÂ³pias. |

## 8. CritÃƒÂ©rios De Pronto

| CritÃƒÂ©rio | Resultado esperado |
|---|---|
| Contrato HTTP | Cada API tem CRUD canÃƒÂ´nico e rotas `/tmf-api/...` estÃƒÂ¡veis. |
| PersistÃƒÂªncia | Existe adapter SQLite com repositÃƒÂ³rios e migraÃƒÂ§ÃƒÂµes para todos os domÃƒÂ­nios da fase. |
| Eventos | Toda escrita relevante produz evento TMF688 persistido no event store. |
| Testes | Cada mÃƒÂ³dulo possui `service.spec.ts`, `sqlite-repository.spec.ts` e `integration.spec.ts`. |
| Fronteiras | Geo, Resource, Service, Party e Order respeitam as fronteiras canÃƒÂ´nicas do Nexus. |
| QualificaÃƒÂ§ÃƒÂ£o | TMF645 nÃƒÂ£o cria Service e nÃƒÂ£o contamina o inventÃƒÂ¡rio com Home Passed. |

## 9. SequÃƒÂªncia Operacional Recomendada

| Ordem | Entrega | DependÃƒÂªncia crÃƒÂ­tica |
|---|---|---|
| 1 | Foundation TMF compartilhada + TMF688 | Base para todo o restante. |
| 2 | Party / PartyRole | Habilita `relatedParty` transversal. |
| 3 | Resource Catalog + Resource Inventory + Activation | Fecha a camada "o quÃƒÂª". |
| 4 | Service Catalog + Service Inventory | Fecha a camada "para quÃƒÂª / quem". |
| 5 | Service Qualification + Service Ordering + Resource Ordering | Introduz viabilidade e fulfillment. |
| 6 | Process Flow + Document Management | Completa orquestraÃƒÂ§ÃƒÂ£o e metadata. |
| 7 | ConsolidaÃƒÂ§ÃƒÂ£o de eventos e refino de contrato | Fechamento de governanÃƒÂ§a e observabilidade. |

## 10. Riscos Principais

| Risco | Impacto | MitigaÃƒÂ§ÃƒÂ£o |
|---|---|---|
| Implementar Service antes de Party | `relatedParty` fica inconsistente e quebra a fronteira multi-tenant. | Tratar Party como foundational antes de Service. |
| Pular TMF688 compartilhado | Eventos ficam fragmentados por mÃƒÂ³dulo. | Centralizar event store, contrato e helpers antes de ampliar domÃƒÂ­nios. |
| Misturar HP com Service | Viola C4 e polui o inventÃƒÂ¡rio. | Reservar viabilidade para TMF645/Order. |
| Deixar `app.ts` crescer | O roteador central vira gargalo de manutenÃƒÂ§ÃƒÂ£o. | Migrar para handlers por mÃƒÂ³dulo com um dispatcher fino. |
| Modelar listas fechadas | CatÃƒÂ¡logos ficam presos em cÃƒÂ³digo. | Governar specs, roles e relationship types via API. |

## 11. Resultado Esperado

Ao final desta sequÃƒÂªncia, o backend passa a expor o nÃƒÂºcleo canÃƒÂ´nico do Nexus:

- Geo como base de `place`.
- Party como fonte de `relatedParty`.
- Resource como "o que existe".
- Service como "para quÃƒÂª / quem existe".
- Order como orquestraÃƒÂ§ÃƒÂ£o de criaÃƒÂ§ÃƒÂ£o e alteraÃƒÂ§ÃƒÂ£o.
- Event Management como trilha transversal de integraÃƒÂ§ÃƒÂ£o e auditoria.

Esse desenho preserva o que jÃƒÂ¡ existe no repositÃƒÂ³rio e fecha a evoluÃƒÂ§ÃƒÂ£o do backend sem quebrar as fronteiras do modelo.

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÃƒÅ¡BLICA*

