# Sequência de implementação

> Sequência de convergência a partir da implementação-base existente, com persistência dual PostgreSQL/Oracle (laboratório hospedado em Neon). Não é um plano de construção do zero e não altera o cânone C1–C10.

## 1. Princípios

- Fechar contratos transversais antes de replicar soluções parciais nos módulos.
- Executar Geographic antes das extensões Resource dependentes de `place`, e Resource antes dos fluxos Service dependentes de `supportingResource`.
- Tratar perguntas abertas como bloqueadores explícitos; decisões resolvidas usam IDs `D-*`.
- Manter endpoints propostos fora do runtime até o item `DEV-*` correspondente ser implementado e testado.
- Preservar o suporte dual PostgreSQL/Oracle como implementado (C10); path computation via SQL recursivo portável, sem Property Graph.

## 2. Ondas

| Onda | Escopo                          | Backlog                                                                                                                                                                                                                                                                                             | Dependências                                                                                                                                                                                                                                                                                                    | Gate de saída                                                    |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0    | Qualidade documental e baseline | `docs:check`                                                                                                                                                                                                                                                                                        | Nenhuma                                                                                                                                                                                                                                                                                                         | 53 REQ no resumo, corpo e matriz; gaps, Q/D e links rastreáveis. |
| 1    | Identidade, eventos e segurança | [#157](https://github.com/niraldojunior/nexus/issues/157)–[#160](https://github.com/niraldojunior/nexus/issues/160)                                                                                                                                                                                 | `D-ARQ-001`, MOD06/MOD08                                                                                                                                                                                                                                                                                        | C5/C7/C8/C9 comprovados em testes transversais.                  |
| 2    | Catálogos Geo/Resource/Service  | [#132](https://github.com/niraldojunior/nexus/issues/132), [#142](https://github.com/niraldojunior/nexus/issues/142)/[#147](https://github.com/niraldojunior/nexus/issues/147), [#151](https://github.com/niraldojunior/nexus/issues/151)/[#156](https://github.com/niraldojunior/nexus/issues/156) | `D-GEO-003`/[#104](https://github.com/niraldojunior/nexus/issues/104), [#112](https://github.com/niraldojunior/nexus/issues/112)/[#119](https://github.com/niraldojunior/nexus/issues/119), [#122](https://github.com/niraldojunior/nexus/issues/122)/[#125](https://github.com/niraldojunior/nexus/issues/125) | Extensão por API sem deploy e strings inválidas rejeitadas.      |
| 3    | Geographic                      | [#130](https://github.com/niraldojunior/nexus/issues/130)/[#131](https://github.com/niraldojunior/nexus/issues/131)/[#133](https://github.com/niraldojunior/nexus/issues/133)–[#135](https://github.com/niraldojunior/nexus/issues/135)                                                             | Geosite, [#102](https://github.com/niraldojunior/nexus/issues/102)/[#105](https://github.com/niraldojunior/nexus/issues/105)/[#106](https://github.com/niraldojunior/nexus/issues/106)/[#107](https://github.com/niraldojunior/nexus/issues/107)/[#108](https://github.com/niraldojunior/nexus/issues/108)      | Consultas, hierarquia, lifecycle, mapa e bulk aprovados.         |
| 4    | Resource sem path               | [#143](https://github.com/niraldojunior/nexus/issues/143)/[#145](https://github.com/niraldojunior/nexus/issues/145)/[#146](https://github.com/niraldojunior/nexus/issues/146)                                                                                                                       | Onda 3, [#115](https://github.com/niraldojunior/nexus/issues/115)/[#116](https://github.com/niraldojunior/nexus/issues/116)/[#118](https://github.com/niraldojunior/nexus/issues/118), MOD05                                                                                                                    | OSP, ISP e LogicalResource aprovados em cenários.                |
| 5    | Path e escala Oracle-native     | [#144](https://github.com/niraldojunior/nexus/issues/144), [#161](https://github.com/niraldojunior/nexus/issues/161)                                                                                                                                                                                | [#117](https://github.com/niraldojunior/nexus/issues/117), `D-ARQ-001`                                                                                                                                                                                | OLT→ONT correto via SQL recursivo e benchmark corporativo aprovado. |
| 6    | Service                         | [#152](https://github.com/niraldojunior/nexus/issues/152)–[#155](https://github.com/niraldojunior/nexus/issues/155)                                                                                                                                                                                 | Ondas 2/4, MOD05/MOD06, [#123](https://github.com/niraldojunior/nexus/issues/123)/[#124](https://github.com/niraldojunior/nexus/issues/124)/[#126](https://github.com/niraldojunior/nexus/issues/126)/[#127](https://github.com/niraldojunior/nexus/issues/127)                                                 | CFS/RFS, SubscriberID, impacto e cenários end-to-end aprovados.  |
| 7    | Migração e operação             | Integrações, `_origin`, observabilidade                                                                                                                                                                                                                                                             | Ondas 1/3/4/6                                                                                                                                                                                                                                                                                                   | Dry-run, reconciliação, dual-running e rollback aprovados.       |

## 3. Ordem dentro de cada domínio

### 3.1 Geographic

1. SiteSpecification/containment governados (REQ-MOD01-003/009).
2. Location e Address espaciais/integrados (REQ-MOD01-001/002).
3. Site, Region, Group e Sub-Site (REQ-MOD01-004–007).
4. Lifecycle, relações e impacto (REQ-MOD01-008/010).
5. Mapa/viewport e bulk (REQ-MOD01-011 e gaps de 002/006).
6. Eventos transacionais (REQ-MOD01-012 via [#158](https://github.com/niraldojunior/nexus/issues/158)).

### 3.2 Resource

1. Catálogo e fabricante PartyRef (REQ-MOD02-001–004).
2. Inventário/lifecycle/relationship governado (REQ-MOD02-005–007/024).
3. OSP (REQ-MOD02-008–011).
4. ISP, energia e conexões (REQ-MOD02-013–019).
5. IPAM e demais LogicalResources (REQ-MOD02-020–023).
6. Path computation (REQ-MOD02-012), após grafo e volume dimensionados.
7. Eventos transacionais (REQ-MOD02-025 via [#158](https://github.com/niraldojunior/nexus/issues/158)).

### 3.3 Service

1. Service Catalog governado (REQ-MOD03-001–003).
2. Inventory, lifecycle e place (REQ-MOD03-004/005/010).
3. CFS, RFS, supportingResource e supportingService (REQ-MOD03-006–009).
4. SubscriberID com Party/Tenant (REQ-MOD03-011).
5. Bitstream, empresarial e CloudVoIP (REQ-MOD03-012–014).
6. RelationshipType governado (REQ-MOD03-015).
7. Eventos transacionais (REQ-MOD03-016 via [#158](https://github.com/niraldojunior/nexus/issues/158)).

## 4. Gates de qualidade

| Gate            | Critério                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| G0 — Documento  | `npm run docs:check` aprovado.                                                         |
| G1 — Código     | lint, typecheck e build aprovados.                                                     |
| G2 — Contrato   | Testes unitários e integrados cobrem RF/RN/CA alterados.                               |
| G3 — Fronteiras | CFS→Resource direto, Resource contendo Geo e Service contendo Resource são rejeitados. |
| G4 — Operação   | Eventos, audit, autorização e retries possuem cenários de falha.                       |
| G5 — Escala     | Teste de volume/concorrência e benchmark do banco alvo atendem NFR aprovado.           |
| G6 — Migração   | Contagens, `_origin`, reconciliação, dual-running e rollback aprovados.                |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
