# Plano de APIs do backend

> **Estado verificado:** 31/07/2026. O runtime atual usa TypeScript/Node, HTTP nativo e Neon Postgres. Este documento distingue contratos publicados de contratos apenas propostos.

## 1. Base publicada

| Domínio       | Contrato atual                                                      | Evidência principal                                                        | Estado frente aos HLDs                                   |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Geographic    | TMF673, TMF674, TMF675; `/v1/geo/tree/*`; criação `site-at-address` | `src/shared/http/app.ts`, `src/modules/geo/`, `web/src/services/geoApi.ts` | Base ativa; gaps DEV-GEO-001–006                         |
| Resource      | TMF634, TMF639, TMF664; `/v1/resource/workspace`                    | `src/modules/resource/`, `web/src/services/resourceApi.ts`                 | Base ativa; gaps DEV-RES-001–006                         |
| Service       | TMF633, TMF638; `/v1/service/workspace`                             | `src/modules/service/`, `web/src/services/serviceApi.ts`                   | Base ativa; gaps DEV-SVC-001–006                         |
| Party / Order | TMF632, TMF669, TMF645, TMF641, TMF652                              | `src/modules/party/`, `src/modules/order/`                                 | Base ativa; governança transversal parcial               |
| Event         | TMF688 sobre `tmf_event`                                            | `src/shared/http/app.ts`, repositórios Postgres                            | API ativa; outbox/registry pendentes em DEV-X-002        |
| Copilot / MCP | Chat, catálogo de tools, confirmação antes de writes                | `src/modules/search/`, `src/modules/mcp/`, `/v1/chat/completions`          | Integração ativa; mantém as mesmas validações de domínio |

## 2. Rotas existentes relevantes

| Grupo              | Rotas publicadas                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geo TMF            | `/tmf-api/geographicLocationManagement/v4/geographicLocation`, `/tmf-api/geographicAddressManagement/v4/geographicAddress`, `/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification`, `/tmf-api/geographicSiteManagement/v4/geographicSite` |
| Geo workspace      | `/v1/geo/tree/roots`, `/children`, `/viewport`, `/search`; `/v1/geo/workspace/site-at-address`; eventos por Site                                                                                                                                      |
| Resource           | `/tmf-api/resourceCatalogManagement/v4/{resourceSpecification,resourceFunctionSpecification,resourceCategory,resourceType}`, `/tmf-api/resourceInventoryManagement/v4/resource`, `/tmf-api/resourceFunctionActivation/v4/resourceFunction`            |
| Resource workspace | `/v1/resource/workspace`                                                                                                                                                                                                                              |
| Service            | `/tmf-api/serviceCatalogManagement/v4/{serviceSpecification,serviceCategory,serviceCandidate}`, `/tmf-api/serviceInventoryManagement/v4/service`                                                                                                      |
| Service workspace  | `/v1/service/workspace`                                                                                                                                                                                                                               |
| Party / Order      | `/tmf-api/partyManagement/v4/party`, `/partyRoleManagement/v4/partyRole`, `/serviceQualificationManagement/v4/serviceQualification`, `/serviceOrderingManagement/v4/serviceOrder`, `/resourceOrderingManagement/v4/resourceOrder`                     |
| Eventos            | `/tmf-api/eventManagement/v4/event`                                                                                                                                                                                                                   |
| Busca / IA         | `/v1/chat/completions`, `/v1/searches`, `/v1/searches/my`, `/v1/research/sessions`                                                                                                                                                                    |

CRUD, filtros e paginação variam por recurso; o contrato exato continua definido pelos handlers e testes. Esta tabela não promete métodos que a rota atual não implementa.

## 3. Contratos somente propostos

Os contratos abaixo são alvo funcional e **não devem ser tratados como endpoints existentes**.

| Capacidade proposta                            | Contrato afetado                | Backlog                |
| ---------------------------------------------- | ------------------------------- | ---------------------- |
| Consultas espaciais completas e export GeoJSON | extensão TMF675 / Geo workspace | DEV-GEO-001            |
| Bulk de Address/Site                           | extensão TMF673/674             | DEV-GEO-006            |
| CRUD governado de GeographicRelationshipType   | catálogo transversal            | DEV-X-003              |
| CRUD governado de ResourceRelationshipType     | TMF639 / catálogo               | DEV-RES-006            |
| Path computation OLT→ONT                       | endpoint de graph a definir     | DEV-RES-003, DEV-X-005 |
| Bulk e histórico semântico de Resource         | TMF639                          | DEV-RES-002            |
| Operações IPAM/pools                           | TMF639 LogicalResource          | DEV-RES-005            |
| Bulk, `fields` e histórico de Service          | TMF638                          | DEV-SVC-002            |
| Emissão/reconciliação de SubscriberID          | TMF638 + Party/Tenant           | DEV-SVC-003            |
| Impacto e propagação Resource→RFS→CFS          | TMF638/TMF688                   | DEV-SVC-004            |
| CRUD governado de ServiceRelationshipType      | TMF638 / catálogo               | DEV-SVC-006            |
| Outbox, relay, Schema Registry, DLQ e replay   | TMF688                          | DEV-X-002              |

## 4. Regras de evolução

- Não adicionar extensão V.tal como campo hardcoded; usar characteristic governada por Specification.
- CFS usa `supportingService`; somente RFS usa `supportingResource`.
- Resource referencia Geo por `place`; não replica endereço ou geometria.
- Writes de Copilot/MCP exigem confirmação e passam pelo mesmo service de domínio das APIs.
- Nenhum `DELETE` físico é introduzido; usar soft-delete/terminate.
- Todo novo endpoint entra com contrato, erro, paginação aplicável, evento, autorização e teste.
- Neon Postgres é a persistência atual; adapter Oracle/Property Graph pertence a DEV-X-005.

## 5. Critério de pronto por API

| Dimensão     | Critério                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| Contrato     | Payload TMF válido, `@type`/`@referredType`, filtros e resposta documentados. |
| Domínio      | RF/RN/CA do requisito e fronteiras C1–C10 validados.                          |
| Persistência | Operação transacional, concorrência e soft-delete/terminate cobertos.         |
| Eventos      | Evento TMF688 idempotente e, após DEV-X-002, outbox/registry comprovados.     |
| Segurança    | Tenant, role e audit comprovados para leitura/write.                          |
| Qualidade    | Unitário + integração; E2E quando houver fluxo de UI/MCP.                     |
| Documentação | Matriz 2.3 e item `DEV-*` atualizados na mesma entrega.                       |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
