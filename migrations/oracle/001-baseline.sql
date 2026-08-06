
      
      CREATE TABLE users (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        external_id VARCHAR2(36 CHAR) UNIQUE NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        email VARCHAR2(255 CHAR),
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE searches (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        user_id VARCHAR2(36 CHAR) NOT NULL,
        query VARCHAR2(4000 CHAR) NOT NULL,
        filters CLOB,
        results CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX idx_searches_user_id ON searches(user_id);

      

      
      CREATE TABLE tmf_geographic_location (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        tenant_id VARCHAR2(36 CHAR) NOT NULL DEFAULT 'default',
        geometry_type VARCHAR2(255 CHAR) NOT NULL CHECK(geometry_type IN ('Point', 'LineString', 'Polygon')),
        geometry CLOB NOT NULL,
        spatial_ref VARCHAR2(255 CHAR) DEFAULT 'EPSG:4326',
        accuracy VARCHAR2(255 CHAR),
        reference_point VARCHAR2(255 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_geographic_location_valid_for ON tmf_geographic_location(valid_for_start, valid_for_end);
      CREATE INDEX idx_tmf_geographic_location_tenant ON tmf_geographic_location(tenant_id);

      
      CREATE TABLE tmf_geographic_address (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        tenant_id VARCHAR2(36 CHAR) NOT NULL DEFAULT 'default',
        street_type VARCHAR2(255 CHAR),
        street_name VARCHAR2(255 CHAR) NOT NULL,
        street_nr VARCHAR2(255 CHAR),
        locality VARCHAR2(255 CHAR),
        city VARCHAR2(255 CHAR),
        state_or_province VARCHAR2(255 CHAR),
        country VARCHAR2(255 CHAR) DEFAULT 'BR',
        postcode VARCHAR2(255 CHAR),
        geographic_location_id VARCHAR2(36 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX idx_tmf_geographic_address_location ON tmf_geographic_address(geographic_location_id);
      CREATE INDEX idx_tmf_geographic_address_city_postcode ON tmf_geographic_address(city, postcode);
      CREATE INDEX idx_tmf_geographic_address_street_name ON tmf_geographic_address(street_name);
      CREATE INDEX idx_tmf_geographic_address_tenant ON tmf_geographic_address(tenant_id);

      
      CREATE TABLE tmf_geographic_site_specification (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        code VARCHAR2(255 CHAR) NOT NULL,
        category VARCHAR2(255 CHAR) NOT NULL,
        lifecycle_status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'Active',
        description VARCHAR2(4000 CHAR),
        allowed_parent_spec_ids CLOB,
        allowed_child_spec_ids CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        is_bootstrap NUMBER(10) NOT NULL DEFAULT 0,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_geographic_site_specification_name_category ON tmf_geographic_site_specification(name, category);
      CREATE INDEX idx_tmf_geographic_site_specification_code ON tmf_geographic_site_specification(code);
      CREATE INDEX idx_tmf_geographic_site_specification_lifecycle ON tmf_geographic_site_specification(lifecycle_status);

      CREATE TABLE tmf_geographic_site_spec_containment_rule (
        parent_spec_id VARCHAR2(36 CHAR) NOT NULL,
        child_spec_id VARCHAR2(36 CHAR) NOT NULL,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        is_protected NUMBER(10) NOT NULL DEFAULT 0,
        PRIMARY KEY (parent_spec_id, child_spec_id),
        FOREIGN KEY (parent_spec_id) REFERENCES tmf_geographic_site_specification(id),
        FOREIGN KEY (child_spec_id) REFERENCES tmf_geographic_site_specification(id)
      );
      CREATE INDEX idx_tmf_geo_spec_containment_parent ON tmf_geographic_site_spec_containment_rule(parent_spec_id, child_spec_id);
      CREATE INDEX idx_tmf_geo_spec_containment_child ON tmf_geographic_site_spec_containment_rule(child_spec_id, parent_spec_id);

      
      CREATE TABLE tmf_geographic_site (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        tenant_id VARCHAR2(36 CHAR) NOT NULL DEFAULT 'default',
        name VARCHAR2(255 CHAR) NOT NULL,
        site_specification_id VARCHAR2(36 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned', 'InConstruction', 'Active', 'InDeactivation', 'Retired')),
        status_date TIMESTAMP(6) WITH TIME ZONE,
        status_reason VARCHAR2(255 CHAR),
        geographic_location_id VARCHAR2(36 CHAR),
        geographic_address_id VARCHAR2(36 CHAR),
        parent_site_id VARCHAR2(36 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        related_party CLOB,
        site_addresses CLOB,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_specification_id) REFERENCES tmf_geographic_site_specification(id),
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id),
        FOREIGN KEY (geographic_address_id) REFERENCES tmf_geographic_address(id),
        FOREIGN KEY (parent_site_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX idx_tmf_geographic_site_spec ON tmf_geographic_site(site_specification_id);
      CREATE INDEX idx_tmf_geographic_site_location ON tmf_geographic_site(geographic_location_id);
      CREATE INDEX idx_tmf_geographic_site_address ON tmf_geographic_site(geographic_address_id);
      CREATE INDEX idx_tmf_geographic_site_parent ON tmf_geographic_site(parent_site_id);
      CREATE INDEX idx_tmf_geographic_site_status ON tmf_geographic_site(status);
      CREATE INDEX idx_tmf_geographic_site_name ON tmf_geographic_site(name);
      CREATE INDEX idx_tmf_geographic_site_tenant ON tmf_geographic_site(tenant_id);
      CREATE INDEX idx_tmf_geographic_site_tenant_status ON tmf_geographic_site(tenant_id, status);

      CREATE TABLE tmf_geographic_site_status_history (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        site_id VARCHAR2(36 CHAR) NOT NULL,
        tenant_id VARCHAR2(36 CHAR) NOT NULL,
        from_status VARCHAR2(255 CHAR),
        to_status VARCHAR2(255 CHAR) NOT NULL,
        status_date TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        status_reason VARCHAR2(255 CHAR),
        actor_sub VARCHAR2(255 CHAR) NOT NULL,
        trace_id VARCHAR2(36 CHAR) NOT NULL,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX idx_tmf_geo_site_history_site ON tmf_geographic_site_status_history(site_id, status_date DESC);
      CREATE INDEX idx_tmf_geo_site_history_tenant ON tmf_geographic_site_status_history(tenant_id);

      
      CREATE TABLE tmf_geographic_site_relationship (
        site_from_id VARCHAR2(36 CHAR) NOT NULL,
        site_to_id VARCHAR2(36 CHAR) NOT NULL,
        relationship_type VARCHAR2(255 CHAR) NOT NULL,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        PRIMARY KEY (site_from_id, site_to_id, relationship_type),
        FOREIGN KEY (site_from_id) REFERENCES tmf_geographic_site(id),
        FOREIGN KEY (site_to_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX idx_tmf_geographic_site_relationship ON tmf_geographic_site_relationship(site_from_id, site_to_id);
      CREATE INDEX idx_tmf_geographic_site_relationship_reverse ON tmf_geographic_site_relationship(site_to_id, site_from_id);

      CREATE TABLE tmf_geographic_relationship_type (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        code VARCHAR2(255 CHAR) NOT NULL UNIQUE,
        name VARCHAR2(255 CHAR) NOT NULL,
        inverse_code VARCHAR2(255 CHAR) NOT NULL,
        is_symmetric NUMBER(10) NOT NULL DEFAULT 0,
        allowed_source_categories CLOB,
        allowed_target_categories CLOB,
        cardinality VARCHAR2(255 CHAR),
        lifecycle_status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'Active' CHECK(lifecycle_status IN ('Active', 'Retired')),
        is_bootstrap NUMBER(10) NOT NULL DEFAULT 0,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_geographic_relationship_type_code ON tmf_geographic_relationship_type(code);
      CREATE INDEX idx_tmf_geographic_relationship_type_lifecycle ON tmf_geographic_relationship_type(lifecycle_status);

      

      
      CREATE TABLE tmf_resource_specification (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        category VARCHAR2(255 CHAR) NOT NULL,
        resource_type VARCHAR2(255 CHAR) NOT NULL,
        description VARCHAR2(4000 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        related_party CLOB,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_resource_specification_category_type ON tmf_resource_specification(category, resource_type);

      
      CREATE TABLE tmf_resource_category (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        code VARCHAR2(255 CHAR) NOT NULL UNIQUE,
        name VARCHAR2(255 CHAR) NOT NULL,
        parent_category_code VARCHAR2(255 CHAR),
        description VARCHAR2(4000 CHAR),
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_resource_category_parent ON tmf_resource_category(parent_category_code);
      CREATE INDEX idx_tmf_resource_category_status ON tmf_resource_category(status);

      CREATE TABLE tmf_resource_type (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        code VARCHAR2(255 CHAR) NOT NULL UNIQUE,
        name VARCHAR2(255 CHAR) NOT NULL,
        category_code VARCHAR2(255 CHAR) NOT NULL,
        description VARCHAR2(4000 CHAR),
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_code) REFERENCES tmf_resource_category(code)
      );
      CREATE INDEX idx_tmf_resource_type_category ON tmf_resource_type(category_code);
      CREATE INDEX idx_tmf_resource_type_status ON tmf_resource_type(status);

      CREATE TABLE tmf_resource_function_specification (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        description VARCHAR2(4000 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      
      CREATE TABLE tmf_physical_resource (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        resource_specification_id VARCHAR2(36 CHAR) NOT NULL,
        resource_type VARCHAR2(255 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        geographic_location_id VARCHAR2(36 CHAR),
        manufacturer VARCHAR2(255 CHAR),
        model VARCHAR2(255 CHAR),
        serial_number VARCHAR2(255 CHAR) UNIQUE,
        part_number VARCHAR2(255 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        related_party CLOB,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_specification_id) REFERENCES tmf_resource_specification(id),
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX idx_tmf_physical_resource_spec ON tmf_physical_resource(resource_specification_id);
      CREATE INDEX idx_tmf_physical_resource_location ON tmf_physical_resource(geographic_location_id);
      CREATE INDEX idx_tmf_physical_resource_status ON tmf_physical_resource(status);
      CREATE INDEX idx_tmf_physical_resource_serial ON tmf_physical_resource(serial_number);

      
      CREATE TABLE tmf_logical_resource (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        resource_specification_id VARCHAR2(36 CHAR) NOT NULL,
        resource_type VARCHAR2(255 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        supporting_physical_resource_id VARCHAR2(36 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_specification_id) REFERENCES tmf_resource_specification(id),
        FOREIGN KEY (supporting_physical_resource_id) REFERENCES tmf_physical_resource(id)
      );
      CREATE INDEX idx_tmf_logical_resource_spec ON tmf_logical_resource(resource_specification_id);
      CREATE INDEX idx_tmf_logical_resource_supporting ON tmf_logical_resource(supporting_physical_resource_id);
      CREATE INDEX idx_tmf_logical_resource_status ON tmf_logical_resource(status);

      
      CREATE TABLE tmf_resource_relationship (
        resource_from_id VARCHAR2(36 CHAR) NOT NULL,
        resource_to_id VARCHAR2(36 CHAR) NOT NULL,
        relationship_type VARCHAR2(255 CHAR) NOT NULL,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        PRIMARY KEY (resource_from_id, resource_to_id, relationship_type),
        FOREIGN KEY (resource_from_id) REFERENCES tmf_physical_resource(id),
        FOREIGN KEY (resource_to_id) REFERENCES tmf_physical_resource(id)
      );
      CREATE INDEX idx_tmf_resource_relationship ON tmf_resource_relationship(resource_from_id, resource_to_id);

      CREATE TABLE tmf_resource_relationship_generic (
        resource_from_id VARCHAR2(36 CHAR) NOT NULL,
        resource_to_id VARCHAR2(36 CHAR) NOT NULL,
        relationship_type VARCHAR2(255 CHAR) NOT NULL,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        PRIMARY KEY (resource_from_id, resource_to_id, relationship_type)
      );
      CREATE INDEX idx_tmf_resource_relationship_generic ON tmf_resource_relationship_generic(resource_from_id, resource_to_id);

      

      
      CREATE TABLE tmf_service_specification (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        category VARCHAR2(255 CHAR) NOT NULL,
        service_type VARCHAR2(255 CHAR) NOT NULL CHECK(service_type IN ('CFS', 'RFS', 'Other')),
        description VARCHAR2(4000 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_service_specification_category_type ON tmf_service_specification(category, service_type);

      CREATE TABLE tmf_service_category (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        description VARCHAR2(4000 CHAR),
        parent_category_id VARCHAR2(36 CHAR),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_category_id) REFERENCES tmf_service_category(id)
      );
      CREATE INDEX idx_tmf_service_category_parent ON tmf_service_category(parent_category_id);
      CREATE INDEX idx_tmf_service_category_name ON tmf_service_category(name);

      CREATE TABLE tmf_service_candidate (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        description VARCHAR2(4000 CHAR),
        service_specification_id VARCHAR2(36 CHAR) NOT NULL,
        service_category_id VARCHAR2(36 CHAR),
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id),
        FOREIGN KEY (service_category_id) REFERENCES tmf_service_category(id)
      );
      CREATE INDEX idx_tmf_service_candidate_spec ON tmf_service_candidate(service_specification_id);
      CREATE INDEX idx_tmf_service_candidate_category ON tmf_service_candidate(service_category_id);
      CREATE INDEX idx_tmf_service_candidate_status ON tmf_service_candidate(status);

      
      
      
      
      CREATE TABLE tmf_resource_facing_service (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR),
        service_specification_id VARCHAR2(36 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        state VARCHAR2(255 CHAR),
        service_type VARCHAR2(255 CHAR),
        category VARCHAR2(255 CHAR),
        service_date VARCHAR2(255 CHAR),
        start_date VARCHAR2(255 CHAR),
        end_date VARCHAR2(255 CHAR),
        is_service_enabled NUMBER(10),
        has_started NUMBER(10),
        supporting_resource_id VARCHAR2(36 CHAR) NOT NULL,
        place CLOB,
        related_party CLOB,
        supporting_resources CLOB,
        supporting_services CLOB,
        service_relationships CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id)
      );
      CREATE INDEX idx_tmf_resource_facing_service_spec ON tmf_resource_facing_service(service_specification_id);
      CREATE INDEX idx_tmf_resource_facing_service_resource ON tmf_resource_facing_service(supporting_resource_id);
      CREATE INDEX idx_tmf_resource_facing_service_status ON tmf_resource_facing_service(status);

      
      CREATE TABLE tmf_customer_facing_service (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        service_specification_id VARCHAR2(36 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        state VARCHAR2(255 CHAR),
        service_type VARCHAR2(255 CHAR),
        category VARCHAR2(255 CHAR),
        service_date VARCHAR2(255 CHAR),
        start_date VARCHAR2(255 CHAR),
        end_date VARCHAR2(255 CHAR),
        is_service_enabled NUMBER(10),
        has_started NUMBER(10),
        subscriber_id VARCHAR2(36 CHAR) NOT NULL,
        supporting_resource_facing_service_id VARCHAR2(36 CHAR),
        place CLOB,
        related_party CLOB,
        supporting_services CLOB,
        service_relationships CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id),
        FOREIGN KEY (supporting_resource_facing_service_id) REFERENCES tmf_resource_facing_service(id)
      );
      CREATE INDEX idx_tmf_customer_facing_service_spec ON tmf_customer_facing_service(service_specification_id);
      CREATE INDEX idx_tmf_customer_facing_service_subscriber ON tmf_customer_facing_service(subscriber_id);
      CREATE INDEX idx_tmf_customer_facing_service_status ON tmf_customer_facing_service(status);

      
      CREATE TABLE tmf_service_relationship (
        service_from_id VARCHAR2(36 CHAR) NOT NULL,
        service_to_id VARCHAR2(36 CHAR) NOT NULL,
        relationship_type VARCHAR2(255 CHAR) NOT NULL,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        PRIMARY KEY (service_from_id, service_to_id, relationship_type),
        FOREIGN KEY (service_from_id) REFERENCES tmf_customer_facing_service(id),
        FOREIGN KEY (service_to_id) REFERENCES tmf_resource_facing_service(id)
      );

      
      CREATE TABLE tmf_service_qualification (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        state VARCHAR2(255 CHAR) NOT NULL DEFAULT 'done' CHECK(state IN ('done', 'terminated')),
        place CLOB,
        related_party CLOB,
        service_characteristic CLOB,
        service_qualification_item CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_service_qualification_state ON tmf_service_qualification(state);

      
      CREATE TABLE tmf_service_order (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        state VARCHAR2(255 CHAR) NOT NULL DEFAULT 'acknowledged' CHECK(state IN ('acknowledged', 'inProgress', 'completed', 'failed', 'cancelled')),
        description VARCHAR2(4000 CHAR),
        related_party CLOB,
        service_order_item CLOB NOT NULL,
        note CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_service_order_state ON tmf_service_order(state);

      
      CREATE TABLE tmf_resource_order (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        state VARCHAR2(255 CHAR) NOT NULL DEFAULT 'acknowledged' CHECK(state IN ('acknowledged', 'inProgress', 'completed', 'failed', 'cancelled')),
        description VARCHAR2(4000 CHAR),
        related_party CLOB,
        resource_order_item CLOB NOT NULL,
        note CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_resource_order_state ON tmf_resource_order(state);

      

      CREATE TABLE tmf_party (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        party_type VARCHAR2(255 CHAR) NOT NULL CHECK(party_type IN ('Organization', 'Individual')),
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_party_name ON tmf_party(name);
      CREATE INDEX idx_tmf_party_type_status ON tmf_party(party_type, status);

      CREATE TABLE tmf_party_role (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        name VARCHAR2(255 CHAR) NOT NULL,
        party_id VARCHAR2(36 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES tmf_party(id)
      );
      CREATE INDEX idx_tmf_party_role_party ON tmf_party_role(party_id);
      CREATE INDEX idx_tmf_party_role_name ON tmf_party_role(name);
      CREATE INDEX idx_tmf_party_role_status ON tmf_party_role(status);

      CREATE TABLE tmf_party_relationship (
        party_from_id VARCHAR2(36 CHAR) NOT NULL,
        party_to_id VARCHAR2(36 CHAR) NOT NULL,
        relationship_type VARCHAR2(255 CHAR) NOT NULL,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        PRIMARY KEY (party_from_id, party_to_id, relationship_type),
        FOREIGN KEY (party_from_id) REFERENCES tmf_party(id),
        FOREIGN KEY (party_to_id) REFERENCES tmf_party(id)
      );
      CREATE INDEX idx_tmf_party_relationship ON tmf_party_relationship(party_from_id, party_to_id);

      

      
      CREATE TABLE tmf_event (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        event_type VARCHAR2(255 CHAR) NOT NULL,
        event_time TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        source VARCHAR2(255 CHAR) NOT NULL,
        event_data CLOB NOT NULL,
        correlation_id VARCHAR2(36 CHAR),
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_event_type_time ON tmf_event(event_type, event_time DESC);
      CREATE INDEX idx_tmf_event_source ON tmf_event(source);
      CREATE INDEX idx_tmf_event_correlation ON tmf_event(correlation_id);
      CREATE INDEX idx_tmf_event_entity ON tmf_event(JSON_VALUE(event_data, '$.entityId' RETURNING VARCHAR2(36)));

      CREATE TABLE tmf_audit_log (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        tenant_id VARCHAR2(36 CHAR) NOT NULL,
        actor_sub VARCHAR2(255 CHAR) NOT NULL,
        action VARCHAR2(255 CHAR) NOT NULL,
        entity_type VARCHAR2(255 CHAR) NOT NULL,
        entity_id VARCHAR2(36 CHAR) NOT NULL,
        event_time TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        before_state CLOB,
        after_state CLOB,
        trace_id VARCHAR2(36 CHAR) NOT NULL,
        source_ip VARCHAR2(255 CHAR),
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_tmf_audit_log_entity ON tmf_audit_log(entity_type, entity_id, event_time DESC);
      CREATE INDEX idx_tmf_audit_log_tenant ON tmf_audit_log(tenant_id, event_time DESC);
      CREATE INDEX idx_tmf_audit_log_trace ON tmf_audit_log(trace_id);

      CREATE TABLE tmf_outbox (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        tenant_id VARCHAR2(36 CHAR) NOT NULL,
        event_id VARCHAR2(36 CHAR) NOT NULL,
        topic VARCHAR2(255 CHAR) NOT NULL,
        payload CLOB NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
        created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        published_at TIMESTAMP(6) WITH TIME ZONE
      );
      CREATE INDEX idx_tmf_outbox_status_created ON tmf_outbox(status, created_at);
      CREATE INDEX idx_tmf_outbox_tenant ON tmf_outbox(tenant_id);

      CREATE TABLE tmf_geo_bulk_job (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        tenant_id VARCHAR2(36 CHAR) NOT NULL,
        target VARCHAR2(255 CHAR) NOT NULL CHECK(target IN ('Address', 'Site')),
        mode VARCHAR2(255 CHAR) NOT NULL CHECK(mode IN ('validateOnly', 'atomic', 'bestEffort')),
        idempotency_key VARCHAR2(255 CHAR) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
        submitted_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        started_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP(6) WITH TIME ZONE,
        total NUMBER(10) NOT NULL,
        success_count NUMBER(10) NOT NULL DEFAULT 0,
        error_count NUMBER(10) NOT NULL DEFAULT 0,
        warning_count NUMBER(10) NOT NULL DEFAULT 0,
        actor_sub VARCHAR2(255 CHAR) NOT NULL,
        trace_id VARCHAR2(36 CHAR) NOT NULL,
        UNIQUE(tenant_id, target, idempotency_key)
      );
      CREATE INDEX idx_tmf_geo_bulk_job_tenant_status ON tmf_geo_bulk_job(tenant_id, status, submitted_at DESC);

      CREATE TABLE tmf_geo_bulk_job_result (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        job_id VARCHAR2(36 CHAR) NOT NULL,
        tenant_id VARCHAR2(36 CHAR) NOT NULL,
        item_index NUMBER(10) NOT NULL,
        status VARCHAR2(255 CHAR) NOT NULL CHECK(status IN ('validated', 'created', 'reused', 'failed')),
        entity_id VARCHAR2(36 CHAR),
        legacy_system VARCHAR2(255 CHAR),
        legacy_entity VARCHAR2(255 CHAR),
        legacy_id VARCHAR2(36 CHAR),
        error_code VARCHAR2(255 CHAR),
        message VARCHAR2(4000 CHAR),
        warnings CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_id, item_index),
        FOREIGN KEY (job_id) REFERENCES tmf_geo_bulk_job(id)
      );
      CREATE INDEX idx_tmf_geo_bulk_job_result_job ON tmf_geo_bulk_job_result(job_id, item_index);
      CREATE INDEX idx_tmf_geo_bulk_job_result_tenant ON tmf_geo_bulk_job_result(tenant_id);

      

      
      CREATE TABLE research_session (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        href VARCHAR2(4000 CHAR) NOT NULL,
        user_id VARCHAR2(36 CHAR) NOT NULL,
        title VARCHAR2(4000 CHAR) NOT NULL,
        description VARCHAR2(4000 CHAR),
        context CLOB,
        status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
        model VARCHAR2(255 CHAR),
        temperature BINARY_DOUBLE DEFAULT 0.7,
        max_tokens NUMBER(10) DEFAULT 2000,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_research_session_user ON research_session(user_id);
      CREATE INDEX idx_research_session_created ON research_session(created_at);
      CREATE INDEX idx_research_session_status ON research_session(status);

      
      CREATE TABLE research_message (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        research_session_id VARCHAR2(36 CHAR) NOT NULL,
        role VARCHAR2(255 CHAR) NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content CLOB NOT NULL,
        tokens_used NUMBER(10),
        metadata CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (research_session_id) REFERENCES research_session(id)
      );
      CREATE INDEX idx_research_message_session ON research_message(research_session_id);
      CREATE INDEX idx_research_message_role ON research_message(role);
      CREATE INDEX idx_research_message_created ON research_message(created_at);

      
      CREATE TABLE mcp_confirmation (
        token VARCHAR2(36 CHAR) PRIMARY KEY,
        domain VARCHAR2(255 CHAR) NOT NULL,
        operation VARCHAR2(255 CHAR) NOT NULL,
        payload CLOB NOT NULL,
        summary VARCHAR2(4000 CHAR) NOT NULL,
        warnings CLOB NOT NULL,
        context CLOB NOT NULL,
        created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        expires_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
        consumed_at TIMESTAMP(6) WITH TIME ZONE
      );
      CREATE INDEX idx_mcp_confirmation_operation ON mcp_confirmation(domain, operation);
      CREATE INDEX idx_mcp_confirmation_expires ON mcp_confirmation(expires_at);

      

      
      CREATE TABLE tmf_relationship_type_catalog (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        name VARCHAR2(255 CHAR) NOT NULL UNIQUE,
        description VARCHAR2(4000 CHAR),
        applicable_to_entity_types CLOB,
        valid_for_start TIMESTAMP(6) WITH TIME ZONE,
        valid_for_end TIMESTAMP(6) WITH TIME ZONE,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      
      CREATE TABLE tmf_characteristic_group_catalog (
        id VARCHAR2(36 CHAR) PRIMARY KEY,
        name VARCHAR2(255 CHAR) NOT NULL UNIQUE,
        description VARCHAR2(4000 CHAR),
        applicable_to_entity_types CLOB,
        allowed_characteristics CLOB,
        created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );


  ALTER TABLE tmf_physical_resource ADD place_id VARCHAR2(36 CHAR);
  ALTER TABLE tmf_physical_resource ADD place_type VARCHAR2(255 CHAR);
  ALTER TABLE tmf_physical_resource ADD administrative_state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_physical_resource ADD operational_state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_physical_resource ADD usage_state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_physical_resource ADD serving_site_id VARCHAR2(36 CHAR);
  CREATE INDEX idx_tmf_physical_resource_serving_site ON tmf_physical_resource(serving_site_id);
  ALTER TABLE tmf_resource_specification ADD related_party CLOB;
  ALTER TABLE tmf_logical_resource ADD place_id VARCHAR2(36 CHAR);
  ALTER TABLE tmf_logical_resource ADD place_type VARCHAR2(255 CHAR);
  ALTER TABLE tmf_logical_resource ADD related_party CLOB;
  ALTER TABLE tmf_logical_resource ADD serving_site_id VARCHAR2(36 CHAR);
  CREATE INDEX idx_tmf_logical_resource_serving_site ON tmf_logical_resource(serving_site_id);
  ALTER TABLE tmf_logical_resource ADD administrative_state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_logical_resource ADD operational_state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_logical_resource ADD usage_state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD service_type VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD category VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD service_date VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD start_date VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD end_date VARCHAR2(255 CHAR);
  ALTER TABLE tmf_customer_facing_service ADD is_service_enabled NUMBER(10);
  ALTER TABLE tmf_customer_facing_service ADD has_started NUMBER(10);
  ALTER TABLE tmf_customer_facing_service ADD place CLOB;
  ALTER TABLE tmf_customer_facing_service ADD related_party CLOB;
  ALTER TABLE tmf_customer_facing_service ADD supporting_services CLOB;
  ALTER TABLE tmf_customer_facing_service ADD service_relationships CLOB;
  ALTER TABLE tmf_resource_facing_service ADD state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_facing_service ADD service_type VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_facing_service ADD category VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_facing_service ADD service_date VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_facing_service ADD start_date VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_facing_service ADD end_date VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_facing_service ADD is_service_enabled NUMBER(10);
  ALTER TABLE tmf_resource_facing_service ADD has_started NUMBER(10);
  ALTER TABLE tmf_resource_facing_service ADD place CLOB;
  ALTER TABLE tmf_resource_facing_service ADD related_party CLOB;
  ALTER TABLE tmf_resource_facing_service ADD supporting_resources CLOB;
  ALTER TABLE tmf_resource_facing_service ADD supporting_services CLOB;
  ALTER TABLE tmf_resource_facing_service ADD service_relationships CLOB;
  ALTER TABLE tmf_service_qualification ADD state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_service_qualification ADD place CLOB;
  ALTER TABLE tmf_service_qualification ADD related_party CLOB;
  ALTER TABLE tmf_service_qualification ADD service_characteristic CLOB;
  ALTER TABLE tmf_service_qualification ADD service_qualification_item CLOB;
  ALTER TABLE tmf_service_order ADD state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_service_order ADD description VARCHAR2(4000 CHAR);
  ALTER TABLE tmf_service_order ADD related_party CLOB;
  ALTER TABLE tmf_service_order ADD service_order_item CLOB;
  ALTER TABLE tmf_service_order ADD note CLOB;
  ALTER TABLE tmf_resource_order ADD state VARCHAR2(255 CHAR);
  ALTER TABLE tmf_resource_order ADD description VARCHAR2(4000 CHAR);
  ALTER TABLE tmf_resource_order ADD related_party CLOB;
  ALTER TABLE tmf_resource_order ADD resource_order_item CLOB;
  ALTER TABLE tmf_resource_order ADD note CLOB;
  ALTER TABLE tmf_geographic_site_specification ADD code VARCHAR2(255 CHAR);
  ALTER TABLE tmf_geographic_site_specification ADD lifecycle_status VARCHAR2(255 CHAR);
  ALTER TABLE tmf_geographic_site_specification ADD is_bootstrap NUMBER(10) DEFAULT 0;
  CREATE INDEX idx_tmf_geographic_site_specification_code ON tmf_geographic_site_specification(code);
  CREATE INDEX idx_tmf_geographic_site_specification_lifecycle ON tmf_geographic_site_specification(lifecycle_status);
  CREATE TABLE tmf_geographic_site_spec_containment_rule (
    parent_spec_id VARCHAR2(36 CHAR) NOT NULL,
    child_spec_id VARCHAR2(36 CHAR) NOT NULL,
    valid_for_start TIMESTAMP(6) WITH TIME ZONE,
    valid_for_end TIMESTAMP(6) WITH TIME ZONE,
    is_protected NUMBER(10) NOT NULL DEFAULT 0,
    PRIMARY KEY (parent_spec_id, child_spec_id),
    FOREIGN KEY (parent_spec_id) REFERENCES tmf_geographic_site_specification(id),
    FOREIGN KEY (child_spec_id) REFERENCES tmf_geographic_site_specification(id)
  );
  CREATE INDEX idx_tmf_geo_spec_containment_parent ON tmf_geographic_site_spec_containment_rule(parent_spec_id, child_spec_id);
  CREATE INDEX idx_tmf_geo_spec_containment_child ON tmf_geographic_site_spec_containment_rule(child_spec_id, parent_spec_id);

  ALTER TABLE tmf_geographic_location ADD tenant_id VARCHAR2(36 CHAR) NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_geographic_address ADD tenant_id VARCHAR2(36 CHAR) NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_geographic_site ADD tenant_id VARCHAR2(36 CHAR) NOT NULL DEFAULT 'default';
  ALTER TABLE tmf_geographic_site ADD status_date TIMESTAMP(6) WITH TIME ZONE;
  ALTER TABLE tmf_geographic_site ADD status_reason VARCHAR2(255 CHAR);
  ALTER TABLE tmf_geographic_site ADD site_addresses CLOB;
  ALTER TABLE tmf_geographic_site DROP CONSTRAINT tmf_geographic_site_status_check;
  UPDATE tmf_geographic_site SET status = 'Planned' WHERE status = 'planned';
  UPDATE tmf_geographic_site SET status = 'Active' WHERE status = 'active';
  UPDATE tmf_geographic_site SET status = 'InDeactivation' WHERE status = 'suspended';
  UPDATE tmf_geographic_site SET status = 'Retired' WHERE status = 'terminated';
  ALTER TABLE tmf_geographic_site
    ADD CONSTRAINT tmf_geographic_site_status_check
    CHECK(status IN ('Planned', 'InConstruction', 'Active', 'InDeactivation', 'Retired'));
  CREATE INDEX idx_tmf_geographic_location_tenant ON tmf_geographic_location(tenant_id);
  CREATE INDEX idx_tmf_geographic_address_tenant ON tmf_geographic_address(tenant_id);
  CREATE INDEX idx_tmf_geographic_site_tenant ON tmf_geographic_site(tenant_id);
  CREATE INDEX idx_tmf_geographic_site_tenant_status ON tmf_geographic_site(tenant_id, status);

  CREATE TABLE tmf_geographic_site_status_history (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    site_id VARCHAR2(36 CHAR) NOT NULL,
    tenant_id VARCHAR2(36 CHAR) NOT NULL,
    from_status VARCHAR2(255 CHAR),
    to_status VARCHAR2(255 CHAR) NOT NULL,
    status_date TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    status_reason VARCHAR2(255 CHAR),
    actor_sub VARCHAR2(255 CHAR) NOT NULL,
    trace_id VARCHAR2(36 CHAR) NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES tmf_geographic_site(id)
  );
  CREATE INDEX idx_tmf_geo_site_history_site ON tmf_geographic_site_status_history(site_id, status_date DESC);
  CREATE INDEX idx_tmf_geo_site_history_tenant ON tmf_geographic_site_status_history(tenant_id);

  CREATE TABLE tmf_geographic_relationship_type (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    href VARCHAR2(4000 CHAR) NOT NULL,
    code VARCHAR2(255 CHAR) NOT NULL UNIQUE,
    name VARCHAR2(255 CHAR) NOT NULL,
    inverse_code VARCHAR2(255 CHAR) NOT NULL,
    is_symmetric NUMBER(10) NOT NULL DEFAULT 0,
    allowed_source_categories CLOB,
    allowed_target_categories CLOB,
    cardinality VARCHAR2(255 CHAR),
    lifecycle_status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'Active' CHECK(lifecycle_status IN ('Active', 'Retired')),
    is_bootstrap NUMBER(10) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_tmf_geographic_relationship_type_code ON tmf_geographic_relationship_type(code);
  CREATE INDEX idx_tmf_geographic_relationship_type_lifecycle ON tmf_geographic_relationship_type(lifecycle_status);

  CREATE TABLE tmf_audit_log (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    tenant_id VARCHAR2(36 CHAR) NOT NULL,
    actor_sub VARCHAR2(255 CHAR) NOT NULL,
    action VARCHAR2(255 CHAR) NOT NULL,
    entity_type VARCHAR2(255 CHAR) NOT NULL,
    entity_id VARCHAR2(36 CHAR) NOT NULL,
    event_time TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    before_state CLOB,
    after_state CLOB,
    trace_id VARCHAR2(36 CHAR) NOT NULL,
    source_ip VARCHAR2(255 CHAR),
    created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_tmf_audit_log_entity ON tmf_audit_log(entity_type, entity_id, event_time DESC);
  CREATE INDEX idx_tmf_audit_log_tenant ON tmf_audit_log(tenant_id, event_time DESC);
  CREATE INDEX idx_tmf_audit_log_trace ON tmf_audit_log(trace_id);

  CREATE TABLE tmf_outbox (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    tenant_id VARCHAR2(36 CHAR) NOT NULL,
    event_id VARCHAR2(36 CHAR) NOT NULL,
    topic VARCHAR2(255 CHAR) NOT NULL,
    payload CLOB NOT NULL,
    status VARCHAR2(255 CHAR) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    published_at TIMESTAMP(6) WITH TIME ZONE
  );
  CREATE INDEX idx_tmf_outbox_status_created ON tmf_outbox(status, created_at);
  CREATE INDEX idx_tmf_outbox_tenant ON tmf_outbox(tenant_id);

  CREATE TABLE tmf_geo_bulk_job (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    tenant_id VARCHAR2(36 CHAR) NOT NULL,
    target VARCHAR2(255 CHAR) NOT NULL CHECK(target IN ('Address', 'Site')),
    mode VARCHAR2(255 CHAR) NOT NULL CHECK(mode IN ('validateOnly', 'atomic', 'bestEffort')),
    idempotency_key VARCHAR2(255 CHAR) NOT NULL,
    status VARCHAR2(255 CHAR) NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
    submitted_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    started_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP(6) WITH TIME ZONE,
    total NUMBER(10) NOT NULL,
    success_count NUMBER(10) NOT NULL DEFAULT 0,
    error_count NUMBER(10) NOT NULL DEFAULT 0,
    warning_count NUMBER(10) NOT NULL DEFAULT 0,
    actor_sub VARCHAR2(255 CHAR) NOT NULL,
    trace_id VARCHAR2(36 CHAR) NOT NULL,
    UNIQUE(tenant_id, target, idempotency_key)
  );
  CREATE INDEX idx_tmf_geo_bulk_job_tenant_status ON tmf_geo_bulk_job(tenant_id, status, submitted_at DESC);

  CREATE TABLE tmf_geo_bulk_job_result (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    job_id VARCHAR2(36 CHAR) NOT NULL,
    tenant_id VARCHAR2(36 CHAR) NOT NULL,
    item_index NUMBER(10) NOT NULL,
    status VARCHAR2(255 CHAR) NOT NULL CHECK(status IN ('validated', 'created', 'reused', 'failed')),
    entity_id VARCHAR2(36 CHAR),
    legacy_system VARCHAR2(255 CHAR),
    legacy_entity VARCHAR2(255 CHAR),
    legacy_id VARCHAR2(36 CHAR),
    error_code VARCHAR2(255 CHAR),
    message VARCHAR2(4000 CHAR),
    warnings CLOB,
    created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, item_index),
    FOREIGN KEY (job_id) REFERENCES tmf_geo_bulk_job(id)
  );
  CREATE INDEX idx_tmf_geo_bulk_job_result_job ON tmf_geo_bulk_job_result(job_id, item_index);
  CREATE INDEX idx_tmf_geo_bulk_job_result_tenant ON tmf_geo_bulk_job_result(tenant_id);

  
  
  
  CREATE INDEX idx_tmf_physical_resource_place ON tmf_physical_resource(place_id);
  CREATE INDEX idx_tmf_physical_resource_type ON tmf_physical_resource(resource_type);
  CREATE INDEX idx_tmf_physical_resource_name ON tmf_physical_resource(name);
  CREATE INDEX idx_tmf_logical_resource_place ON tmf_logical_resource(place_id);
  CREATE INDEX idx_tmf_logical_resource_type ON tmf_logical_resource(resource_type);
  CREATE INDEX idx_tmf_logical_resource_name ON tmf_logical_resource(name);

  
  
  
  
  CREATE INDEX idx_tmf_geographic_location_point_lnglat
    ON tmf_geographic_location (
      JSON_VALUE(geometry, '$.coordinates[0]' RETURNING NUMBER),
      JSON_VALUE(geometry, '$.coordinates[1]' RETURNING NUMBER)
    ) WHERE geometry_type = 'Point';

ALTER TABLE searches ADD CONSTRAINT ck_nexus_json_1 CHECK (filters IS JSON);
ALTER TABLE searches ADD CONSTRAINT ck_nexus_json_2 CHECK (results IS JSON);
ALTER TABLE tmf_geographic_location ADD CONSTRAINT ck_nexus_json_3 CHECK (characteristics IS JSON);
ALTER TABLE tmf_geographic_location ADD CONSTRAINT ck_nexus_json_4 CHECK (geometry IS JSON);
ALTER TABLE tmf_geographic_address ADD CONSTRAINT ck_nexus_json_5 CHECK (characteristics IS JSON);
ALTER TABLE tmf_geographic_site_specification ADD CONSTRAINT ck_nexus_json_6 CHECK (allowed_child_spec_ids IS JSON);
ALTER TABLE tmf_geographic_site_specification ADD CONSTRAINT ck_nexus_json_7 CHECK (allowed_parent_spec_ids IS JSON);
ALTER TABLE tmf_geographic_site_specification ADD CONSTRAINT ck_nexus_json_8 CHECK (characteristics IS JSON);
ALTER TABLE tmf_geographic_site ADD CONSTRAINT ck_nexus_json_9 CHECK (characteristics IS JSON);
ALTER TABLE tmf_geographic_site ADD CONSTRAINT ck_nexus_json_10 CHECK (related_party IS JSON);
ALTER TABLE tmf_geographic_site ADD CONSTRAINT ck_nexus_json_11 CHECK (site_addresses IS JSON);
ALTER TABLE tmf_geographic_relationship_type ADD CONSTRAINT ck_nexus_json_12 CHECK (allowed_source_categories IS JSON);
ALTER TABLE tmf_geographic_relationship_type ADD CONSTRAINT ck_nexus_json_13 CHECK (allowed_target_categories IS JSON);
ALTER TABLE tmf_resource_specification ADD CONSTRAINT ck_nexus_json_14 CHECK (characteristics IS JSON);
ALTER TABLE tmf_resource_specification ADD CONSTRAINT ck_nexus_json_15 CHECK (related_party IS JSON);
ALTER TABLE tmf_resource_function_specification ADD CONSTRAINT ck_nexus_json_16 CHECK (characteristics IS JSON);
ALTER TABLE tmf_physical_resource ADD CONSTRAINT ck_nexus_json_17 CHECK (characteristics IS JSON);
ALTER TABLE tmf_physical_resource ADD CONSTRAINT ck_nexus_json_18 CHECK (related_party IS JSON);
ALTER TABLE tmf_logical_resource ADD CONSTRAINT ck_nexus_json_19 CHECK (characteristics IS JSON);
ALTER TABLE tmf_service_specification ADD CONSTRAINT ck_nexus_json_20 CHECK (characteristics IS JSON);
ALTER TABLE tmf_service_category ADD CONSTRAINT ck_nexus_json_21 CHECK (characteristics IS JSON);
ALTER TABLE tmf_service_candidate ADD CONSTRAINT ck_nexus_json_22 CHECK (characteristics IS JSON);
ALTER TABLE tmf_resource_facing_service ADD CONSTRAINT ck_nexus_json_23 CHECK (characteristics IS JSON);
ALTER TABLE tmf_resource_facing_service ADD CONSTRAINT ck_nexus_json_24 CHECK (place IS JSON);
ALTER TABLE tmf_resource_facing_service ADD CONSTRAINT ck_nexus_json_25 CHECK (related_party IS JSON);
ALTER TABLE tmf_resource_facing_service ADD CONSTRAINT ck_nexus_json_26 CHECK (service_relationships IS JSON);
ALTER TABLE tmf_resource_facing_service ADD CONSTRAINT ck_nexus_json_27 CHECK (supporting_resources IS JSON);
ALTER TABLE tmf_resource_facing_service ADD CONSTRAINT ck_nexus_json_28 CHECK (supporting_services IS JSON);
ALTER TABLE tmf_customer_facing_service ADD CONSTRAINT ck_nexus_json_29 CHECK (characteristics IS JSON);
ALTER TABLE tmf_customer_facing_service ADD CONSTRAINT ck_nexus_json_30 CHECK (place IS JSON);
ALTER TABLE tmf_customer_facing_service ADD CONSTRAINT ck_nexus_json_31 CHECK (related_party IS JSON);
ALTER TABLE tmf_customer_facing_service ADD CONSTRAINT ck_nexus_json_32 CHECK (service_relationships IS JSON);
ALTER TABLE tmf_customer_facing_service ADD CONSTRAINT ck_nexus_json_33 CHECK (supporting_services IS JSON);
ALTER TABLE tmf_service_qualification ADD CONSTRAINT ck_nexus_json_34 CHECK (place IS JSON);
ALTER TABLE tmf_service_qualification ADD CONSTRAINT ck_nexus_json_35 CHECK (related_party IS JSON);
ALTER TABLE tmf_service_qualification ADD CONSTRAINT ck_nexus_json_36 CHECK (service_characteristic IS JSON);
ALTER TABLE tmf_service_qualification ADD CONSTRAINT ck_nexus_json_37 CHECK (service_qualification_item IS JSON);
ALTER TABLE tmf_service_order ADD CONSTRAINT ck_nexus_json_38 CHECK (note IS JSON);
ALTER TABLE tmf_service_order ADD CONSTRAINT ck_nexus_json_39 CHECK (related_party IS JSON);
ALTER TABLE tmf_service_order ADD CONSTRAINT ck_nexus_json_40 CHECK (service_order_item IS JSON);
ALTER TABLE tmf_resource_order ADD CONSTRAINT ck_nexus_json_41 CHECK (note IS JSON);
ALTER TABLE tmf_resource_order ADD CONSTRAINT ck_nexus_json_42 CHECK (related_party IS JSON);
ALTER TABLE tmf_resource_order ADD CONSTRAINT ck_nexus_json_43 CHECK (resource_order_item IS JSON);
ALTER TABLE tmf_party ADD CONSTRAINT ck_nexus_json_44 CHECK (characteristics IS JSON);
ALTER TABLE tmf_party_role ADD CONSTRAINT ck_nexus_json_45 CHECK (characteristics IS JSON);
ALTER TABLE tmf_event ADD CONSTRAINT ck_nexus_json_46 CHECK (event_data IS JSON);
ALTER TABLE tmf_audit_log ADD CONSTRAINT ck_nexus_json_47 CHECK (after_state IS JSON);
ALTER TABLE tmf_audit_log ADD CONSTRAINT ck_nexus_json_48 CHECK (before_state IS JSON);
ALTER TABLE tmf_outbox ADD CONSTRAINT ck_nexus_json_49 CHECK (payload IS JSON);
ALTER TABLE tmf_geo_bulk_job_result ADD CONSTRAINT ck_nexus_json_50 CHECK (warnings IS JSON);
ALTER TABLE research_session ADD CONSTRAINT ck_nexus_json_51 CHECK (context IS JSON);
ALTER TABLE research_message ADD CONSTRAINT ck_nexus_json_52 CHECK (metadata IS JSON);
ALTER TABLE mcp_confirmation ADD CONSTRAINT ck_nexus_json_53 CHECK (context IS JSON);
ALTER TABLE mcp_confirmation ADD CONSTRAINT ck_nexus_json_54 CHECK (payload IS JSON);
ALTER TABLE mcp_confirmation ADD CONSTRAINT ck_nexus_json_55 CHECK (warnings IS JSON);
ALTER TABLE tmf_relationship_type_catalog ADD CONSTRAINT ck_nexus_json_56 CHECK (applicable_to_entity_types IS JSON);
ALTER TABLE tmf_characteristic_group_catalog ADD CONSTRAINT ck_nexus_json_57 CHECK (allowed_characteristics IS JSON);
ALTER TABLE tmf_characteristic_group_catalog ADD CONSTRAINT ck_nexus_json_58 CHECK (applicable_to_entity_types IS JSON);
CREATE TABLE schema_migrations (version NUMBER(10) PRIMARY KEY, name VARCHAR2(255 CHAR) NOT NULL, checksum VARCHAR2(255 CHAR) NOT NULL, applied_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL);
