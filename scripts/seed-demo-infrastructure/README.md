# Seed de infraestrutura pública — Energia (ANEEL SIGEL)

Popula uma instância Nexus (tipicamente a **DEMO**, `NX_DEMO_`) com **subestações, Sistemas Isolados
e linhas de transmissão reais**, para demonstrar que o modelo do Nexus serve a outros domínios de
infraestrutura além de fibra.

Não é uma plataforma de integração: é um script CLI que baixa, transforma e grava usando
**exclusivamente** as tabelas e os padrões que o Nexus já tem. Sem sincronização contínua, sem
staging, sem jobs.

---

## Fonte

**ANEEL SIGEL** — serviço ArcGIS REST público, sem autenticação:

```text
https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Transmissão/MapServer
```

| Layer | Conteúdo              | Geometria  | Escopo atual |
| ----- | --------------------- | ---------- | ------------ |
| `3`   | Subestações           | Point      | Por UF       |
| `5`   | Sistemas Isolados     | Point      | Por UF       |
| `1`   | Linhas de transmissão | LineString | Por UF       |

> As contagens do SIGEL são dinâmicas. Use o dry-run para registrar os números atuais antes de uma
> carga `--apply`, especialmente ao selecionar múltiplas UFs.
>
> Usamos o SIGEL, não a EPE: os endpoints GIS da EPE estão fora do ar (host interno
> `VSVR-AGSPRD.EPE.LAN:7443` recusa conexão, o portal devolve HTTP 500). O SIGEL carrega a mesma base
> ONS.

As camadas vêm de KML, então **os atributos são pobres**: só `OID`, `Name`, `FolderPath`, `PopupInfo`
(HTML) e `Shape_Length`. Tensão, extensão, agente e capacidade são extraídos do HTML do `PopupInfo`.

---

## Comandos

```bash
# Ensaio (dry-run) — baixa, mapeia e conta, sem gravar nada
npm run seed-demo-infra -- --limit 20

# Dry-run para UFs adicionais — exemplo de Norte e Sul
npm run seed-demo-infra -- --states AM,RR,RS

# Dry-run nacional explícito — não grava
npm run seed-demo-infra -- --all-states

# Carga real, somente após revisar as contagens do dry-run
npm run seed-demo-infra -- --apply --states RJ,SP

# Carga real + índice de tiles do mapa na mesma passada
npm run seed-demo-infra -- --apply --build-features
```

| Flag               | Default       | O que faz                                               |
| ------------------ | ------------- | ------------------------------------------------------- |
| `--apply`          | _ausente_     | Sem ela é **dry-run**: nada é gravado                   |
| `--limit N`        | _sem limite_  | Teto de features baixadas por layer                     |
| `--states RJ,SP`   | `RJ,SP`       | UFs do escopo (aceita as 27 UFs brasileiras)            |
| `--all-states`     | _ausente_     | Seleciona as 27 UFs; rode dry-run primeiro              |
| `--tenant-id`      | _do ambiente_ | Tenant de destino — default lido de `nexus_environment` |
| `--owner-party-id` | `=tenantId`   | `Organization` do `relatedParty`                        |
| `--build-features` | _ausente_     | Dispara `build-map-features.mjs --apply` ao final       |

Ambiente (`.env`): `ORACLE_CONNECTION_STRING`, `ORACLE_USER`, `ORACLE_PASSWORD` e
`ORACLE_OBJECT_PREFIX` (ex.: `NX_DEMO_`). Oracle-only (C10).

Se `--build-features` não for usado, o script imprime no final o comando exato do indexador — **a
carga não aparece no mapa até ele rodar**.

Para regenerar os índices derivados manualmente, escolha o namespace no próprio comando (a flag
prevalece sobre qualquer `ORACLE_OBJECT_PREFIX` herdado da sessão):

```bash
node scripts/build-map-features.mjs --environment NX_DEMO_ --tenant vtal --apply
node scripts/build-map-density.mjs --environment NX_DEMO_ --tenant vtal --apply
```

Sem `--environment`, ambos conservam a compatibilidade e usam `ORACLE_OBJECT_PREFIX` do ambiente.

---

## O que é criado

**Catálogo** (fase 1) — modelagem mínima, 2 site specs + 3 types + 3 specs:

```text
GeographicSiteSpecification  ENERGY_SUBSTATION       (category Site · siteRole network)
GeographicSiteSpecification  ENERGY_ISOLATED_SYSTEM  (category Site · siteRole network)

ResourceType  EnergySubstation        (POINT · map_presence 1)
ResourceType  EnergyIsolatedSystem    (POINT · map_presence 1)
ResourceType  EnergyTransmissionLine  (LINE  · map_presence 1)

Catálogo de recursos
└── Energia (GROUP)
    ├── EnergySubstation
    ├── EnergyIsolatedSystem
    └── EnergyTransmissionLine
```

As **11 tensões distintas do escopo não viram specifications** — `tensaoKv` é characteristic de
instância.

**Instâncias** (fase 4):

| Item            | Linhas gravadas                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| Subestação      | `GeographicLocation` (Point) → `GeographicSite` → `PhysicalResource` (`place_type` Site, C2) |
| Sistema Isolado | `GeographicLocation` (Point) → `GeographicSite` → `PhysicalResource` (`place_type` Site, C2) |
| Linha           | `GeographicLocation` (LineString **completa**) → `PhysicalResource` (`place_type` Location)  |

**Characteristics** — `tensaoKv`, `extensaoKm`, `capacidadeMw`, `operador`, `uf`, mais `_origin.*`
(`system=ANEEL_SIGEL`, `entity`, `id`). Nenhuma coluna nova foi criada para esses atributos (C1).

**Camadas do mapa** (fase 5) — o script publica o grupo **ENERGIA** no catálogo Studio GEO. Isso é
obrigatório: num ambiente `bootstrapMode:'empty'` o catálogo publicado vem vazio e
`isMapFeatureVisible` esconde toda feature sem camada — os dados entrariam no banco e o mapa ficaria
vazio.

---

## Idempotência

Todo id é um UUID v5 derivado de `ANEEL_SIGEL:<entidade>:<OID>` em um namespace próprio do seed.
Reexecutar no mesmo escopo **atualiza** as mesmas linhas, nunca duplica — a gravação é `MERGE`.

---

## Limitações conhecidas

Nenhuma destas é bug; são consequências da fonte ou de decisões de escopo.

- **Sem `municipio`.** A fonte não tem o dado, e a characteristic **não é emitida** em vez de receber
  `''`/`'N/D'`, que poluiria filtro e popup. Geocodificação reversa seria a evolução natural.
- **O indexador roda sem `--uf/--city`.** Aqueles filtros dependem do _endereço_ da Location, e
  nenhum item importado tem endereço — um rebuild escopado deixaria tudo de fora.
- **A subestação não aparece na árvore de Locais.** A Hierarquia Geo lista como Estações apenas
  `CO`/`POP` (`STATION_WHERE` em `src/modules/geo/tree-service.ts`). Ela aparece **no mapa e na
  busca**; incluí-la na árvore exigiria mexer naquele recorte — fora do escopo de um seed.
- **Reexecutar com `--limit` menor deixa resíduo.** O excedente da carga anterior permanece: o Nexus
  não faz DELETE físico (C6) e limpeza está fora de escopo.
- **Pontos sem UF na fonte.** Subestações e Sistemas Isolados são filtrados espacialmente; quando a
  origem não declara a UF no `Name` ou `PopupInfo`, a characteristic `uf` sai da caixa envolvente.
- **Escopo nacional deve ser ensaiado.** O default continua `RJ,SP` para evitar download/carga ampla
  por engano. Para cobrir o país, passe explicitamente as 27 siglas em `--states`, rode primeiro sem
  `--apply` e só grave depois de revisar as contagens emitidas pelo script.
- **Linha bi-estadual.** 28 das 476 linhas declaram duas UFs (`MG/SP`, `RJ/SP`, `SP/MS`). O registro
  é mantido **uma vez**, e `uf` recebe o valor composto (`'RJ/SP'`) em vez de escolher uma.
- **Faixas de escala divergem do default do front.** Todas as 8 ficam `visible:true`: o default
  esconde ponto acima de 100 m, e numa demo em escala estadual nada apareceria.

### Por que o filtro de UF olha o nome antes da geometria

O envelope retangular da consulta ArcGIS não basta. Das 476 linhas que ele devolve para RJ+SP,
**175 têm sufixo exclusivamente PR, MG, MS ou ES** — atravessam o retângulo sem tocar o escopo. E o
teste de ponto não resolve: a caixa de SP **contém Telêmaco Borba (PR)**. Então, quando a fonte
declara a UF no sufixo do `Name`, ela é a autoridade; a geometria só decide na ausência do sufixo (1
linha em 476).

---

## Gás e Ferrovia (IBGE WFS)

Opt-in via `--domains` (default: só `energy`):

```bash
npm run seed-demo-infra -- --domains gas,rail --all-states          # dry-run
npm run seed-demo-infra -- --domains energy,gas,rail --apply        # carga real
```

Fonte: WFS público do IBGE (`geoservicos.ibge.gov.br/geoserver/wfs`, workspace `CCAR`), filtrado por
UF no cliente (a ordem dos eixos de `bbox` varia entre versões do WFS).

| Camada Nexus                                             | Geometria    | Camada IBGE                       | `_origin.system` | Grupo no Studio |
| -------------------------------------------------------- | ------------ | --------------------------------- | ---------------- | --------------- |
| Gasoduto (`GasPipeline`)                                 | Linha        | `BC250_2023_Trecho_Duto_L`        | `IBGE_BC250`     | Gás             |
| Trecho Ferroviário (`RailSegment`)                       | Linha        | `BC250_2023_Trecho_Ferroviario_L` | `IBGE_BC250`     | Ferrovia        |
| Estação Ferroviária (`RailStation`, spec `RAIL_STATION`) | Ponto → Site | `BCIM_Edif_Metro_Ferroviaria_P`   | `IBGE_BCIM`      | Ferrovia        |

A camada de dutos do IBGE mistura materiais (gás, minério, água, desconhecido). `classifyDuct`
decide: `mattransp` conhecido manda (só `Gás` vira `GasPipeline`); sem material, o nome decide, e
oleoduto/poliduto/mineroduto/adutora nunca viram gasoduto. Em 2026-10-05, 49 das 108 feições são gás.

### Enriquecimento ANP (gasodutos)

Fonte: autorizações de construção e operação de gás natural da ANP, CSV de dados abertos (UTF-8,
vírgula, aspas duplas, campos com quebra de linha), sem autenticação:

```text
https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/autorizacoes-gas-natural/autorizacoes-construcao-operacao-gas-natural.csv
```

A ANP não publica geometria nem o OID do IBGE; a única chave comum é o **nome**. A junção é por
nome normalizado **exato** (sem acento nem pontuação) contra instalações de duto (`Gasoduto de
Transporte` / `Transferência`). Casos ambíguos ou com campo em conflito nunca são aplicados. Um gasoduto
casado ganha `operador`, `tipoInstalacao` e `_origin.extra.sources`; o id continua o do IBGE.

Cobertura em 2026-10-06: **8 de 49** gasodutos (todos Gasoduto Bolívia-Brasil), 41 sem correspondência,
0 ambíguos. É baixa porque os nomes do IBGE ("Gasoduto Rio-Campinas", "Gasfor") quase não coincidem com
os da ANP. Ampliar exigiria tabela de aliases revisada à mão. Se a ANP estiver fora do ar, o seed avisa e
segue só com o IBGE. **ANTT** não é usada: os conjuntos públicos não trazem geometria nem chave de junção.

Limitações: **Estação de Compressão e Ponto de Entrega de gás não existem** — não há fonte acessível.
O nome das estações ferroviárias é frequentemente nulo na BCIM (fallback `Estação Ferroviária <id>`),
e a BCIM tem menos detalhe que a BC250. Valores nulos ou "Desconhecido" não viram characteristic.

### Indexação das linhas (perfis de LOD)

As camadas de linha (transmissão, gasoduto, trecho ferroviário) são publicadas com quatro perfis de
LOD — `overview` z6/500 m, `regional` z8/150 m, `urban` z10/30 m e `detail` z12/5 m — e cada faixa
de escala escolhe um (`scaleBands[*].lodProfileId`). Em z16 cada linha virava ~1.100 linhas de
`geo_map_feature`. Ajuste no Studio GEO → Tamanho → "Perfis de LOD no mapa". Depois de republicar o
catálogo, **reindexe**: `node scripts/build-map-features.mjs --environment NX_DEMO_ --tenant vtal
--apply` (o dry-run já lista as linhas por `lod_key` e `tile_z`).

## Óleo e Gás (ANP GISHUB + IBGE)

```bash
npm run seed-demo-infra -- --domains oil --all-states          # dry-run
npm run seed-demo-infra -- --domains oil --all-states --apply  # carga real
```

Fonte: WFS público da ANP (`gishub.anp.gov.br/geoserver/ows`, camadas `BD_ANP:*`, EPSG:4674).
Toda página usa `sortBy` — o GeoServer falha com NullPointerException em `startIndex > 0` sem ele.

| Camada ANP                        | Vira                | Forma    | Chave       |
| --------------------------------- | ------------------- | -------- | ----------- |
| `REFINARIAS_SIRGAS`               | Site + Refinaria    | ponto    | `SIGLA`     |
| `UPGN`                            | Site + UPGN         | ponto    | `NOME`      |
| `TERMINAIS_LIQ`                   | Site + Terminal     | ponto    | `SIMP`      |
| `Terminais_GNL`                   | Site + Terminal GNL | ponto    | `NOME`      |
| `POCOS_SIRGAS` (~31 mil)          | Site + Poço         | ponto    | `CADASTRO`  |
| `CAMPOS_PRODUCAO_SIRGAS`          | Campo de Produção   | polígono | `COD_CAMPO` |
| `BLOCOS_EXPLORATORIOS_SIRGAS`     | Bloco Exploratório  | polígono | `COD_BLOCO` |
| dutos IBGE BC250 (`classifyDuct`) | Oleoduto            | linha    | id IBGE     |

Campos e blocos são polígonos (Location → Resource, `place_type=GeographicLocation`); uma
`MultiPolygon` vira um registro por parte (`:part`). Blocos e poços nascem **ocultos** no Studio.
O indexador (`build-map-features.mjs`) grava polígonos com `shape='polygon'`, anel simplificado
(200 m) em z9 e perfil único `legacy`; o cliente desenha cada entidade uma vez.

Limitações: a cobertura de oleodutos vem só do IBGE (poucas feições).

### Licença e atribuição (ANP)

O portal de dados abertos da ANP declara que todo o conteúdo é publicado sob **Creative Commons
Atribuição-SemDerivações 3.0 Não Adaptada** (conferido em 2026-10-08 em
`gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos`; o WFS não declara licença própria).

- **Atribuição (BY):** o grupo "Óleo e Gás" do Studio cita a ANP como fonte no `hint`.
- **Sem derivações (ND):** o seed normaliza atributos em `characteristic`, divide `MultiPolygon` em
  partes e o índice do mapa guarda uma cópia simplificada (200 m). Se isso configura "adaptação" é
  questão jurídica, não técnica — **manter o dado apenas na DEMO (`NX_DEMO_`), fora de produção e de
  apresentações externas, até parecer do jurídico/dados da V.tal.**
  Depois de carregar, reindexe o mapa (comando da seção anterior).
