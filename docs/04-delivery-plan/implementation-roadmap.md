# Plano de Implementação - Roadmap

> Data base: 27/06/2026  
> Fonte: AGENTS.md, README.md, `docs/00-visao-geral`, HLDs MOD01-MOD03, `docs/02-system-design` e `docs/03-design-system`.

## 1. Objetivo

Este roadmap transforma a documentação funcional e arquitetural existente em um plano técnico de entrega para o V.tal Nexus. O plano não altera a arquitetura definida; ele organiza a execução, explicita inconsistências documentais, registra dependências e destaca decisões ainda pendentes.

O produto segue a tríade canônica:

| Pergunta | Módulo | APIs TMF | Status real em 27/06/2026 |
|---|---|---|---|
| Onde? | MOD01 - Nexus Geographic | TMF673, TMF674, TMF675, TMF688 | Em elaboração, 12 requisitos levantados |
| O quê? | MOD02 - Nexus Resource | TMF634, TMF639, TMF664, TMF688 | Em elaboração, 25 requisitos levantados |
| Para quê / quem? | MOD03 - Nexus Service | TMF633, TMF638, TMF688 | Em elaboração, 16 requisitos levantados |

## 2. Inconsistências de Base

| ID | Inconsistência | Impacto no roadmap | Ação de delivery |
|---|---|---|---|
| INC-001 | `business-rules.md` está vazio, apesar de ser fonte prevista para C1-C10. | Decisões transversais ficam espalhadas entre AGENTS.md, Overview e HLDs. | Tratar `architecture-decisions.md` como consolidação operacional até o arquivo canônico ser preenchido. |
| INC-002 | `glossary.md` está vazio. | Risco de termos divergentes entre módulos e UI. | Criar item de backlog documental para glossário mínimo antes da Fase 1. |
| INC-003 | Overview marca MOD03 como "Não iniciado", mas `03-modulo-service.md` existe e cobre REQ-MOD03-001 a 016. | Roadmap e status executivo ficam defasados. | Considerar MOD03 como "Em elaboração" neste plano. |
| INC-004 | Overview consolida questões abertas apenas de MOD01-MOD02. | Decisões de Service ficam fora da visão consolidada. | Consolidar MOD03 em `open-questions.md`. |
| INC-005 | `02-system-design/*` é genérico e cita NestJS/Fastify, múltiplos backends e RMQ, mas o cânone exige Oracle 21c/23ai, Property Graph, Kafka/outbox e Schema Registry. | Risco de implementação seguir uma arquitetura técnica inferior ao HLD. | Backlog P0 para alinhar design técnico ao cânone antes de construir foundations. |
| INC-006 | UI kit usa termos de protótipo/legado como Geosite, Geonet e Viabilidade Fuzzy. | Risco de UX reforçar taxonomia antiga em vez da tríade TMF. | Backlog de alinhamento semântico do design system e telas. |

## 3. Roadmap Por Fase

| Fase | Período | Objetivo | Entregas mínimas | Critério de saída |
|---|---|---|---|---|
| F0 - Fechamento técnico | Jul/2026 | Converter HLDs em base implementável. | Decisões P0 fechadas, system design alinhado, backlog priorizado, contratos TMF688 e `_origin` consolidados. | Nenhuma decisão P0 bloqueando MOD01-MOD02. |
| F1A - Build local SQLite | Jul-Ago/2026 | Construir foundation isolada e testável localmente. | MOD01/MOD02 core com adapter SQLite, migrations locais, seed de catálogos, testes de contrato, eventos em outbox local. | Desenvolvedor consegue subir ambiente local, rodar testes e validar payloads TMF sem dependência corporativa. |
| F1B - Staging corporativo | Ago-Set/2026 | Promover a base madura para banco corporativo e serviços corporativos. | Adapter Oracle/banco corporativo, Kafka/Schema Registry ou equivalentes corporativos, secrets/config, observabilidade, validação de performance inicial. | Mesmos testes do SQLite passam contra banco corporativo; divergências de SQL e transação estão documentadas. |
| F2 - MVP Produção Região 1 em OpenShift | Out-Dez/2026 | Sustentar sunset Netwin em Dez/2026 para escopo de Sites e Resources. | Geographic + Resource deployados em OpenShift corporativo, banco corporativo, wave 1 Netwin, `_origin`, dual-running, consultas operacionais e mapa mínimo. | Operação Região 1 consegue consultar, correlacionar e auditar Sites/Resources sem depender de escrita no Netwin para novo inventário. |
| F3 - Service, Order e Party | Jan-Mar/2027 | Introduzir Service Inventory e fundamentos de ordem/tenant. | MOD03, MOD04 mínimo TMF641/TMF645, MOD06 Party/Tenant, SubscriberID Nexus-native, pipeline OpenShift maduro. | CFS/RFS criados por ordem, com `relatedParty` reconciliado e viabilidade TMF645 fora do Service Inventory. |
| F4 - Migração Região 2 | Abr-Jun/2027 | Migrar NetworkCore e Octave EAM antes do sunset de Mai/2027. | Wave 2 OSP/ISP/ativos físicos, reconciliação, relatórios de cobertura e rollback operacional. | Região 2 operando no Nexus para escopo migrado, com trilha `_origin` completa. |
| F5 - Maturidade de plataforma | Jul-Dez/2027 | Completar Process, Analytics e Platform/Admin. | MOD05 BPMN, MOD07 analytics/eventos/documentos, MOD08 administração/RBAC/audit avançados, integração Um Telecom iniciada. | Plataforma completa, governança operacional e consumidores analíticos estabilizados. |

## 3.1 Estratégia De Ambientes E Persistência

| Estágio | Persistência | Runtime | Objetivo | Limites explícitos |
|---|---|---|---|---|
| Local isolado | SQLite | Máquina do desenvolvedor / CI local | Acelerar desenvolvimento, testes unitários, testes de contrato e exploração de modelo. | Não valida performance, particionamento, concorrência real, Property Graph corporativo nem integrações corporativas. |
| Staging corporativo | Oracle/banco corporativo alvo | Ambiente corporativo não produtivo | Validar dialeto SQL, transações, migrações, volume inicial, outbox real e integrações corporativas. | Não deve aceitar atalhos que existam só em SQLite. |
| Produção corporativa | Oracle/banco corporativo alvo | OpenShift corporativo | Operação real com RBAC, audit, observabilidade, secrets, scaling e integração com legados. | SQLite não é permitido em produção nem homologação corporativa. |

SQLite é uma decisão de implementação local para reduzir fricção e permitir testes isolados. A arquitetura-alvo permanece C10: Oracle-native + Property Graph no ambiente corporativo.

## 4. Milestones De Produto

| Milestone | Data alvo | Escopo | Dependências críticas |
|---|---|---|---|
| M0 - Plano técnico aprovado | Jul/2026 | Delivery plan, backlog, riscos, decisões e questões consolidados. | Este pacote documental. |
| M1 - Foundation local ready | Jul/2026 | SQLite local, migrations, seeds, testes de contrato, outbox local. | Fechamento de INC-005 e ADR-PEND-001 sem violar C10. |
| M2 - MOD01 local/staging | Ago/2026 | GeographicLocation, GeographicAddress, GeographicSiteSpecification, GeographicSite. | Q-GEO-001, Q-GEO-002, Q-GEO-005, Q-GEO-009. |
| M3 - MOD02 local/staging | Set/2026 | Resource catalog, inventory base, lifecycle, containment, OSP/ISP core. | Q-RES-001, Q-RES-004, Q-RES-007, Q-RES-008. |
| M4 - Corporate staging ready | Set/2026 | Banco corporativo, outbox real, observabilidade e pipeline OpenShift não produtivo. | Testes SQLite reproduzidos contra banco corporativo. |
| M5 - MVP Região 1 | Dez/2026 | Produção MOD01-MOD02 em OpenShift com migração Netwin wave 1. | Migração `_origin`, dual-running, NFRs mínimos e suporte operacional. |
| M6 - Service foundation | Mar/2027 | MOD03 com Party/Order mínimos. | MOD06, MOD04, Q-SVC-001, Q-SVC-002, Q-SVC-004. |
| M7 - Região 2 migrada | Jun/2027 | NetworkCore + Octave EAM migrados. | Pipeline de migração, performance de graph/path e validação operacional. |

## 5. Critérios Gerais De Aceite

| Categoria | Critério |
|---|---|
| TMF-first | Contratos HTTP, payloads e eventos seguem TMF; extensões V.tal são `characteristic` tipadas. |
| Fronteiras | Service referencia Resource via `supportingResource`; Resource referencia Geo via `place`; CFS não referencia Resource diretamente. |
| Identidade | UUID v7 Nexus-native para toda entidade; IDs legados somente em `_origin` read-only. |
| Persistência | Soft-delete/soft-terminate, sem exclusão física em entidades auditáveis. |
| Eventos | Mudanças relevantes publicam TMF688 por outbox, com idempotência e schema versionado. |
| Multi-tenant | `relatedParty` existe desde a criação; validação pode ser diferida apenas onde já decidido. |
| Operação | Migração tem relatório de cobertura, cross-reference legado e suporte a dual-running. |
| Portabilidade | O mesmo contrato de repositório roda em SQLite local e banco corporativo; diferenças de dialeto são isoladas em adapters. |
| Deploy | Ambiente corporativo usa OpenShift, configuração externa, secrets corporativos, health checks e observabilidade. |

## 6. Observações De Execução

- MOD01 e MOD02 são caminho crítico para Netwin Dez/2026.
- MOD06 é dependência funcional de MOD03, mas MOD03 já tem decisão D-3 permitindo validação diferida no MVP.
- MOD04 é dono de TMF645/Viabilidade e deve impedir que Home Passed vire Service.
- MOD05 é necessário para swap/decommissioning orquestrado, mas parte das operações pode ser bloqueada até a fase de maturidade se não for essencial ao MVP.
- MOD07 e MOD08 são transversais; seus contratos mínimos precisam existir antes do MVP mesmo que os módulos completos venham depois.
- SQLite deve ser tratado como harness de desenvolvimento e teste, nunca como arquitetura produtiva.
- A passagem SQLite -> banco corporativo deve acontecer antes de qualquer compromisso de MVP produtivo, para evitar maturidade falsa baseada em um banco mais simples.

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
