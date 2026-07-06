# SQLite Persistence Layer — V.tal Nexus

## Visão geral

A aplicação V.tal Nexus foi refatorada para usar **SQLite** como camada de persistência em vez de manter dados em memória. Isso permite que dados sejam persistidos entre execuções e oferece escalabilidade para produção.

## Arquitetura

### Componentes principais

```
src/
├── shared/
│   └── persistence/
│       ├── sqlite-database.ts          # Singleton que gerencia conexão SQLite
│       ├── sqlite-user-repository.ts   # CRUD de usuários
│       ├── sqlite-search-repository.ts # CRUD de pesquisas
│       └── sqlite-*.ts                 # Outros repositórios
├── modules/
│   └── geo/
│       ├── sqlite-repository.ts        # Persistência geo com SQLite
│       ├── geo-repository-interface.ts # Interface comum (GeoRepository e SqliteGeoRepository)
│       └── service.ts                  # Aceita IGeoRepository (polimórfico)
└── shared/
    └── http/
        └── app.ts                      # Wiring: app cria DB, inicializa, injeta repositórios
```

### Banco de dados

**Arquivo:** `./data/nexus.db` (SQLite com WAL mode)

**Tabelas:**

#### Usuários
- `users` — ID, external_id (VT158145), name, email, timestamps
- `searches` — ID, user_id (FK), query, filters (JSON), results (JSON), timestamp

#### Geographic (Módulo Geo)
- `geographic_locations` — Pontos, linhas, polígonos com geometria GeoJSON
- `geographic_addresses` — Endereços com referência a locations
- `geographic_site_specifications` — Catálogo de tipos de site
- `geographic_sites` — Sites (CO, substação, etc.) com hierarquia e referências

#### Resource (preparado para futuro)
- `physical_resources` — Racks, equipamentos, cabos, etc.
- `logical_resources` — Serviços de camada L2/L3

#### Service (preparado para futuro)
- `services_cfs` — Customer Facing Service (comercial)
- `services_rfs` — Resource Facing Service (técnico)
- `service_orders` — Ordens de serviço

---

## APIs HTTP

### Usuários

```bash
# Listar usuários
GET /v1/users
Authorization: Bearer <token>

# Criar usuário
POST /v1/users
{
  "externalId": "VT158145",
  "name": "NIRALDO ROCHA GRANADO JUNIOR",
  "email": "niraldo@v-tal.com"  # opcional
}

# Obter usuário
GET /v1/users/<id>

# Atualizar usuário
PUT /v1/users/<id>
{
  "name": "Novo Nome",  # opcional
  "email": "novo@v-tal.com"  # opcional
}

# Deletar usuário
DELETE /v1/users/<id>
```

### Pesquisas (atreladas ao usuário VT158145)

```bash
# Listar todas as pesquisas
GET /v1/searches

# Listar minhas pesquisas (do usuário autenticado VT158145)
GET /v1/searches/my

# Criar pesquisa
POST /v1/searches
{
  "query": "buscar sites em Botafogo",
  "filters": {
    "region": "RJ",
    "category": "Central"
  },
  "results": {
    "count": 3,
    "items": [...]
  }  # opcional
}

# Obter pesquisa
GET /v1/searches/<id>

# Atualizar pesquisa
PUT /v1/searches/<id>
{
  "query": "nova query",  # opcional
  "filters": {...},       # opcional
  "results": {...}        # opcional
}

# Deletar pesquisa
DELETE /v1/searches/<id>
```

### Geographic (existente, agora persiste em SQLite)

```bash
# Locações
POST /v1/geo/locations
{
  "geometryType": "Point",
  "geometry": {"type": "Point", "coordinates": [-43.18, -22.9]},
  "spatialRef": "EPSG:4326"
}

GET /v1/geo/locations
GET /v1/geo/locations/<id>

# Endereços
POST /v1/geo/addresses
{
  "street": "Rua Voluntários da Pátria",
  "city": "Rio de Janeiro",
  "geographicLocationId": "<location_id>"  # opcional
}

GET /v1/geo/addresses

# Especificações de Site
POST /v1/geo/site-specifications
{
  "name": "Central Office",
  "category": "Site",
  "allowedParentSpecIds": [],
  "allowedChildSpecIds": ["SubSite"]
}

GET /v1/geo/site-specifications

# Sites
POST /v1/geo/sites
{
  "name": "CO Botafogo",
  "siteSpecificationId": "<spec_id>",
  "placeId": "<location_id>",  # opcional
  "addressId": "<address_id>"   # opcional
}

GET /v1/geo/sites
```

---

## Inicialização

### Desenvolvimento

```bash
# Build e executa com SQLite local
npm run dev:sqlite

# Inicia apenas (sem rebuild)
npm run start:sqlite
```

Banco de dados fica em `./data/nexus.db`.

### Testes

```bash
# Executa testes com SQLite temporário
npm run test

# Com cobertura
npm run test:coverage
```

Durante os testes, o DB é resetado entre suites (`SqliteDatabase.resetForTesting()`).

---

## Usuário Padrão

Na inicialização da aplicação, é criado automaticamente:

```json
{
  "externalId": "VT158145",
  "name": "NIRALDO ROCHA GRANADO JUNIOR"
}
```

Todas as pesquisas criadas via `/v1/searches` são atreladas a este usuário automaticamente.

---

## Exemplo de Fluxo Completo

```bash
# 1. Criar localização
curl -X POST http://localhost:4001/v1/geo/locations \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "geometryType": "Point",
    "geometry": {"type": "Point", "coordinates": [-43.18, -22.9]}
  }'
# Retorna: {"@type": "GeographicLocation", "id": "uuid-1", ...}

# 2. Criar especificação de site
curl -X POST http://localhost:4001/v1/geo/site-specifications \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"name": "Central Office", "category": "Site"}'
# Retorna: {"@type": "GeographicSiteSpecification", "id": "uuid-2", ...}

# 3. Criar site
curl -X POST http://localhost:4001/v1/geo/sites \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CO Botafogo",
    "siteSpecificationId": "uuid-2",
    "placeId": "uuid-1"
  }'
# Retorna: {"@type": "GeographicSite", "id": "uuid-3", ...}

# 4. Criar pesquisa
curl -X POST http://localhost:4001/v1/searches \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "sites em Botafogo",
    "filters": {"region": "RJ"}
  }'
# Retorna: {"id": "uuid-4", "userId": "uuid-user", "query": "...", ...}

# 5. Listar minhas pesquisas
curl -X GET http://localhost:4001/v1/searches/my \
  -H "Authorization: Bearer change-me"
# Retorna: [{"id": "uuid-4", ...}]
```

---

## Configuração de Ambiente

```env
# Caminho do banco de dados (padrão: ./data/nexus.db)
DATABASE_URL=sqlite://./data/nexus.db

# Porta da aplicação (padrão: 4001)
PORT=4001

# Nível de log (padrão: info)
LOG_LEVEL=debug|info|warn|error

# Autenticação
AUTH_ENABLED=true
AUTH_TOKEN=change-me
```

---

## Estrutura do Schema SQLite

Consulte [sqlite-database.ts](src/shared/persistence/sqlite-database.ts) para o SQL completo de inicialização das tabelas.

### Características principais

- **UPSERT:** Operações `INSERT OR IGNORE` / `INSERT ... ON CONFLICT` para idempotência
- **JSON:** Características, filtros e resultados são armazenados como texto JSON
- **Integridade referencial:** Foreign keys entre ubicações, endereços, sites
- **Índices:** Índices em FKs para performance em queries comuns
- **WAL mode:** Write-Ahead Logging para melhor concorrência em leitura

---

## Próximas Etapas

1. **Modules Resource e Service:** Implementar repositórios SQLite para Physical/Logical Resources e Services
2. **Migrations:** Estruturar migrations com versionamento de schema
3. **Backup/Export:** Endpoints para export/import de dados em CSV/JSON
4. **Replicação:** Estratégia de replicação para backup
5. **Índices avançados:** Índices full-text para pesquisas de texto livro
6. **Versionamento de dados:** Auditoria de mudanças com soft-delete

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
