# Plano De APIs Do Backend

> Base documental: `AGENTS.md`, `docs/2-functional-specs/01-module-geo.md`, `docs/2-functional-specs/02-module-resource.md`, `docs/2-functional-specs/03-module-service.md`, `docs/3-system-design/*`, `docs/5-delivery-plan/*` e o estado atual do backend em `src/shared/http/app.ts`, `src/shared/persistence/sqlite-database.ts` e `src/modules/geo/*`.


Atualizacao de status: em 07/07/2026, o backend local ja expoe Geo, Party, Resource, Service, TMF645, TMF641, TMF652 e TMF688 com persistencia SQLite e testes de integracao.

Este plano organiza a entrega das APIs do backend do V.tal Nexus em uma sequência implementável, preservando o cânone TMF-first, as fronteiras Geo/Resource/Service e o modelo de persistência local em SQLite como adapter de desenvolvimento.

O objetivo não é inventar um backend paralelo. É transformar o que já está no repositório em um conjunto de contratos HTTP, repositórios, eventos e testes que permita evoluir do estado atual para os módulos canônicos do Nexus.

## 2. Estado Atual Do Backend

| Componente | Situação atual | Leitura técnica |
|---|---|---|
| HTTP entrypoint | `src/shared/http/app.ts` centraliza as rotas | O backend ainda está concentrado em um roteador único, com Geo já exposto em `/tmf-api/...` e rotas legadas `v1`. |
| Módulo Geo | Implementado em `src/modules/geo/*` | Serve como referência de padrão para serviços, repositórios e contratos TMF no backend. |
| Persistência | SQLite inicializada em `src/shared/persistence/sqlite-database.ts` | O schema já antecipa Resource, Service e Event, mas parte das APIs ainda não existe. |
| Event store | Tabela `tmf_event` criada | Há base física para TMF688, mas ainda falta a API pública compartilhada. |
| Resource / Service / Party / Order | Implementados em `src/modules/*` | Os contratos canonicos ja existem no backend local, incluindo TMF645, TMF641 e TMF652, com eventos e testes. |

## 3. Princípios De Implementação

| ID | Princípio | Regra prática |
|---|---|---|
| P-01 | TMF-first | Todo payload e entidade seguem o modelo canônico TMF; extensões V.tal entram como `characteristic`. |
| P-02 | Fronteiras canônicas | Geo referencia Resource via `place`; Service referencia Resource via `supportingResource`; CFS não referencia Resource diretamente. |
| P-03 | Event-driven | Toda escrita relevante publica evento TMF688 via outbox ou mecanismo equivalente. |
| P-04 | Soft-delete / soft-terminate | Nada é removido fisicamente se a entidade for auditável. |
| P-05 | `_origin` read-only | IDs legados são preservados apenas como proveniência. |
| P-06 | Catálogos extensíveis | Specs, RelationshipTypes e similares precisam nascer com bootstrap e CRUD governado. |
| P-07 | Party antes de Service | `relatedParty` é transversal; Party/Tenant deve existir antes de fechar Resource e Service. |
| P-08 | Order fica por último | TMF645 / TMF641 / TMF652 dependem de Geo, Resource, Service e Party estabilizados. |

## 4. Sequência Recomendada

### 4.1 Foundation Compartilhada

| Ordem | Entrega | Resultado esperado |
|---|---|---|
| 1 | Criar tipos comuns em `src/shared/tmf/` | `TimePeriod`, `Characteristic`, `RelatedParty`, `EntityRef`, paginação, filtros e envelopes de evento. |
| 2 | Criar `EventService` e `SqliteEventRepository` | A tabela `tmf_event` passa a ter API pública e consulta canônica. |
| 3 | Padronizar helpers HTTP | `GET list`, `GET by id`, `POST`, `PATCH`, `DELETE` lógico e resolução de aliases `/tmf-api/...`. |
| 4 | Extrair roteamento por módulo | `app.ts` deixa de concentrar regras de domínio e passa a orquestrar handlers. |

### 4.2 Party Primeiro

| Ordem | API | Entrega mínima |
|---|---|---|
| 1 | TMF632 Party Management | `Individual`, `Organization`, `PartyRef`, CRUD, lookup por documento/nome, soft-delete lógico. |
| 2 | TMF669 Party Role | `tenant`, `subscriber`, `owner`, `manufacturer`, `vendor`, `provider`. |
| 3 | Persistência | Tabelas `tmf_party`, `tmf_party_role`, `tmf_party_relationship`. |
| 4 | Eventos | `PartyCreateEvent`, `PartyAttributeValueChangeEvent`, `PartyRoleCreateEvent`. |

### 4.3 Resource Domain

| Ordem | API | Entrega mínima |
|---|---|---|
| 1 | TMF634 Resource Catalog | `ResourceSpecification`, `ResourceFunctionSpecification`, `ResourceCategory` se necessário. |
| 2 | TMF639 Resource Inventory | `PhysicalResource`, `LogicalResource`, `resourceRelationship`, `place` e `relatedParty`. |
| 3 | TMF664 Resource Function Activation | Registrar solicitação de ativação, mudar estado operacional e emitir evento. |
| 4 | Persistência | Reforçar tabelas de Resource, relações e chaves de referência a Geo/Party. |

### 4.4 Service Domain

| Ordem | API | Entrega mínima |
|---|---|---|
| 1 | TMF633 Service Catalog | `ServiceSpecification`, `ServiceCategory`, `ServiceCandidate`. |
| 2 | TMF638 Service Inventory | `CustomerFacingService`, `ResourceFacingService`, `supportingResource`, `supportingService`, `serviceRelationship`, `relatedParty`. |
| 3 | Regras de fronteira | CFS usa `supportingService`; RFS usa `supportingResource`; CFS nunca referencia Resource diretamente. |
| 4 | Persistência | Ajustar o schema para expor `/service` unificado com `@type`. |

### 4.5 Order E Qualification

| Ordem | API | Entrega mínima |
|---|---|---|
| 1 | TMF645 Service Qualification | Consulta viabilidade por `GeographicAddress` ou coordenada; não cria Service. |
| 2 | TMF641 Service Ordering | Cria ordem, referencia `serviceOrderItem` e pode criar/alterar Service ao concluir. |
| 3 | TMF652 Resource Order | Reserva/alocacao simples de Resource, com create/modify/delete via `resourceOrderItem`. |
| 4 | Persistência | Tabelas `tmf_service_qualification`, `tmf_service_order`, `tmf_resource_order` e itens de ordem. |

### 4.6 Process, Document E Analytics

| Ordem | API | Entrega mínima |
|---|---|---|
| 1 | TMF701 Process Flow | `ProcessFlow`, `ProcessFlowStep`, estados `acknowledged`, `inProgress`, `completed`, `failed`, `cancelled`. |
| 2 | TMF724 Document Management | Metadados de documento, vínculo com entidades e URL/armazenamento local no MVP. |
| 3 | TMF688 Event Management completo | Consolida eventos de Geo, Party, Resource, Service, Order e Process em uma API canônica. |

## 5. Mapa De APIs Por Domínio

| Domínio | Open API TMF | Rotas canônicas |
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

## 6. Modelo De Dados Mínimo Por Etapa

### 6.1 Tabelas Já Preparadas

| Tabela | Uso |
|---|---|
| `tmf_geographic_location` | Base geoespacial do Módulo 1. |
| `tmf_geographic_address` | Endereço canônico e referência de viabilidade. |
| `tmf_geographic_site_specification` | Catálogo de tipos de site. |
| `tmf_geographic_site` | Site e sub-site. |
| `tmf_resource_specification` | Catálogo de Resource. |
| `tmf_physical_resource` | Inventário físico. |
| `tmf_logical_resource` | Inventário lógico. |
| `tmf_service_specification` | Catálogo de Service. |
| `tmf_customer_facing_service` | Inventário CFS. |
| `tmf_resource_facing_service` | Inventário RFS. |
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
| Listagem | Todas as APIs de inventário precisam suportar lista, filtro básico e paginação. |
| Busca | Party, Resource e Service precisam de lookup por identificadores de negócio relevantes. |
| Resposta | `@type` e `@referredType` devem aparecer sempre que o contrato TMF exigir referência. |
| Erro | Erros devem manter código e mensagem consistentes com a exceção de domínio. |
| Escrita | `POST`, `PATCH` e `DELETE` lógico precisam publicar evento. |
| Proveniência | `_origin` entra como `characteristic` somente leitura, nunca como campo hardcoded. |
| Relações | `relatedParty`, `supportingResource`, `supportingService` e `place` são referências canônicas, não cópias. |

## 8. Critérios De Pronto

| Critério | Resultado esperado |
|---|---|
| Contrato HTTP | Cada API tem CRUD canônico e rotas `/tmf-api/...` estáveis. |
| Persistência | Existe adapter SQLite com repositórios e migrações para todos os domínios da fase. |
| Eventos | Toda escrita relevante produz evento TMF688 persistido no event store. |
| Testes | Cada módulo possui `service.spec.ts`, `sqlite-repository.spec.ts` e `integration.spec.ts`. |
| Fronteiras | Geo, Resource, Service, Party e Order respeitam as fronteiras canônicas do Nexus. |
| Qualificação | TMF645 não cria Service e não contamina o inventário com Home Passed. |

## 9. Sequência Operacional Recomendada

| Ordem | Entrega | Dependência crítica |
|---|---|---|
| 1 | Foundation TMF compartilhada + TMF688 | Base para todo o restante. |
| 2 | Party / PartyRole | Habilita `relatedParty` transversal. |
| 3 | Resource Catalog + Resource Inventory + Activation | Fecha a camada "o quê". |
| 4 | Service Catalog + Service Inventory | Fecha a camada "para quê / quem". |
| 5 | Service Qualification + Service Ordering + Resource Ordering | Introduz viabilidade e fulfillment. |
| 6 | Process Flow + Document Management | Completa orquestração e metadata. |
| 7 | Consolidação de eventos e refino de contrato | Fechamento de governança e observabilidade. |

## 10. Riscos Principais

| Risco | Impacto | Mitigação |
|---|---|---|
| Implementar Service antes de Party | `relatedParty` fica inconsistente e quebra a fronteira multi-tenant. | Tratar Party como foundational antes de Service. |
| Pular TMF688 compartilhado | Eventos ficam fragmentados por módulo. | Centralizar event store, contrato e helpers antes de ampliar domínios. |
| Misturar HP com Service | Viola C4 e polui o inventário. | Reservar viabilidade para TMF645/Order. |
| Deixar `app.ts` crescer | O roteador central vira gargalo de manutenção. | Migrar para handlers por módulo com um dispatcher fino. |
| Modelar listas fechadas | Catálogos ficam presos em código. | Governar specs, roles e relationship types via API. |

## 11. Resultado Esperado

Ao final desta sequência, o backend passa a expor o núcleo canônico do Nexus:

- Geo como base de `place`.
- Party como fonte de `relatedParty`.
- Resource como "o que existe".
- Service como "para quê / quem existe".
- Order como orquestração de criação e alteração.
- Event Management como trilha transversal de integração e auditoria.

Esse desenho preserva o que já existe no repositório e fecha a evolução do backend sem quebrar as fronteiras do modelo.

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
