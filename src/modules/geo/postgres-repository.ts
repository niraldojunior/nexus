import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import type {
  GeographicAddress,
  GeoEvent,
  GeographicLocation,
  GeographicSite,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
} from './domain.js';
import type { IGeoRepository } from './geo-repository-interface.js';

export class PostgresGeoRepository implements IGeoRepository {
  constructor(private db: PostgresDatabase) {}

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }

  // Geographic Locations
  public upsertLocation(location: GeographicLocation): GeographicLocation {
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO tmf_geographic_location 
       (id, href, geometry_type, geometry, spatial_ref, accuracy, reference_point, 
        valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       geometry_type = excluded.geometry_type,
       geometry = excluded.geometry,
       spatial_ref = excluded.spatial_ref,
       accuracy = excluded.accuracy,
       reference_point = excluded.reference_point,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        location.id,
        location.href,
        location.geometryType,
        JSON.stringify(location.geometry),
        location.spatialRef,
        location.accuracy || null,
        location.referencePoint || null,
        location.validFor?.startDateTime || null,
        location.validFor?.endDateTime || null,
        JSON.stringify(location.characteristic),
        now,
        now,
      ],
    );

    return this.getLocation(location.id)!;
  }

  public getLocation(id: string): GeographicLocation | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, geometry_type, geometry, spatial_ref, accuracy, reference_point,
              valid_for_start, valid_for_end, characteristics
       FROM tmf_geographic_location WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    const result: GeographicLocation = {
      '@type': 'GeographicLocation',
      id: row.id,
      href: row.href,
      geometryType: row.geometry_type,
      geometry: JSON.parse(row.geometry),
      spatialRef: row.spatial_ref,
      characteristic: JSON.parse(row.characteristics || '[]'),
    };

    if (row.accuracy) result.accuracy = row.accuracy;
    if (row.reference_point) result.referencePoint = row.reference_point;
    if (row.valid_for_start || row.valid_for_end) {
      result.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }

    return result;
  }

  public listLocations(): GeographicLocation[] {
    const rows = this.db.all<any>(
      `SELECT id, href, geometry_type, geometry, spatial_ref, accuracy, reference_point,
              valid_for_start, valid_for_end, characteristics
       FROM tmf_geographic_location`,
    );

    return rows.map((row: any) => {
      const result: GeographicLocation = {
        '@type': 'GeographicLocation',
        id: row.id,
        href: row.href,
        geometryType: row.geometry_type,
        geometry: JSON.parse(row.geometry),
        spatialRef: row.spatial_ref,
        characteristic: JSON.parse(row.characteristics || '[]'),
      };

      if (row.accuracy) result.accuracy = row.accuracy;
      if (row.reference_point) result.referencePoint = row.reference_point;
      if (row.valid_for_start || row.valid_for_end) {
        result.validFor = {
          ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
          ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
        };
      }

      return result;
    });
  }

  // Geographic Addresses
  public upsertAddress(address: GeographicAddress): GeographicAddress {
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO tmf_geographic_address
       (id, href, street_type, street_name, street_nr, city, state_or_province, postcode, country,
        geographic_location_id, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       street_type = excluded.street_type,
       street_name = excluded.street_name,
       street_nr = excluded.street_nr,
       city = excluded.city,
       state_or_province = excluded.state_or_province,
       postcode = excluded.postcode,
       country = excluded.country,
       geographic_location_id = excluded.geographic_location_id,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        address.id,
        address.href,
        null,
        address.street,
        address.streetNr || null,
        address.city || null,
        address.stateOrProvince || null,
        address.postcode || null,
        address.country || null,
        address.geographicLocationId || null,
        JSON.stringify(address.characteristic),
        now,
        now,
      ],
    );

    return this.getAddress(address.id)!;
  }

  public getAddress(id: string): GeographicAddress | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, street_type, street_name, street_nr, city, state_or_province, postcode, country,
              geographic_location_id, characteristics
       FROM tmf_geographic_address WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    const result: GeographicAddress = {
      '@type': 'GeographicAddress',
      id: row.id,
      href: row.href,
      street: row.street_name,
      characteristic: JSON.parse(row.characteristics || '[]'),
    };

    if (row.street_nr) result.streetNr = row.street_nr;
    if (row.city) result.city = row.city;
    if (row.state_or_province) result.stateOrProvince = row.state_or_province;
    if (row.postcode) result.postcode = row.postcode;
    if (row.country) result.country = row.country;
    if (row.geographic_location_id) {
      result.geographicLocationId = row.geographic_location_id;
      result.place = {
        id: row.geographic_location_id,
        '@referredType': 'GeographicLocation',
      };
    }

    return result;
  }

  public listAddresses(): GeographicAddress[] {
    const rows = this.db.all<any>(
      `SELECT id, href, street_type, street_name, street_nr, city, state_or_province, postcode, country,
              geographic_location_id, characteristics
       FROM tmf_geographic_address`,
    );

    return rows.map((row: any) => {
      const result: GeographicAddress = {
        '@type': 'GeographicAddress',
        id: row.id,
        href: row.href,
        street: row.street_name,
        characteristic: JSON.parse(row.characteristics || '[]'),
      }
      if (row.street_nr) result.streetNr = row.street_nr;
      if (row.city) result.city = row.city;
      if (row.state_or_province) result.stateOrProvince = row.state_or_province;
      if (row.postcode) result.postcode = row.postcode;
      if (row.country) result.country = row.country;
      if (row.geographic_location_id) {
        result.geographicLocationId = row.geographic_location_id;
        result.place = {
          id: row.geographic_location_id,
          '@referredType': 'GeographicLocation',
        };
      }

      return result;
    });
  }

  // Geographic Site Specifications
  public upsertSpec(spec: GeographicSiteSpecification): GeographicSiteSpecification {
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO tmf_geographic_site_specification
       (id, href, name, category, allowed_parent_spec_ids, allowed_child_spec_ids,
        characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       category = excluded.category,
       allowed_parent_spec_ids = excluded.allowed_parent_spec_ids,
       allowed_child_spec_ids = excluded.allowed_child_spec_ids,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.href,
        spec.name,
        spec.category,
        JSON.stringify(spec.allowedParentSpecIds),
        JSON.stringify(spec.allowedChildSpecIds),
        JSON.stringify(spec.specCharacteristic),
        now,
        now,
      ],
    );

    return this.getSpec(spec.id)!;
  }

  public getSpec(id: string): GeographicSiteSpecification | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, name, category, allowed_parent_spec_ids, allowed_child_spec_ids,
              characteristics
       FROM tmf_geographic_site_specification WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    return {
      '@type': 'GeographicSiteSpecification',
      id: row.id,
      href: row.href,
      name: row.name,
      category: row.category,
      allowedParentSpecIds: JSON.parse(row.allowed_parent_spec_ids || '[]'),
      allowedChildSpecIds: JSON.parse(row.allowed_child_spec_ids || '[]'),
      specCharacteristic: JSON.parse(row.characteristics || '[]'),
    };
  }

  public listSpecs(): GeographicSiteSpecification[] {
    const rows = this.db.all<any>(
      `SELECT id, href, name, category, allowed_parent_spec_ids, allowed_child_spec_ids,
              characteristics
       FROM tmf_geographic_site_specification`,
    );

    return rows.map((row) => ({
      '@type': 'GeographicSiteSpecification',
      id: row.id,
      href: row.href,
      name: row.name,
      category: row.category,
      allowedParentSpecIds: JSON.parse(row.allowed_parent_spec_ids || '[]'),
      allowedChildSpecIds: JSON.parse(row.allowed_child_spec_ids || '[]'),
      specCharacteristic: JSON.parse(row.characteristics || '[]'),
    }));
  }

  // Geographic Sites
  public upsertSite(site: GeographicSite): GeographicSite {
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO tmf_geographic_site
       (id, href, name, status, site_specification_id, geographic_location_id,
        geographic_address_id, parent_site_id, related_party,
        characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       status = excluded.status,
       site_specification_id = excluded.site_specification_id,
       geographic_location_id = excluded.geographic_location_id,
       geographic_address_id = excluded.geographic_address_id,
       parent_site_id = excluded.parent_site_id,
       related_party = excluded.related_party,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        site.id,
        site.href,
        site.name,
        site.status,
        site.siteSpecificationId,
        site.place?.id || null,
        site.address?.id || null,
        site.parentSite?.id || null,
        JSON.stringify(site.relatedParty),
        JSON.stringify(site.characteristic),
        now,
        now,
      ],
    );

    return this.getSite(site.id)!;
  }

  public getSite(id: string): GeographicSite | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, name, status, site_specification_id, geographic_location_id,
              geographic_address_id, parent_site_id, related_party, characteristics
       FROM tmf_geographic_site WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    const result: GeographicSite = {
      '@type': 'GeographicSite',
      id: row.id,
      href: row.href,
      name: row.name,
      status: row.status,
      siteSpecificationId: row.site_specification_id,
      siteSpecification: {
        id: row.site_specification_id,
        '@referredType': 'GeographicSiteSpecification',
      },
      relatedSite: [],
      relatedParty: JSON.parse(row.related_party || '[]'),
      characteristic: JSON.parse(row.characteristics || '[]'),
    };

    if (row.geographic_location_id) {
      result.place = {
        id: row.geographic_location_id,
        '@referredType': 'GeographicLocation',
      };
    }
    if (row.geographic_address_id) {
      result.address = {
        id: row.geographic_address_id,
        '@referredType': 'GeographicAddress',
      };
    }
    if (row.parent_site_id) {
      result.parentSite = {
        id: row.parent_site_id,
        '@referredType': 'GeographicSite',
      };
    }

    result.relatedSite = this.listSiteRelationships(row.id);

    return result;
  }

  public listSites(): GeographicSite[] {
    const rows = this.db.all<any>(
      `SELECT id, href, name, status, site_specification_id, geographic_location_id,
              geographic_address_id, parent_site_id, related_party, characteristics
       FROM tmf_geographic_site`,
    );

    return rows.map((row: any) => {
      const result: GeographicSite = {
        '@type': 'GeographicSite',
        id: row.id,
        href: row.href,
        name: row.name,
        status: row.status,
        siteSpecificationId: row.site_specification_id,
        siteSpecification: {
          id: row.site_specification_id,
          '@referredType': 'GeographicSiteSpecification',
        },
        relatedSite: this.listSiteRelationships(row.id),
        relatedParty: JSON.parse(row.related_party || '[]'),
        characteristic: JSON.parse(row.characteristics || '[]'),
      };

      if (row.geographic_location_id) {
        result.place = {
          id: row.geographic_location_id,
          '@referredType': 'GeographicLocation',
        };
      }
      if (row.geographic_address_id) {
        result.address = {
          id: row.geographic_address_id,
          '@referredType': 'GeographicAddress',
        };
      }
      if (row.parent_site_id) {
        result.parentSite = {
          id: row.parent_site_id,
          '@referredType': 'GeographicSite',
        };
      }

      return result;
    });
  }

  public upsertSiteRelationship(siteId: string, relationship: GeographicSiteRelationship): GeographicSiteRelationship {
    this.db.run(
      `INSERT INTO tmf_geographic_site_relationship
       (site_from_id, site_to_id, relationship_type, valid_for_start, valid_for_end)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(site_from_id, site_to_id, relationship_type) DO UPDATE SET
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end`,
      [
        siteId,
        relationship.id,
        relationship.relationshipType,
        relationship.validFor?.startDateTime || null,
        relationship.validFor?.endDateTime || null,
      ],
    );

    return relationship;
  }

  public deleteSiteRelationship(siteId: string, relatedSiteId: string, relationshipType: string): boolean {
    const result = this.db.run(
      `DELETE FROM tmf_geographic_site_relationship
       WHERE site_from_id = ? AND site_to_id = ? AND relationship_type = ?`,
      [siteId, relatedSiteId, relationshipType],
    );
    return result.changes > 0;
  }

  public listSiteRelationships(siteId: string): GeographicSiteRelationship[] {
    const rows = this.db.all<any>(
      `SELECT site_to_id, relationship_type, valid_for_start, valid_for_end
       FROM tmf_geographic_site_relationship
       WHERE site_from_id = ?
       ORDER BY relationship_type, site_to_id`,
      [siteId],
    );

    return rows.map((row) => {
      const relationship: GeographicSiteRelationship = {
        id: row.site_to_id,
        relationshipType: row.relationship_type,
        '@referredType': 'GeographicSite',
      };

      if (row.valid_for_start || row.valid_for_end) {
        relationship.validFor = {
          ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
          ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
        };
      }

      return relationship;
    });
  }

  public appendEvent(event: GeoEvent): GeoEvent {
    this.db.run(
      `INSERT INTO tmf_event (id, event_type, event_time, source, event_data, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.eventType,
        event.eventTime,
        event.source,
        JSON.stringify(event.eventData),
        event.correlationId || null,
      ],
    );

    return event;
  }

  public listEventsForEntity(entityId: string): GeoEvent[] {
    const rows = this.db.all<any>(
      `SELECT id, event_type, event_time, source, event_data, correlation_id
       FROM tmf_event
       WHERE json_extract(event_data, '$.entityId') = ?
       ORDER BY event_time DESC`,
      [entityId],
    );

    return rows.map((row) => {
      const event: GeoEvent = {
        '@type': 'Event',
        id: row.id,
        eventType: row.event_type,
        eventTime: row.event_time,
        source: row.source,
        eventData: JSON.parse(row.event_data || '{}'),
      };

      if (row.correlation_id) event.correlationId = row.correlation_id;
      return event;
    });
  }
}
