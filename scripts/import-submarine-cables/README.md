# Importação de cabos submarinos (KML/KMZ)

Carrega a geometria dos sistemas submarinos da V.tal — **GlobeNet** e **Malbec** — de
`legacy-data/cabos_submarinos/` numa instância Nexus escolhida por parâmetro.

É um script CLI de carga pontual. Usa **somente** as tabelas e os padrões que o Nexus já tem: catálogo
(`ResourceType`, `ResourceSpecification`, `GeographicSiteSpecification`) e instâncias
(`GeographicLocation`, `GeographicSite`, `PhysicalResource`). Não cria coluna nova (C1) e não faz
DELETE físico (C6).

---

## Comandos

```bash
# Ensaio (dry-run) — lê, converte e conta; não grava nada
npm run import-submarine-cables -- --environment NX_DEV21_

# Carga real
npm run import-submarine-cables -- --environment NX_DEV21_ --apply

# Carga real + índice de tiles do mapa na mesma passada
npm run import-submarine-cables -- --environment NX_DEV21_ --apply --build-features
```

| Flag               | Default                          | O que faz                                                                        |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------- |
| `--environment`    | `ORACLE_OBJECT_PREFIX`           | Prefixo Oracle da instância de destino (ex.: `NX_DEV21_`). A flag vence o `.env` |
| `--apply`          | _ausente_                        | Sem ela é **dry-run**: nada é gravado                                            |
| `--build-features` | _ausente_                        | Com `--apply`, roda `build-map-features.mjs` ao final                            |
| `--source-dir`     | `legacy-data/cabos_submarinos`   | Pasta com os `.kml`/`.kmz`                                                       |
| `--tenant-id`      | `<prefixo>environment.tenant_id` | Override do tenant (o default é o que o provisionador gravou, ex.: `vtal`)       |
| `--owner-party-id` | o tenant                         | Organization gravada em `related_party` (C8)                                     |

Conexão: `ORACLE_CONNECTION_STRING`, `ORACLE_USER` e `ORACLE_PASSWORD` no `.env`.

---

## Fonte

Três formatos convivem na pasta:

| Arquivos                       | Formato               | Conteúdo                                                                                   |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------ |
| `MALBEC_SEG*.kml` (5)          | KML 2.2               | `Route` (LineString) + pastas `Waypoints - <tipo>` (BMH, BU, repetidores, navegação…)      |
| `SEGMENT n …kmz`, `SEG02-…kmz` | KMZ (`doc.kml`)       | Uma LineString por arquivo; o SEGMENT 6 traz também `Seg 6 Land Route`                     |
| `SEGMENT 4 … Post Repair.kml`  | KML **sem namespace** | Rota em centenas de trechos de 2 pontos, sem nome, + pontos `CableType` (DA/SA/SAL/LWP/LW) |

Sistema, segmento e pontas vêm do **nome do arquivo** (`MALBEC_SEG1.1_BMH_RIO-BU1_PL01_21-FEB-2020`,
`SEGMENT 6 WHITE - FORTALEZA - RIO DE JANEIRO`, `SEGUIMENT 3 - …` com o erro de grafia original).

---

## Conversão

```text
Catálogo (cria se faltar, no tenant da instância)
├── ResourceType  SubmarineCable          Cabo Submarino           LINE
├── ResourceType  SubmarineBranchingUnit  Branching Unit (BU)      POINT
├── ResourceType  SubmarineRepeater       Repetidor Submarino      POINT
├── ResourceType  SubmarineEqualizer      Equalizador Submarino    POINT
│     (+ 1 ResourceSpecification por type; árvore "Cabos Submarinos" no catálogo de recursos)
└── GeographicSiteSpecification  SUBMARINE_BMH · SUBMARINE_POSITION (BU, repetidor e equalizador)
      (category Site · siteRole network)
```

| Origem                                                                                                                | Nexus                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| LineString de rota                                                                                                    | `GeographicLocation(LineString)` → `PhysicalResource SubmarineCable` (`place` = a Location) |
| `Waypoints - BMH`                                                                                                     | `GeographicLocation(Point)` → `GeographicSite SUBMARINE_BMH` (só Local, sem recurso)        |
| `Waypoints - BU` / `Repeaters` / `Equalisers`                                                                         | `GeographicLocation(Point)` → `GeographicSite` → `PhysicalResource` (`place` = o Site, C2)  |
| Demais waypoints (Alter Course, Burial, Crossings, Joints, Splices, Transitions, Maritime Boundaries, Points on Line) | descartados — são navegação/levantamento; o run lista as contagens por pasta                |
| Pontos `CableType` (SEGMENT 4)                                                                                        | descartados como ponto; os tipos distintos viram a characteristic `tiposCabo` da rota       |

Regras de geometria:

- Trechos encadeados (fim de um = início do seguinte) são **costurados** numa única LineString — o
  SEGMENT 4 vira uma rota. Trecho que não encadeia vira parte separada (`#<placemark>:<n>`); nunca se
  inventa geometria para fechar lacuna.
- Vértices consecutivos repetidos são removidos; o restante da geometria vai completo.
- Um mesmo equipamento em vários segmentos (BU1 e BU2 do Malbec) entra **uma vez**: a chave é
  `sistema + entidade + nome`. Coordenada divergente entre arquivos é avisada no log.

**Characteristics** (C1): `sistema` (GlobeNet/Malbec), `segmento`, `pontaA`, `pontaB`, `ambiente`
(`submarino`/`terrestre`), `extensaoKm` (haversine), `revisaoPlano` (Malbec), `corSegmento`,
`observacao` e `tiposCabo` quando a fonte traz.

**Procedência** (C5): `_origin.system = KML_CABOS_SUBMARINOS`, `_origin.entity = ROUTE|BMH|BU|REPEATER|EQUALIZER`,
`_origin.id = <arquivo>#<placemark>` (rotas) ou `<sistema>:<entidade>:<nome>` (equipamentos) e
`_origin.extra = {file, folder|placemark}`.

**Ids**: UUID v5 de um namespace próprio sobre o `_origin.id`. Reexecutar atualiza as mesmas linhas
por `MERGE`.

---

## Mapa

Com `--apply`, o script publica no Studio GEO o grupo **Cabos Submarinos** (cabo como RESOURCE;
BMH, BU, repetidores e equalizadores como LOCAL), mesclado ao catálogo existente sem remover nós de
outros grupos. Repetidores nascem desligados por padrão. Cores e visibilidade se ajustam depois no
Studio.

As features do mapa só aparecem após o indexador — `--build-features` ou o comando que o run imprime:

```bash
node scripts/build-map-features.mjs --environment NX_DEV21_ --apply --tenant vtal --source-system KML_CABOS_SUBMARINOS
```

`--source-system` torna a indexação **aditiva**: só as entidades com
`geographic_location.source_system = KML_CABOS_SUBMARINOS` são (re)indexadas, sem apagar o índice
do tenant, regravar o manifesto de linhas ou recoletar estatísticas. Isso é seguro numa instância já
povoada (ex.: `NX_DEV16_`, com 11 milhões de features).

O indexador resolve a coordenada do recurso pelo Site em que ele está (`place_id` → Site → Location),
então repetidores, derivações e equalizadores entram no índice junto com o cabo (#416).
