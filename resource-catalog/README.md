# ms-resource-catalog

Microserviço de gerenciamento de catálogo de recursos no padrão **TMF634 Resource Catalog Management API v5** (TM Forum). Permite criar, consultar e atualizar catálogos, categorias e especificações de recursos (ex.: CPEs), com controle de ciclo de vida, unicidade corporativa e notificação de eventos via Hub.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Entidades](#entidades)
- [Endpoints](#endpoints)
- [Regras de Negócio](#regras-de-negócio)
- [Eventos (Hub)](#eventos-hub)
- [Configuração](#configuração)
- [Executando Localmente](#executando-localmente)
- [Testes](#testes)
- [Tecnologias](#tecnologias)

---

## Visão Geral

O `ms-resource-catalog` implementa o domínio TMF634 para disponibilizar um catálogo corporativo de CPE (Customer Premises Equipment) consumível por Portal e sistemas internos. O serviço garante:

- Integridade e consistência do catálogo
- Controle de ciclo de vida e vigência (`lifecycleStatus`, `validFor`)
- Unicidade de especificações via chave corporativa
- Consulta padronizada com filtros e paginação
- Notificações de mudança via Hub (TMF pub/sub)

O serviço **não** implementa regras de pedido, jornada, venda ou histórico de ordens. Alterações em entidades de negócio são feitas exclusivamente via `PATCH` — não há `DELETE` físico para `ResourceCatalog`, `ResourceCategory` nem `ResourceSpecification`.

---

## Arquitetura

O projeto segue **Clean Architecture** com separação por módulos em `src/module` e componentes compartilhados em `src/shared`:

```
src/
├── app.module.ts                     # Raiz — registra módulos ativos
├── module/
│   └── resource-catalog/             # Módulo TMF634
│       ├── app.module.ts
│       ├── main.ts
│       ├── application/
│       │   ├── dto/                  # DTOs de request/response
│       │   ├── port/                 # Interfaces de repositório e dispatcher
│       │   └── usecase/              # Casos de uso (lógica de aplicação)
│       ├── domain/
│       │   ├── const/                # Enums e constantes de domínio
│       │   ├── mapper/               # Mapeadores de características
│       │   ├── model/                # Modelos de domínio
│       │   └── rule/                 # Regras de negócio puras
│       └── infra/
│           ├── persistence/          # Implementações de repositório (MongoDB, SQLite, in-memory)
│           ├── presentation/http/    # Controllers e Presenters
│           └── service/              # Serviços de infraestrutura
└── shared/                           # Módulos transversais (logger, config, auth, cache, etc.)
```

**Princípios aplicados:**

- Sem lógica de negócio nos controllers — apenas orquestração de use cases
- Regras de domínio isoladas em `domain/rule/`
- Portas (`application/port`) garantem desacoplamento entre camadas
- IDs gerados via Snowflake (ordem temporal, sem UUID aleatório)
- Erros de negócio com HTTP status explícito (`400`, `404`, `409`, `422`, `500`)

---

## Entidades

O modelo segue a hierarquia TMF634:

```
ResourceCatalog
  └── ResourceCategory  (hierárquica, N níveis)
        └── ResourceSpecification  ←  define o "tipo" do recurso
              └── ResourceCandidate  ←  vincula Spec ↔ Category ↔ Catalog (gerado automaticamente)
```

| Entidade                  | Descrição                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **ResourceCatalog**       | Container raiz (ex.: Atacado, Rede Neutra)                                                                            |
| **ResourceCategory**      | Agrupa especificações; suporta hierarquia pai/filho                                                                   |
| **ResourceSpecification** | Define o CPE (marca, modelo, porte, características, vigência)                                                        |
| **ResourceCandidate**     | Elo de publicação — criado e sincronizado automaticamente pelo backend ao criar/atualizar uma `ResourceSpecification` |
| **Hub**                   | Assinatura de eventos TMF (callback URL)                                                                              |

> O `ResourceCandidate` não precisa ser criado pelos consumidores da API. Ele é materializado internamente a cada `resourceCatalog` referenciado na spec.

---

## Endpoints

Base URL: `/{API_ROUTE_PREFIX}/v1` (ex.: `/api/v1`)

### ResourceCatalog

| Método  | Rota                    | Descrição                                 |
| ------- | ----------------------- | ----------------------------------------- |
| `POST`  | `/resourceCatalog`      | Cria um novo catálogo                     |
| `GET`   | `/resourceCatalog`      | Lista catálogos (com filtros e paginação) |
| `GET`   | `/resourceCatalog/{id}` | Busca catálogo por ID                     |
| `PATCH` | `/resourceCatalog/{id}` | Atualiza catálogo                         |

### ResourceCategory

| Método  | Rota                     | Descrição                                  |
| ------- | ------------------------ | ------------------------------------------ |
| `POST`  | `/resourceCategory`      | Cria uma nova categoria                    |
| `GET`   | `/resourceCategory`      | Lista categorias (com filtros e paginação) |
| `GET`   | `/resourceCategory/{id}` | Busca categoria por ID                     |
| `PATCH` | `/resourceCategory/{id}` | Atualiza categoria                         |

### ResourceSpecification

| Método  | Rota                          | Descrição                                                                                |
| ------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `POST`  | `/resourceSpecification`      | Cria especificação (valida estrutura mínima e unicidade)                                 |
| `GET`   | `/resourceSpecification`      | Lista especificações (suporta filtros `lifecycleStatus`, `validAt`, `fields`, paginação) |
| `GET`   | `/resourceSpecification/{id}` | Busca especificação por ID                                                               |
| `PATCH` | `/resourceSpecification/{id}` | Atualiza especificação; sincroniza candidatos automaticamente                            |

### ResourceCandidate

| Método  | Rota                      | Descrição                                                                  |
| ------- | ------------------------- | -------------------------------------------------------------------------- |
| `GET`   | `/resourceCandidate`      | Lista candidatos                                                           |
| `GET`   | `/resourceCandidate/{id}` | Busca candidato por ID                                                     |
| `PATCH` | `/resourceCandidate/{id}` | Atualiza `name`, `description`, `version`, `lifecycleStatus` ou campos TMF |

### Hub

| Método   | Rota        | Descrição                     |
| -------- | ----------- | ----------------------------- |
| `POST`   | `/hub`      | Registra assinante de eventos |
| `DELETE` | `/hub/{id}` | Remove assinante              |

**Respostas paginadas** incluem os cabeçalhos `X-Result-Count` e `X-Total-Count`.

---

## Regras de Negócio

### Estrutura mínima de `ResourceSpecification`

O `POST /resourceSpecification` requer os seguintes campos, retornando `422 Unprocessable Entity` se ausentes:

- `resourceCatalog[0].id`
- `resourceCategory[0].id`
- `validFor.startDateTime`
- `resourceSpecCharacteristic` com as características:
    - `Brand`
    - `Model`
    - `Categoria` (aceita os valores `P`, `M`, `G` ou `CUSTOMIZADO`)

### Unicidade corporativa

Bloqueia criação e alterações que causem conflito (`409 Conflict`) usando a chave:

```
uniqueKey = categoryId | Brand | Model | porteGroup
```

Onde `porteGroup`:

- `P`, `M` ou `G` → `STD`
- `CUSTOMIZADO` → `CUSTOMIZADO`

Isso impede duplicidade entre Portes padrão para o mesmo Brand + Model + Category, mas permite a coexistência de um registro `STD` e um `CUSTOMIZADO` simultaneamente.

### Sincronização de candidatos no PATCH

Ao atualizar `resourceCatalog` de uma especificação:

- Candidatos de catálogos **removidos** → `lifecycleStatus: Inactive`
- Candidatos de catálogos **adicionados** → criados automaticamente
- Candidatos inalterados → sincronizam as categorias se `resourceCategory` mudou

### Vigência e ciclo de vida

- `lifecycleStatus` controla a ativação do item no catálogo
- `validFor.startDateTime` / `validFor.endDateTime` definem a janela de disponibilidade
- Filtros disponíveis: `?lifecycleStatus=Active`, `?validAt=<ISO-8601>`

---

## Eventos (Hub)

Os seguintes eventos TMF634 são emitidos e entregues para assinantes registrados via `POST /hub`:

| Evento                                           | Gatilho                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `ResourceCatalogCreateEvent`                     | Criação de `ResourceCatalog`              |
| `ResourceCatalogAttributeValueChangeEvent`       | Atualização de atributos                  |
| `ResourceCatalogStatusChangeEvent`               | Mudança de `lifecycleStatus`              |
| `ResourceCategoryCreateEvent`                    | Criação de `ResourceCategory`             |
| `ResourceCategoryAttributeValueChangeEvent`      | Atualização de atributos                  |
| `ResourceCategoryStatusChangeEvent`              | Mudança de `lifecycleStatus`              |
| `ResourceSpecificationCreateEvent`               | Criação de `ResourceSpecification`        |
| `ResourceSpecificationAttributeValueChangeEvent` | Atualização de atributos                  |
| `ResourceSpecificationStatusChangeEvent`         | Mudança de `lifecycleStatus`              |
| `ResourceCandidateCreateEvent`                   | Criação automática de `ResourceCandidate` |

---

## Configuração

Copie `env/env.example` para `env/env.local` e ajuste as variáveis:

```bash
cp env/env.example env/env.local
```

Variáveis relevantes:

| Variável                         | Padrão   | Descrição                                        |
| -------------------------------- | -------- | ------------------------------------------------ |
| `MODULE_TMF634_RESOURCE_CATALOG` | `false`  | Ativa o módulo TMF634                            |
| `DATABASE_TYPE`                  | `memory` | Tipo de banco: `mongodb` \| `sqlite` \| `memory` |
| `MONGODB_HOST`                   | —        | Host do MongoDB                                  |
| `MONGODB_PORT`                   | `27020`  | Porta do MongoDB                                 |
| `MONGODB_NAME`                   | —        | Nome do banco                                    |
| `MONGODB_USER` / `MONGODB_PASS`  | —        | Credenciais                                      |
| `PORT`                           | `3000`   | Porta HTTP da aplicação                          |
| `API_ROUTE_PREFIX`               | `api`    | Prefixo global das rotas                         |
| `SWAGGER_ENABLED`                | `false`  | Habilita UI do Swagger                           |
| `CACHE_TYPE`                     | `memory` | Cache: `memory` \| `redis`                       |
| `DD_ENABLED`                     | `false`  | Habilita tracing com Datadog                     |

> Para desenvolvimento local com repositório in-memory, basta definir `DATABASE_TYPE=memory` e `MODULE_TMF634_RESOURCE_CATALOG=true`.

---

## Executando Localmente

### Requisitos

- Node.js v22.14.0
- npm v8.19.2
- Git v2.38.0
- MongoDB (opcional — use `DATABASE_TYPE=memory` ou `DATABASE_TYPE=sqlite` para desenvolvimento)

### Instalação

```bash
git clone https://dev.azure.com/vtaldevops/MICROSSERVICOS/_git/ms-resource-catalog
cd ms-resource-catalog
npm ci
cp env/env.example env/env.local
# edite env/env.local conforme necessário
```

### Desenvolvimento

```bash
# modo watch (hot reload)
npm run start:dev

# iniciar sem watch
npm run start
```

### Produção

```bash
npm run build
npm run start:prod
```

### Documentação interativa (Swagger)

Com `SWAGGER_ENABLED=true` no `.env`, acesse `http://localhost:3000/swagger` após subir a aplicação.

---

## Testes

```bash
# Todos os testes unitários
npm run test

# Suite focada no módulo TMF634
npm run test -- tmf634-resource-catalog --runInBand

# Testes com cobertura
npm run test:coverage

# Lint
npm run lint
```

---

## Tecnologias

| Camada          | Tecnologia                                   |
| --------------- | -------------------------------------------- |
| Framework       | NestJS 11 + Fastify                          |
| Linguagem       | TypeScript 5                                 |
| Persistência    | TypeORM 0.3 + MongoDB 6 / SQLite / in-memory |
| Cache           | cache-manager + Redis / in-memory            |
| Eventos         | `@nestjs/event-emitter`                      |
| Observabilidade | Pino (logs), Datadog APM (`dd-trace`)        |
| Validação       | `class-validator` / `class-transformer`      |
| Documentação    | Swagger (`@nestjs/swagger`)                  |
| ID              | Snowflake ID (`snowflake-uuid`)              |
| Testes          | Jest + ts-jest                               |
