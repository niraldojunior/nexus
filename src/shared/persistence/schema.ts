// Canonical database schema, shared by the Postgres sync worker (runtime schema init) and the
// migrate-sqlite-to-neon script (target schema bootstrap). The DDL is authored in the SQLite
// dialect the repositories emit; `transformSchemaSql` rewrites the SQLite-only constructs to
// their Postgres equivalents before the schema is applied to Neon.

// Every table in the schema, ordered parent-before-child so it is safe both for FK-ordered inserts
// (migrate-sqlite-to-neon) and for a single TRUNCATE ... CASCADE between tests (test-utils).
export const TABLE_NAMES = [
  'users',
  'searches',
  'geo_search_history',
  'tmf_geographic_location',
  'tmf_geographic_address',
  'tmf_geographic_site_specification',
  'tmf_geographic_site_spec_containment_rule',
  'tmf_geographic_site',
  'tmf_geographic_site_status_history',
  'tmf_geographic_site_relationship',
  'geo_project',
  'geo_project_status_catalog',
  'geo_project_site',
  'geo_project_resource',
  'geo_project_area',
  'geo_project_area_resource',
  'tmf_geographic_relationship_type',
  'tmf_resource_catalog',
  'tmf_resource_type',
  'tmf_resource_catalog_node',
  'tmf_resource_specification',
  'tmf_resource_status_catalog',
  'tmf_resource_function_specification',
  'tmf_physical_resource',
  'tmf_logical_resource',
  'tmf_resource_relationship',
  'tmf_resource_relationship_generic',
  'tmf_service_specification',
  'tmf_service_category',
  'tmf_service_candidate',
  'tmf_customer_facing_service',
  'tmf_resource_facing_service',
  'tmf_service_relationship',
  'tmf_service_qualification',
  'tmf_service_order',
  'tmf_resource_order',
  'tmf_party',
  'tmf_party_role',
  'tmf_party_relationship',
  'tmf_event',
  'tmf_audit_log',
  'tmf_outbox',
  'tmf_geo_bulk_job',
  'tmf_geo_bulk_job_result',
  'research_session',
  'research_message',
  'mcp_confirmation',
  'tmf_relationship_type_catalog',
  'tmf_characteristic_group_catalog',
  'geo_gpon_coverage_cell',
  'geo_gpon_coverage_area',
  'geo_map_feature',
  'geo_map_density',
] as const;

// Column migrations added after the base schema so databases created before these columns get
// upgraded. Postgres supports ADD COLUMN IF NOT EXISTS natively, so this is idempotent.
//
// Order matters where a CHECK constraint is being replaced: drop the old constraint *before* the
// UPDATE that rewrites the values, otherwise the rewrite is rejected by the constraint it is meant
// to replace (see tmf_geographic_site_status_check below).
export const MIGRATIONS_SQL = `
  ALTER TABLE tmf_service_specification ADD COLUMN IF NOT EXISTS observation TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS place_id TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS place_type TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS administrative_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS operational_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS usage_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS serving_site_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_serving_site ON tmf_physical_resource(serving_site_id);
  ALTER TABLE tmf_resource_specification ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS place_id TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS place_type TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS serving_site_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_serving_site ON tmf_logical_resource(serving_site_id);
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS administrative_state TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS operational_state TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS usage_state TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_type TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS start_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS end_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS is_service_enabled INTEGER;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS has_started INTEGER;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS supporting_services TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_relationships TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_type TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS start_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS end_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS is_service_enabled INTEGER;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS has_started INTEGER;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS supporting_resources TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS supporting_services TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_relationships TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS service_characteristic TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS service_qualification_item TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS service_order_item TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS note TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS resource_order_item TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS note TEXT;
  ALTER TABLE tmf_geographic_site_specification ADD COLUMN IF NOT EXISTS code TEXT;
  ALTER TABLE tmf_geographic_site_specification ADD COLUMN IF NOT EXISTS lifecycle_status TEXT;
  ALTER TABLE tmf_geographic_site_specification ADD COLUMN IF NOT EXISTS is_bootstrap INTEGER DEFAULT 0;
  ALTER TABLE tmf_geographic_site_specification ADD COLUMN IF NOT EXISTS site_role TEXT;
  -- Backfill idempotente do eixo funcional (C11). Sem UNIQUE(code): specs podem estar
  -- duplicadas por corrida de bootstrap, então usamos WHERE code IN (...) em vez de assumir
  -- 1 linha por code.
  UPDATE tmf_geographic_site_specification SET site_role = 'grouping'
    WHERE site_role IS NULL AND code IN ('REGION', 'FUNCTIONAL_GROUP');
  UPDATE tmf_geographic_site_specification SET site_role = 'property'
    WHERE site_role IS NULL AND code IN ('CONDOMINIUM', 'BLOCK', 'BUILDING');
  UPDATE tmf_geographic_site_specification SET site_role = 'service'
    WHERE site_role IS NULL AND code IN ('CUSTOMER_SITE');
  UPDATE tmf_geographic_site_specification SET site_role = 'network'
    WHERE site_role IS NULL;
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_specification_code ON tmf_geographic_site_specification(code);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_specification_lifecycle ON tmf_geographic_site_specification(lifecycle_status);
  CREATE TABLE IF NOT EXISTS tmf_geographic_site_spec_containment_rule (
    parent_spec_id TEXT NOT NULL,
    child_spec_id TEXT NOT NULL,
    valid_for_start DATETIME,
    valid_for_end DATETIME,
    is_protected INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (parent_spec_id, child_spec_id),
    FOREIGN KEY (parent_spec_id) REFERENCES tmf_geographic_site_specification(id),
    FOREIGN KEY (child_spec_id) REFERENCES tmf_geographic_site_specification(id)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_spec_containment_parent ON tmf_geographic_site_spec_containment_rule(parent_spec_id, child_spec_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_spec_containment_child ON tmf_geographic_site_spec_containment_rule(child_spec_id, parent_spec_id);

  ALTER TABLE tmf_geographic_location ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS street_search TEXT;
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS street_nr_search TEXT;
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS city_search TEXT;
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS postcode_search TEXT;
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS sub_address TEXT;
  -- The one-time backfill of these four columns (for rows written before they existed) used to run
  -- here as an UPDATE ... WHERE col IS NULL OR col IS NULL OR ... — a predicate that can't be
  -- served by a single index, so on every boot with DATABASE_AUTO_SCHEMA=true it forced a full
  -- table scan of tmf_geographic_address (783k rows in dev today) even though every write already
  -- populates these columns (see PostgresGeoRepository). Moved to a standalone, run-once script:
  -- node scripts/backfill-address-search.mjs --apply
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_search
    ON tmf_geographic_address(tenant_id, postcode_search, street_nr_search);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_street_search
    ON tmf_geographic_address(street_search);
  ALTER TABLE tmf_geographic_site ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_geographic_site ADD COLUMN IF NOT EXISTS status_date TIMESTAMPTZ;
  ALTER TABLE tmf_geographic_site ADD COLUMN IF NOT EXISTS status_reason TEXT;
  ALTER TABLE tmf_geographic_site ADD COLUMN IF NOT EXISTS site_addresses TEXT;
  ALTER TABLE tmf_geographic_site DROP CONSTRAINT IF EXISTS tmf_geographic_site_status_check;
  UPDATE tmf_geographic_site SET status = 'Planned' WHERE status = 'planned';
  UPDATE tmf_geographic_site SET status = 'Active' WHERE status = 'active';
  UPDATE tmf_geographic_site SET status = 'InDeactivation' WHERE status = 'suspended';
  UPDATE tmf_geographic_site SET status = 'Retired' WHERE status = 'terminated';
  ALTER TABLE tmf_geographic_site
    ADD CONSTRAINT tmf_geographic_site_status_check
    CHECK(status IN ('Planned', 'InConstruction', 'Active', 'InDeactivation', 'Retired'));
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_location_tenant ON tmf_geographic_location(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_tenant ON tmf_geographic_address(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_tenant ON tmf_geographic_site(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_tenant_status ON tmf_geographic_site(tenant_id, status);

  CREATE TABLE IF NOT EXISTS tmf_geographic_site_status_history (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    status_date TIMESTAMPTZ NOT NULL,
    status_reason TEXT,
    actor_sub TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES tmf_geographic_site(id)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_site_history_site ON tmf_geographic_site_status_history(site_id, status_date DESC);
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_site_history_tenant ON tmf_geographic_site_status_history(tenant_id);

  CREATE TABLE IF NOT EXISTS tmf_geographic_relationship_type (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    inverse_code TEXT NOT NULL,
    is_symmetric INTEGER NOT NULL DEFAULT 0,
    allowed_source_categories TEXT,
    allowed_target_categories TEXT,
    cardinality TEXT,
    lifecycle_status TEXT NOT NULL DEFAULT 'Active' CHECK(lifecycle_status IN ('Active', 'Retired')),
    is_bootstrap INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_relationship_type_code ON tmf_geographic_relationship_type(code);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_relationship_type_lifecycle ON tmf_geographic_relationship_type(lifecycle_status);

  CREATE TABLE IF NOT EXISTS tmf_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_sub TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    before_state TEXT,
    after_state TEXT,
    trace_id TEXT NOT NULL,
    source_ip TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_audit_log_entity ON tmf_audit_log(entity_type, entity_id, event_time DESC);
  CREATE INDEX IF NOT EXISTS idx_tmf_audit_log_tenant ON tmf_audit_log(tenant_id, event_time DESC);
  CREATE INDEX IF NOT EXISTS idx_tmf_audit_log_trace ON tmf_audit_log(trace_id);

  CREATE TABLE IF NOT EXISTS tmf_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_outbox_status_created ON tmf_outbox(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_tmf_outbox_tenant ON tmf_outbox(tenant_id);

  CREATE TABLE IF NOT EXISTS tmf_geo_bulk_job (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    target TEXT NOT NULL CHECK(target IN ('Address', 'Site')),
    mode TEXT NOT NULL CHECK(mode IN ('validateOnly', 'atomic', 'bestEffort')),
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
    submitted_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    total INTEGER NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    actor_sub TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    UNIQUE(tenant_id, target, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_bulk_job_tenant_status ON tmf_geo_bulk_job(tenant_id, status, submitted_at DESC);

  CREATE TABLE IF NOT EXISTS tmf_geo_bulk_job_result (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    item_index INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('validated', 'created', 'reused', 'failed')),
    entity_id TEXT,
    legacy_system TEXT,
    legacy_entity TEXT,
    legacy_id TEXT,
    error_code TEXT,
    message TEXT,
    warnings TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, item_index),
    FOREIGN KEY (job_id) REFERENCES tmf_geo_bulk_job(id)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_bulk_job_result_job ON tmf_geo_bulk_job_result(job_id, item_index);
  CREATE INDEX IF NOT EXISTS idx_tmf_geo_bulk_job_result_tenant ON tmf_geo_bulk_job_result(tenant_id);

  -- place_id/name são os filtros das instâncias. O tipo pertence exclusivamente à
  -- ResourceSpecification, portanto índices por tipo ficam no catálogo e nunca no exemplar TMF639.
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_place ON tmf_physical_resource(place_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_name ON tmf_physical_resource(name);
  CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_place ON tmf_logical_resource(place_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_name ON tmf_logical_resource(name);

  -- Índice de expressão para a busca de infra passiva por bbox do mapa (GeoTreeService
  -- .resourcesInViewport). Sem ele, cada consulta de viewport faz seq scan de toda a
  -- tmf_geographic_location parseando o GeoJSON linha a linha. Parcial em Point porque só
  -- pontos filtram por coordenada direta.
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_location_point_lnglat
    ON tmf_geographic_location (
      ((geometry::jsonb->'coordinates'->>0)::float8),
      ((geometry::jsonb->'coordinates'->>1)::float8)
    ) WHERE geometry_type = 'Point';

  -- Seguranca de conta na tabela users (autenticacao local). A tabela ja existe em bases
  -- implantadas, entao as colunas entram como migracao idempotente. password_hash guarda o
  -- digest scrypt (nunca a senha). token_version invalida tokens emitidos ao ser incrementado
  -- no logout global ou desativacao, sem estado de sessao no servidor.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
  -- TIMESTAMPTZ (nao DATETIME): MIGRATIONS_SQL nao passa por transformSchemaSql no Postgres, entao
  -- o tipo precisa ja ser o nativo. O transform do Oracle converte TIMESTAMPTZ mesmo assim.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

  -- Projetos de trabalho (REQ-MOD01-015): status do projeto (herdado em cascata pelos Sites
  -- vinculados) e, por local, observação de trabalho + id do endereço no GEONET.
  ALTER TABLE geo_project ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned';
  ALTER TABLE geo_project ADD COLUMN IF NOT EXISTS status_code TEXT;
  CREATE TABLE IF NOT EXISTS geo_project_status_catalog (
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    behavior TEXT NOT NULL,
    PRIMARY KEY (tenant_id, code)
  );
  CREATE INDEX IF NOT EXISTS idx_geo_project_status_catalog_tenant_order
    ON geo_project_status_catalog(tenant_id, sort_order, code);
  UPDATE geo_project
     SET status_code = CASE status
       WHEN 'planned' THEN '11'
       WHEN 'active' THEN '22'
       WHEN 'suspended' THEN '23'
       WHEN 'terminated' THEN '17'
       WHEN 'cancelled' THEN 'legacy-cancelled'
       ELSE '11'
     END
   WHERE status_code IS NULL;
  ALTER TABLE geo_project ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  ALTER TABLE geo_project ADD COLUMN IF NOT EXISTS archived_by TEXT;
  CREATE TABLE IF NOT EXISTS geo_project_resource (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    origin_kind TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    linked_by TEXT,
    detached_at TIMESTAMPTZ,
    detached_by TEXT,
    detached_reason TEXT,
    FOREIGN KEY (project_id) REFERENCES geo_project(id)
  );
  CREATE TABLE IF NOT EXISTS geo_project_area_resource (
    project_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, location_id, resource_id),
    FOREIGN KEY (project_id, location_id) REFERENCES geo_project_area(project_id, location_id)
  );
  ALTER TABLE geo_project_site ADD COLUMN IF NOT EXISTS note TEXT;
  ALTER TABLE geo_project_site ADD COLUMN IF NOT EXISTS geonet_address_id TEXT;

  -- Procedência e precisão de Location/Address (pré-requisito do painel unificado de Local,
  -- REQ-MOD01-016): de onde veio a coordenada/endereço (GEONET, Google Maps, um sistema
  -- legado migrado, ou cadastro manual) e o nível de confiança normalizado do ponto.
  -- accuracy (coluna já existente) segue guardando o texto cru da fonte (ex.: "ROOFTOP" ou
  -- "ENDEREÇO COMPLETO") -- accuracy_level é a normalização em high|medium|low|unknown.
  ALTER TABLE tmf_geographic_location ADD COLUMN IF NOT EXISTS source_system TEXT;
  ALTER TABLE tmf_geographic_location ADD COLUMN IF NOT EXISTS source_ref TEXT;
  ALTER TABLE tmf_geographic_location ADD COLUMN IF NOT EXISTS accuracy_level TEXT;
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS source_system TEXT;
  ALTER TABLE tmf_geographic_address ADD COLUMN IF NOT EXISTS source_ref TEXT;
  -- Observação livre do Site (aba Visão Geral do painel unificado) — campo comum, não
  -- characteristic (C1 não se aplica: não é extensão de domínio, é anotação de trabalho,
  -- como já era em geo_project_site.note antes desta migração).
  ALTER TABLE tmf_geographic_site ADD COLUMN IF NOT EXISTS note TEXT;
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_source
    ON tmf_geographic_address(tenant_id, source_system, source_ref);

  -- Backfill 1: accuracy foi usada indevidamente para guardar a FONTE (ex.: 'GOOGLE_MAPS'
  -- gravado por ProjectSitePanel/GuidedSignupModal ao criar local por endereço escolhido no
  -- mapa) em vez da precisão. Move o valor para source_system e limpa accuracy — daqui em
  -- diante accuracy guarda só o texto de precisão cru da fonte.
  UPDATE tmf_geographic_location
     SET source_system = 'GOOGLE_MAPS', accuracy = NULL
   WHERE accuracy = 'GOOGLE_MAPS' AND source_system IS NULL;

  -- Backfill 2: id GEONET gravado em geo_project_site (só alcançável para local de projeto)
  -- migra para tmf_geographic_address.source_system/source_ref, disponível a qualquer Site.
  -- Subconsulta correlacionada (não UPDATE...FROM) para permanecer portável ao Oracle —
  -- transformOracleSchemaSql não reescreve UPDATE...FROM, que é sintaxe exclusiva do Postgres.
  UPDATE tmf_geographic_address
     SET source_system = 'GEONET',
         source_ref = (
           SELECT ps.geonet_address_id FROM geo_project_site ps
             JOIN tmf_geographic_site s ON s.id = ps.site_id
            WHERE s.geographic_address_id = tmf_geographic_address.id
              AND ps.geonet_address_id IS NOT NULL
            LIMIT 1
         )
   WHERE source_system IS NULL
     AND EXISTS (
           SELECT 1 FROM geo_project_site ps
             JOIN tmf_geographic_site s ON s.id = ps.site_id
            WHERE s.geographic_address_id = tmf_geographic_address.id
              AND ps.geonet_address_id IS NOT NULL
         );

  -- Backfill 3: observação de local de projeto migra para a coluna comum do Site.
  UPDATE tmf_geographic_site
     SET note = (
           SELECT ps.note FROM geo_project_site ps
            WHERE ps.site_id = tmf_geographic_site.id AND ps.note IS NOT NULL
            LIMIT 1
         )
   WHERE note IS NULL
     AND EXISTS (
           SELECT 1 FROM geo_project_site ps
            WHERE ps.site_id = tmf_geographic_site.id AND ps.note IS NOT NULL
         );

  -- Índices que faltavam para a escala de carga massiva de Sites/Recursos (issue #52).
  -- Sem o primeiro, todo NOT EXISTS por resource_to_id (GeoTreeService
  -- .childrenOfSite / .sitesWithChildren, "planta externa da estação ainda sem pai")
  -- só tinha a PK (resource_from_id, resource_to_id, relationship_type) para varrer —
  -- inútil quando a busca entra por resource_to_id, forçando INDEX FAST FULL SCAN da
  -- tabela inteira a cada expansão de nó na árvore.
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_relationship_reverse
    ON tmf_resource_relationship(resource_to_id, relationship_type);
  -- geo_project_site só tinha a PK (project_id, site_id) — todo ORDER BY ps.position
  -- (listagem de locais de um projeto, na ordem salva) ordenava em memória.
  CREATE INDEX IF NOT EXISTS idx_geo_project_site_project_position
    ON geo_project_site(project_id, position);
  CREATE INDEX IF NOT EXISTS idx_geo_project_resource_project_position
    ON geo_project_resource(project_id, position);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_project_resource_open_resource
    ON geo_project_resource(resource_id) WHERE detached_at IS NULL;
  -- Cobre o filtro mais comum da árvore/workspace (tenant + tipo de local + status) sem
  -- cair no índice solto de tenant_id sozinho.
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_tenant_spec_status
    ON tmf_geographic_site(tenant_id, site_specification_id, status);
  -- A árvore filtra a estação dona da planta pela coluna derivada serving_site_id.
  -- O tipo é resolvido por join com a ResourceSpecification (C1), sem duplicá-lo no exemplar.
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_serving_site_name
    ON tmf_physical_resource(serving_site_id, name);

  -- Reengenharia da exibição de recursos no mapa (issue #69, Fase 2): "aparece no mapa" vira
  -- propriedade do catálogo (C9) em vez da string literal espalhada pelo SQL do viewport
  -- (ver INTERNAL_RESOURCE_TYPES em src/modules/geo/map-visibility.ts, fonte única consultada
  -- por tree-service.ts, map-feature-synchronizer.ts e build-map-features.mjs) — só que, ao
  -- contrário de um simples "outdoor sim/não" por categoria, o corte real também depende de
  -- existência própria no mapa: Splitter e Porta moram na Location de quem os contém e nunca
  -- têm ponto próprio, então continuam excluídos por fora (INTERNAL_RESOURCE_TYPES), não por
  -- esta coluna — Porta já cai em map_presence = 0 por categoria (Equipment.Access não está na
  -- lista abaixo), mas é INTERNAL_RESOURCE_TYPES quem faz a exclusão valer, não esta coluna.
  -- NULL (tipo desconhecido/migrado, sem linha no catálogo) é tratado como "mostra" por quem lê
  -- — omitir o que não se sabe classificar é pior do que mostrar demais, mesma régua que
  -- resourcePlant() já aplica no cliente para tipo sem ícone. O "code NOT IN (DIO, Splitter)"
  -- no backfill espelha PLANT_BY_CODE.DIO (indoor apesar da categoria) e o próprio
  -- INTERNAL_RESOURCE_TYPES, para nenhum dos dois nascer com map_presence = 1.
  -- INTEGER (1/0), não BOOLEAN: nenhuma outra coluna deste schema usa BOOLEAN (o transform para
  -- Oracle não tem regra para o tipo, e o Oracle desta base não é 23c+) — todo flag existente
  -- (is_bootstrap, is_protected, is_symmetric...) já é INTEGER — mesma convenção aqui.
  ALTER TABLE tmf_resource_type ADD COLUMN IF NOT EXISTS map_presence INTEGER;
  UPDATE tmf_resource_type
     SET map_presence = CASE
       WHEN category_code IN ('Infrastructure.Passive', 'Cable.OutsidePlant')
            AND code NOT IN ('DIO', 'Splitter') THEN 1
       ELSE 0
     END
   WHERE map_presence IS NULL;

  -- Índice de exibição do mapa (geo_map_feature) — artefato derivado e regenerável, mesma
  -- postura de geo_gpon_coverage_area: uma linha por feature visível (ponto de Site/Recurso
  -- outdoor, ou trecho de cabo já recortado no tile — ver src/modules/geo/map-tile.ts), pronta
  -- para o cliente desenhar sem JOIN, sem parse de JSON, sem grafo de relacionamentos. A PK É o
  -- índice de leitura: servir um tile é uma igualdade em 4 colunas. entity_id é o uuid puro (não
  -- "resource:<uuid>") para caber em VARCHAR2(36 CHAR) no Oracle (toda coluna *_id ganha esse
  -- tamanho — ver oracleTextType em oracle-schema.ts) — feature_kind reconstrói o prefixo do
  -- GeoTreeNode.id do lado do serviço. Reconstruível por scripts/build-map-features.mjs e
  -- mantido por write-through nos writes unitários de Resource/Site/Location.
  CREATE TABLE IF NOT EXISTS geo_map_feature (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    tile_z INTEGER NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    entity_id TEXT NOT NULL,
    shape TEXT NOT NULL CHECK(shape IN ('point', 'line')),
    feature_kind TEXT NOT NULL CHECK(feature_kind IN ('resource', 'site')),
    entity_type TEXT NOT NULL,
    type_code TEXT,
    site_category TEXT,
    status TEXT,
    label TEXT NOT NULL,
    sublabel TEXT,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    geometry TEXT,
    rank INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, tile_z, tile_x, tile_y, entity_id, shape)
  );
  CREATE INDEX IF NOT EXISTS idx_geo_map_feature_tile
    ON geo_map_feature(tenant_id, tile_z, tile_x, tile_y, rank);

  -- Densidade agregada da planta para zoom aberto (Fase 4 da issue #69). Abaixo de
  -- PASSIVE_INFRA_MAX_SCALE_METERS o mapa desenha feature por feature (geo_map_feature); acima
  -- disso desenhar 780 mil pontos individuais não é só caro, é ilegível — vira borrão. Esta
  -- tabela responde a outra pergunta: "onde HÁ planta", em vez de "qual é cada item".
  --
  -- A agregação é o próprio tile de geo_map_feature dividido por potência de 2 (z16 → z13/z10/
  -- z7), não uma grade métrica nova: reusa a matemática de slippy map que o índice já usa, a
  -- redução vira divisão inteira em SQL, e cliente e servidor continuam falando o mesmo
  -- endereçamento. lng/lat são o CENTROIDE das features da célula, não o centro do tile — assim
  -- o ponto desenhado cai onde a planta realmente está, e não no meio de um quadrado que pode
  -- estar vazio de um lado. Artefato derivado e regenerável, como geo_map_feature.
  CREATE TABLE IF NOT EXISTS geo_map_density (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    tile_z INTEGER NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    feature_count INTEGER NOT NULL DEFAULT 0,
    resource_count INTEGER NOT NULL DEFAULT 0,
    site_count INTEGER NOT NULL DEFAULT 0,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, tile_z, tile_x, tile_y)
  );
  -- Leitura é por bbox dentro de um nível (não por tile único como geo_map_feature): o cliente
  -- pede a viewport inteira de uma vez, então o índice cobre (nível, faixa de x, faixa de y).
  CREATE INDEX IF NOT EXISTS idx_geo_map_density_bbox
    ON geo_map_density(tenant_id, tile_z, tile_x, tile_y, feature_count);

  -- Caminho rápido da busca da barra de pesquisa (GeoTreeService.search /
  -- searchResourceCandidates): tenta primeiro LOWER(name) LIKE 'termo%' (prefixo), que só
  -- fica indexável com um índice sobre a EXPRESSÃO LOWER(name) e a classe de operador
  -- text_pattern_ops — sem ela, uma collation não-C (a maioria) não usa o índice para LIKE
  -- nenhum. Sem isto, cada tecla digitada varria as tabelas inteiras (recurso: ~1,5M linhas)
  -- só para achar 20 resultados. text_pattern_ops é sintaxe Postgres; transformOracleSchemaSql
  -- remove o sufixo para o Oracle, onde o mesmo DDL já é um índice funcional sobre LOWER(name).
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_name_lower
    ON tmf_physical_resource (LOWER(name) text_pattern_ops);
  CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_name_lower
    ON tmf_logical_resource (LOWER(name) text_pattern_ops);
  CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_name_lower
    ON tmf_geographic_site (LOWER(name) text_pattern_ops);

  -- Isolamento multi-tenant (C8) para Resource/Service/Order/Party — o Geo já tinha (ver
  -- tmf_geographic_location/address/site acima); estes módulos só exigiam autenticação, sem
  -- escopo de tenant algum. Tabelas de relacionamento (tmf_*_relationship*) ficam de fora: são
  -- pares de ids de entidades já escopadas, herdam o isolamento por essa referência — mesmo
  -- critério de tmf_geographic_site_relationship, que também nunca ganhou tenant_id próprio.
  ALTER TABLE tmf_resource_specification ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_resource_type ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_resource_function_specification ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_service_specification ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_service_category ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_service_candidate ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_party ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_party_role ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

  CREATE INDEX IF NOT EXISTS idx_tmf_resource_specification_tenant ON tmf_resource_specification(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_type_tenant ON tmf_resource_type(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_function_specification_tenant ON tmf_resource_function_specification(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_tenant ON tmf_physical_resource(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_tenant ON tmf_logical_resource(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_service_specification_tenant ON tmf_service_specification(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_service_category_tenant ON tmf_service_category(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_tenant ON tmf_service_candidate(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_tenant ON tmf_resource_facing_service(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_tenant ON tmf_customer_facing_service(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_service_qualification_tenant ON tmf_service_qualification(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_service_order_tenant ON tmf_service_order(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_order_tenant ON tmf_resource_order(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_party_tenant ON tmf_party(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_party_role_tenant ON tmf_party_role(tenant_id);

  -- Estado granular do recurso (issue #171). O eixo SID continua em tmf_physical_resource.status,
  -- que tem CHECK fechado nos 4 valores canônicos; o motivo específico ("Bloqueado por área de
  -- risco") vira código de catálogo em status_code. Não alargar o CHECK de status: são eixos
  -- distintos, e o catálogo é extensível via API (C9) enquanto o CHECK não é.
  --
  -- resource_type_id NULL = o estado vale para qualquer tipo de recurso; preenchido = específico
  -- daquele tipo (ex.: só CTO). Mesmo desenho de geo_project_status_catalog (acima).
  CREATE TABLE IF NOT EXISTS tmf_resource_status_catalog (
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    resource_type_id TEXT,
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    behavior TEXT NOT NULL,
    PRIMARY KEY (tenant_id, code)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_status_catalog_tenant_order
    ON tmf_resource_status_catalog(tenant_id, sort_order, code);

  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS status_code TEXT;
  -- Etiqueta física da caixa (o que está escrito nela em campo), distinta do name.
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS label TEXT;
  -- ID Imobilizado (SAP) — referência patrimonial do exemplar.
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS asset_reference TEXT;
  -- Projeto de implantação que originou o recurso. Distinto de geo_project_resource, que é o
  -- vínculo de curadoria (entra/sai de um projeto ao longo do tempo); aqui é atributo de origem.
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS project_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_project ON tmf_physical_resource(project_id);
`;

export const SCHEMA_SQL = `
      -- ========== PLATFORM TABLES (Non-TMF) ==========
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        filters TEXT,
        results TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_searches_user_id ON searches(user_id);

      -- Histórico da barra de pesquisa da página Geo, por usuário (estilo Google Maps).
      -- Ranking: visit_count DESC, desempate por last_visited_at DESC. entry_key deduplica
      -- (node:<id> ou address:<placeId|hash(label)>); payload guarda o snapshot do
      -- GeoTreeNode/DraftAddress para re-selecionar sem nova consulta ao Google.
      CREATE TABLE IF NOT EXISTS geo_search_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('node', 'address')),
        label TEXT NOT NULL,
        payload TEXT NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 1,
        last_visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, entry_key)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_search_history_rank
        ON geo_search_history(user_id, visit_count DESC, last_visited_at DESC);

      -- ========== MODULE 1: GEOGRAPHIC (TMF673/674/675) ==========

      -- TMF675: Geographic Location (geoespacial pura: Point, LineString, Polygon)
      CREATE TABLE IF NOT EXISTS tmf_geographic_location (
        id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'default',
        geometry_type TEXT NOT NULL CHECK(geometry_type IN ('Point', 'LineString', 'Polygon')),
        geometry TEXT NOT NULL,
        spatial_ref TEXT DEFAULT 'EPSG:4326',
        accuracy TEXT,
        reference_point TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_location_valid_for ON tmf_geographic_location(valid_for_start, valid_for_end);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_location_tenant ON tmf_geographic_location(tenant_id);

      -- TMF673: Geographic Address (endereço postal estruturado)
      CREATE TABLE IF NOT EXISTS tmf_geographic_address (
        id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'default',
        street_type TEXT,
        street_name TEXT NOT NULL,
        street_search TEXT,
        street_nr TEXT,
        street_nr_search TEXT,
        locality TEXT,
        city TEXT,
        city_search TEXT,
        state_or_province TEXT,
        country TEXT DEFAULT 'BR',
        postcode TEXT,
        postcode_search TEXT,
        geographic_location_id TEXT,
        sub_address TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_location ON tmf_geographic_address(geographic_location_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_city_postcode ON tmf_geographic_address(city, postcode);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_street_name ON tmf_geographic_address(street_name);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_tenant ON tmf_geographic_address(tenant_id);

      -- TMF674: Geographic Site Specification (catálogo de tipos de site)
      CREATE TABLE IF NOT EXISTS tmf_geographic_site_specification (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        code TEXT NOT NULL,
        category TEXT NOT NULL,
        site_role TEXT,
        lifecycle_status TEXT NOT NULL DEFAULT 'Active',
        description TEXT,
        allowed_parent_spec_ids TEXT,
        allowed_child_spec_ids TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        is_bootstrap INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_specification_name_category ON tmf_geographic_site_specification(name, category);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_specification_code ON tmf_geographic_site_specification(code);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_specification_lifecycle ON tmf_geographic_site_specification(lifecycle_status);

      CREATE TABLE IF NOT EXISTS tmf_geographic_site_spec_containment_rule (
        parent_spec_id TEXT NOT NULL,
        child_spec_id TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        is_protected INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (parent_spec_id, child_spec_id),
        FOREIGN KEY (parent_spec_id) REFERENCES tmf_geographic_site_specification(id),
        FOREIGN KEY (child_spec_id) REFERENCES tmf_geographic_site_specification(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_spec_containment_parent ON tmf_geographic_site_spec_containment_rule(parent_spec_id, child_spec_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_spec_containment_child ON tmf_geographic_site_spec_containment_rule(child_spec_id, parent_spec_id);

      -- TMF674: Geographic Site (entidade central: Centro, POP, Sala, Armário, etc.)
      CREATE TABLE IF NOT EXISTS tmf_geographic_site (
        id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        site_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned', 'InConstruction', 'Active', 'InDeactivation', 'Retired')),
        status_date DATETIME,
        status_reason TEXT,
        geographic_location_id TEXT,
        geographic_address_id TEXT,
        parent_site_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        related_party TEXT,
        site_addresses TEXT,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_specification_id) REFERENCES tmf_geographic_site_specification(id),
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id),
        FOREIGN KEY (geographic_address_id) REFERENCES tmf_geographic_address(id),
        FOREIGN KEY (parent_site_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_spec ON tmf_geographic_site(site_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_location ON tmf_geographic_site(geographic_location_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_address ON tmf_geographic_site(geographic_address_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_parent ON tmf_geographic_site(parent_site_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_status ON tmf_geographic_site(status);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_name ON tmf_geographic_site(name);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_tenant ON tmf_geographic_site(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_tenant_status ON tmf_geographic_site(tenant_id, status);

      CREATE TABLE IF NOT EXISTS tmf_geographic_site_status_history (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        status_date DATETIME NOT NULL,
        status_reason TEXT,
        actor_sub TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_site_history_site ON tmf_geographic_site_status_history(site_id, status_date DESC);
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_site_history_tenant ON tmf_geographic_site_status_history(tenant_id);

      -- Geographic Site Relationship (topologia A→Z)
      CREATE TABLE IF NOT EXISTS tmf_geographic_site_relationship (
        site_from_id TEXT NOT NULL,
        site_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (site_from_id, site_to_id, relationship_type),
        FOREIGN KEY (site_from_id) REFERENCES tmf_geographic_site(id),
        FOREIGN KEY (site_to_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_relationship ON tmf_geographic_site_relationship(site_from_id, site_to_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_relationship_reverse ON tmf_geographic_site_relationship(site_to_id, site_from_id);

      -- Projeto de trabalho da página Locais (REQ-MOD01-015, estilo "Salvos" do Google Maps):
      -- coleção nomeada de GeographicSite criados exclusivamente para aquele recorte de
      -- trabalho. Não é entidade TMF — é projeção de plataforma, como geo_search_history.
      -- Compartilhado por tenant (C8): qualquer usuário do tenant vê e edita.
      CREATE TABLE IF NOT EXISTS geo_project (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        icon_data_url TEXT,
        -- Status do projeto (planned|active|suspended|terminated, vocabulário de GeoStatus):
        -- o projeto é a unidade de estado — mudar aqui cascateia (best-effort) para cada Site
        -- vinculado via transitionSite (ver /v1/geo/projects/:id em app.ts). Um local de
        -- projeto não tem status próprio editável; ele apenas herda este valor.
        status TEXT NOT NULL DEFAULT 'planned',
        created_by TEXT,
        archived_at DATETIME,
        archived_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_geo_project_tenant ON geo_project(tenant_id, updated_at DESC);

      -- Vínculo entre o projeto e os Sites criados dentro dele. O Site vinculado aqui é
      -- excluído da árvore/busca de navegação (ver GeoTreeService) — só aparece com o
      -- projeto aberto. Exclusão de projeto/local é soft-terminate (C6): esta tabela só
      -- perde a linha de vínculo, o Site em si vira 'Retired'.
      CREATE TABLE IF NOT EXISTS geo_project_site (
        project_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        -- Observação de trabalho do local dentro do projeto — anotação de plataforma (como o
        -- restante desta tabela), não um characteristic TMF (C1): não acompanha o Site se ele
        -- for promovido ao inventário fora do projeto.
        note TEXT,
        -- Id do endereço no GEONET que originou este local — a base de endereçamento canônica
        -- da V.tal (ver REQ-MOD01-015 §20). Todo local de projeto nasce amarrado a um id real.
        geonet_address_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, site_id),
        FOREIGN KEY (project_id) REFERENCES geo_project(id),
        FOREIGN KEY (site_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_project_site_site ON geo_project_site(site_id);

      -- Vínculo histórico explícito Projeto ↔ Resource. A entidade Resource continua sendo
      -- TMF634/639 independente; esta projeção só registra a origem e o ciclo de trabalho.
      CREATE TABLE IF NOT EXISTS geo_project_resource (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        resource_kind TEXT NOT NULL,
        origin_kind TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        linked_by TEXT,
        detached_at DATETIME,
        detached_by TEXT,
        detached_reason TEXT,
        FOREIGN KEY (project_id) REFERENCES geo_project(id)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_project_resource_project_position
        ON geo_project_resource(project_id, position);
      CREATE INDEX IF NOT EXISTS idx_geo_project_resource_resource
        ON geo_project_resource(resource_id, detached_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_project_resource_open_resource
        ON geo_project_resource(resource_id) WHERE detached_at IS NULL;

      -- Manchas de concentração/dispersão de um Projeto (REQ-MOD01-017): agrupamento espacial
      -- dos Sites de um projeto carregado em massa, gerado por scripts/build-project-areas.mjs
      -- (dist/src/modules/geo/project-area-grid.ts). A geometria da mancha em si é um Polygon
      -- comum em tmf_geographic_location (reference_point 'PROJECT:<projectId>'); esta tabela
      -- guarda o vínculo com o projeto e o resto do relatório (mesmo espírito de
      -- geo_project_site.note: extensão de plataforma, não characteristic TMF — C1 não se
      -- aplica). Artefato derivado e regenerável (como geo_gpon_coverage_cell): toda execução
      -- do script SUBSTITUI a geração anterior do projeto — exceção consciente a C6.
      CREATE TABLE IF NOT EXISTS geo_project_area (
        project_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        -- concentration (>= minSites locais) | dispersion (< minSites) — ver PROJECT_AREA_MIN_SITES.
        kind TEXT NOT NULL,
        site_count INTEGER NOT NULL DEFAULT 0,
        -- Amostra de ids de Site do componente (JSON array de string, cap ~50) — diagnóstico de
        -- dispersão sem precisar reconsultar geo_project_site inteiro.
        site_ids TEXT,
        centroid_lng REAL,
        centroid_lat REAL,
        area_km2 REAL,
        position INTEGER NOT NULL DEFAULT 0,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, location_id),
        FOREIGN KEY (project_id) REFERENCES geo_project(id),
        FOREIGN KEY (location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_project_area_project ON geo_project_area(project_id, position);

      -- Índice derivado para as contagens de Cobertura. É regenerável, como as manchas.
      CREATE TABLE IF NOT EXISTS geo_project_area_resource (
        project_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, location_id, resource_id),
        FOREIGN KEY (project_id, location_id) REFERENCES geo_project_area(project_id, location_id)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_project_area_resource_project_location
        ON geo_project_area_resource(project_id, location_id);

      CREATE TABLE IF NOT EXISTS tmf_geographic_relationship_type (
        id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        inverse_code TEXT NOT NULL,
        is_symmetric INTEGER NOT NULL DEFAULT 0,
        allowed_source_categories TEXT,
        allowed_target_categories TEXT,
        cardinality TEXT,
        lifecycle_status TEXT NOT NULL DEFAULT 'Active' CHECK(lifecycle_status IN ('Active', 'Retired')),
        is_bootstrap INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_relationship_type_code ON tmf_geographic_relationship_type(code);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_relationship_type_lifecycle ON tmf_geographic_relationship_type(lifecycle_status);

      -- ========== MODULE 2: RESOURCE (TMF634/639) ==========

      -- TMF634: Resource Specification (catálogo de tipos de recurso)
      CREATE TABLE IF NOT EXISTS tmf_resource_specification (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        resource_type_id TEXT NOT NULL,
        description TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        related_party TEXT,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id, resource_type_id) REFERENCES tmf_resource_type(tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_specification_resource_type_id ON tmf_resource_specification(tenant_id, resource_type_id, valid_for_end, name, id);

      CREATE TABLE IF NOT EXISTS tmf_resource_type (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        map_presence TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, code),
        UNIQUE(tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_type_status ON tmf_resource_type(status);

      -- Catálogo de estados granulares do recurso (issue #171): o motivo por trás do status SID
      -- ("Bloqueado por área de risco" sob status='suspended'). Extensível via API (C9), ao
      -- contrário do CHECK fechado de tmf_physical_resource.status.
      CREATE TABLE IF NOT EXISTS tmf_resource_status_catalog (
        tenant_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        resource_type_id TEXT,
        sort_order INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        behavior TEXT NOT NULL,
        PRIMARY KEY (tenant_id, code)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_status_catalog_tenant_order
        ON tmf_resource_status_catalog(tenant_id, sort_order, code);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_status_catalog_resource_type_id
        ON tmf_resource_status_catalog(tenant_id, resource_type_id);

      CREATE TABLE IF NOT EXISTS tmf_resource_function_specification (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        description TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- TMF639: Physical Resource (instância de recurso físico: OLT, cabo, poste, ONT, etc.)
      CREATE TABLE IF NOT EXISTS tmf_physical_resource (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        resource_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        -- Motivo granular do status, resolvido em tmf_resource_status_catalog (issue #171).
        status_code TEXT,
        geographic_location_id TEXT,
        serial_number TEXT UNIQUE,
        part_number TEXT,
        label TEXT,
        asset_reference TEXT,
        project_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        related_party TEXT,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_specification_id) REFERENCES tmf_resource_specification(id),
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_spec ON tmf_physical_resource(resource_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_location ON tmf_physical_resource(geographic_location_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_status ON tmf_physical_resource(status);
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_serial ON tmf_physical_resource(serial_number);

      -- TMF639: Logical Resource (instância de recurso lógico: IP, VLAN, VRF, etc.)
      CREATE TABLE IF NOT EXISTS tmf_logical_resource (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        resource_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        supporting_physical_resource_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_specification_id) REFERENCES tmf_resource_specification(id),
        FOREIGN KEY (supporting_physical_resource_id) REFERENCES tmf_physical_resource(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_spec ON tmf_logical_resource(resource_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_supporting ON tmf_logical_resource(supporting_physical_resource_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_status ON tmf_logical_resource(status);

      -- Resource Relationship (containment, dependency entre recursos)
      CREATE TABLE IF NOT EXISTS tmf_resource_relationship (
        resource_from_id TEXT NOT NULL,
        resource_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (resource_from_id, resource_to_id, relationship_type),
        FOREIGN KEY (resource_from_id) REFERENCES tmf_physical_resource(id),
        FOREIGN KEY (resource_to_id) REFERENCES tmf_physical_resource(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_relationship ON tmf_resource_relationship(resource_from_id, resource_to_id);

      CREATE TABLE IF NOT EXISTS tmf_resource_relationship_generic (
        resource_from_id TEXT NOT NULL,
        resource_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (resource_from_id, resource_to_id, relationship_type)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_relationship_generic ON tmf_resource_relationship_generic(resource_from_id, resource_to_id);

      -- ========== MODULE 3: SERVICE (TMF633/638) ==========

      -- TMF633: Service Specification (catálogo de tipos de serviço)
      CREATE TABLE IF NOT EXISTS tmf_service_specification (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        category TEXT NOT NULL,
        service_type TEXT NOT NULL CHECK(service_type IN ('CFS', 'RFS', 'Other')),
        description TEXT,
        observation TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_specification_category_type ON tmf_service_specification(category, service_type);

      CREATE TABLE IF NOT EXISTS tmf_service_category (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        description TEXT,
        parent_category_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_category_id) REFERENCES tmf_service_category(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_category_parent ON tmf_service_category(parent_category_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_service_category_name ON tmf_service_category(name);

      CREATE TABLE IF NOT EXISTS tmf_service_candidate (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        description TEXT,
        service_specification_id TEXT NOT NULL,
        service_category_id TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id),
        FOREIGN KEY (service_category_id) REFERENCES tmf_service_category(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_spec ON tmf_service_candidate(service_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_category ON tmf_service_candidate(service_category_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_status ON tmf_service_candidate(status);

      -- TMF638: Resource Facing Service (serviço técnico, realização da rede)
      -- NOTE: defined before Customer Facing Service because the CFS foreign key references it.
      -- SQLite tolerates forward FK references; Postgres resolves the referenced table at CREATE
      -- TABLE time, so the referenced table must already exist.
      CREATE TABLE IF NOT EXISTS tmf_resource_facing_service (
        id TEXT PRIMARY KEY,
            name TEXT,
        service_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        state TEXT,
        service_type TEXT,
        category TEXT,
        service_date TEXT,
        start_date TEXT,
        end_date TEXT,
        is_service_enabled INTEGER,
        has_started INTEGER,
        supporting_resource_id TEXT NOT NULL,
        place TEXT,
        related_party TEXT,
        supporting_resources TEXT,
        supporting_services TEXT,
        service_relationships TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_spec ON tmf_resource_facing_service(service_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_resource ON tmf_resource_facing_service(supporting_resource_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_status ON tmf_resource_facing_service(status);

      -- TMF638: Customer Facing Service (serviço comercial ao cliente/ISP)
      CREATE TABLE IF NOT EXISTS tmf_customer_facing_service (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        service_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        state TEXT,
        service_type TEXT,
        category TEXT,
        service_date TEXT,
        start_date TEXT,
        end_date TEXT,
        is_service_enabled INTEGER,
        has_started INTEGER,
        subscriber_id TEXT NOT NULL,
        supporting_resource_facing_service_id TEXT,
        place TEXT,
        related_party TEXT,
        supporting_services TEXT,
        service_relationships TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id),
        FOREIGN KEY (supporting_resource_facing_service_id) REFERENCES tmf_resource_facing_service(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_spec ON tmf_customer_facing_service(service_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_subscriber ON tmf_customer_facing_service(subscriber_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_status ON tmf_customer_facing_service(status);

      -- Service Relationship (suporta, depende de)
      CREATE TABLE IF NOT EXISTS tmf_service_relationship (
        service_from_id TEXT NOT NULL,
        service_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (service_from_id, service_to_id, relationship_type),
        FOREIGN KEY (service_from_id) REFERENCES tmf_customer_facing_service(id),
        FOREIGN KEY (service_to_id) REFERENCES tmf_resource_facing_service(id)
      );

      -- TMF645: Service Qualification
      CREATE TABLE IF NOT EXISTS tmf_service_qualification (
        id TEXT PRIMARY KEY,
            state TEXT NOT NULL DEFAULT 'done' CHECK(state IN ('done', 'terminated')),
        place TEXT,
        related_party TEXT,
        service_characteristic TEXT,
        service_qualification_item TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_qualification_state ON tmf_service_qualification(state);

      -- TMF641: Service Order
      CREATE TABLE IF NOT EXISTS tmf_service_order (
        id TEXT PRIMARY KEY,
            state TEXT NOT NULL DEFAULT 'acknowledged' CHECK(state IN ('acknowledged', 'inProgress', 'completed', 'failed', 'cancelled')),
        description TEXT,
        related_party TEXT,
        service_order_item TEXT NOT NULL,
        note TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_order_state ON tmf_service_order(state);

      -- TMF652: Resource Order
      CREATE TABLE IF NOT EXISTS tmf_resource_order (
        id TEXT PRIMARY KEY,
            state TEXT NOT NULL DEFAULT 'acknowledged' CHECK(state IN ('acknowledged', 'inProgress', 'completed', 'failed', 'cancelled')),
        description TEXT,
        related_party TEXT,
        resource_order_item TEXT NOT NULL,
        note TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_order_state ON tmf_resource_order(state);

      -- ========== MODULE 6: PARTY & TENANT (TMF632/669) ==========

      CREATE TABLE IF NOT EXISTS tmf_party (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        party_type TEXT NOT NULL CHECK(party_type IN ('Organization', 'Individual')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_party_name ON tmf_party(name);
      CREATE INDEX IF NOT EXISTS idx_tmf_party_type_status ON tmf_party(party_type, status);

      CREATE TABLE IF NOT EXISTS tmf_party_role (
        id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
        party_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES tmf_party(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_party_role_party ON tmf_party_role(party_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_party_role_name ON tmf_party_role(name);
      CREATE INDEX IF NOT EXISTS idx_tmf_party_role_status ON tmf_party_role(status);

      CREATE TABLE IF NOT EXISTS tmf_party_relationship (
        party_from_id TEXT NOT NULL,
        party_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (party_from_id, party_to_id, relationship_type),
        FOREIGN KEY (party_from_id) REFERENCES tmf_party(id),
        FOREIGN KEY (party_to_id) REFERENCES tmf_party(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_party_relationship ON tmf_party_relationship(party_from_id, party_to_id);

      -- ========== TRANSVERSAL: EVENTS (TMF688) ==========

      -- TMF688: Event Store (auditoria e event sourcing)
      CREATE TABLE IF NOT EXISTS tmf_event (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        event_time DATETIME NOT NULL,
        source TEXT NOT NULL,
        event_data TEXT NOT NULL,
        correlation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_event_type_time ON tmf_event(event_type, event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_tmf_event_source ON tmf_event(source);
      CREATE INDEX IF NOT EXISTS idx_tmf_event_correlation ON tmf_event(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event(json_extract(event_data, '$.entityId'));

      CREATE TABLE IF NOT EXISTS tmf_audit_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        actor_sub TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_time DATETIME NOT NULL,
        before_state TEXT,
        after_state TEXT,
        trace_id TEXT NOT NULL,
        source_ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_audit_log_entity ON tmf_audit_log(entity_type, entity_id, event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_tmf_audit_log_tenant ON tmf_audit_log(tenant_id, event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_tmf_audit_log_trace ON tmf_audit_log(trace_id);

      CREATE TABLE IF NOT EXISTS tmf_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
        created_at DATETIME NOT NULL,
        published_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_outbox_status_created ON tmf_outbox(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_tmf_outbox_tenant ON tmf_outbox(tenant_id);

      CREATE TABLE IF NOT EXISTS tmf_geo_bulk_job (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        target TEXT NOT NULL CHECK(target IN ('Address', 'Site')),
        mode TEXT NOT NULL CHECK(mode IN ('validateOnly', 'atomic', 'bestEffort')),
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
        submitted_at DATETIME NOT NULL,
        started_at DATETIME NOT NULL,
        completed_at DATETIME,
        total INTEGER NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        actor_sub TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        UNIQUE(tenant_id, target, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_bulk_job_tenant_status ON tmf_geo_bulk_job(tenant_id, status, submitted_at DESC);

      CREATE TABLE IF NOT EXISTS tmf_geo_bulk_job_result (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        item_index INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('validated', 'created', 'reused', 'failed')),
        entity_id TEXT,
        legacy_system TEXT,
        legacy_entity TEXT,
        legacy_id TEXT,
        error_code TEXT,
        message TEXT,
        warnings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_id, item_index),
        FOREIGN KEY (job_id) REFERENCES tmf_geo_bulk_job(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_bulk_job_result_job ON tmf_geo_bulk_job_result(job_id, item_index);
      CREATE INDEX IF NOT EXISTS idx_tmf_geo_bulk_job_result_tenant ON tmf_geo_bulk_job_result(tenant_id);

      -- ========== SEARCH/CHAT MODULE ==========

      -- Research Session (similar to ChatGPT conversation)
      CREATE TABLE IF NOT EXISTS research_session (
        id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        context TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
        model TEXT,
        temperature REAL DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 2000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_research_session_user ON research_session(user_id);
      CREATE INDEX IF NOT EXISTS idx_research_session_created ON research_session(created_at);
      CREATE INDEX IF NOT EXISTS idx_research_session_status ON research_session(status);

      -- Research Message (turn-by-turn conversation)
      CREATE TABLE IF NOT EXISTS research_message (
        id TEXT PRIMARY KEY,
        research_session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tokens_used INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (research_session_id) REFERENCES research_session(id)
      );
      CREATE INDEX IF NOT EXISTS idx_research_message_session ON research_message(research_session_id);
      CREATE INDEX IF NOT EXISTS idx_research_message_role ON research_message(role);
      CREATE INDEX IF NOT EXISTS idx_research_message_created ON research_message(created_at);

      -- MCP two-phase confirmation tokens
      CREATE TABLE IF NOT EXISTS mcp_confirmation (
        token TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        summary TEXT NOT NULL,
        warnings TEXT NOT NULL,
        context TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_confirmation_operation ON mcp_confirmation(domain, operation);
      CREATE INDEX IF NOT EXISTS idx_mcp_confirmation_expires ON mcp_confirmation(expires_at);

      -- ========== CATALOGS: Extensible ==========

      -- Catalog: Relationship Types (reutilizável)
      CREATE TABLE IF NOT EXISTS tmf_relationship_type_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        applicable_to_entity_types TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Catalog: Characteristic Groups (reutilizável)
      CREATE TABLE IF NOT EXISTS tmf_characteristic_group_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        applicable_to_entity_types TEXT,
        allowed_characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ========== MODULE 1: GPON COVERAGE (mapa de calor por bairro, REQ-MOD01-014) ==========

      -- Projeção de leitura da cobertura GPON: a grade de calor derivada da posição das
      -- CDOs (ver scripts/build-gpon-coverage.mjs e src/modules/geo/coverage-grid.ts). Não é
      -- entidade TMF — é artefato regenerável, como geo_search_history. O polígono do bairro
      -- em si mora em tmf_geographic_location (Polygon, TMF675); aqui fica o campo de densidade
      -- fino de 150 m que a API agrega por zoom (150 m → 750 m via GROUP BY floor(grid_x/5)).
      -- coverage_area_id aponta (por convenção, sem FK rígida — a tabela é substituída inteira
      -- a cada geração) a GeographicLocation do componente de cobertura da célula.
      -- ports_total/ports_used ficam NULL hoje e reservam o takeup futuro (portas ocupadas).
      -- Sem coluna JSON de propósito: a base Oracle tem CHECK(col IS JSON) global por nome.
      CREATE TABLE IF NOT EXISTS geo_gpon_coverage_cell (
        tenant_id TEXT NOT NULL DEFAULT 'default',
        grid_size_m INTEGER NOT NULL,
        grid_x INTEGER NOT NULL,
        grid_y INTEGER NOT NULL,
        coverage_area_id TEXT,
        cdo_total INTEGER NOT NULL DEFAULT 0,
        cdo_available INTEGER NOT NULL DEFAULT 0,
        ports_total INTEGER,
        ports_used INTEGER,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, grid_size_m, grid_x, grid_y)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_cell_xy
        ON geo_gpon_coverage_cell(grid_size_m, grid_x, grid_y);
      CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_cell_area
        ON geo_gpon_coverage_cell(coverage_area_id);

      -- Índice de leitura por polígono de cobertura (1 linha por Location "GPON:"/"GPON-CITY:"/
      -- "GPON-UF:"), com bbox e estatística DESNORMALIZADOS — evita, no recorte por viewport, ter
      -- que varrer geo_gpon_coverage_cell (milhões de linhas) e reparsear characteristics (dezenas
      -- de MB) a cada requisição. lod_level espelha os três níveis de detalhe que
      -- scripts/build-gpon-coverage.mjs grava: neighborhood (bairro, célula fina) até 500 m de
      -- escala, city (município) até 10 km, uf (estado) acima disso — ver coverageLevelForScale no
      -- frontend. (Nome da coluna evita "level": palavra reservada do Oracle, usada em
      -- CONNECT BY LEVEL.) Artefato derivado e regenerável, como geo_gpon_coverage_cell: toda
      -- execução do script SUBSTITUI a geração anterior do escopo/nível.
      CREATE TABLE IF NOT EXISTS geo_gpon_coverage_area (
        tenant_id TEXT NOT NULL DEFAULT 'default',
        location_id TEXT NOT NULL,
        lod_level TEXT NOT NULL,
        cell_size_m INTEGER NOT NULL,
        min_lng REAL NOT NULL,
        min_lat REAL NOT NULL,
        max_lng REAL NOT NULL,
        max_lat REAL NOT NULL,
        area_key TEXT NOT NULL,
        neighborhood TEXT,
        city TEXT,
        uf TEXT,
        cdo_total INTEGER NOT NULL DEFAULT 0,
        cdo_available INTEGER NOT NULL DEFAULT 0,
        covered_area_km2 REAL NOT NULL DEFAULT 0,
        ports_total INTEGER,
        ports_used INTEGER,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, location_id)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_area_bbox
        ON geo_gpon_coverage_area(tenant_id, lod_level, min_lng, max_lng, min_lat, max_lat);
      CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_area_rank
        ON geo_gpon_coverage_area(tenant_id, lod_level, cdo_total);
`;

/**
 * Real migration versioning (fixes the gap tracked in issue #188 §7.0): before this, both
 * PostgresDatabase.applyMigrations() and OracleDatabase.applyMigrations() re-executed the
 * *entire* MIGRATIONS_SQL block on every boot and always stamped schema_migrations with a single
 * hardcoded version=1 row — there was no real batch granularity, so a future destructive DDL
 * phase would be silently undone by the next boot with DATABASE_AUTO_SCHEMA=true (it would just
 * re-run the still-idempotent ADD COLUMN/CREATE INDEX statements that recreate the dropped
 * objects). `MIGRATION_BATCHES` gives each slice of MIGRATIONS_SQL a stable version number that
 * both providers record individually in `schema_migrations` and skip once applied.
 *
 * The existing MIGRATIONS_SQL content becomes batch 1 verbatim — this is a pure refactor of how
 * it's tracked, not a schema change. New additive migrations (e.g. the Resource Catalog tree)
 * get their own batch with the next version number; a future destructive phase gets its own
 * batch too, but it must never run automatically (see §7 Fase B) — only via the controlled
 * script, which is why destructive DDL does not belong in MIGRATIONS_SQL/MIGRATION_BATCHES at
 * all.
 */
export type MigrationBatch = {
  version: number;
  name: string;
  sql: string;
};

/**
 * Batch 2 — Resource Catalog tree (issue #188 §2/§7 passo 4). Purely additive: two new tables
 * (`tmf_resource_catalog`, `tmf_resource_catalog_node`) plus a nullable `resource_type_id` on
 * the tables that will eventually replace the `category`/`resource_type`/`resource_layer_id`
 * textual classification. Deliberately does NOT touch the legacy columns, does NOT add the
 * `(tenant_id, code)` unique constraint on `tmf_resource_type` (still globally unique — that
 * relaxation depends on the audited backfill, see plan §2.2/§7 passo 4), and does NOT add the
 * `resource_type_id` FK/NOT NULL yet (those land post-backfill, plan §7.8). Runtime code must
 * not read or write `resource_type_id` until the domain/service/repository layers (tasks #4-#8)
 * exist — this batch only makes the columns available for the backfill script to populate.
 */
const MIGRATIONS_SQL_V2_RESOURCE_CATALOG = `
  -- Contêiner tenant-scoped de uma árvore de catálogo governada; não é nó da árvore em si.
  CREATE TABLE IF NOT EXISTS tmf_resource_catalog (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code),
    UNIQUE(tenant_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_catalog_tenant_order
    ON tmf_resource_catalog(tenant_id, status, sort_order, name, id);
  -- No máximo um catálogo default por tenant. Oracle não tem índice parcial nativo —
  -- transformOracleSchemaSql reescreve este padrão exato como índice funcional (mesma técnica
  -- já usada para geo_project_resource.resource_id/detached_at, ver oracle-schema.ts).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tmf_resource_catalog_one_default
    ON tmf_resource_catalog(tenant_id) WHERE is_default = 1;

  -- Composite FK target for tmf_resource_catalog_node.resource_type_id below — Postgres/Oracle
  -- both require a real unique constraint on the referenced column pair, not just PK(id).
  -- Harmless alongside the existing global UNIQUE(code): this doesn't relax it, just adds the
  -- tenant-scoped pair FKs need. That relaxation (UNIQUE(tenant_id, code) replacing the global
  -- one) is deferred to the audited backfill per plan §2.2/§7 passo 4.
  ALTER TABLE tmf_resource_type ADD CONSTRAINT tmf_resource_type_tenant_id_id_key UNIQUE(tenant_id, id);

  -- Nó da árvore de catálogo: GROUP (organizacional, nunca referencia tipo) ou RESOURCE_TYPE
  -- (folha, referencia exatamente um ResourceType — sem unicidade global: o mesmo tipo pode
  -- estar em 0..N nós, inclusive no mesmo catálogo). Profundidade arbitrária via parent_node_id.
  CREATE TABLE IF NOT EXISTS tmf_resource_catalog_node (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    catalog_id TEXT NOT NULL,
    parent_node_id TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('GROUP', 'RESOURCE_TYPE')),
    resource_type_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK ((kind = 'GROUP' AND resource_type_id IS NULL) OR (kind = 'RESOURCE_TYPE' AND resource_type_id IS NOT NULL)),
    CHECK (parent_node_id IS NULL OR parent_node_id <> id),
    UNIQUE(tenant_id, catalog_id, code),
    UNIQUE(tenant_id, catalog_id, id),
    FOREIGN KEY (tenant_id, catalog_id) REFERENCES tmf_resource_catalog(tenant_id, id),
    FOREIGN KEY (tenant_id, catalog_id, parent_node_id) REFERENCES tmf_resource_catalog_node(tenant_id, catalog_id, id),
    FOREIGN KEY (tenant_id, resource_type_id) REFERENCES tmf_resource_type(tenant_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_catalog_node_tree
    ON tmf_resource_catalog_node(tenant_id, catalog_id, parent_node_id, status, sort_order, name, id);
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_catalog_node_type
    ON tmf_resource_catalog_node(tenant_id, resource_type_id, status, catalog_id);
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_catalog_node_catalog_kind
    ON tmf_resource_catalog_node(tenant_id, catalog_id, status, kind);

  -- FK futura (pós-backfill, plan §7.8): coluna nullable por enquanto, populada pelo script de
  -- migração controlado. Nenhum código de runtime deve ler/gravar esta coluna antes disso.
  ALTER TABLE tmf_resource_specification ADD COLUMN IF NOT EXISTS resource_type_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_specification_resource_type_id
    ON tmf_resource_specification(tenant_id, resource_type_id, valid_for_end, name, id);
  ALTER TABLE tmf_resource_status_catalog ADD COLUMN IF NOT EXISTS resource_type_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_tmf_resource_status_catalog_resource_type_id
    ON tmf_resource_status_catalog(tenant_id, resource_type_id);
`;

export const MIGRATION_BATCHES: readonly MigrationBatch[] = [
  { version: 1, name: 'baseline', sql: MIGRATIONS_SQL },
  { version: 2, name: 'resource-catalog-tree', sql: MIGRATIONS_SQL_V2_RESOURCE_CATALOG },
];

/**
 * Deterministic, dependency-free checksum for a migration batch's SQL — not cryptographic,
 * just stable across runs so `schema_migrations.checksum` can flag "this version's SQL changed
 * since it was applied" without pulling in Node's `crypto` module for a bookkeeping column.
 */
export const checksumMigrationBatch = (sql: string): string => {
  let hash = 0;
  for (let i = 0; i < sql.length; i += 1) {
    hash = (Math.imul(hash, 31) + sql.charCodeAt(i)) | 0;
  }
  return `batch-${(hash >>> 0).toString(16)}`;
};

// Rewrites the SQLite-dialect schema DDL to its Postgres equivalent: SQLite type names to
// Postgres ones and the json_extract() expression index to a jsonb expression index. Comments
// are stripped so the statements can be split on ';' safely.
export const transformSchemaSql = (sql: string): string =>
  sql
    .replace(/\bDATETIME\b/g, 'TIMESTAMPTZ')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    .replace(
      /CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event\(json_extract\(event_data, '\$\.(.+?)'\)\);/g,
      (_match, path: string) =>
        `CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event (((event_data)::jsonb->>'${path}'));`,
    )
    .replace(/--.*$/gm, '');

// Splits a `CREATE TABLE (...)` body on its top-level commas — i.e. ignoring commas nested inside a
// column's own parens (`CHECK(status IN ('a', 'b'))`, `VARCHAR(36)`). A naive split(',') would cut
// those definitions in half.
const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
};

// Table-level clauses (not column definitions) that can appear as a top-level item inside a
// `CREATE TABLE (...)` body — must not be mistaken for a column named e.g. "foreign".
const TABLE_LEVEL_CLAUSE = /^(FOREIGN KEY|PRIMARY KEY|CHECK|UNIQUE|CONSTRAINT)\b/i;

/**
 * Parses the canonical (SQLite-authored) schema SQL and returns every column declared per table —
 * both in its `CREATE TABLE IF NOT EXISTS` block and in every later `ALTER TABLE ... ADD COLUMN IF
 * NOT EXISTS`. This is the single source of truth `assertNoSchemaDrift` (Oracle/Postgres) diffs
 * against the live database, so a column added here without a corresponding `ADD COLUMN` migration
 * — or a migration applied to Postgres but not Oracle — fails the boot with a clear message instead
 * of surfacing as a 500 the first time a repository queries it.
 */
export const parseDeclaredColumns = (sql: string): Map<string, Set<string>> => {
  const declared = new Map<string, Set<string>>();
  const addColumn = (table: string, column: string): void => {
    const columns = declared.get(table) ?? new Set<string>();
    columns.add(column);
    declared.set(table, columns);
  };

  const createTableRe = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(sql))) {
    const table = match[1]!;
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    while (cursor < sql.length && depth > 0) {
      if (sql[cursor] === '(') depth += 1;
      else if (sql[cursor] === ')') depth -= 1;
      cursor += 1;
    }
    const body = sql.slice(bodyStart, cursor - 1);
    // Remover comentários antes de separar por vírgulas: uma vírgula em comentário SQL não é um
    // delimitador de coluna e, se preservada, pode transformar uma palavra do comentário em item.
    const uncommentedBody = body.replace(/--.*$/gmu, '');
    for (const rawItem of splitTopLevel(uncommentedBody)) {
      const item = rawItem.trim();
      if (item.length === 0 || TABLE_LEVEL_CLAUSE.test(item)) continue;
      const columnMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+\S/.exec(item);
      if (columnMatch) addColumn(table, columnMatch[1]!);
    }
  }

  const addColumnRe =
    /ALTER TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ADD COLUMN IF NOT EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  while ((match = addColumnRe.exec(sql))) {
    addColumn(match[1]!, match[2]!);
  }

  return declared;
};

// Parsed once at import time — SCHEMA_SQL/MIGRATION_BATCHES are static template literals, so this
// is the same declared-column map every caller would otherwise recompute. Derives from every
// batch (not just MIGRATIONS_SQL) so a new additive batch's tables/columns are picked up by the
// drift check automatically, without editing this line each time.
export const DECLARED_COLUMNS: ReadonlyMap<string, ReadonlySet<string>> = parseDeclaredColumns(
  `${SCHEMA_SQL}\n${MIGRATION_BATCHES.map((batch) => batch.sql).join('\n')}`,
);

/**
 * Diffs `DECLARED_COLUMNS` against a live database's actual columns, returning `"table.column"` for
 * every declared column absent from `actual`. `actual` is keyed by bare (unprefixed) table name,
 * matching `DECLARED_COLUMNS`; both column-name sets are compared case-insensitively so Oracle's
 * uppercase-folded `user_tab_columns` and Postgres's lowercase `information_schema.columns` both
 * work unmodified. Used by OracleDatabase/PostgresDatabase at boot (see `validateSchemaVersion`) so
 * a migration applied to one provider but not the other fails the boot with the exact gap instead of
 * surfacing as a 500 the first time a repository queries the missing column (see AGENTS.md C10 and
 * issue #166).
 */
export const findColumnDrift = (actual: ReadonlyMap<string, ReadonlySet<string>>): string[] => {
  const missing: string[] = [];
  for (const [table, columns] of DECLARED_COLUMNS) {
    const actualColumns = actual.get(table);
    if (!actualColumns) continue; // a whole missing table is a different failure mode (ORA-00942 / 42P01) surfaced elsewhere
    const actualUpper = new Set([...actualColumns].map((column) => column.toUpperCase()));
    for (const column of columns) {
      if (!actualUpper.has(column.toUpperCase())) missing.push(`${table}.${column}`);
    }
  }
  return missing;
};
