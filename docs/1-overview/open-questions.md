# Questões em Aberto — Registro de Governança

> Fonte única de acompanhamento das decisões pendentes do V.tal Nexus. Consolida as questões dos
> HLDs de módulo, do system design e do plano de entrega.
>
> Regra: uma questão vive aqui. Os documentos de origem podem referenciá-la pelo ID, mas não
> mantêm listas paralelas.

**Atualizado em:** 12/08/2026

---

## 1. Painel

| Estado        | Significado                                         |
| ------------- | --------------------------------------------------- |
| 🔴 Aberta     | Sem decisão; alguém precisa decidir                 |
| 🟠 Aguardando | Depende de insumo externo                           |
| ✅ Decidida   | Resolvida; mantida no registro para rastreabilidade |

| Domínio                            | 🔴  | 🟠  | ✅  |
| ---------------------------------- | --- | --- | --- |
| Integrações (`Q-INT`)              | 1   | 1   | 6   |
| Geographic (`Q-GEO`)               | 8   | —   | 1   |
| Resource (`Q-RES`)                 | 10  | —   | —   |
| Service (`Q-SVC`)                  | 6   | —   | —   |
| Arquitetura / Plataforma (`Q-ARQ`) | 4   | —   | 2   |

---

## 2. Integrações

| ID            | Questão                                                                                                                                        | Estado                                                   | Responsável            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| **Q-INT-002** | CDC do Netwin via GoldenGate ou extração incremental agendada? A pergunta de fundo é quão fresco o Nexus precisa estar durante o dual-running. | 🔴 Aberta                                                | Arquitetura + DBA      |
| **Q-INT-005** | Mapeamento dos modelos de dados de Netwin, Geosite Legado e Network Core para o modelo canônico TMF.                                           | 🟠 Aguardando modelos dos legados                        | Arquitetura + Migração |
| Q-INT-001     | Qual serviço de geocodificação?                                                                                                                | ✅ Geosite Logradouros é premissa                        | —                      |
| Q-INT-003     | Formato e SLA da viabilidade em lote.                                                                                                          | ✅ Foto diária dos 22M + evento de divergência em tópico | —                      |
| Q-INT-004     | Sistema de provisionamento alvo.                                                                                                               | ✅ SIS, já abstrai gerências, AAA e IMS                  | —                      |
| Q-INT-006     | Conversão do CAD do Geonet para `SDO_GEOMETRY`.                                                                                                | ✅ Sem efeito; Geonet não migra                          | —                      |
| Q-INT-007     | O Geosite devolve procedência e precisão da coordenada?                                                                                        | ✅ Precisão sim, procedência não                         | —                      |
| Q-INT-008     | O CAD do Geonet cobre planta ou território?                                                                                                    | ✅ Só cartografia base; cobertura vem do Netwin          | —                      |

Detalhamento em [`../3-system-design/integrations.md`](../3-system-design/integrations.md).

---

## 3. Arquitetura e Plataforma

| ID            | Questão                                                                                                        | Estado                                          | Responsável              |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------ |
| **Q-ARQ-001** | Converter as interfaces de repositório para assíncronas (`Promise`) e selecionar PostgreSQL ou Oracle no boot. | ✅ Decidida — `DATABASE_PROVIDER`, sem fallback | Arquitetura + Engenharia |
| **Q-ARQ-002** | Confirmar com Privacidade que o Nexus é operador, e não controlador, na cadeia LGPD.                           | 🔴 Aberta                                       | Jurídico / Privacidade   |
| **Q-ARQ-003** | Criar `docs/3-system-design/adr/` para decisões novas, em vez de expandir a tabela C1–C10?                     | 🔴 Aberta                                       | Arquitetura              |
| Q-ARQ-004     | Banco, aplicação, cache, mensageria e gateway alvo.                                                            | ✅ Oracle · OpenShift · Redis · Kafka · Apigee  | —                        |
| Q-ARQ-005     | Vercel + Neon é destino ou laboratório?                                                                        | ✅ Laboratório temporário                       | —                        |
| **Q-ARQ-006** | Migrar os marcadores do mapa Geo de `google.maps.Marker` (deprecado) para `AdvancedMarkerElement`? Exige um Map ID do Cloud Console e mover o `styles` inline de POI para cloud styling. | 🔴 Aberta | Arquitetura + Frontend |
| **Q-ARQ-007** | Estender o RBAC (hoje só em `/v1/users` e histórico Geo) para cada caso de uso de Geo/Resource/Service/Order na camada de serviço, e impor isolamento multi-tenant no adaptador/VPD (§4 de security.md). O IdP local emite JWT compatível com o Apigee — a migração troca só o emissor. | 🔴 Aberta | Arquitetura + Segurança |

Detalhamento em [`../3-system-design/architecture.md`](../3-system-design/architecture.md) e
[`../3-system-design/security.md`](../3-system-design/security.md).

---

## 4. MOD01 — Geographic

| ID        | Questão                                                                                                  | Estado                                                                                                                                    | Responsável              |
| --------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Q-GEO-001 | Quais `SiteSpecifications` entram no bootstrap?                                                          | ✅ Decidida em 31/07/2026: `Region`, `FunctionalGroup`, `Central Office`, `POP`, `Cabinet`, `InstallationPoint`, `Floor`, `Room` e `Cage` | Produto + Engenharia     |
| Q-GEO-002 | CN é determinístico por Região + Regional ou tem exceções?                                               | 🔴 Aberta                                                                                                                                 | Engenharia               |
| Q-GEO-003 | CLLI é obrigatório para todos os COs ou subconjunto?                                                     | 🔴 Aberta                                                                                                                                 | Engenharia + Regulatório |
| Q-GEO-004 | Quais `RelationshipTypes` geográficos além do bootstrap mínimo?                                          | 🔴 Aberta                                                                                                                                 | Operações                |
| Q-GEO-005 | Integração com Geosite usa API existente ou nova interface?                                              | 🔴 Aberta                                                                                                                                 | Arquitetura + Geosite    |
| Q-GEO-007 | `syncGeoPosition` será síncrono ou assíncrono?                                                           | 🔴 Aberta                                                                                                                                 | Arquitetura + Produto    |
| Q-GEO-008 | Quais SLAs de eventos em produção?                                                                       | 🔴 Aberta                                                                                                                                 | Arquitetura + Plataforma |
| Q-GEO-010 | Existe hierarquia real de `Sub-Sites` acima de 4 níveis?                                                 | 🔴 Aberta                                                                                                                                 | Engenharia               |
| Q-GEO-011 | Edição de geometria no navegador exige workflow de aprovação (MOD05) ou bastam RBAC, motivo e auditoria? | 🔴 Aberta                                                                                                                                 | Operações + Arquitetura  |

> Q-GEO-005 e Q-INT-005 são a mesma conversa vista por lados diferentes.
>
> A antiga Q-GEO-009 foi resolvida como D-GEO-002: o provedor é o Geosite Logradouros.

---

## 5. MOD02 — Resource

| ID        | Questão                                                                                                                                         | Estado    | Responsável               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------- |
| Q-RES-001 | Quais `ResourceSpecifications` entram no MVP?                                                                                                   | 🔴 Aberta | Engenharia + Produto      |
| Q-RES-002 | Importar `NetBox device-type-library`?                                                                                                          | 🔴 Aberta | Arquitetura               |
| Q-RES-004 | Oracle Property Graph e licença para 22M+ HPs.                                                                                                  | 🔴 Aberta | Arquitetura + Plataforma  |
| Q-RES-007 | `Fibers` internas a `Cables`: todas ou apenas ocupadas?                                                                                         | 🔴 Aberta | Arquitetura + OSP         |
| Q-RES-008 | Estratégia de carga inicial de IPAM legado.                                                                                                     | 🔴 Aberta | Backbone + Arquitetura    |
| Q-RES-010 | Cache de paths: TTL e invalidação.                                                                                                              | 🔴 Aberta | Arquitetura + Performance |
| Q-RES-011 | `PowerSupply` interno vs `PowerOutlet` externo.                                                                                                 | 🔴 Aberta | Engenharia + Operações    |
| Q-RES-012 | Tipos operacionais adicionais de `ResourceRelationship`.                                                                                        | 🔴 Aberta | Operações                 |
| Q-RES-013 | Autoridade do dado de ativo corporativo: o SAP escreve no Nexus, o Nexus consulta o SAP, ou a referência `_asset` é frouxa e sem sincronização? | 🔴 Aberta | Arquitetura + Patrimônio  |
| Q-RES-014 | Sub-duto é recurso próprio (contido no duto) ou characteristic de capacidade do duto?                                                           | 🔴 Aberta | OSP + Arquitetura         |

---

## 6. MOD03 — Service

| ID        | Questão                                                    | Estado    | Responsável              |
| --------- | ---------------------------------------------------------- | --------- | ------------------------ |
| Q-SVC-001 | Catálogo inicial de `ServiceSpecifications` CFS/RFS.       | 🔴 Aberta | Produto + Engenharia     |
| Q-SVC-002 | Formato, faixa e autoridade do `SubscriberID`.             | 🔴 Aberta | Produto + BSS            |
| Q-SVC-004 | Granularidade do RFS GPON: por assinante ou por porta PON? | 🔴 Aberta | Engenharia + Arquitetura |
| Q-SVC-005 | Modelagem de bundle comercial.                             | 🔴 Aberta | Produto                  |
| Q-SVC-006 | Propagação de estado CFS-RFS-Resource.                     | 🔴 Aberta | Operações + Arquitetura  |
| Q-SVC-007 | `Impact analysis` atende Service Assurance externo no MVP? | 🔴 Aberta | Arquitetura + Operações  |

---

## 7. Prioridade Recomendada

Ordenado por quanto bloqueia, não por facilidade:

| #   | Questão               | Por que primeiro                                                            |
| --- | --------------------- | --------------------------------------------------------------------------- |
| 1   | Q-ARQ-001             | Sem o refactor assíncrono, nenhum alvo de escala é atingível                |
| 2   | Q-INT-005             | Carga inicial dos 22M depende dos modelos dos três legados                  |
| 3   | Q-RES-004             | Sem Property Graph dimensionado, o path computation em escala fica em risco |
| 4   | Q-RES-001             | Sem catálogo inicial de Resource não há instância confiável nem migração    |
| 5   | Q-GEO-005             | Address e sugestão de logradouro dependem da interface do Geosite           |
| 6   | Q-GEO-008             | Eventos são transversais; NFR precisa vir antes da produção                 |
| 7   | Q-SVC-001 + Q-SVC-002 | Service e Order dependem disso na fase 3                                    |

---

## 8. Referências

| Onde                                               | O quê                                               |
| -------------------------------------------------- | --------------------------------------------------- |
| [`business-rules.md`](business-rules.md)           | Decisões já firmadas (C1–C10)                       |
| [`../2-functional-specs/`](../2-functional-specs/) | HLDs; origem das questões `Q-GEO`, `Q-RES`, `Q-SVC` |
| [`../3-system-design/`](../3-system-design/)       | Origem das questões `Q-INT` e `Q-ARQ`               |
| [`../5-delivery-plan/`](../5-delivery-plan/)       | Roadmap e fases bloqueadas                          |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
