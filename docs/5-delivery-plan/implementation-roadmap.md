# Plano de implementação — Roadmap

> **Data-base:** 31/07/2026
> **Fontes:** AGENTS.md, Overview, HLDs MOD01–MOD03, system design e matrizes `2.3 Aderência ao codebase atual`.

## 1. Baseline real

O runtime atual é TypeScript/Node, React/Vite e Neon Postgres. Geo, Resource e Service possuem implementação-base executável, APIs TMF, frontend e testes; isso não equivale à aderência integral aos 53 requisitos. O alvo corporativo de C10 continua Oracle 21c/23ai + Property Graph.

| Módulo             | HLD | Base existente                                                       | Aderência atual                                    |
| ------------------ | --- | -------------------------------------------------------------------- | -------------------------------------------------- |
| MOD01 — Geographic | 1.2 | TMF673/674/675, árvore, busca, viewport, mapa e criação transacional | 12 requisitos `Parcial`                            |
| MOD02 — Resource   | 1.3 | TMF634/639/664, filtros, paginação, catálogo/inventário e workspace  | 23 `Parcial`, 1 `Não implementado`, 1 `Divergente` |
| MOD03 — Service    | 1.1 | TMF633/638, CFS/RFS, workspace, UI/MCP e proteção CFS→RFS→Resource   | 15 `Parcial`, 1 `Divergente`                       |

As contagens são um retrato de julho de 2026. A fonte de detalhe é cada matriz 2.3; o destino de cada gap é uma [GitHub Issue com label `tipo:lacuna`](https://github.com/niraldojunior/nexus/issues?q=is%3Aopen+label%3Atipo%3Alacuna).

## 2. Frentes de convergência

| Frente                         | Objetivo                                                              | Itens líderes                                                                                                                                                                                                                                                                                                                                                  | Saída verificável                                                              |
| ------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| F0 — Governança documental     | Manter HLD, decisões, perguntas e backlog sincronizados.              | `npm run docs:check`                                                                                                                                                                                                                                                                                                                                           | CI rejeita estrutura, JSON, link, benchmark ou rastreabilidade inválidos.      |
| F1 — Cânone transversal        | Entregar identidade/proveniência, eventos e multi-tenancy.            | [#157](https://github.com/niraldojunior/nexus/issues/157)–[#160](https://github.com/niraldojunior/nexus/issues/160)                                                                                                                                                                                                                                            | UUID v7/`_origin`, outbox/registry e isolamento por tenant aprovados em teste. |
| F2 — Catálogos governados      | Remover listas fechadas e strings livres de domínio.                  | [#132](https://github.com/niraldojunior/nexus/issues/132), [#142](https://github.com/niraldojunior/nexus/issues/142)/[#147](https://github.com/niraldojunior/nexus/issues/147), [#151](https://github.com/niraldojunior/nexus/issues/151)/[#156](https://github.com/niraldojunior/nexus/issues/156), [#159](https://github.com/niraldojunior/nexus/issues/159) | Specifications e RelationshipTypes extensíveis por API, auditados e validados. |
| F3 — Geographic completo       | Fechar consultas espaciais, hierarquia, lifecycle, integração e bulk. | [#130](https://github.com/niraldojunior/nexus/issues/130)–[#135](https://github.com/niraldojunior/nexus/issues/135)                                                                                                                                                                                                                                            | HLD MOD01 sem gaps funcionais obrigatórios.                                    |
| F4 — Resource completo         | Fechar OSP/ISP, IPAM, path e invariantes físicas/lógicas.             | [#143](https://github.com/niraldojunior/nexus/issues/143)–[#146](https://github.com/niraldojunior/nexus/issues/146)                                                                                                                                                                                                                                            | HLD MOD02 com cenários OSP/ISP e path aprovados.                               |
| F5 — Service completo          | Fechar SubscriberID, ciclo/impacto e cenários comerciais.             | [#152](https://github.com/niraldojunior/nexus/issues/152)–[#155](https://github.com/niraldojunior/nexus/issues/155)                                                                                                                                                                                                                                            | HLD MOD03 com CFS/RFS e três cenários end-to-end aprovados.                    |
| F6 — Alvo corporativo e escala | Migrar adapters e path computation ao alvo C10.                       | [#161](https://github.com/niraldojunior/nexus/issues/161), [#144](https://github.com/niraldojunior/nexus/issues/144)                                                                                                                                                                                                                                           | Testes de contrato e benchmark aprovados em Oracle/Property Graph.             |

## 3. Sequência e dependências

```text
F0 docs/CI
   └── F1 identidade + eventos + tenant
       ├── F2 catálogos governados
       │   ├── F3 Geographic
       │   ├── F4 Resource ───────┐
       │   └── F5 Service ◀───────┘
       └── F6 Oracle/Graph ◀── path Resource
```

- Geographic precede Resource nos contratos `place`; Resource precede a conclusão de Service em `supportingResource`.
- MOD06 Party/Tenant bloqueia a aderência completa de C8 e SubscriberID; D-SVC-003 permite somente validação diferida no MVP.
- MOD05 bloqueia propagação de estado e swap orquestrado.
- `D-ARQ-001` foi decidida: interfaces assíncronas e seleção PostgreSQL/Oracle no boot; permanecem os gates de contrato e benchmark Oracle.
- [#114](https://github.com/niraldojunior/nexus/issues/114)/[#117](https://github.com/niraldojunior/nexus/issues/117) bloqueiam o desenho final de path computation e cache.

## 4. Marcos de aceite

| Marco                     | Escopo                                                                                                                                                                                                                                  | Critério de saída                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| M0 — Specs convergidas    | 53 requisitos, matrizes, decisões, questões e backlog                                                                                                                                                                                   | `docs:check`, lint, typecheck, build e testes aprovados.               |
| M1 — Foundation canônica  | [#157](https://github.com/niraldojunior/nexus/issues/157)–[#160](https://github.com/niraldojunior/nexus/issues/160)                                                                                                                     | Regras C5, C7, C8 e C9 deixam de ser parciais no código.               |
| M2 — Geographic aderente  | [#130](https://github.com/niraldojunior/nexus/issues/130)–[#135](https://github.com/niraldojunior/nexus/issues/135)                                                                                                                     | Todos os REQ-MOD01 atendem RF/RN/CA com testes.                        |
| M3 — Resource operacional | [#142](https://github.com/niraldojunior/nexus/issues/142)/[#143](https://github.com/niraldojunior/nexus/issues/143)/[#145](https://github.com/niraldojunior/nexus/issues/145)–[#147](https://github.com/niraldojunior/nexus/issues/147) | Catálogo, OSP/ISP e inventário lógico passam pelos cenários do HLD.    |
| M4 — Path e escala        | [#144](https://github.com/niraldojunior/nexus/issues/144), [#161](https://github.com/niraldojunior/nexus/issues/161)                                                                                                                    | OLT→ONT e benchmark corporativo aprovados.                             |
| M5 — Service aderente     | [#151](https://github.com/niraldojunior/nexus/issues/151)–[#156](https://github.com/niraldojunior/nexus/issues/156)                                                                                                                     | CFS/RFS, SubscriberID, impacto e cenários de produto aprovados.        |
| M6 — Migração controlada  | `_origin`, integrações e ondas de dados                                                                                                                                                                                                 | Dry-run, reconciliação, dual-running, rollback e cobertura auditáveis. |

Datas de produto e sunset devem ser replanejadas pelos donos após o dimensionamento das issues de lacuna (`tipo:lacuna`); este documento não transforma datas históricas em compromissos atuais.

## 5. Critérios gerais

| Categoria    | Critério                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| TMF-first    | Contratos e eventos seguem TMF; extensão V.tal entra como characteristic governada.                        |
| Fronteiras   | Resource referencia Geo; RFS referencia Resource; CFS referencia RFS e nunca Resource direto.              |
| Identidade   | UUID v7 Nexus-native e `_origin` somente-leitura.                                                          |
| Persistência | Soft-delete/terminate e histórico sem exclusão física.                                                     |
| Eventos      | Outbox transacional, idempotência, schema versionado, DLQ e reprocessamento.                               |
| Multi-tenant | `relatedParty`, autorização, segregação e audit desde o write.                                             |
| Evidência    | `Implementado` exige código e teste aprovado; endpoints propostos permanecem marcados como backlog.        |
| Alvo         | Neon Postgres é estado atual; Oracle/Property Graph é destino C10, sem alegação de paridade até benchmark. |

## 6. Riscos ligados

Os riscos ativos e seus gatilhos estão em [`project-risks.md`](project-risks.md). Os principais para esta sequência são escala síncrona, ausência de outbox, divergência de catálogos, identidade legada, path computation e falsa equivalência entre implementação-base e aderência ao HLD.

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
