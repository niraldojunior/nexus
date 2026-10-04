# Seed de infraestrutura pública — Energia (ANEEL SIGEL)

Popula uma instância Nexus (tipicamente a **DEMO**, `NX_DEMO_`) com **subestações e linhas de
transmissão reais**, para demonstrar que o modelo do Nexus serve a outros domínios de infraestrutura
além de fibra.

Não é uma plataforma de integração: é um script CLI que baixa, transforma e grava usando
**exclusivamente** as tabelas e os padrões que o Nexus já tem. Sem sincronização contínua, sem
staging, sem jobs.

---

## Fonte

**ANEEL SIGEL** — serviço ArcGIS REST público, sem autenticação:

```
https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Transmissão/MapServer
```

| Layer | Conteúdo              | Total nacional | No envelope RJ+SP | No escopo RJ+SP |
| ----- | --------------------- | -------------- | ----------------- | --------------- |
| `3`   | Subestações (Point)   | 627            | 145               | **131**         |
| `1`   | Linhas de transmissão | 1817           | 476               | **301**         |

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

# Carga real
npm run seed-demo-infra -- --apply --states RJ,SP

# Carga real + índice de tiles do mapa na mesma passada
npm run seed-demo-infra -- --apply --build-features
```

| Flag               | Default       | O que faz                                                  |
| ------------------ | ------------- | ---------------------------------------------------------- |
| `--apply`          | _ausente_     | Sem ela é **dry-run**: nada é gravado                      |
| `--limit N`        | _sem limite_  | Teto de features baixadas por layer                        |
| `--states RJ,SP`   | `RJ,SP`       | UFs do escopo (só RJ e SP têm caixa envolvente cadastrada) |
| `--tenant-id`      | _do ambiente_ | Tenant de destino — default lido de `nexus_environment`    |
| `--owner-party-id` | `=tenantId`   | `Organization` do `relatedParty`                           |
| `--build-features` | _ausente_     | Dispara `build-map-features.mjs --apply` ao final          |

Ambiente (`.env`): `ORACLE_CONNECTION_STRING`, `ORACLE_USER`, `ORACLE_PASSWORD` e
`ORACLE_OBJECT_PREFIX` (ex.: `NX_DEMO_`). Oracle-only (C10).

Se `--build-features` não for usado, o script imprime no final o comando exato do indexador — **a
carga não aparece no mapa até ele rodar**.

---

## O que é criado

**Catálogo** (fase 1) — modelagem mínima, 1 site spec + 2 types + 2 specs:

```
GeographicSiteSpecification  ENERGY_SUBSTATION  (category Site · siteRole network)

ResourceType  EnergySubstation        (POINT · map_presence 1)
ResourceType  EnergyTransmissionLine  (LINE  · map_presence 1)

Catálogo de recursos
└── Energia (GROUP)
    ├── EnergySubstation
    └── EnergyTransmissionLine
```

As **11 tensões distintas do escopo não viram specifications** — `tensaoKv` é characteristic de
instância.

**Instâncias** (fase 4):

| Item       | Linhas gravadas                                                                              |
| ---------- | -------------------------------------------------------------------------------------------- |
| Subestação | `GeographicLocation` (Point) → `GeographicSite` → `PhysicalResource` (`place_type` Site, C2) |
| Linha      | `GeographicLocation` (LineString **completa**) → `PhysicalResource` (`place_type` Location)  |

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
- **Subestação sem UF na fonte.** A camada não traz UF nem no `Name` nem no `PopupInfo`, então o
  filtro e a characteristic `uf` saem da caixa envolvente do ponto.
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

## Próximos passos (não implementados)

A estrutura já aceita outros domínios — `aneel.ts` recebe `layerId` e devolve features GeoJSON.

- **Gás**: Gasoduto, Estação de Compressão, Ponto de Entrega.
- **Ferrovia**: Trecho Ferroviário, Estação Ferroviária.

As fontes diretas (ONS, ANTT, DNIT VGEO, ANP GIS) estavam todas fora do ar na verificação. O
substituto confirmado é o WFS do IBGE (`geoservicos.ibge.gov.br/geoserver/wfs`), camadas
`CCAR:BC100_Trecho_Duto_L` e `CCAR:BC100_Trecho_Ferroviario_L` — **nacionais**, exigindo filtro por
bbox, e os trechos ferroviários vêm como `MultiLineString` (que o mapper já divide em partes).

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
