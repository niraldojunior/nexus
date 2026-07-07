# Plano de ImplementaÃ§Ã£o - Roadmap

> Data base: 27/06/2026  
> Fonte: AGENTS.md, README.md, `docs/00-visao-geral`, HLDs MOD01-MOD03, `docs/02-system-design` e `docs/03-design-system`.


Status atual: o backend local ja cobre Geo, Party, Resource, Service, TMF645, TMF641, TMF652 e TMF688 com SQLite e testes automatizados.

Este roadmap transforma a documentaÃ§Ã£o funcional e arquitetural existente em um plano tÃ©cnico de entrega para o V.tal Nexus. O plano nÃ£o altera a arquitetura definida; ele organiza a execuÃ§Ã£o, explicita inconsistÃªncias documentais, registra dependÃªncias e destaca decisÃµes ainda pendentes.

O detalhamento das APIs do backend estÃ¡ consolidado em `docs/04-delivery-plan/backend-api-plan.md`.

O produto segue a trÃ­ade canÃ´nica:

| Pergunta | MÃ³dulo | APIs TMF | Status real em 27/06/2026 |
|---|---|---|---|
| Onde? | MOD01 - Nexus Geographic | TMF673, TMF674, TMF675, TMF688 | Em elaboraÃ§Ã£o, 12 requisitos levantados |
| O quÃª? | MOD02 - Nexus Resource | TMF634, TMF639, TMF664, TMF688 | Em elaboraÃ§Ã£o, 25 requisitos levantados |
| Para quÃª / quem? | MOD03 - Nexus Service | TMF633, TMF638, TMF688 | Em elaboraÃ§Ã£o, 16 requisitos levantados |

## 2. InconsistÃªncias de Base

| ID | InconsistÃªncia | Impacto no roadmap | AÃ§Ã£o de delivery |
|---|---|---|---|
| INC-001 | `business-rules.md` estÃ¡ vazio, apesar de ser fonte prevista para C1-C10. | DecisÃµes transversais ficam espalhadas entre AGENTS.md, Overview e HLDs. | Tratar `architecture-decisions.md` como consolidaÃ§Ã£o operacional atÃ© o arquivo canÃ´nico ser preenchido. |
| INC-002 | `glossary.md` estÃ¡ vazio. | Risco de termos divergentes entre mÃ³dulos e UI. | Criar item de backlog documental para glossÃ¡rio mÃ­nimo antes da Fase 1. |
| INC-003 | Overview marca MOD03 como "NÃ£o iniciado", mas `03-modulo-service.md` existe e cobre REQ-MOD03-001 a 016. | Roadmap e status executivo ficam defasados. | Considerar MOD03 como "Em elaboraÃ§Ã£o" neste plano. |
| INC-004 | Overview consolida questÃµes abertas apenas de MOD01-MOD02. | DecisÃµes de Service ficam fora da visÃ£o consolidada. | Consolidar MOD03 em `open-questions.md`. |
| INC-005 | `02-system-design/*` Ã© genÃ©rico e cita NestJS/Fastify, mÃºltiplos backends e RMQ, mas o cÃ¢none exige Oracle 21c/23ai, Property Graph, Kafka/outbox e Schema Registry. | Risco de implementaÃ§Ã£o seguir uma arquitetura tÃ©cnica inferior ao HLD. | Backlog P0 para alinhar design tÃ©cnico ao cÃ¢none antes de construir foundations. |
| INC-006 | UI kit usa termos de protÃ³tipo/legado como Geosite, Geonet e Viabilidade Fuzzy. | Risco de UX reforÃ§ar taxonomia antiga em vez da trÃ­ade TMF. | Backlog de alinhamento semÃ¢ntico do design system e telas. |

## 3. Roadmap Por Fase

| Fase | PerÃ­odo | Objetivo | Entregas mÃ­nimas | CritÃ©rio de saÃ­da |
|---|---|---|---|---|
| F0 - Fechamento tÃ©cnico | Jul/2026 | Converter HLDs em base implementÃ¡vel. | DecisÃµes P0 fechadas, system design alinhado, backlog priorizado, contratos TMF688 e `_origin` consolidados. | Nenhuma decisÃ£o P0 bloqueando MOD01-MOD02. |
| F1A - Build local SQLite | Jul-Ago/2026 | Construir foundation isolada e testÃ¡vel localmente. | MOD01/MOD02 core com adapter SQLite, migrations locais, seed de catÃ¡logos, testes de contrato, eventos em outbox local. | Desenvolvedor consegue subir ambiente local, rodar testes e validar payloads TMF sem dependÃªncia corporativa. |
| F1B - Staging corporativo | Ago-Set/2026 | Promover a base madura para banco corporativo e serviÃ§os corporativos. | Adapter Oracle/banco corporativo, Kafka/Schema Registry ou equivalentes corporativos, secrets/config, observabilidade, validaÃ§Ã£o de performance inicial. | Mesmos testes do SQLite passam contra banco corporativo; divergÃªncias de SQL e transaÃ§Ã£o estÃ£o documentadas. |
| F2 - MVP ProduÃ§Ã£o RegiÃ£o 1 em OpenShift | Out-Dez/2026 | Sustentar sunset Netwin em Dez/2026 para escopo de Sites e Resources. | Geographic + Resource deployados em OpenShift corporativo, banco corporativo, wave 1 Netwin, `_origin`, dual-running, consultas operacionais e mapa mÃ­nimo. | OperaÃ§Ã£o RegiÃ£o 1 consegue consultar, correlacionar e auditar Sites/Resources sem depender de escrita no Netwin para novo inventÃ¡rio. |
| F3 - Service, Order e Party | Jan-Mar/2027 | Introduzir Service Inventory e fundamentos de ordem/tenant. | MOD03, MOD04 mÃ­nimo TMF641/TMF645, MOD06 Party/Tenant, SubscriberID Nexus-native, pipeline OpenShift maduro. | CFS/RFS criados por ordem, com `relatedParty` reconciliado e viabilidade TMF645 fora do Service Inventory. |
| F4 - MigraÃ§Ã£o RegiÃ£o 2 | Abr-Jun/2027 | Migrar NetworkCore e Octave EAM antes do sunset de Mai/2027. | Wave 2 OSP/ISP/ativos fÃ­sicos, reconciliaÃ§Ã£o, relatÃ³rios de cobertura e rollback operacional. | RegiÃ£o 2 operando no Nexus para escopo migrado, com trilha `_origin` completa. |
| F5 - Maturidade de plataforma | Jul-Dez/2027 | Completar Process, Analytics e Platform/Admin. | MOD05 BPMN, MOD07 analytics/eventos/documentos, MOD08 administraÃ§Ã£o/RBAC/audit avanÃ§ados, integraÃ§Ã£o Um Telecom iniciada. | Plataforma completa, governanÃ§a operacional e consumidores analÃ­ticos estabilizados. |

## 3.1 EstratÃ©gia De Ambientes E PersistÃªncia

| EstÃ¡gio | PersistÃªncia | Runtime | Objetivo | Limites explÃ­citos |
|---|---|---|---|---|
| Local isolado | SQLite | MÃ¡quina do desenvolvedor / CI local | Acelerar desenvolvimento, testes unitÃ¡rios, testes de contrato e exploraÃ§Ã£o de modelo. | NÃ£o valida performance, particionamento, concorrÃªncia real, Property Graph corporativo nem integraÃ§Ãµes corporativas. |
| Staging corporativo | Oracle/banco corporativo alvo | Ambiente corporativo nÃ£o produtivo | Validar dialeto SQL, transaÃ§Ãµes, migraÃ§Ãµes, volume inicial, outbox real e integraÃ§Ãµes corporativas. | NÃ£o deve aceitar atalhos que existam sÃ³ em SQLite. |
| ProduÃ§Ã£o corporativa | Oracle/banco corporativo alvo | OpenShift corporativo | OperaÃ§Ã£o real com RBAC, audit, observabilidade, secrets, scaling e integraÃ§Ã£o com legados. | SQLite nÃ£o Ã© permitido em produÃ§Ã£o nem homologaÃ§Ã£o corporativa. |

SQLite Ã© uma decisÃ£o de implementaÃ§Ã£o local para reduzir fricÃ§Ã£o e permitir testes isolados. A arquitetura-alvo permanece C10: Oracle-native + Property Graph no ambiente corporativo.

## 4. Milestones De Produto

| Milestone | Data alvo | Escopo | DependÃªncias crÃ­ticas |
|---|---|---|---|
| M0 - Plano tÃ©cnico aprovado | Jul/2026 | Delivery plan, backlog, riscos, decisÃµes e questÃµes consolidados. | Este pacote documental. |
| M1 - Foundation local ready | Jul/2026 | SQLite local, migrations, seeds, testes de contrato, outbox local. | Fechamento de INC-005 e ADR-PEND-001 sem violar C10. |
| M2 - MOD01 local/staging | Ago/2026 | GeographicLocation, GeographicAddress, GeographicSiteSpecification, GeographicSite. | Q-GEO-001, Q-GEO-002, Q-GEO-005, Q-GEO-009. |
| M3 - MOD02 local/staging | Set/2026 | Resource catalog, inventory base, lifecycle, containment, OSP/ISP core. | Q-RES-001, Q-RES-004, Q-RES-007, Q-RES-008. |
| M4 - Corporate staging ready | Set/2026 | Banco corporativo, outbox real, observabilidade e pipeline OpenShift nÃ£o produtivo. | Testes SQLite reproduzidos contra banco corporativo. |
| M5 - MVP RegiÃ£o 1 | Dez/2026 | ProduÃ§Ã£o MOD01-MOD02 em OpenShift com migraÃ§Ã£o Netwin wave 1. | MigraÃ§Ã£o `_origin`, dual-running, NFRs mÃ­nimos e suporte operacional. |
| M6 - Service foundation | Mar/2027 | MOD03 com Party/Order mÃ­nimos. | MOD06, MOD04, Q-SVC-001, Q-SVC-002, Q-SVC-004. |
| M7 - RegiÃ£o 2 migrada | Jun/2027 | NetworkCore + Octave EAM migrados. | Pipeline de migraÃ§Ã£o, performance de graph/path e validaÃ§Ã£o operacional. |

## 5. CritÃ©rios Gerais De Aceite

| Categoria | CritÃ©rio |
|---|---|
| TMF-first | Contratos HTTP, payloads e eventos seguem TMF; extensÃµes V.tal sÃ£o `characteristic` tipadas. |
| Fronteiras | Service referencia Resource via `supportingResource`; Resource referencia Geo via `place`; CFS nÃ£o referencia Resource diretamente. |
| Identidade | UUID v7 Nexus-native para toda entidade; IDs legados somente em `_origin` read-only. |
| PersistÃªncia | Soft-delete/soft-terminate, sem exclusÃ£o fÃ­sica em entidades auditÃ¡veis. |
| Eventos | MudanÃ§as relevantes publicam TMF688 por outbox, com idempotÃªncia e schema versionado. |
| Multi-tenant | `relatedParty` existe desde a criaÃ§Ã£o; validaÃ§Ã£o pode ser diferida apenas onde jÃ¡ decidido. |
| OperaÃ§Ã£o | MigraÃ§Ã£o tem relatÃ³rio de cobertura, cross-reference legado e suporte a dual-running. |
| Portabilidade | O mesmo contrato de repositÃ³rio roda em SQLite local e banco corporativo; diferenÃ§as de dialeto sÃ£o isoladas em adapters. |
| Deploy | Ambiente corporativo usa OpenShift, configuraÃ§Ã£o externa, secrets corporativos, health checks e observabilidade. |

## 6. ObservaÃ§Ãµes De ExecuÃ§Ã£o

- MOD01 e MOD02 sÃ£o caminho crÃ­tico para Netwin Dez/2026.
- MOD06 Ã© dependÃªncia funcional de MOD03, mas MOD03 jÃ¡ tem decisÃ£o D-3 permitindo validaÃ§Ã£o diferida no MVP.
- MOD04 Ã© dono de TMF645/Viabilidade e deve impedir que Home Passed vire Service.
- MOD05 Ã© necessÃ¡rio para swap/decommissioning orquestrado, mas parte das operaÃ§Ãµes pode ser bloqueada atÃ© a fase de maturidade se nÃ£o for essencial ao MVP.
- MOD07 e MOD08 sÃ£o transversais; seus contratos mÃ­nimos precisam existir antes do MVP mesmo que os mÃ³dulos completos venham depois.
- SQLite deve ser tratado como harness de desenvolvimento e teste, nunca como arquitetura produtiva.
- A passagem SQLite -> banco corporativo deve acontecer antes de qualquer compromisso de MVP produtivo, para evitar maturidade falsa baseada em um banco mais simples.

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÃšBLICA*


