# Questões Em Aberto

> ⚠️ **Este arquivo foi consolidado.** O registro de governança das questões em aberto passou a ser
> único e vive em **[`../1-overview/open-questions.md`](../1-overview/open-questions.md)**.
>
> Ele reúne as questões dos HLDs (`Q-GEO`, `Q-RES`, `Q-SVC`), do system design (`Q-INT`, `Q-ARQ`) e
> do plano de entrega, com estado, responsável e ordem de prioridade.

Manter duas listas garante que uma envelheça sem ninguém perceber. Registre e consulte apenas o
arquivo central.

## Recorte para o plano de entrega

O que interessa aqui é **qual fase cada questão bloqueia**:

| Fase | Questões bloqueadoras |
|---|---|
| **Pré-requisito de escala** | Q-ARQ-001 (refactor assíncrono) |
| **F0/F1 — Fundação e Geo** | Q-GEO-001, Q-GEO-005, Q-GEO-008, Q-INT-005 |
| **F1 — Resource** | Q-RES-001, Q-RES-004, Q-RES-007 |
| **F1/F3 — Migração** | Q-INT-002, Q-INT-005, Q-RES-008 |
| **F3 — Service e Order** | Q-SVC-001, Q-SVC-002, Q-SVC-004 |
| **F2/F5 — Assurance** | Q-SVC-006, Q-SVC-007, Q-RES-011 |

Roadmap detalhado em [`implementation-roadmap.md`](implementation-roadmap.md).

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
