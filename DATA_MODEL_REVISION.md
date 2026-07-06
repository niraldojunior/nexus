# Revisão do Modelo de Dados SQLite — Alinhamento TMF Forum Rigoroso

**Data:** 2026-07-05  
**Status:** Em implementação  
**Escopo:** Revisão completa do schema para aderência 100% ao padrão TM Forum conforme HLDs 01-03

---

## 1. Princípios de Design TMF Aplicados

Baseado em `AGENTS.md` (Cânone Arquitetural §4) e nos HLDs dos Módulos 1-3:

### 1.1 C1 — TMF-first
- Toda entidade/atributo segue modelo canônico TMF
- Extensão V.tal entra como `characteristics` (JSON array de specCharacteristic) via catálogo
- Nunca campo hardcoded

### 1.2 C5 — Agnóstico à origem com `_origin`
- Nexus gera **UUID v7** próprio (coluna `id`)
- IDs legados → `characteristics` em grupo `_origin`
- Estrutura: `{ group: "_origin", name: "system", value: "netwin" }`, `{ group: "_origin", name: "id", value: "12345" }`, etc.

### 1.3 Características como JSON Array
```json
{
  "id": "resource-uuid",
  "characteristics": [
    {
      "group": "_origin",
      "name": "system",
      "value": "netwin",
      "valueType": "string"
    },
    {
      "group": "_origin", 
      "name": "id",
      "value": "old-resource-123",
      "valueType": "string"
    },
    {
      "group": "configuration",
      "name": "optical_power",
      "value": "25",
      "valueType": "decimal"
    }
  ]
}
```

### 1.4 validFor (Ciclo de vida)
Padrão TMF para todos os recursos:
```json
{
  "validFor": {
    "startDateTime": "2026-06-26T10:00:00Z",
    "endDateTime": null
  }
}
```

### 1.5 relatedParty (Multi-tenant)
```json
{
  "relatedParty": [
    {
      "id": "tenant-uuid",
      "role": "subscriber",
      "name": "ISP Provedor X"
    },
    {
      "id": "tenant-uuid-2",
      "role": "owner",
      "name": "V.tal"
    }
  ]
}
```

---

## 2. Estrutura de Tabelas Revisada

### 2.1 Foundation Tables (Não modificadas — sistema)

```sql
-- Usuários e Pesquisas (não são TMF, são plataforma)
CREATE TABLE users (...)
CREATE TABLE searches (...)
```

### 2.2 Módulo 1 — Geographic (TMF673/674/675)

#### Tabela: `tmf_geographic_location`
Implementa **GeographicLocation (TMF675)**
- Geometrias: Point | LineString | Polygon (GeoJSON)
- Campos: id, href, geometryType, geometry (JSON), spatialRef, accuracy, referencePoint, validFor (JSON)
- Índices: geometry spatial (futura), validFor.startDateTime

#### Tabela: `tmf_geographic_address`
Implementa **GeographicAddress (TMF673)**
- Campos: id, href, streetType, streetName, streetNr, locality, city, stateOrProvince, country, postcode, geographicLocationId (FK), validFor (JSON), characteristics (JSON)
- Índices: city, postcode, geographicLocationId

#### Tabela: `tmf_geographic_site_specification`
Implementa **GeographicSiteSpecification (TMF674)**
- Catálogo de tipos de Site (Central, POP, Floor, Room, Cabinet, etc.)
- Campos: id, href, name, category, description, validFor (JSON), characteristics (JSON com allowedParentSpecIds, allowedChildSpecIds como JSON arrays)
- Índices: name, category

#### Tabela: `tmf_geographic_site`
Implementa **GeographicSite (TMF674)** — entidade central
- Campos: id, href, name, siteSpecificationId (FK), status, geographicLocationId (FK), geographicAddressId (FK), parentSiteId (FK), validFor (JSON), relatedParty (JSON), characteristics (JSON), created_at, updated_at
- Índices: siteSpecificationId, geographicLocationId, parentSiteId, status

#### Tabela: `tmf_geographic_site_relationship`
Relacionamentos topológicos A↔Z entre Sites (TMF674 relatedSite)
- Campos: siteFromId (FK), siteToId (FK), relationshipType, validFor (JSON)
- Índices: siteFromId, siteToId

### 2.3 Módulo 2 — Resource (TMF634/639)

#### Tabela: `tmf_resource_specification`
Implementa **ResourceSpecification (TMF634)** — catálogo
- Campos: id, href, name, category, resourceType, description, validFor (JSON), characteristics (JSON com spec attributes)
- Índices: category, resourceType, name

#### Tabela: `tmf_resource_function_specification`
Implementa **ResourceFunctionSpecification (TMF634)**
- Campos: id, href, name, description, validFor (JSON), characteristics (JSON com configuração padrão)
- Índices: name

#### Tabela: `tmf_physical_resource`
Implementa **PhysicalResource (TMF639)** — instância
- Campos: id, href, name, resourceSpecificationId (FK), resourceType, status, geographicLocationId (FK), manufacturer, model, serialNumber, partNumber, validFor (JSON), relatedParty (JSON), characteristics (JSON), created_at, updated_at
- Índices: resourceSpecificationId, geographicLocationId, status, serialNumber (unique)

#### Tabela: `tmf_logical_resource`
Implementa **LogicalResource (TMF639)** — instância lógica
- Campos: id, href, name, resourceSpecificationId (FK), resourceType, status, supportingResourceId (FK), validFor (JSON), characteristics (JSON), created_at, updated_at
- Índices: resourceSpecificationId, supportingResourceId, status

#### Tabela: `tmf_resource_relationship`
Relacionamentos entre Resources (containment, dependency)
- Campos: resourceFromId (FK), resourceToId (FK), relationshipType, validFor (JSON)
- Índices: resourceFromId, resourceToId

### 2.4 Módulo 3 — Service (TMF633/638)

#### Tabela: `tmf_service_specification`
Implementa **ServiceSpecification (TMF633)** — catálogo
- Campos: id, href, name, category, serviceType (CFS | RFS | Other), description, validFor (JSON), characteristics (JSON)
- Índices: category, serviceType, name

#### Tabela: `tmf_customer_facing_service`
Implementa **CustomerFacingService (TMF638)** — serviço comercial
- Campos: id, href, name, specificationId (FK), status, subscriberId, supportingResourceId (FK), supportingServiceId (FK, RFS), validFor (JSON), relatedParty (JSON), characteristics (JSON), created_at, updated_at
- Índices: specificationId, subscriberId, status, supportingServiceId

#### Tabela: `tmf_resource_facing_service`
Implementa **ResourceFacingService (TMF638)** — serviço técnico
- Campos: id, href, name, specificationId (FK), status, supportingResourceId (FK), validFor (JSON), characteristics (JSON), created_at, updated_at
- Índices: specificationId, supportingResourceId, status

#### Tabela: `tmf_service_relationship`
Relacionamentos entre Services (supports, dependsOn, etc.)
- Campos: serviceFromId (FK), serviceToId (FK), relationshipType, validFor (JSON)
- Índices: serviceFromId, serviceToId

### 2.5 Transversal — Events (TMF688)

#### Tabela: `tmf_event`
Implementa **Event (TMF688)** — event store
- Campos: id (UUID v7), eventType, eventTime, source (módulo + entidade), eventData (JSON payload completo), correlationId, createdAt
- Índices: eventType, source, eventTime, correlationId

### 2.6 Catálogos Extensíveis

#### Tabela: `tmf_relationship_type_catalog`
Catálogo de tipos de relacionamento reutilizável
- Campos: id, name, description, applicableToEntityTypes (JSON array), validFor (JSON)
- Exemplos: "contains", "connects_to", "supports", "depends_on", "implements", "references"

#### Tabela: `tmf_characteristic_group_catalog`
Catálogo de grupos de características
- Campos: id, name, description, applicableToEntityTypes (JSON array), allowedCharacteristics (JSON array com {name, valueType, required})
- Exemplos: "_origin", "configuration", "performance", "billing"

---

## 3. Mapeamento de Atributos Canônicos (TMF)

Todo objeto TMF segue padrão:
```json
{
  "id": "uuid-v7",
  "href": "/tmf-api/module/v4/entity/uuid",
  "name": "...",
  "status": "active | inactive | suspended | terminated",
  "validFor": {
    "startDateTime": "2026-06-26T10:00:00Z",
    "endDateTime": null
  },
  "relatedParty": [
    {
      "id": "party-uuid",
      "role": "owner | subscriber | provider | other",
      "name": "Party Name"
    }
  ],
  "characteristics": [
    {
      "group": "category",
      "name": "attribute_name",
      "value": "attribute_value",
      "valueType": "string | integer | decimal | boolean | date | json"
    }
  ],
  "created_at": "2026-06-26T10:00:00Z",
  "updated_at": "2026-06-26T10:00:00Z"
}
```

---

## 4. Tipos de Status Canônicos

### GeographicSite / Resource
- `active` — operacional, disponível para uso
- `inactive` — provisionado mas não em uso
- `suspended` — temporariamente fora de serviço (manutenção)
- `terminated` — em descomissionamento ou obsoleto (soft-delete)

### Service
- `active` — em operação
- `inactive` — provisionado mas não ativo
- `suspended` — suspenso (falta de pagamento, investigação, manutenção)
- `terminated` — encerrado (fim de contrato, não renovado)

---

## 5. Validação de Integridade Referencial

### Regras de FK
1. Site referencia SiteSpecification (obrigatório)
2. Site referencia GeographicLocation OU GeographicAddress (ao menos um)
3. PhysicalResource referencia ResourceSpecification (obrigatório)
4. LogicalResource referencia ResourceSpecification e PhysicalResource (ambos obrigatórios)
5. CustomerFacingService referencia ResourceFacingService (obrigatório)
6. ResourceFacingService referencia PhysicalResource OU LogicalResource (obrigatório)

### Cascata de Soft-delete
- Recurso marcado com `validFor.endDateTime` não pode ser deletado fisicamente
- Relacionamentos são marcados como inválidos via `validFor.endDateTime`
- Eventos são mantidos para auditoria

---

## 6. Índices de Performance

### Críticos
- `tmf_geographic_site(status, validFor)`
- `tmf_physical_resource(resourceSpecificationId, status)`
- `tmf_customer_facing_service(subscriberId, status)`
- `tmf_event(eventType, eventTime DESC)`

### Secundários
- `tmf_geographic_address(city, postcode)`
- `tmf_logical_resource(supportingResourceId)`
- `tmf_service_specification(serviceType)`

---

## 7. Migração de Dados Legados (Netwin)

### Estratégia
1. Cada recurso migrado recebe UUID v7 único em `id` (gerado pelo Nexus)
2. ID legado armazenado em `characteristics` com grupo `_origin`
3. Timestamp de migração registrado em `_origin.migratedAt`
4. Usuário responsável em `_origin.migratedBy`
5. URL original em `_origin.url` (opcional)

### Exemplo de Payload com Proveniência
```json
{
  "id": "resource-018f8a4e-e51c-7c4d-91a9-2e3e6c2f4a13",
  "name": "OLT-RJ-CENTRAL-01",
  "resourceType": "DSLAM",
  "status": "active",
  "characteristics": [
    {
      "group": "_origin",
      "name": "system",
      "value": "netwin",
      "valueType": "string"
    },
    {
      "group": "_origin",
      "name": "id",
      "value": "DSLAM-00001",
      "valueType": "string"
    },
    {
      "group": "_origin",
      "name": "migratedAt",
      "value": "2026-07-05T14:30:00Z",
      "valueType": "date"
    },
    {
      "group": "_origin",
      "name": "migratedBy",
      "value": "admin@v-tal",
      "valueType": "string"
    },
    {
      "group": "configuration",
      "name": "model",
      "value": "DSLAM-7300",
      "valueType": "string"
    }
  ]
}
```

---

## 8. Compatibilidade com Open APIs TMF

### Endpoints Padrão
- `GET /tmf-api/geographicSiteManagement/v4/geographicSite` (TMF674)
- `GET /tmf-api/geographicAddressManagement/v4/geographicAddress` (TMF673)
- `GET /tmf-api/geographicLocationManagement/v4/geographicLocation` (TMF675)
- `GET /tmf-api/resourceCatalogManagement/v4/resourceSpecification` (TMF634)
- `GET /tmf-api/resourceInventoryManagement/v4/resource` (TMF639)
- `GET /tmf-api/serviceCatalogManagement/v4/serviceSpecification` (TMF633)
- `GET /tmf-api/serviceInventoryManagement/v4/service` (TMF638)
- `GET /tmf-api/eventManagement/v4/event` (TMF688)

### Paginação & Filtros Padrão
- `?offset=0&limit=100`
- `?fields=id,name,status`
- `?status=active`
- `?name~=pattern`

---

## 9. Próximos Passos

1. ✅ Implementar novo schema SQLite em `sqlite-database.ts`
2. ✅ Criar migradores para características (JSON parsing)
3. ⏳ Atualizar repositórios SQLite (GeoRepository, ResourceRepository, ServiceRepository)
4. ⏳ Implementar validadores TMF para cada entidade
5. ⏳ Criar event store e publicador de eventos TMF688
6. ⏳ Adicionar endpoints HTTP conforme padrão Open API TMF

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
