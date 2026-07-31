# Decisões Arquiteturais

> Este documento consolida decisões existentes. Ele não reabre decisões marcadas como decididas.

## 1. Decisões Canônicas C1-C10

| ID | Decisão | Status | Implicação de implementação |
|---|---|---|---|
| C1 | TMF-first | Firmada | Entidades, atributos e eventos seguem TMF; extensão V.tal em `characteristic`. |
| C2 | Rack é fronteira Geo-Resource | Firmada | Sala/andar/Central são GeographicSite; Rack em diante é PhysicalResource. |
| C3 | Fronteira dupla do Service | Firmada | CFS não referencia Resource; RFS referencia Resource via `supportingResource`. |
| C4 | Home Passed não é Service | Firmada | HP é Geo + TMF645 no MOD04; HC gera Service no MOD03. |
| C5 | Agnóstico à origem com `_origin` | Firmada | UUID v7 Nexus é canônico; legado fica em characteristics read-only. |
| C6 | Soft-delete / soft-terminate | Firmada | Nada crítico é excluído fisicamente. |
| C7 | Event-driven TMF688 | Firmada | Outbox transacional, idempotência UUID v7 e Schema Registry. |
| C8 | Multi-tenant / wholesale | Firmada | `relatedParty` desde a criação; subscriber do CFS tipicamente Tenant ISP. |
| C9 | Catálogos extensíveis via API | Firmada | Bootstrap canônico + CRUD governado; sem listas fechadas hardcoded. |
| C10 | Oracle-native + Property Graph | Firmada | Persistência Oracle 21c/23ai; path computation via Oracle Property Graph. |

## 1.1 Diretriz De Implementação Local

| ID | Decisão | Status | Implicação de implementação |
|---|---|---|---|
| D-LOCAL-001 | SQLite pode ser usado no estágio local isolado. | Aprovada para desenvolvimento | SQLite é apenas adapter local para acelerar desenvolvimento e testes; não substitui C10. |
| D-LOCAL-002 | Persistência deve ser isolada por portas/adapters. | Aprovada para desenvolvimento | Domínio, casos de uso, contratos TMF e validações não podem depender de dialeto SQLite. |
| D-LOCAL-003 | Banco corporativo e OpenShift são gates antes de MVP produtivo. | Aprovada para delivery | Produção exige banco corporativo, configuração corporativa, secrets, observabilidade, probes e deploy OpenShift. |

## 2. Decisões Resolvidas Nos HLDs

| ID | Decisão | Origem | Status | Impacto |
|---|---|---|---|---|
| D-GEO-001 | Migração de Geo gera UUID v7 Nexus e preserva legado em `_origin`. | MOD01 Q-006 | Decidida | Uniformiza Site, Address e Location. |
| D-RES-001 | Migração de Resource segue UUID v7 + `_origin`. | MOD02 Q-003 | Decidida | Cobre PhysicalResource, LogicalResource e ResourceSpecification. |
| D-RES-002 | Postes de terceiros são cadastrados no Nexus como fonte de verdade V.tal. | MOD02 Q-005 | Decidida | Sem sincronização com concessionárias no MVP. |
| D-RES-003 | Service Assurance fica externa no MVP, mas consumindo eventos. | MOD02 Q-006 | Decidida | Eventos Resource devem atender SA atual e futura. |
| D-RES-004 | Swap de equipamento usa workflow BPMN no MOD05. | MOD02 Q-009 | Decidida | `/resource/{id}/swap` inicia workflow, não operação manual simples. |
| D-RES-005 | ResourceRelationship é extensível via API. | MOD02 Q-012 | Decidida | RelationshipType é entidade governada. |
| D-SVC-001 | HP não é Service. | MOD03 D-1 | Decidida | Viabilidade fica em MOD04/TMF645. |
| D-SVC-002 | Wholesale é modelo default. | MOD03 D-2 | Decidida | CFS aponta para Tenant ISP por padrão. |
| D-SVC-003 | Validação de Subscriber é diferida no MVP. | MOD03 D-3 | Decidida | MOD03 pode referenciar subscriber por ID até MOD06 entrar. |
| D-SVC-004 | ServiceRelationship é extensível via API. | MOD03 D-4 | Decidida | Mesmo padrão de catálogo governado. |
| D-SVC-005 | Migração de Service segue UUID v7 + `_origin`. | MOD03 25.2 | Decidida | Cobre CFS/RFS e IDs legados de serviço/assinante. |

## 3. Decisões Pendentes

| ID | Decisão pendente | Módulo | Bloqueia | Opções conhecidas | Dono sugerido |
|---|---|---|---|---|---|
| ADR-PEND-001 | Design técnico Oracle/Kafka/Schema Registry vs stack genérica atual. | Plataforma | F0/F1 | Alinhar system design ao cânone ou formalizar exceção. | Arquitetura |
| ADR-PEND-001A | Estratégia de paridade SQLite -> banco corporativo. | Plataforma | F1A/F1B | Suíte de testes compartilhada, migrations equivalentes e adapters separados. | Arquitetura + Engenharia |
| ADR-PEND-001B | Estratégia OpenShift corporativa. | Plataforma | F1B/F2 | Pipeline CI/CD, namespaces, routes, secrets, probes, observabilidade e rollback. | Plataforma |
| ADR-PEND-002 | SiteSpecifications bootstrap. | MOD01 | MOD01 staging | Lista mínima vs catálogo amplo. | Produto + Engenharia |
| ADR-PEND-003 | CN determinístico. | MOD01 | Cadastro de Site | Matriz fixa vs exceções governadas. | Engenharia V.tal |
| ADR-PEND-004 | Integração Geosite Logradouros. | MOD01 | Address/viabilidade | API existente vs nova interface. | Arquitetura + Geosite |
| ADR-PEND-005 | Geocodificação. | MOD01 | Address/mapa | Google, OSM ou base interna. | Produto + GIS |
| ADR-PEND-006 | Property Graph sizing. | MOD02 | Path computation | Benchmark/licença antes do MVP vs escopo reduzido. | Arquitetura + Plataforma |
| ADR-PEND-007 | Fibers internas a Cables. | MOD02 | OSP/path | Modelar 100% vs apenas ocupadas. | OSP + Arquitetura |
| ADR-PEND-008 | IPAM legado. | MOD02 | LogicalResource | Carga de planilhas/sistemas internos vs saneamento prévio. | Backbone + Arquitetura |
| ADR-PEND-009 | Cache de paths. | MOD02 | Performance | TTL por tipo vs invalidação por evento. | Arquitetura + Performance |
| ADR-PEND-010 | ServiceSpecifications MVP. | MOD03 | Service Catalog | Catálogo mínimo FTTH/EILD/VoIP vs catálogo comercial mais amplo. | Produto + Engenharia |
| ADR-PEND-011 | SubscriberID. | MOD03/MOD06 | Service/Order | Nexus-native imediato vs coexistência prolongada com legado. | Produto + BSS |
| ADR-PEND-012 | RFS GPON. | MOD03 | Escala Service | RFS por assinante vs RFS por porta PON agregada. | Engenharia + Arquitetura |
| ADR-PEND-013 | Bundle comercial. | MOD03 | Ofertas | `isBundle` vs `serviceRelationship`. | Produto |
| ADR-PEND-014 | Propagação de estado. | MOD03/MOD05 | Assurance/Order | Cascata automática vs BPMN/orquestrada. | Operações + Arquitetura |
| ADR-PEND-015 | RBAC/audit mínimo de produção. | MOD08 | Todos | Modelo centralizado mínimo vs módulo completo. | Segurança + Plataforma |

## 4. Decisões Que Não Devem Ser Reabertas Sem Pedido Explícito

- Home Passed não é Service.
- Service referencia Resource; não copia atributos.
- CFS não referencia Resource diretamente.
- Rack é a fronteira entre Geographic e Resource.
- `_origin` é characteristic read-only, não ID primário.
- Catálogos e RelationshipTypes são extensíveis via API.
- Service Assurance fica externa no MVP.
- Swap de equipamento é workflow BPMN.
- SQLite não substitui o banco corporativo nem altera C10.
- MVP produtivo só ocorre depois de validação em banco corporativo e OpenShift.

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
