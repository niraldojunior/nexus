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

| Layer | Conteúdo                        | Geometria     | Escopo atual |
| ----- | ------------------------------- | ------------- | ------------ |
| `3`   | Subestações                     | Point         | Por UF       |
| `5`   | Sistemas Isolados               | Point         | Por UF       |
| `1`   | Linhas de transmissão           | LineString    | Por UF       |

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

| Flag               | Default       | O que faz                                                 |
| ------------------ | ------------- | --------------------------------------------------------- |
| `--apply`          | _ausente_     | Sem ela é **dry-run**: nada é gravado                     |
| `--limit N`        | _sem limite_  | Teto de features baixadas por layer                       |
| `--states RJ,SP`   | `RJ,SP`       | UFs do escopo (aceita as 27 UFs brasileiras)              |
| `--all-states`     | _ausente_     | Seleciona as 27 UFs; rode dry-run primeiro                |
| `--tenant-id`      | _do ambiente_ | Tenant de destino — default lido de `nexus_environment`   |
| `--owner-party-id` | `=tenantId`   | `Organization` do `relatedParty`                          |
| `--build-features` | _ausente_     | Dispara `build-map-features.mjs --apply` ao final         |

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

| Item              | Linhas gravadas                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Subestação        | `GeographicLocation` (Point) → `GeographicSite` → `PhysicalResource` (`place_type` Site, C2) |
| Sistema Isolado   | `GeographicLocation` (Point) → `GeographicSite` → `PhysicalResource` (`place_type` Site, C2) |
| Linha             | `GeographicLocation` (LineString **completa**) → `PhysicalResource` (`place_type` Location)  |

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

| Camada Nexus | Geometria | Camada IBGE | `_origin.system` | Grupo no Studio |
| --- | --- | --- | --- | --- |
| Gasoduto (`GasPipeline`) | Linha | `BC250_2023_Trecho_Duto_L` | `IBGE_BC250` | Gás |
| Trecho Ferroviário (`RailSegment`) | Linha | `BC250_2023_Trecho_Ferroviario_L` | `IBGE_BC250` | Ferrovia |
| Estação Ferroviária (`RailStation`, spec `RAIL_STATION`) | Ponto → Site | `BCIM_Edif_Metro_Ferroviaria_P` | `IBGE_BCIM` | Ferrovia |

Limitações: **Estação de Compressão e Ponto de Entrega de gás não existem** — não há fonte acessível.
O nome das estações ferroviárias é frequentemente nulo na BCIM (fallback `Estação Ferroviária <id>`),
e a BCIM tem menos detalhe que a BC250. Valores nulos ou "Desconhecido" não viram characteristic.

---


## Confidencialidade

V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA
