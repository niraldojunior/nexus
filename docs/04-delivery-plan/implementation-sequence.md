# Sequência De Implementação

> Sequência recomendada para execução técnica. Não altera a arquitetura; organiza a ordem para reduzir risco.

## 1. Princípios Da Sequência

- Implementar primeiro contratos transversais que todos os módulos usarão.
- Não iniciar funcionalidades que dependem de decisões P0 abertas.
- Começar com SQLite para desenvolvimento local isolado, mantendo o banco corporativo como alvo arquitetural.
- Isolar persistência por portas/adapters para que SQLite não contamine contratos de domínio, APIs TMF ou modelo canônico.
- Entregar MOD01 e MOD02 antes de aprofundar MOD03.
- Manter MOD04 como dono de viabilidade/TMF645 para proteger a decisão Home Passed não é Service.
- Tratar MOD06 como dependência de governança, com validação diferida apenas onde já decidido.

## 2. Ondas Técnicas

| Onda | Nome | Objetivo | Principais entregas | Saída esperada |
|---|---|---|---|---|
| Onda 0 | Discovery técnico fechado | Sair da documentação para contratos implementáveis. | ADRs P0, system design alinhado, catálogos MVP, NFRs. | Backlog pronto para execução. |
| Onda 1A | Foundations locais SQLite | Criar base transversal local e testável. | Configuração, API pattern, migrations SQLite, seeds, repositórios por porta, outbox local, audit mínimo. | Módulos rodam localmente sem dependências corporativas. |
| Onda 1B | Foundations corporativas | Promover a foundation para banco corporativo e OpenShift não produtivo. | Adapter Oracle/banco corporativo, Kafka/Schema Registry corporativos, secrets, health checks, pipeline OpenShift. | Mesmos testes da Onda 1A passam em staging corporativo. |
| Onda 2 | MOD01 Geographic foundation | Implementar "onde". | Location, Address, SiteSpecification, Site, SubSite, lifecycle e eventos, primeiro SQLite e depois staging corporativo. | Geo pronto para Resource e Order. |
| Onda 3 | MOD02 Resource foundation | Implementar "o quê" base. | ResourceSpec, Category, Resource CRUD, lifecycle X.731, containment, OSP/ISP core, primeiro SQLite e depois staging corporativo. | Resource pronto para migração Netwin e Service. |
| Onda 4 | Eventos e migração MVP | Preparar produção Região 1. | `_origin`, pipelines wave 1, relatórios, dual-running, consumidores mínimos, deploy OpenShift. | MVP MOD01-MOD02 operável em ambiente corporativo. |
| Onda 5 | MOD03 Service foundation | Implementar "para quê/quem". | ServiceSpec, Service CRUD, lifecycle, CFS/RFS, supportingResource/supportingService, eventos. | Service Inventory pronto para Order/Party. |
| Onda 6 | MOD04 + MOD06 mínimos | Fechar viabilidade, ordem e tenant. | TMF645, TMF641 mínimo, Party/Tenant, SubscriberID. | Serviço criado por ordem com tenant governado. |
| Onda 7 | MOD05/MOD07/MOD08 maturidade | Automatizar e governar plataforma. | BPMN, analytics, administração, RBAC avançado, audit reports. | Plataforma completa e preparada para Um Telecom. |

## 3. Sequência Detalhada

### Onda 0 - Antes de escrever produto

| Ordem | Ação | Dependência |
|---|---|---|
| 1 | Aprovar decisões P0 em `architecture-decisions.md`. | Nenhuma |
| 2 | Reconciliar `02-system-design` com C7 e C10. | ADR-PEND-001 |
| 3 | Fechar SiteSpec e ResourceSpec MVP. | Q-GEO-001, Q-RES-001 |
| 4 | Definir NFR de APIs, eventos e migração. | Q-GEO-008 |
| 5 | Definir estratégia de Geosite/Geocoding e Property Graph. | Q-GEO-005, Q-GEO-009, Q-RES-004 |

### Onda 1A - Foundations locais SQLite

| Ordem | Capability | Critério |
|---|---|---|
| 1 | Identidade UUID v7 | IDs gerados pelo backend, sem dependência de ID cliente. |
| 2 | Portas de repositório | Domínio depende de interfaces; SQLite é adapter local. |
| 3 | Migrations e seed SQLite | Ambiente local recriável com catálogos mínimos. |
| 4 | Characteristic engine | Tipos, validadores, mandatory/configurable e `_origin` read-only. |
| 5 | Catálogo governado | Specs e RelationshipTypes com lifecycle e audit. |
| 6 | Outbox local | Registra eventos TMF688 em tabela local para teste de envelope e idempotência. |
| 7 | RBAC/audit mínimo | Roles operacionais, admin de catálogo e MigrationJob simuláveis localmente. |

### Onda 1B - Foundations corporativas

| Ordem | Capability | Critério |
|---|---|---|
| 1 | Adapter banco corporativo | Mesmos contratos de repositório passam contra Oracle/banco corporativo. |
| 2 | Migrations corporativas | DDL compatível com constraints, índices, transações e volumes esperados. |
| 3 | Outbox corporativo | Integra com Kafka/Schema Registry ou serviços corporativos equivalentes. |
| 4 | OpenShift não produtivo | Build, deploy, env vars, secrets, probes e logs estruturados funcionando. |
| 5 | Paridade de testes | Testes do SQLite rodam também contra banco corporativo com suíte de integração. |

### Onda 2 - Geographic

| Ordem | Requisitos | Observação |
|---|---|---|
| 1 | REQ-MOD01-001, 002, 003 | Location, Address e SiteSpecification são fundação. |
| 2 | REQ-MOD01-004, 005, 006, 007 | Região, grupo funcional, Site e Sub-Site. |
| 3 | REQ-MOD01-008, 009 | Lifecycle e containment. |
| 4 | REQ-MOD01-010, 011 | Relações A-Z e mapa, respeitando decisões de Geosite/sync. |
| 5 | REQ-MOD01-012 | Eventos TMF688 do domínio. |

### Onda 3 - Resource

| Ordem | Requisitos | Observação |
|---|---|---|
| 1 | REQ-MOD02-001 a 004 | Catálogo e fabricantes como Party referenciada. |
| 2 | REQ-MOD02-005 a 007 | Resource CRUD, lifecycle e containment. |
| 3 | REQ-MOD02-008 a 012 | OSP, cabos, emendas e path computation. |
| 4 | REQ-MOD02-013 a 019 | ISP, rack, equipment, card, port, energia, conexão e DIO. |
| 5 | REQ-MOD02-020 a 023 | LogicalResources: IPAM, VRF, VLAN, ASN/MPLS. |
| 6 | REQ-MOD02-024, 025 | RelationshipType e eventos. |

### Onda 4 - Migração e Produção Região 1

| Ordem | Capability | Critério |
|---|---|---|
| 1 | Mapping Netwin/Geosite para Nexus | Cobertura por entidade e regra de transformação. |
| 2 | `_origin` completo | Consulta por sistema/id e migratedBy. |
| 3 | Dry-run wave 1 | Contagens reconciliadas e erros classificados. |
| 4 | Dual-running | Cross-reference operacional e suporte a rollback. |
| 5 | Produção controlada | Observabilidade, audit e suporte operacional ativados. |

### Onda 5 - Service

| Ordem | Requisitos | Observação |
|---|---|---|
| 1 | REQ-MOD03-001 a 003 | Service Catalog e candidates. |
| 2 | REQ-MOD03-004, 005 | Service CRUD e lifecycle. |
| 3 | REQ-MOD03-006, 007 | CFS e RFS. |
| 4 | REQ-MOD03-008, 009, 010 | supportingResource, supportingService e place. |
| 5 | REQ-MOD03-011 | SubscriberID, alinhado ao MOD06/BSS. |
| 6 | REQ-MOD03-012 a 014 | Serviços ilustrativos FTTH, empresarial e CloudVoIP. |
| 7 | REQ-MOD03-015, 016 | ServiceRelationship e eventos. |

### Onda 6 - Order e Party mínimos

| Capability | Regra |
|---|---|
| Party/Tenant | Fonte canônica para subscriber, owner, manufacturer, vendor e tenants. |
| TMF645 | Viabilidade/Home Passed fica fora do Service Inventory. |
| TMF641 | Order cria/altera Service e referencia `serviceOrderItem`. |
| SubscriberID | Nexus-native na Fase 3, com convivência legada definida. |

### Onda 7 - Maturidade

| Capability | Resultado |
|---|---|
| MOD05 BPMN | Swap, re-home, decommissioning e suspensões críticas orquestradas. |
| MOD07 Analytics | Data Lake, dashboards, impacto, churn, ocupação e eventos. |
| MOD08 Platform | RBAC granular, administração de catálogo, audit reports e governança. |
| Um Telecom | Integração OZMAP/UMBOX iniciada sem quebrar `_origin`. |

## 4. Gates De Qualidade

| Gate | Quando | Critério |
|---|---|---|
| G0 | Antes da Onda 1 | Decisões P0 fechadas. |
| G1 | Antes da Onda 1B | SQLite local recriável, testes passando e adapters isolados. |
| G2 | Antes da Onda 2 | Banco corporativo e OpenShift não produtivo executam health check e testes de integração básicos. |
| G3 | Antes da Onda 3 | Geo cria Site/Address/Location e valida lifecycle em SQLite e staging corporativo. |
| G4 | Antes da produção | Migração dry-run aprovada, NFR mínimo medido em banco corporativo e deploy OpenShift validado. |
| G5 | Antes de MOD03 produção | Party/Order mínimos ou validação diferida explicitamente governada. |
| G6 | Antes de Região 2 | Property Graph e pipeline NetworkCore/Octave validados. |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
