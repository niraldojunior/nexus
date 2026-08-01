Minha avaliação: o módulo Geo já possui uma boa base executável, mas ainda não está aderente ao HLD. Atualmente, os 12 requisitos `REQ-MOD01-001` a `REQ-MOD01-012` estão classificados como parciais. Referência principal: `docs/2-functional-specs/01-module-geo.md`.

Já existem CRUDs TMF673/674/675, validação de geometrias, árvore lazy, busca, viewport, mapa com clusters, relações básicas e registro de eventos. O que falta pode ser organizado nestes pacotes:

| Prioridade | Entrega que falta |
|---|---|
| P0 | Identidade e eventos canônicos |
| P0 | Catálogo governado de SiteSpecification e RelationshipType |
| P0/P1 | Lifecycle e invariantes de GeographicSite |
| P1 | Consultas geoespaciais completas |
| P1 | GeographicAddress e integração Geosite |
| P1 | Hierarquia, classificação e relações completas |
| P1 | Operações em massa |
| P2 | Funcionalidades avançadas do mapa |

### 1. Identidade e eventos canônicos

Falta construir:

- UUID v7; hoje o módulo usa UUID v4 com `randomUUID()`. Referência: `src/modules/geo/ids.ts`.
- Grupo `_origin` somente-leitura para rastreabilidade de dados legados.
- Outbox transacional.
- Relay e idempotência dos eventos.
- Schema Registry.
- DLQ e reprocessamento.
- `correlationId` consistente.

Hoje os eventos são persistidos em `tmf_event`, mas isso ainda não garante publicação confiável para Kafka/TMF688.

### 2. Catálogo de GeographicSiteSpecification

O CRUD básico existe, mas o catálogo ainda precisa de:

- `code`, `description`, `lifecycleStatus` e `validFor`.
- Versionamento e aposentadoria da Specification.
- Unicidade de código.
- Endpoint `allowedChildren`.
- Validação de `specCharacteristic`: obrigatoriedade, regex, enum, range, default e `configurable`.
- Migração controlada ao adicionar uma característica obrigatória.
- Análise de impacto ao restringir regras de contenção.
- Remoção das categorias fechadas no TypeScript, conforme a governança prevista.

Atualmente a entidade tem somente nome, categoria fechada, listas de pais e filhos e características simples. Referência: `src/modules/geo/domain.ts`.

### 3. Lifecycle de GeographicSite

Este é um dos gaps mais importantes. O HLD exige:

`Planned → InConstruction → Active → InDeactivation → Retired`

O código implementa:

`planned | active | suspended | terminated`

Implementação atual em `src/modules/geo/domain.ts`. Lifecycle esperado em `docs/2-functional-specs/01-module-geo.md`.

Falta construir:

- Máquina de transições válidas.
- `statusDate` automático.
- `statusReason`.
- Histórico semântico das transições.
- Bloqueio de saltos inválidos.
- Aprovação especial para reativação.
- Verificação de Resources, Services e Orders antes da desativação.
- Auditoria e RBAC por transição.
- Propagação das regras para Sub-Sites.

Hoje qualquer status presente no enum pode substituir diretamente o anterior.

### 4. Consultas geoespaciais

Faltam na API TMF675:

- Busca por proximidade com `near` e `radius`.
- Ordenação por distância geodésica.
- Bounding box no endpoint canônico de GeographicLocation.
- Interseção com Polygon.
- Consulta de entidades que referenciam uma Location.
- Exportação como `FeatureCollection` GeoJSON.
- Soft-delete de Location com verificação de referências.
- Paginação determinística dessas consultas.
- Índice espacial completo para Point, LineString e Polygon.

Existe uma consulta de viewport específica para o mapa e um índice de expressão para Point, mas não um mecanismo espacial completo. Referência: `src/shared/persistence/schema.ts`.

### 5. GeographicAddress e Geosite

O contrato implementado é menor que o definido no HLD. Faltam:

- Campos TMF `streetType`, `streetName`, `streetNrSuffix`, `locality` e `geographicSubAddress`.
- `validFor` e versionamento.
- Obrigatoriedade de cidade, UF e país.
- Normalização e validação de CEP.
- Normalização de logradouro.
- Endpoint de sugestões do Geosite.
- Endpoint de geocodificação no backend.
- Tratamento de indisponibilidade sem persistência parcial.
- Soft-delete com verificação de Sites dependentes.
- Auditoria das alterações.

Atualmente `city`, `stateOrProvince` e `country` são opcionais no domínio. Referência: `src/modules/geo/domain.ts`.

Também existe uma divergência: o frontend usa diretamente Google Maps para sugestão e geocodificação, enquanto o cânone definiu o Geosite Logradouros. Referência: `web/src/utils/googleMaps.ts`.

### 6. GeographicSite, hierarquia e relações

Faltam:

- `code`, `siteType`, `description` e múltiplos endereços com papéis.
- Validação das características contra a SiteSpecification.
- Cálculo e proteção de campos derivados como CN.
- Unicidade de nome conforme lifecycle.
- Filtros combinados por status, spec, parent, tipo, característica e localização.
- Contadores de Sub-Sites, Resources, Services e Orders.
- Detalhamento expandido.
- Prevenção de ciclos ancestrais.
- Limite e validação de profundidade.
- Regras específicas para movimentação de Sub-Sites.
- Consulta de membros e agregações de FunctionalGroup.

Para relações topológicas, faltam:

- CRUD governado de `GeographicRelationshipType`.
- Validação do tipo no write.
- Inversos automáticos, simetria e cardinalidade.
- Endpoint de impact analysis.
- Consulta de subgrafo com profundidade configurável.
- API pública para listar e remover relações.

O serviço possui remoção interna, mas o repositório faz `DELETE` físico da relação, enquanto o HLD exige encerramento por `validFor.endDateTime`. Referência: `src/modules/geo/postgres-repository.ts`.

### 7. Operações em massa

Não existe contrato bulk no backend. Faltam:

- Importação e atualização em lote de Address e Site.
- Validação independente por item.
- Relatório de sucessos e falhas.
- Idempotência para retry.
- Transação bem definida por item ou lote.
- Eventos somente para commits efetivos.
- Suporte a CSV e ou payload bulk TMF.

Este é o único backlog Geo marcado diretamente como pendente, não apenas parcial. Referência: `docs/5-delivery-plan/technical-backlog.md`.

### 8. Mapa

A base do mapa está pronta, mas ainda faltam:

- Mover marcador existente e sincronizar sua GeographicLocation.
- Confirmação e motivo ao mover Site ativo.
- Camadas do Geosite.
- Visualização das relações topológicas.
- Busca de Sites por proximidade.
- Ferramenta de medição.
- Exportação PNG.
- Exportação GeoJSON da viewport.
- Testes E2E completos dessas interações.

### Dependências ainda abertas

Há decisões Geo pendentes sobre regra de CN, obrigatoriedade de CLLI, tipos de relacionamento, interface do Geosite, estratégia de sincronização, SLA de eventos e profundidade máxima da hierarquia. Referência: `docs/1-overview/open-questions.md`.

Minha sequência recomendada seria:

1. UUID v7, `_origin` e infraestrutura de eventos.
2. SiteSpecification, características e RelationshipTypes governados.
3. Alinhar o lifecycle e o contrato das entidades ao HLD.
4. Consultas espaciais e integração Geosite.
5. Hierarquia, filtros, impacto e bulk.
6. Funcionalidades avançadas do mapa.

Na validação executada, os testes unitários do Geo e do helper de hierarquia passaram. O teste HTTP compilado ficou inconclusivo porque travou na infraestrutura de persistência e worker, então não o considerei evidência de falha funcional. Nenhum código foi alterado naquela análise específica.
