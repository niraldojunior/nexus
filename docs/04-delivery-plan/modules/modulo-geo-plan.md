# Plano Técnico do Módulo Geo

> Base documental: `AGENTS.md`, `docs/01-functional-specs/01-modulo-geo.md`, `docs/02-system-design/*`, `docs/03-design-system/*` e `docs/04-delivery-plan/*`.

## 1. Objetivo

Este plano define a implementação técnica do **MOD01 - Nexus Geographic** como a base geoespacial do Nexus. O módulo precisa entregar o "onde" do inventário com aderência ao TMF673 / TMF674 / TMF675, respeitando C1-C10, a fronteira entre Geo e Resource, e a integração com TMF688 para eventos de domínio.

## 2. Responsabilidades Do Módulo

| Responsabilidade | Descrição |
|---|---|
| Base geoespacial canônica | Modelar `GeographicLocation`, `GeographicAddress` e `GeographicSite` como entidades TMF-first. |
| Geocodificação e referência espacial | Persistir geometria, coordenadas e vínculos entre address, location e site. |
| Hierarquia de sites | Governar `parentSite`, sub-sites e regras de contenção via `GeographicSiteSpecification`. |
| Relações topológicas | Expor relações A↔Z entre sites sem misturar fronteiras com Resource ou Service. |
| Catálogo governado | Manter site specifications e características extensíveis via API, sem listas hardcoded. |
| Visão operacional | Suportar consultas, mapa e painéis que permitam navegação e manutenção do inventário geográfico. |
| Eventos de domínio | Publicar eventos TMF688 para criação, alteração, status e relacionamento. |
| Proveniência de migração | Preservar `_origin` como característica read-only para rastreio de legados e dual-running. |

## 3. Entidades E Agregados

### 3.1 Entidades principais

| Entidade | Papel no módulo | Observações de modelagem |
|---|---|---|
| `GeographicLocation` | Representa geometria pura, independente de instâncias de Site ou Address. | Suporta Point, LineString e Polygon em GeoJSON. |
| `GeographicAddress` | Endereço postal estruturado, com possibilidade de geocodificação. | Pode referenciar `GeographicLocation`. |
| `GeographicSite` | Unidade operacional do inventário geográfico. | Usa `siteSpecification`, `place`, `address`, `parentSite` e `relatedSite`. |
| `GeographicSiteSpecification` | Catálogo de tipos e regras de contenção. | Define atributos, tipos permitidos e governança de criação. |

### 3.2 Componentes de suporte

| Componente | Função |
|---|---|
| `Characteristic` | Campo extensível canônico para atributos V.tal e `_origin`. |
| `RelatedParty` | Vínculo com Tenant, Owner ou responsáveis operacionais quando aplicável. |
| `TimePeriod` | Janela de validade para versões, vigência e soft-delete lógico. |
| `EntityRef` | Referências canônicas entre entidades e back-references operacionais. |
| `GeoJSONGeometry` | Estrutura serializada para armazenamento e resposta de geometria. |

### 3.3 Agregados sugeridos

| Agregado | Raiz | Consistência esperada |
|---|---|---|
| Location | `GeographicLocation` | Validação geométrica, validade temporal e referências. |
| Address | `GeographicAddress` | Estrutura postal, geocodificação e vínculo com location. |
| Site | `GeographicSite` | Hierarquia, contenção, relações e lifecycle. |
| Site catalog | `GeographicSiteSpecification` | Catálogo governado com características e regras de contenção. |

## 4. DTOs

### 4.1 DTOs de entrada e saída

| DTO | Uso |
|---|---|
| `CreateGeographicLocationDto` | Criar location com geometria, referência espacial e metadados. |
| `UpdateGeographicLocationDto` | Atualizar geometria, precisão, validade e descrição auxiliar. |
| `GeographicLocationDto` | Retornar location com identificação canônica e vínculos. |
| `CreateGeographicAddressDto` | Criar endereço com estrutura postal e geocodificação opcional. |
| `UpdateGeographicAddressDto` | Atualizar address sem violar vínculo canônico. |
| `GeographicAddressDto` | Retornar address com referência espacial e `place`. |
| `CreateGeographicSiteDto` | Criar site/sub-site com specification, address e relações. |
| `UpdateGeographicSiteDto` | Atualizar atributos, vínculos e localização de um site. |
| `GeographicSiteDto` | Retornar site com hierarquia, status, características e referências. |
| `CreateGeographicSiteSpecificationDto` | Criar item do catálogo de tipos de site. |
| `UpdateGeographicSiteSpecificationDto` | Manter características, restrições e relações do catálogo. |
| `GeographicSiteSpecificationDto` | Retornar specification e regras de contenção. |

### 4.2 DTOs de consulta

| DTO | Uso |
|---|---|
| `GeoRadiusQueryDto` | Consultar entidades por ponto e raio. |
| `GeoBoundingBoxQueryDto` | Consultar entidades dentro de bbox. |
| `GeoIntersectionQueryDto` | Consultar entidades por polígono de interseção. |
| `GeoMapFilterDto` | Filtrar mapa por tipo, status, specification e raio. |
| `GeoReferenceQueryDto` | Listar entidades que referenciam uma location, address ou site. |
| `EventCatalogDto` | Expor catálogo formal dos eventos TMF688 publicados pelo módulo. |

### 4.3 Regras de DTO

| Regra | Diretriz |
|---|---|
| Identidade | Toda saída usa UUID v7 Nexus-native como ID canônico. |
| `_origin` | Sempre read-only e modelado como `characteristic`. |
| Extensibilidade | Características V.tal entram apenas como `characteristic`. |
| Geometria | Entrada e saída usam GeoJSON válido, com validação de intervalos. |
| Resposta | Listagens devem suportar paginação, ordenação e filtro. |

## 5. Serviços E Casos De Uso

### 5.1 Serviços de aplicação

| Serviço | Responsabilidade |
|---|---|
| `GeographicLocationService` | Criar, atualizar, consultar e remover logicamente locations. |
| `GeographicAddressService` | Criar, atualizar, consultar, geocodificar e inativar addresses. |
| `GeographicSiteService` | Gerir sites, sub-sites, lifecycle, relações e contenção. |
| `GeographicSiteSpecificationService` | Operar o catálogo de tipos de site e suas regras. |
| `GeographicMapService` | Entregar consultas para mapa, proximidade, bbox e interseção. |
| `GeographicEventPublisher` | Publicar eventos TMF688 via outbox. |

### 5.2 Casos de uso

| Caso de uso | Resultado esperado |
|---|---|
| Criar Location | Persistir geometria válida e gerar evento de criação. |
| Atualizar Location | Registrar nova geometria ou atributos e publicar evento de alteração. |
| Inativar Location | Encerrar validade sem exclusão física. |
| Criar Address | Persistir endereço estruturado com vínculo espacial quando aplicável. |
| Atualizar Address | Manter consistência postal, geocodificação e características. |
| Criar SiteSpecification | Abrir item de catálogo governado. |
| Atualizar SiteSpecification | Alterar atributos e regras sem quebrar compatibilidade contratual. |
| Criar Site | Instanciar site com hierarchy, address, place e specification. |
| Criar Sub-Site | Instanciar site interno respeitando contenção. |
| Alterar lifecycle de Site | Mudar status e registrar histórico por evento. |
| Validar contenção | Rejeitar combinação de parent/child fora da especificação. |
| Consultar por raio / bbox / interseção | Retornar entidades geográficas em formato de consulta operacional. |
| Sincronizar mapa | Refletir alteração de coordenadas no site referenciado com confirmação para mudanças críticas. |
| Publicar catálogo de eventos | Expor nomes, schemas e exemplos dos eventos TMF688. |

## 6. APIs Planejadas

### 6.1 Contratos TMF

| API | Cobertura no módulo |
|---|---|
| TMF673 Geographic Address Management | CRUD de addresses, busca e referência espacial. |
| TMF674 Geographic Site Management | CRUD de sites, catálogo, hierarquia e relações. |
| TMF675 Geographic Location Management | CRUD de locations, geometria e consultas geoespaciais. |
| TMF688 Event Management | Publicação e consulta do catálogo de eventos. |

### 6.2 Endpoints planejados

| Área | Endpoints previstos |
|---|---|
| Locations | CRUD, consulta por ID, lista, bbox, raio, interseção, referências e exportação GeoJSON. |
| Addresses | CRUD, consulta por ID, lista, geocodificação e referência a location. |
| Sites | CRUD, lifecycle, relações, sub-sites, hierarquia e leitura de back-references. |
| Site specifications | CRUD, versão de catálogo, regras de contenção e busca por tipo. |
| Mapa | Lista geoespacial para viewport, filtros de visualização e sincronização bidirecional. |
| Eventos | Catálogo de eventos, schemas e exemplos canônicos. |

### 6.3 Regras de contrato

| Regra | Diretriz |
|---|---|
| Compatibilidade | Payloads precisam refletir TMF canônico e extensões apenas em `characteristic`. |
| Soft-delete | Exclusões físicas não são expostas como comportamento padrão. |
| Idempotência | Escritas e eventos devem suportar reprocessamento sem duplicar efeitos. |
| Versionamento | Mudanças breaking devem subir versão de contrato, não quebrar consumidores. |
| Segurança | Escrituras exigem autorização, e `relatedParty` deve refletir o escopo permitido. |

## 7. Telas

### 7.1 Telas-alvo

| Tela | Objetivo |
|---|---|
| Visão de mapa | Navegar sites, locations e filtros geográficos. |
| Detalhe de site | Inspecionar hierarquia, status, address, place e relações. |
| Cadastro/edição de address | Manter endereço estruturado e vínculos de geocodificação. |
| Cadastro/edição de location | Editar geometria, precisão e referência espacial. |
| Catálogo de site specification | Administrar tipos de site e regras de contenção. |
| Árvore de sites | Visualizar parent/child e sub-sites por categoria. |
| Consulta de viabilidade | Reusar o padrão de lookup por endereço e mostrar resultado operacional. |

### 7.2 Reuso do UI kit

| Fonte | Reuso previsto |
|---|---|
| `Shell` | Navegação global, sidebar e estrutura da aplicação. |
| `Inventory` | Listagens, filtros, paginação e estados de tabela. |
| `Topology` | Visualização de relacionamento espacial e painel de detalhe. |
| `Viability` | Busca por endereço e retorno operacional orientado à consulta. |

## 8. Componentes Reutilizados

| Componente | Uso no módulo |
|---|---|
| `Button` | Ações primárias, secundárias e destrutivas controladas. |
| `Card` | Painéis, listagens, formulário e detalhe. |
| `Badge` | Classificação de tipo, status e marcação de categoria. |
| `Input` | Formulários, buscas e filtros. |
| `StatusPill` | Estado de site, lifecycle, viabilidade e sincronização. |
| `MetricCard` | KPIs do mapa e cobertura geográfica. |
| `Icon` | Ações e sinais visuais do domínio. |
| `ELEMENT_META` | Base visual para elementos topológicos e taxonomia espacial. |

## 9. Regras De Negócio

| ID | Regra |
|---|---|
| RN-GEO-001 | Toda extensão V.tal deve ser modelada como `characteristic`. |
| RN-GEO-002 | `GeographicSite` é a fronteira operacional do módulo. |
| RN-GEO-003 | `GeographicLocation` não pode ser duplicada em Site ou Address como atributos físicos redundantes. |
| RN-GEO-004 | `GeographicSiteSpecification` governa contenção, tipo e atributos esperados. |
| RN-GEO-005 | `_origin` é somente leitura após migração e preserva rastreabilidade. |
| RN-GEO-006 | Não existe exclusão física para entidades auditáveis; usa-se soft-delete / soft-terminate. |
| RN-GEO-007 | Mudanças relevantes exigem publicação de evento via outbox. |
| RN-GEO-008 | `relatedParty` deve existir desde a criação quando o caso de uso exigir governança ou tenant. |
| RN-GEO-009 | Geometria inválida é rejeitada antes de persistir. |
| RN-GEO-010 | Alterações críticas no mapa exigem confirmação antes da gravação. |

## 10. Dependências

| Dependência | Efeito no plano |
|---|---|
| `docs/02-system-design/*` | Define arquitetura, persistência, segurança, integrações e NFR do módulo. |
| `docs/03-design-system/*` | Define componentes, tokens e padrões visuais para as telas Geo. |
| MOD06 Party & Tenant | Habilita `relatedParty` com escopo e governança. |
| MOD02 Resource | Consome `place` e depende da referência geográfica. |
| MOD03 Service | Consome address/site para instalação e inventário de serviço. |
| MOD04 Order & Fulfillment | Consome address e site em viabilidade e ordens. |
| Kafka / outbox / Schema Registry | Necessários para TMF688 e consistência transacional. |
| Oracle / Property Graph | Alvo arquitetural para persistência e consultas espaciais em escala. |
| Catálogo inicial de SiteSpecification | Bloqueador para bootstrap funcional do módulo. |
| Geocodificação | Bloqueador para address, mapa e enriquecimento operacional. |

## 11. Estratégia De Testes

### 11.1 Testes de domínio

| Cenário | Verificação |
|---|---|
| Geometria GeoJSON | Validar Point, LineString e Polygon com intervalos corretos. |
| Limites geográficos | Rejeitar latitude/longitude fora do intervalo aceito. |
| Contenção | Validar parent/child conforme specification. |
| Lifecycle | Garantir transições válidas de status de Site. |
| `_origin` | Confirmar preservação read-only e consulta por origem. |

### 11.2 Testes de integração

| Cenário | Verificação |
|---|---|
| CRUD | Criar, ler, atualizar e inativar Location, Address, Site e SiteSpecification. |
| Consultas espaciais | Raio, bbox e interseção retornando o conjunto correto. |
| Hierarquia | Sub-sites e relações topológicas persistidas e recuperadas. |
| Eventos | Escrita gera evento TMF688 via outbox. |
| Catálogo | Leitura e manutenção do catálogo de site specification e eventos. |

### 11.3 Testes de contrato de API

| Cenário | Verificação |
|---|---|
| TMF673/674/675 | Payload, campos e respostas compatíveis com contratos canônicos. |
| Erros e validação | Mensagens de validação, paginação e status HTTP consistentes. |
| DTO x payload | Consistência entre transporte e modelo de aplicação. |
| GeoJSON | Resposta de exportação e filtro geoespacial válida. |

### 11.4 Testes de UI

| Cenário | Verificação |
|---|---|
| Mapa e detalhe | Navegação entre lista, mapa e painel de site. |
| Filtros | Tipo, status, especificação e busca. |
| Edição de coordenadas | Atualização com confirmação em alterações críticas. |
| Viabilidade | Consulta por endereço com retorno operacional compreensível. |
| Reuso visual | Uso consistente de `Card`, `Button`, `Badge`, `Input` e `StatusPill`. |

### 11.5 Regressão

| Cenário | Verificação |
|---|---|
| Integração com Resource | Geo continua servindo como referência para `place`. |
| Integração com Service | Address e site continuam válidos para inventário e instalação. |
| Integração com Order | Endereço e localização continuam suportando viabilidade e ordem. |
| Eventos e soft-delete | Mudanças e inativação seguem o mesmo padrão do restante do produto. |

## 12. Sequência Recomendada

| Ordem | Entrega |
|---|---|
| 1 | Consolidar contratos de entidade, DTO e persistência para Location, Address e SiteSpecification. |
| 2 | Implementar Site e hierarquia, incluindo validation de contenção e lifecycle. |
| 3 | Implementar consultas geoespaciais, filtros e exportação GeoJSON. |
| 4 | Fechar eventos TMF688 e outbox. |
| 5 | Construir as telas Geo sobre o kit existente e validar reuso de componentes. |
| 6 | Amarrar integrações com Resource, Service e Order e fechar testes de regressão. |

## 13. Assunções

| ID | Assunção |
|---|---|
| A-001 | O plano considera como bloqueadores as decisões ainda abertas no HLD de MOD01. |
| A-002 | O módulo usará os padrões de UI e tokens já existentes em `docs/03-design-system`. |
| A-003 | A implementação deve respeitar o backbone técnico definido em `docs/02-system-design`. |
| A-004 | Este documento não resolve a lista de bootstrap de SiteSpecification nem a estratégia de geocodificação; apenas os trata como dependências. |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
