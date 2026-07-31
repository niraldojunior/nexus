# Backlog Técnico

> Priorização: P0 bloqueia MVP/foundation; P1 reduz risco relevante; P2 melhora maturidade ou governança.

## 1. P0 - Bloqueadores De Foundation

| ID | Tema | Item | Origem | Dependência | Critério de aceite |
|---|---|---|---|---|---|
| P0-001 | Arquitetura | Alinhar `02-system-design` ao cânone Oracle-native, Kafka/outbox, Schema Registry, TMF688 e Property Graph. | INC-005, C7, C10 | Nenhuma | Documento técnico deixa de citar múltiplos backends/RMQ como padrão primário sem decisão explícita. |
| P0-002 | Eventos | Definir contrato transversal de outbox TMF688. | REQ-MOD01-012, REQ-MOD02-025, REQ-MOD03-016 | P0-001 | Nomes, envelope, versionamento, idempotência, DLQ e retenção documentados. |
| P0-003 | Dados | Definir modelo físico Oracle para catálogo, inventory, relationships, characteristics e `_origin`. | C1, C5, C10 | P0-001 | Mapeamento cobre Geo, Resource e Service sem campos V.tal hardcoded. |
| P0-004 | Dados | Definir estratégia SQLite local como adapter de desenvolvimento. | Diretriz de implementação | P0-001 | Limites do SQLite documentados; domínio isolado por portas; produção proibida em SQLite. |
| P0-005 | Plataforma | Definir pipeline OpenShift não produtivo e produtivo. | Diretriz de implementação | P0-001 | Build, deploy, probes, secrets, env vars, logs e rollback documentados. |
| P0-006 | Migração | Definir padrão de pipeline `_origin` e relatórios de cobertura. | C5, HLDs MOD01-MOD03 | P0-003 | Consulta por sistema/id legado, migratedBy e relatório por wave especificados. |
| P0-007 | Catálogo | Fechar bootstrap inicial de SiteSpecification. | Q-GEO-001 | P0-003 | Lista mínima aprovada para CO, POP, armário, ponto de instalação, andar, sala e cage. |
| P0-008 | Catálogo | Fechar bootstrap inicial de ResourceSpecification. | Q-RES-001 | P0-003 | Modelos MVP de OLT, ONT, switch, roteador, splitter, CTO, cabo e rack definidos. |
| P0-009 | Plataforma | Definir RBAC/audit mínimo para produção. | C8, MOD08, security.md | P0-001 | Roles mínimas, permissões por módulo, audit trail e role MigrationJob documentados. |
| P0-010 | NFR | Definir SLOs mínimos de API e eventos. | Q-GEO-008, non-functional-requirements.md | P0-002 | Latência, disponibilidade, throughput e retenção definidos para MVP. |
| P0-011 | Integração | Definir integração com Geosite Logradouros. | Q-GEO-005 | P0-001 | Decisão API existente vs nova interface registrada. |
| P0-012 | Graph | Dimensionar Oracle Property Graph. | Q-RES-004 | P0-001 | Licença, volume, índices, benchmark e limite operacional definidos. |

## 2. P1 - Entrega Funcional E Redução De Risco

| ID | Tema | Item | Origem | Dependência | Critério de aceite |
|---|---|---|---|---|---|
| P1-001 | Qualidade | Criar suíte dupla de persistência: SQLite local e banco corporativo. | Diretriz de implementação | P0-004/P0-005 | Testes de contrato rodam nos dois adapters; exceções são explícitas. |
| P1-002 | Geographic | Definir matriz de derivação CN. | Q-GEO-002 | P0-007 | Regra determinística e exceções documentadas. |
| P1-003 | Geographic | Definir política CLLI. | Q-GEO-003 | P0-007 | Obrigatoriedade por tipo/status de Site aprovada. |
| P1-004 | Geographic | Definir RelationshipTypes de Site. | Q-GEO-004 | P0-007 | Bootstrap e inversos aprovados. |
| P1-005 | Geographic | Decidir syncGeoPosition síncrono vs assíncrono. | Q-GEO-007 | P0-002 | Fluxo de UX e consistência documentado. |
| P1-006 | Geographic | Escolher provedor de geocodificação. | Q-GEO-009 | P0-011 | Custo, licença e fallback definidos. |
| P1-007 | Resource | Decidir modelagem de fibers internas. | Q-RES-007 | P0-012 | Política 100% vs ocupadas e impacto de volume aprovado. |
| P1-008 | Resource | Definir carga inicial de IPAM legado. | Q-RES-008 | P0-006 | Fonte, mapeamento e validação de prefix/IP/VRF/VLAN definidos. |
| P1-009 | Resource | Definir cache de path computation. | Q-RES-010 | P0-012 | TTL, invalidação e rebuild documentados. |
| P1-010 | Resource | Definir granularidade de energia. | Q-RES-011 | P0-008 | PowerSupply/PowerOutlet/PowerFeed aplicáveis ao MVP. |
| P1-011 | Service | Fechar ServiceSpecifications do MVP. | Q-SVC-001 | P0-008 | CFS/RFS para FTTH, EILD/L2/L3VPN e CloudVoIP definidos. |
| P1-012 | Service | Definir SubscriberID Nexus-native. | Q-SVC-002 | MOD06/MOD04 | Formato, autoridade, faixa e convivência legado aprovados. |
| P1-013 | Service | Decidir granularidade RFS GPON. | Q-SVC-004 | P1-011 | Modelo por assinante ou porta PON agregada aprovado. |
| P1-014 | Service | Decidir bundle comercial. | Q-SVC-005 | P1-011 | Uso de `isBundle` ou `serviceRelationship` definido. |
| P1-015 | Service | Definir propagação de estado CFS/RFS/Resource. | Q-SVC-006 | MOD05 | Política automática vs orquestrada aprovada. |
| P1-016 | UI | Alinhar UI kit à taxonomia Nexus TMF. | INC-006 | P0-007/P0-008 | Navegação e labels usam Geographic, Resource, Service, Order e Party. |

## 3. P2 - Maturidade E Governança

| ID | Tema | Item | Origem | Dependência | Critério de aceite |
|---|---|---|---|---|---|
| P2-001 | Documentação | Preencher `business-rules.md` com C1-C10 e decisões resolvidas. | INC-001 | Architecture decisions aprovado | Arquivo vira fonte canônica transversal. |
| P2-002 | Documentação | Preencher `glossary.md`. | INC-002 | HLDs MOD01-MOD03 | Glossário cobre TMF, GPON/FTTH, HP/HC, CFS/RFS, OSP/ISP e termos V.tal. |
| P2-003 | Documentação | Atualizar Overview com status real do MOD03. | INC-003/INC-004 | Este plano | Overview deixa de marcar MOD03 como não iniciado. |
| P2-004 | Design system | Corrigir metadados de tokens no manifest/adherence. | Design system discovery | P1-015 | Tipos de token coerentes para automação. |
| P2-005 | Analytics | Definir modelo de consumo do Data Lake. | MOD07 | P0-002 | Tópicos, retenção, particionamento e lineage definidos. |
| P2-006 | Process | Modelar BPMN de swap e decommissioning. | Q-RES-009 decidido | MOD05 | Workflows documentados e auditáveis. |
| P2-007 | Um Telecom | Planejar integração OZMAP/UMBOX. | Overview, `_origin` | P0-004 | Estratégia de coexistência e migração diferida definida. |

## 4. Control Points Transversais

| Control point | Aplicação | Motivo |
|---|---|---|
| Catálogo extensível | SiteSpecification, ResourceSpecification, ServiceSpecification, RelationshipType | Evita listas hardcoded e suporta governança via API. |
| Eventos/outbox | MOD01, MOD02, MOD03, futuro MOD04-MOD08 | Garante consistência e integração desacoplada. |
| `_origin` | Geo, Resource, Service, catálogo importado | Sustenta migração, auditoria e dual-running. |
| RBAC/audit | Todos os writes | Necessário para produção e operação multi-tenant. |
| Soft-delete/terminate | Geo, Resource, Service | Preserva histórico e evita perda operacional/regulatória. |
| Portabilidade de persistência | Repositórios e migrations | Permite SQLite local sem comprometer Oracle/banco corporativo. |
| Deploy OpenShift | Todos os módulos produtivos | Garante runtime corporativo, secrets, health checks, observabilidade e rollback. |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
