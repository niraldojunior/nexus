# Plano de APIs do backend

> **Estado verificado:** 31/07/2026. O runtime atual usa TypeScript/Node, HTTP nativo e persistência dual PostgreSQL/Oracle (`DATABASE_PROVIDER`), com laboratório PostgreSQL hospedado em Neon. Este documento distingue contratos publicados de contratos apenas propostos.

## 1. Base publicada

| Domínio       | Contrato atual                                                      | Evidência principal                                                        | Estado frente aos HLDs                                                                                                               |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Geographic    | TMF673, TMF674, TMF675; `/v1/geo/tree/*`; criação `site-at-address` | `src/shared/http/app.ts`, `src/modules/geo/`, `web/src/services/geoApi.ts` | Base ativa; gaps [#130](https://github.com/niraldojunior/nexus/issues/130)–[#135](https://github.com/niraldojunior/nexus/issues/135) |
| Resource      | TMF634, TMF639, TMF664; `/v1/resource/workspace`                    | `src/modules/resource/`, `web/src/services/resourceApi.ts`                 | Base ativa; gaps [#142](https://github.com/niraldojunior/nexus/issues/142)–[#147](https://github.com/niraldojunior/nexus/issues/147) |
| Service       | TMF633, TMF638; `/v1/service/workspace`                             | `src/modules/service/`, `web/src/services/serviceApi.ts`                   | Base ativa; gaps [#151](https://github.com/niraldojunior/nexus/issues/151)–[#156](https://github.com/niraldojunior/nexus/issues/156) |
| Party / Order | TMF632, TMF669, TMF645, TMF641, TMF652                              | `src/modules/party/`, `src/modules/order/`                                 | Base ativa; governança transversal parcial                                                                                           |
| Event         | TMF688 sobre `tmf_event`                                            | `src/shared/http/app.ts`, repositórios Postgres                            | API ativa; outbox/registry pendentes em [#158](https://github.com/niraldojunior/nexus/issues/158)                                    |
| Copilot / MCP | Chat, catálogo de tools, confirmação antes de writes                | `src/modules/search/`, `src/modules/mcp/`, `/v1/chat/completions`          | Integração ativa; mantém as mesmas validações de domínio                                                                             |

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

| Capacidade proposta                            | Contrato afetado                | Backlog                                                                                                              |
| ---------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Consultas espaciais completas e export GeoJSON | extensão TMF675 / Geo workspace | [#130](https://github.com/niraldojunior/nexus/issues/130)                                                            |
| Bulk de Address/Site                           | extensão TMF673/674             | [#135](https://github.com/niraldojunior/nexus/issues/135)                                                            |
| CRUD governado de GeographicRelationshipType   | catálogo transversal            | [#159](https://github.com/niraldojunior/nexus/issues/159)                                                            |
| CRUD governado de ResourceRelationshipType     | TMF639 / catálogo               | [#147](https://github.com/niraldojunior/nexus/issues/147)                                                            |
| Path computation OLT→ONT                       | endpoint de graph a definir     | [#144](https://github.com/niraldojunior/nexus/issues/144), [#161](https://github.com/niraldojunior/nexus/issues/161) |
| Bulk e histórico semântico de Resource         | TMF639                          | [#143](https://github.com/niraldojunior/nexus/issues/143)                                                            |
| Operações IPAM/pools                           | TMF639 LogicalResource          | [#146](https://github.com/niraldojunior/nexus/issues/146)                                                            |
| Bulk, `fields` e histórico de Service          | TMF638                          | [#152](https://github.com/niraldojunior/nexus/issues/152)                                                            |
| Emissão/reconciliação de SubscriberID          | TMF638 + Party/Tenant           | [#153](https://github.com/niraldojunior/nexus/issues/153)                                                            |
| Impacto e propagação Resource→RFS→CFS          | TMF638/TMF688                   | [#154](https://github.com/niraldojunior/nexus/issues/154)                                                            |
| CRUD governado de ServiceRelationshipType      | TMF638 / catálogo               | [#156](https://github.com/niraldojunior/nexus/issues/156)                                                            |
| Outbox, relay, Schema Registry, DLQ e replay   | TMF688                          | [#158](https://github.com/niraldojunior/nexus/issues/158)                                                            |

## 4. Regras de evolução

- Não adicionar extensão V.tal como campo hardcoded; usar characteristic governada por Specification.
- CFS usa `supportingService`; somente RFS usa `supportingResource`.
- Resource referencia Geo por `place`; não replica endereço ou geometria.
- Writes de Copilot/MCP exigem confirmação e passam pelo mesmo service de domínio das APIs.
- Nenhum `DELETE` físico é introduzido; usar soft-delete/terminate.
- Todo novo endpoint entra com contrato, erro, paginação aplicável, evento, autorização e teste.
- PostgreSQL e Oracle são suportados nativamente (C10); otimizações Oracle-native e benchmark de escala pertencem a [#161](https://github.com/niraldojunior/nexus/issues/161).

## 5. Critério de pronto por API

| Dimensão     | Critério                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Contrato     | Payload TMF válido, `@type`/`@referredType`, filtros e resposta documentados.                                             |
| Domínio      | RF/RN/CA do requisito e fronteiras C1–C10 validados.                                                                      |
| Persistência | Operação transacional, concorrência e soft-delete/terminate cobertos.                                                     |
| Eventos      | Evento TMF688 idempotente e, após [#158](https://github.com/niraldojunior/nexus/issues/158), outbox/registry comprovados. |
| Segurança    | Tenant, role e audit comprovados para leitura/write.                                                                      |
| Qualidade    | Unitário + integração; E2E quando houver fluxo de UI/MCP.                                                                 |
| Documentação | Matriz 2.3 e item `DEV-*` atualizados na mesma entrega.                                                                   |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
