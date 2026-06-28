# Riscos Do Projeto

> Escala: Severidade e probabilidade em Baixa, Média, Alta, Crítica.

## 1. Risk Register

| ID | Risco | Severidade | Probabilidade | Impacto | Mitigação | Dono sugerido |
|---|---|---:|---:|---|---|---|
| R-001 | Prazo Netwin Dez/2026 sem MOD01-MOD02 em produção. | Crítica | Alta | Operação fica dependente de sistema fora de suporte. | Foco P0 em Geographic/Resource, reduzir escopo não essencial e antecipar migração dry-run. | PMO + Arquitetura |
| R-002 | NetworkCore/Octave EAM Mai/2027 sem migração Região 2. | Crítica | Média | Região 2 mantém risco operacional e suporte encerrado. | Planejar wave 2 desde F1, validar `_origin` e OSP cedo. | Migração + OSP |
| R-003 | Oracle Property Graph subdimensionado para 22M+ HPs. | Alta | Média | Path computation lento ou inviável. | Benchmark obrigatório antes de MVP; definir cache e degradação funcional. | Plataforma |
| R-004 | `02-system-design` guiar implementação fora do cânone. | Alta | Alta | Stack real diverge de C7/C10 e dos HLDs. | P0 para reescrever design técnico antes de desenvolvimento. | Arquitetura |
| R-005 | Catálogos iniciais não fechados. | Alta | Alta | MOD01/MOD02 não conseguem criar instâncias consistentes. | Workshops curtos para SiteSpec e ResourceSpec MVP; versionar catálogo. | Produto + Engenharia |
| R-006 | Eventos TMF688/outbox sem contrato transversal. | Alta | Média | Integrações frágeis, polling e inconsistência transacional. | Definir envelope, tópicos, schema e DLQ como foundation. | Arquitetura + Plataforma |
| R-007 | MOD06 Party atrasado. | Alta | Média | Multi-tenancy e Service ficam parcialmente validados. | Usar D-3 para Service MVP; definir Party mínimo antes de F3. | Produto + BSS |
| R-008 | MOD04/TMF645 atrasado. | Alta | Média | Viabilidade e HP podem ser modelados incorretamente em Service. | Reforçar C4; criar Order/Qualification mínimo cedo. | Produto + Order |
| R-009 | RBAC/audit insuficiente. | Alta | Média | Produção insegura, risco multi-tenant e migração sem trilha. | MOD08 mínimo antes do MVP; role MigrationJob e audit obrigatório. | Segurança |
| R-010 | Migração legado com baixa qualidade de dados. | Alta | Alta | Dados duplicados, incompletos ou sem rastreabilidade. | Regras de saneamento, relatórios por wave, reconciliação e rollback operacional. | Migração |
| R-011 | IPAM legado sem fonte clara. | Média | Alta | LogicalResource incompleto, impacto em serviços empresariais. | Inventariar fontes IPAM e definir carga inicial P1. | Backbone |
| R-012 | Fibers internas modeladas com granularidade errada. | Média | Média | Volume excessivo ou path computation incompleto. | Decisão Q-RES-007 com benchmark e cenários OSP. | OSP + Arquitetura |
| R-013 | UI reforça terminologia legada. | Média | Média | Usuários e stakeholders confundem domínios canônicos. | Alinhar UI kit à tríade TMF e manter Geosite/Geonet como sistemas de origem. | Design + Produto |
| R-014 | Design system sem governança de tokens/metadados. | Baixa | Média | Automação de UI e lint podem produzir falsos positivos. | Corrigir manifest/adherence em P2. | Frontend |
| R-015 | Service Assurance externo não consumir eventos esperados. | Média | Média | Impact analysis insuficiente no MVP. | Validar contrato com consumidor externo usando eventos Resource e Service. | Operações |
| R-016 | Decisions spread sem business-rules preenchido. | Média | Alta | Decisões se perdem ou são reabertas indevidamente. | Preencher `business-rules.md` após aprovação do plano. | Arquitetura |
| R-017 | Maturidade falsa por validar apenas em SQLite. | Alta | Média | A aplicação parece pronta localmente, mas falha em transações, SQL, volume ou concorrência no banco corporativo. | Gate obrigatório F1B com suíte de integração contra banco corporativo antes de MVP. | Arquitetura + Engenharia |
| R-018 | Divergência entre migrations SQLite e banco corporativo. | Média | Média | Bugs aparecem tarde em constraints, índices, tipos, paginação ou filtros. | Manter migrations/adapters versionados e testes de contrato compartilhados. | Engenharia |
| R-019 | Deploy OpenShift corporativo descoberto tarde. | Alta | Média | A aplicação funciona localmente, mas não atende secrets, probes, logs, routes, policies ou observabilidade corporativa. | Criar pipeline OpenShift não produtivo ainda em F1B. | Plataforma |

## 2. Top 6 Riscos Para Governança Semanal

| Ordem | Risco | Indicador antecipado |
|---|---|---|
| 1 | R-001 Netwin | MOD01/MOD02 sem staging até Set/2026. |
| 2 | R-004 System design divergente | Implementação começa antes de ADR-PEND-001. |
| 3 | R-003 Property Graph | Benchmark não executado antes do desenho físico de Resource. |
| 4 | R-010 Migração | Falta de relatório `_origin` por wave ou baixa qualidade de dados origem. |
| 5 | R-007/R-008 Party e Order | MOD03 avança criando atalhos que violam C3/C4/C8. |
| 6 | R-017 SQLite-only | Funcionalidades fechadas sem execução da suíte contra banco corporativo. |

## 3. Mitigações Estruturais

| Mitigação | Riscos reduzidos |
|---|---|
| Gate técnico F0 antes de desenvolvimento. | R-003, R-004, R-006, R-009. |
| Catálogos MVP congelados por versão. | R-005, R-010, R-012. |
| Pipeline de migração com `_origin` e relatórios. | R-001, R-002, R-010. |
| Testes de contrato TMF e eventos. | R-006, R-015. |
| Revisão quinzenal de decisões pendentes. | R-007, R-008, R-016. |
| Suíte dupla SQLite + banco corporativo. | R-017, R-018. |
| Deploy OpenShift não produtivo desde staging. | R-019. |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
