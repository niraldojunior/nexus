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
| C10 | Oracle-native + Property Graph   | Firmada | Oracle 21c/23ai e Property Graph são o alvo; o estado atual é Neon Postgres.     |

## 1.1 Diretriz de Implementação Local

| ID          | Decisão                                                         | Status                 | Implicação de implementação                                                                                              |
| ----------- | --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D-LOCAL-001 | SQLite pode ser usado no estágio local isolado.                 | Superada               | O codebase convergiu para Neon Postgres; SQLite subsiste apenas como fonte opcional de migração, não como runtime atual. |
| D-LOCAL-002 | Persistência deve ser isolada por portas e adapters.            | Firmada                | Domínio, casos de uso, contratos TMF e validações não dependem do dialeto do banco atual.                                |
| D-LOCAL-003 | Banco corporativo e OpenShift são gates antes de MVP produtivo. | Aprovada para delivery | Produção exige banco corporativo, configuração corporativa, secrets, observabilidade, probes e deploy OpenShift.         |

## 2. Decisões Resolvidas nos HLDs

| ID        | Decisão                                                                   | Origem                       | Status   | Impacto                                                                |
| --------- | ------------------------------------------------------------------------- | ---------------------------- | -------- | ---------------------------------------------------------------------- |
| D-GEO-001 | Migração de Geo gera UUID v7 Nexus e preserva legado em `_origin`.        | MOD01 §21.2                  | Decidida | Uniformiza Site, Address e Location.                                   |
| D-GEO-002 | Geosite Logradouros é o provedor de geocodificação.                       | Antiga Q-GEO-009 / Q-INT-001 | Decidida | A interface técnica ainda depende de Q-GEO-005.                        |
| D-RES-001 | Migração de Resource segue UUID v7 + `_origin`.                           | MOD02 §37.2                  | Decidida | Cobre `PhysicalResource`, `LogicalResource` e `ResourceSpecification`. |
| D-RES-002 | Postes de terceiros são cadastrados no Nexus como fonte de verdade V.tal. | MOD02 §37.1                  | Decidida | Sem sincronização com concessionárias no MVP.                          |
| D-RES-003 | Service Assurance fica externa no MVP, mas consumindo eventos.            | MOD02 §37.1                  | Decidida | Eventos Resource devem atender SA atual e futura.                      |
| D-RES-004 | Swap de equipamento usa workflow BPMN no MOD05.                           | MOD02 §37.1                  | Decidida | `/resource/{id}/swap` inicia workflow, não operação manual simples.    |
| D-RES-005 | `ResourceRelationship` é extensível via API.                              | MOD02 §37.1                  | Decidida | `RelationshipType` é entidade governada.                               |
| D-SVC-001 | HP não é Service.                                                         | MOD03 §25.1                  | Decidida | Viabilidade fica em MOD04/TMF645.                                      |
| D-SVC-002 | Wholesale é modelo default.                                               | MOD03 §25.1                  | Decidida | CFS aponta para Tenant ISP por padrão.                                 |
| D-SVC-003 | Validação de Subscriber é diferida no MVP.                                | MOD03 §25.1                  | Decidida | MOD03 pode referenciar subscriber por ID até MOD06 entrar.             |
| D-SVC-004 | `ServiceRelationship` é extensível via API.                               | MOD03 §25.1                  | Decidida | Mesmo padrão de catálogo governado.                                    |
| D-SVC-005 | Migração de Service segue UUID v7 + `_origin`.                            | MOD03 §25.2                  | Decidida | Cobre CFS/RFS e IDs legados de serviço e assinante.                    |

## 3. Decisões Pendentes

| ID            | Decisão pendente                                                            | Módulo        | Bloqueia              | Opções conhecidas                                                                | Dono sugerido             |
| ------------- | --------------------------------------------------------------------------- | ------------- | --------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| ADR-PEND-001  | Estratégia de convergência Neon Postgres → Oracle, Kafka e Schema Registry. | Plataforma    | Produção corporativa  | Manter Neon como laboratório ou iniciar adapters corporativos por onda.          | Arquitetura               |
| ADR-PEND-001B | Estratégia OpenShift corporativa.                                           | Plataforma    | F1B/F2                | Pipeline CI/CD, namespaces, routes, secrets, probes, observabilidade e rollback. | Plataforma                |
| ADR-PEND-003  | CN determinístico.                                                          | MOD01         | Cadastro de Site      | Matriz fixa vs exceções governadas.                                              | Engenharia V.tal          |
| ADR-PEND-004  | Integração Geosite Logradouros.                                             | MOD01         | Address / viabilidade | API existente vs nova interface.                                                 | Arquitetura + Geosite     |
| ADR-PEND-006  | Property Graph sizing.                                                      | MOD02         | Path computation      | Benchmark e licença antes do MVP vs escopo reduzido.                             | Arquitetura + Plataforma  |
| ADR-PEND-007  | Fibers internas a Cables.                                                   | MOD02         | OSP / path            | Modelar 100% vs apenas ocupadas.                                                 | OSP + Arquitetura         |
| ADR-PEND-008  | IPAM legado.                                                                | MOD02         | LogicalResource       | Carga de planilhas e sistemas internos vs saneamento prévio.                     | Backbone + Arquitetura    |
| ADR-PEND-009  | Cache de paths.                                                             | MOD02         | Performance           | TTL por tipo vs invalidação por evento.                                          | Arquitetura + Performance |
| ADR-PEND-010  | ServiceSpecifications MVP.                                                  | MOD03         | Service Catalog       | Catálogo mínimo FTTH, EILD e VoIP vs catálogo comercial mais amplo.              | Produto + Engenharia      |
| ADR-PEND-011  | SubscriberID.                                                               | MOD03 / MOD06 | Service / Order       | Nexus-native imediato vs coexistência prolongada com legado.                     | Produto + BSS             |
| ADR-PEND-012  | RFS GPON.                                                                   | MOD03         | Escala Service        | RFS por assinante vs RFS por porta PON agregada.                                 | Engenharia + Arquitetura  |
| ADR-PEND-013  | Bundle comercial.                                                           | MOD03         | Ofertas               | `isBundle` vs `serviceRelationship`.                                             | Produto                   |
| ADR-PEND-014  | Propagação de estado.                                                       | MOD03 / MOD05 | Assurance / Order     | Cascata automática vs BPMN/orquestrada.                                          | Operações + Arquitetura   |
| ADR-PEND-015  | RBAC e audit mínimo de produção.                                            | MOD08         | Todos                 | Modelo centralizado mínimo vs módulo completo.                                   | Segurança + Plataforma    |

## 4. Decisões que Não Devem Ser Reabertas sem Pedido Explícito

- Home Passed não é Service.
- Service referencia Resource; não copia atributos.
- CFS não referencia Resource diretamente.
- Rack é a fronteira entre Geographic e Resource.
- `_origin` é characteristic read-only, não ID primário.
- Catálogos e RelationshipTypes são extensíveis via API.
- Service Assurance fica externa no MVP.
- Swap de equipamento é workflow BPMN.
- Neon Postgres é o runtime atual de laboratório e não substitui o alvo Oracle de C10.
- MVP produtivo só ocorre depois de validação em banco corporativo e OpenShift.

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
