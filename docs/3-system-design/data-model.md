# Modelo de Dados

> Modelo canônico do V.tal Nexus, suportado nativamente em **Oracle**, único banco (C10). O alvo
> corporativo homologado é Oracle 21c/23ai; a instância disponível hoje é Oracle 19c EE. Volumetria e
> alvos em [`non-functional-requirements.md`](non-functional-requirements.md); decisões de
> arquitetura em [`architecture.md`](architecture.md).

O modelo segue **TMF-first** (C1): entidade, atributo e relacionamento espelham o SID. Extensão V.tal
entra como `characteristic` tipada via catálogo — nunca coluna nova.

> Este é o modelo **alvo**. `_origin`, outbox e multi-tenancy completo permanecem rastreados em
> [#157](https://github.com/niraldojunior/nexus/issues/157)–[#159](https://github.com/niraldojunior/nexus/issues/159).

> **Baseline Oracle implementado:** o schema é autorado nativamente em dialeto Oracle, sem tradutor
> genérico. No Oracle 19c desta fase, UUID usa `VARCHAR2(36 CHAR)`, datas usam
> `TIMESTAMP(6) WITH TIME ZONE`, booleanos `NUMBER(1)` e JSON/GeoJSON `CLOB IS JSON`.
> `RAW(16)` e `SDO_GEOMETRY` permanecem otimizações posteriores, no alvo Oracle 21c/23ai.

---

## 1. Volumetria projetada por tabela

| Tabela                    | Volume inicial    | Crescimento              | Em 3 anos |
| ------------------------- | ----------------- | ------------------------ | --------- |
| `geographic_address`      | 22.000.000        | +20%/ano                 | ~38M      |
| `geographic_location`     | ~25.000.000       | +20%/ano                 | ~43M      |
| `physical_resource`       | ~50.000.000       | portas, cabos, splitters | ~80M      |
| `customer_facing_service` | 4.000.000         | +20%/ano                 | ~7M       |
| `resource_facing_service` | ~8.000.000        | 2 RFS por CFS            | ~14M      |
| `service_order`           | 3.000.000/**mês** | 36M/ano                  | **~108M** |
| `service_qualification`   | 5.000.000/**mês** | 60M/ano                  | **~180M** |
| `outbox` / `event`        | alto churn        | retenção curta           | —         |

> ⚠️ **A maior tabela do sistema não é o inventário — é a viabilidade.** 5M consultas/mês persistidas
> como `ServiceQualification` geram 60M linhas/ano, superando ordens e endereços. Sem particionamento
> e retenção, ela domina o custo de armazenamento e degrada todo o resto.

---

## 2. Estratégia de particionamento

Particionar não é otimização: nesta volumetria é **pré-condição de operação** (purga, reorganização e
estatísticas ficam inviáveis em tabela única).

| Tabela                    | Esquema                      | Chave                                                           | Por quê                                                                                                                                                                                       |
| ------------------------- | ---------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geographic_address`      | **LIST + HASH subpartition** | `state_or_province` (UF) → hash do **código IBGE do município** | Consulta de viabilidade é regional; _partition pruning_ por UF elimina 96% dos dados. A subpartição por município equilibra SP (~30% da base) **e preserva a localidade espacial** — ver §4.5 |
| `geographic_location`     | **LIST + HASH**              | idem, herdado do endereço                                       | Mantém co-localização com o endereço                                                                                                                                                          |
| `physical_resource`       | **HASH**                     | `id` (32)                                                       | Acesso é por id ou por pai; não há dimensão temporal ou regional dominante                                                                                                                    |
| `customer_facing_service` | **LIST + HASH**              | UF → hash do município                                          | Alinha serviço ao endereço que o suporta                                                                                                                                                      |
| `service_order`           | **INTERVAL RANGE**           | `created_at`, mensal                                            | Purga e arquivamento por `DROP PARTITION` — operação de metadados, instantânea                                                                                                                |
| `service_qualification`   | **INTERVAL RANGE**           | `created_at`, mensal                                            | Idem, com retenção agressiva (§6)                                                                                                                                                             |
| `outbox`                  | **INTERVAL RANGE**           | `created_at`, diária                                            | Alta rotatividade, retenção de dias                                                                                                                                                           |

**Interval partitioning cria a partição sozinho** quando chega o primeiro registro do mês — não exige
DDL agendado nem janela.

```sql
PARTITION BY RANGE (created_at)
INTERVAL (NUMTOYMINTERVAL(1,'MONTH'))
( PARTITION p_inicial VALUES LESS THAN (TIMESTAMP '2026-01-01 00:00:00') );
```

---

## 3. Identidade — UUID v7 em `RAW(16)`

O cânone C5 exige **UUID v7**; o código atual usa `randomUUID()`, que é **v4**. A diferença importa
nesta escala:

| Aspecto            | UUID v4 (hoje)                        | UUID v7 (alvo)                              |
| ------------------ | ------------------------------------- | ------------------------------------------- |
| Ordenação          | Aleatória                             | **Temporal**                                |
| Inserção no índice | Espalhada — _block splits_ constantes | Sequencial — inserção na folha mais recente |
| Fragmentação       | Alta; exige rebuild periódico         | Baixa                                       |
| Armazenamento      | `VARCHAR2(36)` = 36 bytes             | **`RAW(16)` = 16 bytes**                    |

Em `service_order` (108M linhas em 3 anos), a diferença de armazenamento do PK sozinha é ~2 GB, e o
ganho real está em não fragmentar o índice a cada inserção.

> **Decisão:** `id RAW(16)`, gerado como UUID v7 na aplicação. Exposto na API como string canônica.
> IDs legados vivem em `_origin` (C5), nunca como PK.

---

## 4. Geoespacial em escala continental

Os 22M de HPs cobrem praticamente todo o território brasileiro. Isso muda o desenho
**qualitativamente**, não só em volume:

| Dimensão    | Extensão do Brasil                                                  |
| ----------- | ------------------------------------------------------------------- |
| Latitude    | +5,27° (Monte Caburaí/RR) a −33,75° (Arroio Chuí/RS) — ~39°         |
| Longitude   | −73,98° (Serra do Divisor/AC) a −34,79° (Ponta do Seixas/PB) — ~39° |
| Zonas UTM   | **18 a 25**                                                         |
| Hemisférios | Cruza o **Equador**                                                 |

### 4.1 Estado atual — e por que não escala

A geometria é persistida como **GeoJSON em texto**, e o viewport do mapa filtra assim
(`src/modules/geo/tree-service.ts`):

```sql
-- ponto: bbox planar sobre JSON parseado
(l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN ? AND ?

-- cabo: desempacota TODOS os vértices de TODAS as rotas
EXISTS (SELECT 1 FROM jsonb_array_elements(l.geometry::jsonb->'coordinates') AS v ...)
```

| Problema                             | Consequência em escala continental                |
| ------------------------------------ | ------------------------------------------------- |
| Sem tipo espacial                    | **Nenhum índice R-tree é possível**               |
| `jsonb_array_elements` em LineString | Varredura + unnest de cada vértice de cada cabo   |
| Bbox em **graus**                    | Retângulo em graus **não é retângulo no terreno** |
| Matemática planar                    | Distância em graus não tem significado métrico    |

O erro do bbox planar é mensurável: **1° de longitude vale ~111 km no Equador (AP) e ~93 km em
−33,75° (RS)** — variação de 20%. Um "raio de 300 m" calculado em graus erra por dezenas de metros
dependendo da latitude, e a mesma consulta se comporta diferente no Amapá e no Rio Grande do Sul.

> Para viabilidade — "qual CTO atende este endereço" — isso é inaceitável: erra a caixa que serve o
> cliente.

### 4.2 Sistema de referência

| Uso                       | SRID                        | Por quê                                                                                |
| ------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| **Persistência canônica** | **SIRGAS 2000 (EPSG 4674)** | Sistema geodésico **oficial brasileiro** (IBGE); obrigatório para cartografia nacional |
| **Intercâmbio via API**   | WGS84 (EPSG 4326)           | GeoJSON (RFC 7946) **exige** CRS84/WGS84                                               |

A diferença entre os dois é submétrica, mas são datums legalmente distintos — a conversão é explícita
na borda, não implícita.

> ❗ **Obrigatoriamente um SRID geodésico, nunca projetado.** Não existe projeção plana única que
> sirva ao Brasil: UTM quebraria em 8 zonas e no cruzamento do Equador. Com SRID geodésico, o Oracle
> Spatial calcula sobre o elipsoide e devolve **metros reais** em qualquer latitude.

### 4.3 Tipo, tolerância e metadados

```sql
-- Tolerância em METROS (SRID geodésico). 5 cm atende precisão de planta.
INSERT INTO user_sdo_geom_metadata (table_name, column_name, diminfo, srid) VALUES (
  'GEOGRAPHIC_LOCATION', 'GEOMETRY',
  SDO_DIM_ARRAY(
    SDO_DIM_ELEMENT('LONGITUDE', -74.0, -34.0, 0.05),
    SDO_DIM_ELEMENT('LATITUDE',  -34.0,   6.0, 0.05)
  ),
  4674
);
```

Os limites do `DIMINFO` são o envelope do território brasileiro — servem também como **primeira
barreira de qualidade**: coordenada fora da caixa é rejeitada pelo próprio banco.

### 4.4 Separação por camada geométrica

Misturar tipos numa única coluna degrada o índice. Em escala continental, separe:

| Camada                                          | Geometria    | Volume               | Observação                                           |
| ----------------------------------------------- | ------------ | -------------------- | ---------------------------------------------------- |
| **Endereços atendidos (HP)**                    | `POINT`      | ~22M                 | Índice com `layer_gtype=POINT` — menor e mais rápido |
| **Ativos pontuais** (site, estação, poste, CTO) | `POINT`      | dezenas de milhões   | Planta física                                        |
| **Cabos e dutos**                               | `LINESTRING` | centenas de milhares | Rotas com milhares de vértices                       |
| **Áreas de cobertura**                          | `POLYGON`    | dezenas de milhares  | Área servida por CTO/estação                         |

> **Limites territoriais (município, bairro, logradouro) NÃO entram nesta lista.** Eles são do
> **Geosite Logradouros**; o Nexus guarda apenas a **chave** (código IBGE, CEP, UF) como atributo e
> consulta a geometria na origem. Ver [`integrations.md`](integrations.md) §7.1 — _o território é do
> Geosite; a planta é do Nexus_.

```sql
CREATE INDEX ix_geo_location_point ON geographic_location (geometry)
  INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2
  PARAMETERS ('layer_gtype=POINT tablespace=nexus_idx')
  LOCAL;                                    -- alinhado às partições
```

> **`LOCAL` é obrigatório.** Um índice espacial global sobre 22M+ geometrias inviabiliza
> `DROP PARTITION` e reconstrução — cada manutenção viraria janela de horas.

### 4.5 Particionamento com coerência espacial

Detalha o esquema da §2 para a camada geográfica. Partição por UF é espacialmente coerente
(estados são contíguos), mas subparticionar por **hash de `id`** destrói a localidade espacial dentro
do estado.

| Nível       | Chave                                   | Racional                                                                      |
| ----------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| Partição    | `LIST` por **UF**                       | Regiões contíguas; _pruning_ natural de 96% dos dados                         |
| Subpartição | `HASH` por **código IBGE do município** | Município é área contígua e é o **escopo natural da consulta** de viabilidade |

Hash sobre município preserva localidade: os endereços de uma mesma cidade caem no mesmo segmento, e
a consulta espacial toca poucas subpartições. Hash sobre `id` espalharia a mesma cidade por todas.

São Paulo concentra ~30% da base — a subpartição por município é o que evita a partição gigante.

### 4.6 Consultas que passam a ser possíveis

```sql
-- Viabilidade: CTOs num raio real de 300 metros, em qualquer latitude
SELECT c.id, SDO_GEOM.SDO_DISTANCE(c.geometry, :ponto, 0.05, 'unit=M') AS dist_m
  FROM physical_resource c
 WHERE c.resource_type = 'CTO'
   AND SDO_WITHIN_DISTANCE(c.geometry, :ponto, 'distance=300 unit=M') = 'TRUE'
 ORDER BY dist_m;

-- Vizinho mais próximo, direto pelo índice
SELECT id FROM physical_resource
 WHERE SDO_NN(geometry, :ponto, 'sdo_num_res=5') = 'TRUE';

-- Viewport do mapa: substitui o bbox em JSON, e funciona para ponto E linha
SELECT id FROM geographic_location
 WHERE SDO_FILTER(geometry, SDO_GEOMETRY(2003, 4674, NULL,
         SDO_ELEM_INFO_ARRAY(1,1003,3),
         SDO_ORDINATE_ARRAY(:min_lng,:min_lat,:max_lng,:max_lat))) = 'TRUE';
```

O `SDO_FILTER` sobre bbox resolve num só predicado indexado o que hoje exige quatro blocos
`UNION ALL` e o unnest de vértices.

### 4.7 Renderização — nível de detalhe

Não se entrega 22M de pontos em resolução plena ao navegador.

| Zoom               | Estratégia (geometria **do Nexus**)                                |
| ------------------ | ------------------------------------------------------------------ |
| País / região      | Agregação por UF ou município (contagem), não geometria individual |
| Município / bairro | Clustering server-side                                             |
| Rua (≤ 200 m)      | Geometria individual — é o que o viewport já faz hoje              |

A agregação usa o **código** do município/UF como chave — não o polígono, que é do Geosite (§4.4).

> **Camada de fundo (município, bairro, logradouro):** vem do Geosite. Cabe a ele entregá-la já
> generalizada por zoom; o Nexus a consome como camada cartográfica, não a persiste nem a simplifica.

### 4.8 Qualidade de dado

Em escala continental, latitude e longitude trocadas não geram erro — geram um ponto no oceano ou em
outro hemisfério. Cargas anteriores já sofreram com coordenada corrompida.

| Validação                | Como                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dentro do território     | `DIMINFO` (§4.3) + caixa por UF                                                                                                                                                      |
| Geometria válida         | `SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT`                                                                                                                                            |
| Coerência com o endereço | Ponto deve cair no polígono do município declarado                                                                                                                                   |
| Sem coordenada           | Marcado para curadoria; **fica fora da viabilidade** até geocodificar                                                                                                                |
| Procedência              | `sourceSystem`/`sourceRef` — de qual fonte externa veio a coordenada/endereço (GEONET, Google Maps, um sistema legado migrado, ou cadastro manual)                                   |
| Precisão                 | `accuracyLevel` (`high\|medium\|low\|unknown`) — normalização do texto cru de precisão da fonte, para comparar candidatos de bases divergentes sem repetir o vocabulário de cada uma |

> A geocodificação é provida pelo **Geosite Logradouros** (base DNE + módulo Geonet), que abstrai
> internamente o fallback para o Google — ver [`integrations.md`](integrations.md) §7. O que
> permanece em aberto é a **capacidade de lote** para a carga inicial dos 22M endereços ([#90](https://github.com/niraldojunior/nexus/issues/90)).
>
> **Implementação atual (Oracle, execução local — Oracle Spatial pendente):** `sourceSystem`/`sourceRef` em
> `geographic_location`/`geographic_address` e `accuracyLevel` em `geographic_location`
> já existem no schema runtime, gravados pelo painel unificado de Local (REQ-MOD01-016,
> `docs/2-functional-specs/01-module-geo.md` §21) — a coluna `DIMINFO`/`SDO_GEOM` acima permanece
> destino, não estado presente.

---

## 5. Índices e paginação

### 5.1 Política de índice

| Regra                                         | Motivo                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Índices LOCAL** em tabela particionada      | Manutenção por partição; `DROP PARTITION` não invalida índice global                                |
| Global apenas na PK                           | Único caso que exige unicidade cruzando partições                                                   |
| Índice composto seguindo a ordem do predicado | `(tenant_id, status, created_at)` serve filtro e ordenação                                          |
| **Parcimônia em tabela de escrita pesada**    | `service_order` e `service_qualification` recebem milhões de inserts; cada índice é custo por linha |

O schema atual já tem 72 índices — na migração eles devem ser **reavaliados contra as consultas
reais**, não portados automaticamente.

### 5.2 Paginação — cursor, não OFFSET

O código atual usa `LIMIT ? OFFSET ?` em 14 pontos. `OFFSET` é **O(n)**: a página 10.000 sobre 22M
endereços faz o banco descartar 200.000 linhas antes de devolver 20.

**Substituir por keyset (cursor):**

```sql
SELECT ... FROM geographic_address
 WHERE state_or_province = :uf
   AND (created_at, id) < (:cursor_created_at, :cursor_id)   -- cursor opaco
 ORDER BY created_at DESC, id DESC
 FETCH FIRST :limit ROWS ONLY;
```

Custo constante em qualquer profundidade. O cursor é devolvido opaco (base64 do par ordenado) e a API
TMF expõe como `nextPage`. Compatível com o padrão de paginação do TMF (`limit`/`offset` continua
aceito para páginas rasas, com teto).

---

## 6. Ciclo de vida e retenção

C6 proíbe exclusão física de **inventário** — mas isso não se aplica a registros operacionais de alta
rotatividade.

| Dado                                | Política                           | Como                                                   |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Inventário (Geo, Resource, Service) | **Nunca excluir** (C6)             | `administrative_state='locked'` / `state='terminated'` |
| `service_order`                     | Online 12 meses → arquivo          | `DROP PARTITION` após export                           |
| `service_qualification`             | **Online 6 meses** → agregado      | Viabilidade antiga não tem valor operacional           |
| `outbox`                            | Excluir após publicação confirmada | Partição diária                                        |
| `event`                             | Online 3 meses → Kafka/data lake   | Kafka é o histórico canônico                           |

**Arquivamento por partição** (`DROP PARTITION`) é operação de metadados — instantânea, sem gerar
redo de 3M linhas. É a razão de particionar essas tabelas por tempo.

---

## 7. Tabela de outbox (C7)

```sql
CREATE TABLE outbox (
  id            RAW(16)        NOT NULL,   -- UUID v7 = ordem de publicação
  aggregate_id  RAW(16)        NOT NULL,   -- chave de partição no Kafka
  topic         VARCHAR2(120)  NOT NULL,
  payload       CLOB           NOT NULL,   -- evento TMF688 serializado
  schema_ver    NUMBER(3)      NOT NULL,
  created_at    TIMESTAMP      NOT NULL,
  published_at  TIMESTAMP,                 -- NULL = pendente
  CONSTRAINT pk_outbox PRIMARY KEY (id)
) PARTITION BY RANGE (created_at) INTERVAL (NUMTODSINTERVAL(1,'DAY')) ...;

CREATE INDEX ix_outbox_pending ON outbox(created_at) LOCAL
  WHERE published_at IS NULL;   -- índice só do que falta publicar
```

O relay consome com `FOR UPDATE SKIP LOCKED`, permitindo múltiplas réplicas sem coordenação externa.

---

## 8. Multi-tenant (C8)

`tenant_id` é coluna **obrigatória e indexada** em toda entidade de inventário e ordem, e **primeira
coluna** dos índices compostos — garante _pruning_ por tenant.

A imposição do filtro não pode depender de disciplina de quem escreve query. Ver
[`security.md`](security.md) para o mecanismo (VPD/RLS ou filtro forçado no adaptador).

`environment_reference_data_set`/`environment_reference_data_value` seguem a mesma regra: `tenant_id` obrigatório e primeira
coluna dos índices (`idx_reference_data_set_tenant_active`,
`idx_reference_data_value_set_active`). Um conjunto de dados de referência nunca é global — cada
tenant modela e publica os seus; um `characteristic` de outro módulo referencia o conjunto pela
identidade (`referenceDataSetId`), nunca copia seus valores, e a referência só resolve dentro do
mesmo tenant.

---

## 9. Mapeamento TMF ↔ tabelas

| Entidade TMF            | Tabela                        | Módulo         |
| ----------------------- | ----------------------------- | -------------- |
| `GeographicSite`        | `geographic_site`             | 1 — Geographic |
| `GeographicAddress`     | `geographic_address`          | 1              |
| `GeographicLocation`    | `geographic_location`         | 1              |
| `PhysicalResource`      | `physical_resource`           | 2 — Resource   |
| `LogicalResource`       | `logical_resource`            | 2              |
| `ResourceSpecification` | `resource_specification`      | 2              |
| `CustomerFacingService` | `customer_facing_service`     | 3 — Service    |
| `ResourceFacingService` | `resource_facing_service`     | 3              |
| `ServiceOrder`          | `service_order`               | 4 — Order      |
| `ServiceQualification`  | `service_qualification`       | 4              |
| `ResourceOrder`         | `resource_order`              | 4              |
| `Party` / `PartyRole`   | `party`, `party_role` | 6 — Party      |
| `Event`                 | `event` + `outbox`            | Transversal    |
| `StudioWorkspace`       | `environment_studio_workspace`            | Studio (#191)  |
| `StudioVersion`         | `environment_studio_version`              | Studio (#191)  |
| `StudioAuditEntry`      | `user_studio_audit_log`            | Studio (#191)  |
| Reference Data set      | `environment_reference_data_set`          | Studio (#196)  |
| Reference Data value    | `environment_reference_data_value`        | Studio (#196)  |

Os tipos de linha crus estão tipados em `src/modules/*/rows.ts` — eles são o contrato entre o SQL e o
domínio, e o compilador valida o mapeamento.

### `href` TMF derivado

O `href` (self-link) continua obrigatório nos contratos TMF expostos pelo Nexus, mas **não é uma coluna persistida**. Repositórios o derivam em tempo de leitura com `buildHref` (`src/shared/tmf/href.ts`), a partir do tipo da entidade e do seu `id`; `GeographicRelationshipType` usa o `code` como chave natural. Isso evita links congelados em uma versão de rota ou host interno e elimina armazenamento redundante.

Por padrão o valor é relativo (`/tmf-api/...`). Quando o gateway público difere do host interno, `TMF_PUBLIC_BASE_URL` prefixa o link absoluto no boot. Código novo não deve montar `href` por template literal nem aceitar o valor como fonte de verdade persistível; deve usar `buildHref`.

### 9.0 Enriquecimento de equipamentos Netwin (#332)

A Fase 2.B do migrador hidrata, por lote e somente por SELECT, os dados de `OSP_EQUIPMENT`, do espelho `NS_RES_INS_NODE_MIRROR` / `ISP_INS_EQUIPAMENTO`, dos atributos dinâmicos e dos lookups (`PROJECT`, `OSP_CELL`, `ISP_CAT_MODELO_EQUIP`). Nada disso entra no SELECT paginado.

| Informação Netwin                                                                      | Destino Nexus                                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `LABEL`                                                                                | `physical_resource.label`                                                                                          |
| `NUM_SERIE`                                                                            | `serial_number` (UNIQUE); colisão ou duplicata vira a characteristic `reportedSerialNumber`, sem abortar o lote    |
| `OWNER_ID`                                                                             | `relatedParty` com role `infrastructure_owner` (Party importada na Fase 1)                                         |
| Fabricante do modelo                                                                   | `relatedParty` com role `manufacturer` da ResourceSpecification (nunca da instância)                               |
| `PROJECT.NAME`                                                                         | `project_id` se casar por nome normalizado exato com `project`; senão a characteristic `implementationProject` |
| Estação abastecedora (dinâmico `supplierStationId` ou `OSP_CELL.SUPPLIER_LOCATION_ID`) | `serving_site_id` + characteristic `servingSite` (nunca `INFRANODE_ID`, que é o local físico)                      |
| Dimensões, rede, topologia, flags, controle, datas, observações                        | characteristics tipadas da allowlist (`characteristicLevel: instance`)                                             |

Política de rerun: o merge é por ownership. O migrador substitui apenas a allowlist, `servingSite`, `substatus`, `_origin` e o papel `infrastructure_owner`; characteristics e partes relacionadas de outras origens (Studio, UI, `vendor`) sobrevivem. Atributos dinâmicos fora da allowlist são só contabilizados no relatório. Não há fase de backfill separada: recursos já carregados recebem o enriquecimento ao reexecutar a 2.B.

---

## 9.1 Diretório geográfico canônico

`geographic_administrative_city` (tabela interna de apoio, não é entidade TMF) guarda país, UF e município normalizados: `country_code`, `country_name`, `state_code`, `city_name`, `city_key`. A chave natural é `(country_code, state_code, city_key)`, onde `city_key` é caixa única, sem acentos e sem espaços repetidos. O diretório é global (sem `tenant_id`); o isolamento continua nos Sites, Resources e Addresses.

O município operacional é dimensão **direta do Site** (issue #339): `geographic_site.administrative_city_id` (nullable; interno de repositório, fora do payload TMF — C1). Os campos TMF673 `country`, `stateOrProvince` e `city` do endereço permanecem como texto; o endereço **não** carrega mais FK para o diretório.

### Vínculo tenant–município (`geographic_administrative_city_tenant`)

Tabela de plataforma, **não-TMF**, PK `(tenant_id, administrative_city_id)`, FK para `geographic_administrative_city`, com `active_site_count` (Sites raiz não `Retired`) e `updated_at`. É o pai da FK composta `geographic_fk_site_admin_city` `(tenant_id, administrative_city_id)` do Site; o índice `geographic_idx_site_tenant_city(tenant_id, administrative_city_id, parent_site_id, status)` serve a abertura de uma cidade na árvore da Planta Interna por `INDEX RANGE SCAN`, sem UNION nem junção com endereço.

Regras: a linha tenant–município é garantida **antes** do Site (ordem da FK); contagens são recontadas, nunca incrementadas; linhas sem Site ativo ficam com `active_site_count = 0` (nunca apagadas, pois Sites `Retired` — C6 — ainda as referenciam) e a árvore filtra `> 0`. Site sem município é válido e aparece no ramo "Sem município". Cargas e o migrador Netwin só preenchem município **nulo**, preservando edições da modal.

Sincronização: `OracleGeoRepository` (`setSiteAdministrativeCity`), as fases 2.A, 2.B e 2.E do migrador Netwin e os loaders em `scripts/` resolvem o município pela chave natural. Ambientes anteriores à V35 usam `scripts/backfill-site-administrative-city.mjs` (dry-run por padrão; `--apply` exige `--target-prefix`), que também valida a FK; a V36 então remove `geographic_address.administrative_city_id`, `geographic_site_administrative_city` e `geographic_administrative_city_site_count` (falha com instrução se houver Site sem município preenchido). Ambientes novos já nascem sem esses objetos.

Os nomes das `GeographicSiteSpecification` seguem o vocabulário Netwin em português (ex.: `BUILDING` → Edifício; `CENTRAL_OFFICE` → Estação Predial) sem alterar `code`/UUID; `GeographicSite.name` na carga Netwin é `LOCATION.NAME - LOCATION.DESCRIPTION`.

## 9.2 Nomes físicos por domínio e cutover (#344)

Toda tabela Oracle segue `<ORACLE_OBJECT_PREFIX><DOMÍNIO>_<RESTO>`, com o domínio em `GEOGRAPHIC`, `PROJECT`, `ENVIRONMENT`, `RESOURCE`, `SERVICE`, `MIGRATION`, `PARTY`, `USER` ou `ORDER`. Índices e constraints nomeadas usam `<DOMÍNIO>_<TIPO>_<RESTO>` (`IDX`, `UQ`, `FK`, `CK`, `PK`); constraints `SYS_*` não são renomeadas. A fonte única é `src/shared/persistence/database-object-names.ts` (tabelas) e `legacy-object-names.ts` (índices e constraints legados, usados só no cutover). O vocabulário TMF permanece no domínio e nas APIs; só a persistência muda.

Namespaces criados antes da #344 usam os nomes legados (`TMF_*`, `GEO_*`, ...). O boot recusa iniciar sobre eles; a conversão é um comando explícito, metadado-only (`RENAME`), retomável e registrado em `<PREFIXO>MIGRATION_DATABASE_OBJECT_RENAME`:

```
ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --inventory
ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --dry-run
ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --apply --confirm-prefix NX_DEV9_
ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --verify
```

Pare backend, Studio e migradores antes do `--apply` e faça backup do ambiente. Se origem e destino coexistirem, o comando aborta. `--rollback --confirm-prefix <PREFIXO>` reverte pelo mesmo mapa.

## 9.3 Projeções geoespaciais do migrador Netwin — operação da Fase 3 (#367)

A Fase 3 deriva, só no destino e sem consultar o Netwin, as projeções de leitura do mapa: `geographic_map_feature` (pontos e linhas por tile), `geographic_map_density` (agregados por zoom) e as manchas de cobertura GPON (`geographic_coverage_area`/`_cell`). Todas são regeráveis a partir de Sites, Resources e Locations; a cobertura está especificada no REQ-MOD01-014 de [`01-module-geo.md`](../2-functional-specs/01-module-geo.md). Por isso a Fase 3 opera sempre pelo tenant inteiro e recusa `--uf`, `--municipio`, `--bairro`, `--full`, `--resume`, `--job-id` e `--max-records`.

| `--phase` | O que faz                                                                                                                                  | Quando usar                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `3`       | 3.A integral (apaga e regrava todas as features e a densidade do tenant) seguida da 3.B                                                    | Ambiente novo ou projeções suspeitas                                  |
| `3a`      | 3.A incremental: só Sites e Resources com `updated_at` na janela `[--updated-since, início da execução)`, e a densidade dos tiles afetados | Depois de cargas da Fase 2 por UF/município em um tenant já projetado |
| `3d`      | Recalcula só a densidade do tenant, a partir das features vigentes                                                                         | Depois de uma 3.A incremental interrompida                            |
| `3b`      | Recalcula a cobertura GPON do tenant inteiro a partir das CDOs (não tem modo incremental)                                                  | Depois da 3.A, sempre que CDOs tiverem mudado                         |

Fluxo para o delta de cargas da Fase 2 (comandos sem `--apply` rodam em DRY-RUN):

```
npm run migrate:netwin:native -- --phase 3a --apply --updated-since 2026-10-14T00:00:00-03:00 --target-prefix NX_DEV16_ --tenant-id vtal
npm run migrate:netwin:native -- --phase 3b --apply --target-prefix NX_DEV16_ --tenant-id vtal
```

- **Escolha do corte.** `--updated-since` exige fuso explícito (`Z` ou `±HH:MM`) e deve ser anterior à primeira carga da Fase 2 ainda não projetada. Um corte mais antigo só custa tempo: cada entidade tem suas features apagadas e regravadas, então reprocessar é idempotente.
- **Execução interrompida.** As features já gravadas ficam, porque o commit é por página. O conjunto de tiles cuja densidade precisa ser recalculada vive só em memória e se perde com o processo. Para recuperar, rode de novo a `3a` a partir de um corte anterior ao ponto de parada (ou aceite o que já foi gravado), depois a `3d` e por fim a `3b`.
- **Alterações durante a execução.** A janela termina no instante em que a 3.A começa. O que a Fase 2 gravar depois disso entra na próxima execução, com `--updated-since` igual ao fim da janela anterior, que a 3.A registra no log (`Janela incremental: [início, fim)`).
- **Paginação.** O cursor da 3.A incremental é `SYS_EXTRACT_UTC(updated_at)` em texto com microssegundos mais o `id`, na mesma expressão do índice `(tenant_id, SYS_EXTRACT_UTC(updated_at), id)`. Ordenar pela coluna crua força um sort da janela inteira a cada página. Um cursor em `Date` do JavaScript trunca em milissegundos e relê para sempre linhas com fração abaixo disso.
- **Ordem de grandeza** (NX_DEV16_, out/2026): a 3.A incremental projeta 400 a 1.000 entidades/s; a `3d` leva poucos minutos (15 mil células); a `3b` leva cerca de 30 min para 1,1 milhão de CDOs (16 mil polígonos, 2,6 milhões de células).

## 10. Referências

| Onde                                                                 | O quê                                         |
| -------------------------------------------------------------------- | --------------------------------------------- |
| [`architecture.md`](architecture.md)                                 | Concorrência, pool, Spatial, path computation |
| [`non-functional-requirements.md`](non-functional-requirements.md)   | Volumetria e alvos                            |
| [`security.md`](security.md)                                         | Isolamento de tenant e auditoria              |
| [`../1-overview/business-rules.md`](../1-overview/business-rules.md) | C1, C4, C5, C6, C8                            |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
