# Questões Em Aberto Consolidadas

> Consolidação dos HLDs MOD01, MOD02 e MOD03. Questões decididas nos HLDs não são reabertas aqui.

## 1. MOD01 - Geographic

| ID consolidado | Questão | Fase bloqueada | Responsável | Observação |
|---|---|---|---|---|
| Q-GEO-001 | Quais SiteSpecifications entram no bootstrap? | F0/F1 | Produto + Engenharia V.tal | Bloqueia criação consistente de Sites. |
| Q-GEO-002 | CN é determinístico por Região + Regional ou tem exceções? | F1 | Engenharia V.tal | Necessita matriz de derivação. |
| Q-GEO-003 | CLLI é obrigatório para todos os COs ou subconjunto? | F1 | Engenharia + Regulatório | Impacta validação de SiteSpecification. |
| Q-GEO-004 | Quais RelationshipTypes geográficos além do bootstrap mínimo? | F1 | Operações V.tal | Deve seguir C9. |
| Q-GEO-005 | Integração com Geosite Logradouros usa API existente ou nova interface? | F0/F1 | Arquitetura + Geosite | Bloqueia Address e sugestão de logradouro. |
| Q-GEO-007 | syncGeoPosition será síncrono ou assíncrono? | F1/F2 | Arquitetura + Produto | Trade-off UX vs performance/eventual consistency. |
| Q-GEO-008 | Quais SLAs de eventos em produção? | F0 | Arquitetura + Plataforma | Deve entrar em NFR/outbox. |
| Q-GEO-009 | Qual provedor de geocodificação automática? | F1 | Produto + GIS | Avaliar custo, licença e base interna. |
| Q-GEO-010 | Existe hierarquia real de Sub-Sites acima de 4 níveis? | F1 | Engenharia V.tal | Modelo não impõe limite, mas UI/performance precisam de política. |

## 2. MOD02 - Resource

| ID consolidado | Questão | Fase bloqueada | Responsável | Observação |
|---|---|---|---|---|
| Q-RES-001 | Quais ResourceSpecifications entram no MVP? | F0/F1 | Engenharia + Produto | Bloqueia catálogo e migração. |
| Q-RES-002 | Importar NetBox device-type-library? | F1 | Arquitetura + Engenharia | Avaliar licença e curadoria. |
| Q-RES-004 | Oracle Property Graph e licença para 22M+ HPs. | F0/F1 | Arquitetura + Plataforma | Bloqueia path computation em escala. |
| Q-RES-007 | Fibers internas a Cables: todas ou apenas ocupadas? | F1 | Arquitetura + OSP | Impacta volume e fidelidade de path. |
| Q-RES-008 | Estratégia de carga inicial de IPAM legado. | F1/F3 | Backbone + Arquitetura | Necessária para serviços empresariais. |
| Q-RES-010 | Cache de paths: TTL e invalidação. | F1/F2 | Arquitetura + Performance | Depende de eventos e graph. |
| Q-RES-011 | PowerSupply interno vs PowerOutlet externo. | F2/F5 | Engenharia + Operações | Relevante para futura Service Assurance. |
| Q-RES-012 | Tipos operacionais adicionais de ResourceRelationship. | F1 | Operações V.tal | Complementa decisão de extensibilidade. |

## 3. MOD03 - Service

| ID consolidado | Questão | Fase bloqueada | Responsável | Observação |
|---|---|---|---|---|
| Q-SVC-001 | Catálogo inicial de ServiceSpecifications CFS/RFS. | F3 | Produto + Engenharia | FTTH/GPON, empresarial e VoIP. |
| Q-SVC-002 | Formato, faixa e autoridade do SubscriberID Nexus-native. | F3 | Produto + BSS | Chave de correlação com BSS/ISP. |
| Q-SVC-004 | Granularidade do RFS GPON. | F3 | Engenharia + Arquitetura | RFS por assinante vs porta PON agregada. |
| Q-SVC-005 | Modelagem de bundle comercial. | F3 | Produto | `isBundle` vs `serviceRelationship`. |
| Q-SVC-006 | Propagação de estado CFS-RFS-Resource. | F3/F5 | Operações + Arquitetura | Automática vs orquestrada pelo MOD05. |
| Q-SVC-007 | Impact analysis atende Service Assurance externo no MVP? | F3 | Arquitetura + Operações | Validar consumidor externo. |

Nota: a questão sobre validação de `relatedParty[subscriber]` antes do MOD06 está decidida por D-3: validação diferida no MVP com reconciliação quando MOD06 entrar.

## 4. Questões Deduplicadas Por Tema

| Tema | Questões relacionadas | Decisão necessária |
|---|---|---|
| Bootstrap de catálogo | Q-GEO-001, Q-RES-001, Q-SVC-001 | Aprovar catálogos mínimos por fase e versionamento. |
| Eventos e NFR | Q-GEO-008, Q-RES-010, Q-SVC-007 | Definir SLO, envelope TMF688, retenção e consumidores. |
| Geografia e mapa | Q-GEO-005, Q-GEO-007, Q-GEO-009 | Fechar integração Geosite, geocoding e sync de mapa. |
| Escala de graph | Q-RES-004, Q-RES-007, Q-RES-010 | Dimensionar volume de fibers/path/cache. |
| Service/Party/Order | Q-SVC-001, Q-SVC-002, Q-SVC-004, Q-SVC-005, Q-SVC-006 | Fechar Service Catalog, SubscriberID, RFS e propagação. |
| Migração | Catálogos, IPAM, `_origin` | Definir fontes, saneamento e relatórios por wave. |

## 5. Próximas Decisões Recomendadas

| Ordem | Questão | Motivo |
|---|---|---|
| 1 | Q-RES-004 | Sem Property Graph dimensionado, o argumento técnico central de path computation fica em risco. |
| 2 | Q-GEO-001 + Q-RES-001 | Sem catálogo inicial, não há instância confiável nem migração. |
| 3 | Q-GEO-005 + Q-GEO-009 | Address/viabilidade dependem de integração e geocoding. |
| 4 | Q-GEO-008 | Eventos são transversais e precisam de NFR antes da produção. |
| 5 | Q-SVC-001 + Q-SVC-002 | Service e Order dependem disso na Fase 3. |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
