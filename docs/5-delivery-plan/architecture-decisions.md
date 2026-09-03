# Decisões Arquiteturais

> Este documento consolida decisões existentes. Ele não reabre decisões marcadas como decididas.

## 1. Decisões Canônicas C1-C10

| ID  | Decisão                          | Status  | Implicação de implementação                                                      |
| --- | -------------------------------- | ------- | -------------------------------------------------------------------------------- |
| C1  | TMF-first                        | Firmada | Entidades, atributos e eventos seguem TMF; extensão V.tal em `characteristic`.   |
| C2  | Rack é fronteira Geo-Resource    | Firmada | Sala, andar e Central são `GeographicSite`; Rack em diante é `PhysicalResource`. |
| C3  | Fronteira dupla do Service       | Firmada | CFS não referencia Resource; RFS referencia Resource via `supportingResource`.   |
| C4  | Home Passed não é Service        | Firmada | HP é Geo + TMF645 no MOD04; HC gera Service no MOD03.                            |
| C5  | Agnóstico à origem com `_origin` | Firmada | UUID v7 Nexus é canônico; legado fica em characteristics read-only.              |
| C6  | Soft-delete / soft-terminate     | Firmada | Nada crítico é excluído fisicamente.                                             |
| C7  | Event-driven TMF688              | Firmada | Outbox transacional, idempotência UUID v7 e Schema Registry.                     |
| C8  | Multi-tenant / wholesale         | Firmada | `relatedParty` desde a criação; subscriber do CFS tipicamente Tenant ISP.        |
| C9  | Catálogos extensíveis via API    | Firmada | Bootstrap canônico + CRUD governado; sem listas fechadas hardcoded.              |
| C10 | Oracle-native + portabilidade PostgreSQL | Firmada | Oracle é o alvo corporativo homologado; PostgreSQL é suportado nativamente, ambos de primeira classe. Path computation usa SQL recursivo portável, não Property Graph. |

## 1.1 Diretriz de Implementação Local

| ID          | Decisão                                                         | Status                 | Implicação de implementação                                                                                              |
| ----------- | --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D-LOCAL-001 | SQLite pode ser usado no estágio local isolado.                 | Superada               | O codebase convergiu para PostgreSQL (hospedado em Neon no laboratório); SQLite subsiste apenas como fonte opcional de migração, não como runtime atual. |
| D-LOCAL-002 | Persistência deve ser isolada por portas e adapters.            | Firmada                | Domínio, casos de uso, contratos TMF e validações não dependem do dialeto do banco atual.                                |
| D-LOCAL-003 | Banco corporativo e OpenShift são gates antes de MVP produtivo. | Aprovada para delivery | Produção exige banco corporativo, configuração corporativa, secrets, observabilidade, probes e deploy OpenShift.         |

## 2. Decisões Resolvidas nos HLDs

| ID        | Decisão                                                                   | Origem                       | Status   | Impacto                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-GEO-001 | Migração de Geo gera UUID v7 Nexus e preserva legado em `_origin`.        | MOD01 §21.2                  | Decidida | Uniformiza Site, Address e Location.                                                                                                                                                  |
| D-GEO-002 | Geosite Logradouros é o provedor de geocodificação.                       | Antiga Q-GEO-009 / Q-INT-001 | Decidida | A interface técnica ainda depende de Q-GEO-005.                                                                                                                                       |
| D-RES-001 | Migração de Resource segue UUID v7 + `_origin`.                           | MOD02 §37.2                  | Decidida | Cobre `PhysicalResource`, `LogicalResource` e `ResourceSpecification`.                                                                                                                |
| D-RES-002 | Postes de terceiros são cadastrados no Nexus como fonte de verdade V.tal. | MOD02 §37.1                  | Decidida | Sem sincronização com concessionárias no MVP.                                                                                                                                         |
| D-RES-003 | Service Assurance fica externa no MVP, mas consumindo eventos.            | MOD02 §37.1                  | Decidida | Eventos Resource devem atender SA atual e futura.                                                                                                                                     |
| D-RES-004 | Swap de equipamento usa workflow BPMN no MOD05.                           | MOD02 §37.1                  | Decidida | `/resource/{id}/swap` inicia workflow, não operação manual simples.                                                                                                                   |
| D-RES-005 | `ResourceRelationship` é extensível via API.                              | MOD02 §37.1                  | Decidida | `RelationshipType` é entidade governada.                                                                                                                                              |
| D-SVC-001 | HP não é Service.                                                         | MOD03 §25.1                  | Decidida | Viabilidade fica em MOD04/TMF645.                                                                                                                                                     |
| D-SVC-002 | Wholesale é modelo default.                                               | MOD03 §25.1                  | Decidida | CFS aponta para Tenant ISP por padrão.                                                                                                                                                |
| D-SVC-003 | Validação de Subscriber é diferida no MVP.                                | MOD03 §25.1                  | Decidida | MOD03 pode referenciar subscriber por ID até MOD06 entrar.                                                                                                                            |
| D-SVC-004 | `ServiceRelationship` é extensível via API.                               | MOD03 §25.1                  | Decidida | Mesmo padrão de catálogo governado.                                                                                                                                                   |
| D-SVC-005 | Migração de Service segue UUID v7 + `_origin`.                            | MOD03 §25.2                  | Decidida | Cobre CFS/RFS e IDs legados de serviço e assinante.                                                                                                                                   |
| D-INT-001 | Geosite Logradouros é o serviço de geocodificação.                        | Antiga Q-INT-001             | Decidida | Premissa para toda integração de endereço/geocodificação.                                                                                                                             |
| D-INT-002 | Formato e SLA da viabilidade em lote.                                     | Antiga Q-INT-003             | Decidida | Foto diária dos 22M HPs + evento de divergência em tópico dedicado.                                                                                                                   |
| D-INT-003 | SIS é o sistema de provisionamento alvo.                                  | Antiga Q-INT-004             | Decidida | Já abstrai gerências, AAA e IMS.                                                                                                                                                      |
| D-INT-004 | CAD do Geonet não é convertido para `SDO_GEOMETRY`.                       | Antiga Q-INT-006             | Decidida | Sem efeito prático; Geonet não migra.                                                                                                                                                 |
| D-INT-005 | Geosite devolve precisão da coordenada, não procedência.                  | Antiga Q-INT-007             | Decidida | Procedência não é atributo disponível na integração.                                                                                                                                  |
| D-INT-006 | CAD do Geonet cobre apenas cartografia base.                              | Antiga Q-INT-008             | Decidida | Cobertura de planta/território vem do Netwin, não do Geonet.                                                                                                                          |
| D-ARQ-001 | Interfaces de repositório assíncronas; seleção Postgres/Oracle no boot.   | Antiga Q-ARQ-001             | Decidida | `DATABASE_PROVIDER` decide o adapter, sem fallback silencioso.                                                                                                                        |
| D-ARQ-002 | Banco, aplicação, cache, mensageria e gateway alvo definidos.             | Antiga Q-ARQ-004             | Decidida | Oracle · OpenShift · Redis · Kafka · Apigee.                                                                                                                                          |
| D-ARQ-003 | Vercel é hospedagem de laboratório, não destino.                          | Antiga Q-ARQ-005             | Decidida | OpenShift é o alvo corporativo de aplicação. O suporte nativo a PostgreSQL (C10) é permanente — só a hospedagem em Vercel/Neon é temporária.                                          |
| D-ARQ-004 | RBAC e isolamento multi-tenant estendidos além de `/v1/users`.            | Antiga Q-ARQ-007             | Decidida | RBAC e `tenant_id` (Resource/Service/Order/Party) entraram nas Fases 2–3 da issue #80; VPD Oracle segue como gap em aberto ([#94](https://github.com/niraldojunior/nexus/issues/94)). |
| D-GEO-003 | `SiteSpecifications` do bootstrap fechadas em 31/07/2026.                 | Antiga Q-GEO-001             | Decidida | `Region`, `FunctionalGroup`, `Central Office`, `POP`, `Cabinet`, `InstallationPoint`, `Floor`, `Room` e `Cage`.                                                                       |
| D-API-001 | `href` TMF é derivado em tempo de leitura, não persistido.                | Issue [#169](https://github.com/niraldojunior/nexus/issues/169) | Decidida | `buildHref` centraliza tipo + identificador e `TMF_PUBLIC_BASE_URL` opcional aplica o host público; a coluna física redundante é removida. |
| D-RES-006 | Refatoração Resource Catalog: Árvore dinâmica e desacoplamento de ResourceType | Issue [#188](https://github.com/niraldojunior/nexus/issues/188) | Decidida | `ResourceCatalog` + `ResourceCatalogNode` (árvore de nós `GROUP` ou `RESOURCE_TYPE`) substituem Category/Layer fixas; `ResourceSpecification` aponta exclusivamente via FK `resource_type_id` (`tmf_resource_type`); tipos canônicos independentes de hierarquia e escopados por tenant (`vtal`). |

## 4. Decisões que Não Devem Ser Reabertas sem Pedido Explícito

- Home Passed não é Service.
- Service referencia Resource; não copia atributos.
- CFS não referencia Resource diretamente.
- Rack é a fronteira entre Geographic e Resource.
- `_origin` é characteristic read-only, não ID primário.
- Catálogos e RelationshipTypes são extensíveis via API.
- Service Assurance fica externa no MVP.
- Swap de equipamento é workflow BPMN.
- Oracle é o alvo corporativo homologado; PostgreSQL é suportado nativamente e não é um modo transitório (C10).
- MVP produtivo só ocorre depois de validação em banco corporativo e OpenShift.

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
