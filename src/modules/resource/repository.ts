import type {
  LogicalResource,
  PhysicalResource,
  ResourceCategory,
  Resource,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
  ResourceType,
  ResourceLayer,
  ResourceSpecification,
  ResourceSpecificationQuery,
  PhysicalResourceDetail,
  ResourceAuditEntry,
  ResourceStatusCatalogEntry,
  ResourcePortDetail,
  ResourcePortsView,
} from './domain.js';
import type { IResourceRepository } from './resource-repository-interface.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES } from './catalog.js';
import { RESOURCE_STATUS_DEFAULTS } from './status-catalog.js';
import { buildHref } from '../../shared/tmf/index.js';

export class ResourceRepository implements IResourceRepository {
  private readonly resourceCategories = new Map<string, ResourceCategory>();
  private readonly resourceTypes = new Map<string, ResourceType>();
  private readonly resourceLayers = new Map<string, ResourceLayer>([
    [
      'resource-layer-infrastructure',
      {
        '@type': 'ResourceLayer',
        id: 'resource-layer-infrastructure',
        href: buildHref('resourceLayer', 'resource-layer-infrastructure'),
        code: 'infrastructure',
        name: 'Infraestrutura',
        status: 'active',
        tenantId: 'default',
      },
    ],
    [
      'resource-layer-gpon-network',
      {
        '@type': 'ResourceLayer',
        id: 'resource-layer-gpon-network',
        href: buildHref('resourceLayer', 'resource-layer-gpon-network'),
        code: 'gpon_network',
        name: 'Rede GPON',
        status: 'active',
        tenantId: 'default',
      },
    ],
  ]);
  private readonly resourceSpecifications = new Map<string, ResourceSpecification>();
  private readonly resourceFunctionSpecifications = new Map<
    string,
    ResourceFunctionSpecification
  >();
  private readonly physicalResources = new Map<string, PhysicalResource>();
  private readonly logicalResources = new Map<string, LogicalResource>();
  private readonly relationships = new Map<string, ResourceRelationship[]>();

  public constructor() {
    for (const category of RESOURCE_CATEGORIES) {
      this.resourceCategories.set(category.code, cloneResourceCategory(category));
    }
    for (const type of RESOURCE_TYPES) {
      this.resourceTypes.set(type.code, cloneResourceType(type));
    }
  }

  public transaction<T>(fn: () => T): T {
    return fn();
  }

  private readonly categoryOfSpec = (specId: string): string | undefined =>
    this.resourceSpecifications.get(specId)?.category;

  public upsertResourceSpecification(spec: ResourceSpecification): ResourceSpecification {
    const stored = cloneResourceSpecification(spec);
    this.resourceSpecifications.set(stored.id, stored);
    return cloneResourceSpecification(stored);
  }

  public getResourceSpecification(id: string): ResourceSpecification | undefined {
    const spec = this.resourceSpecifications.get(id);
    return spec ? cloneResourceSpecification(spec) : undefined;
  }

  public listResourceSpecifications(query?: ResourceSpecificationQuery): ResourceSpecification[] {
    return [...this.resourceSpecifications.values()]
      .filter((spec) => filterSpec(spec, query))
      .map(cloneResourceSpecification);
  }

  public upsertResourceFunctionSpecification(
    spec: ResourceFunctionSpecification,
  ): ResourceFunctionSpecification {
    const stored = cloneResourceFunctionSpecification(spec);
    this.resourceFunctionSpecifications.set(stored.id, stored);
    return cloneResourceFunctionSpecification(stored);
  }

  public getResourceFunctionSpecification(id: string): ResourceFunctionSpecification | undefined {
    const spec = this.resourceFunctionSpecifications.get(id);
    return spec ? cloneResourceFunctionSpecification(spec) : undefined;
  }

  public listResourceFunctionSpecifications(
    query?: ResourceFunctionSpecificationQuery,
  ): ResourceFunctionSpecification[] {
    return [...this.resourceFunctionSpecifications.values()]
      .filter((spec) => filterFunctionSpec(spec, query))
      .map(cloneResourceFunctionSpecification);
  }

  public getResourceCategory(code: string): ResourceCategory | undefined {
    const category = this.resourceCategories.get(code);
    return category ? cloneResourceCategory(category) : undefined;
  }

  public listResourceCategories(): ResourceCategory[] {
    return [...this.resourceCategories.values()].map(cloneResourceCategory);
  }

  public getResourceType(code: string): ResourceType | undefined {
    const type = this.resourceTypes.get(code);
    return type ? cloneResourceType(type) : undefined;
  }

  public listResourceTypes(): ResourceType[] {
    return [...this.resourceTypes.values()].map(cloneResourceType);
  }

  public upsertResourceLayer(layer: ResourceLayer): ResourceLayer {
    const stored = { ...layer };
    this.resourceLayers.set(stored.id, stored);
    return { ...stored };
  }

  public getResourceLayer(id: string): ResourceLayer | undefined {
    const layer = this.resourceLayers.get(id);
    return layer ? { ...layer } : undefined;
  }

  public listResourceLayers(): ResourceLayer[] {
    return [...this.resourceLayers.values()].map((layer) => ({ ...layer }));
  }

  public listResourceStatusCatalog(
    query: { resourceType?: string; tenantId?: string } = {},
  ): ResourceStatusCatalogEntry[] {
    return RESOURCE_STATUS_DEFAULTS.filter(
      (entry) => !query.resourceType || !entry.resourceType || entry.resourceType === query.resourceType,
    ).map((entry) => ({ '@type': 'ResourceStatusCatalogEntry' as const, ...entry }));
  }

  public getResourceStatusCatalogEntry(code: string): ResourceStatusCatalogEntry | undefined {
    return this.listResourceStatusCatalog().find((entry) => entry.code === code);
  }

  // O repositório em memória não tem audit log — o histórico só existe na persistência real.
  public listResourceAudit(): ResourceAuditEntry[] {
    return [];
  }

  public getPhysicalResourceDetail(id: string): PhysicalResourceDetail | undefined {
    const resource = this.getPhysicalResource(id);
    if (!resource) return undefined;
    const specification = this.getResourceSpecification(resource.resourceSpecificationId);
    if (!specification) return undefined;
    const resourceType = this.getResourceType(specification.resourceType);
    const statusCatalogEntry = resource.statusCode
      ? this.getResourceStatusCatalogEntry(resource.statusCode)
      : undefined;
    const characteristicValue = (name: string): string | undefined => {
      const value = specification.resourceSpecificationCharacteristic.find(
        (characteristic) => characteristic.name === name,
      )?.value;
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const manufacturer = specification.relatedParty.find((party) => party.role === 'manufacturer');
    const model = characteristicValue('model');
    const resourceLayer = specification.resourceLayerId
      ? this.getResourceLayer(specification.resourceLayerId)
      : undefined;
    return {
      '@type': 'PhysicalResourceDetail',
      // O repositório em memória não persiste timestamps; os testes unitários recebem um instante
      // coerente sem criar um segundo modelo só para a implementação de teste.
      resource: { ...resource, createdAt: '', updatedAt: '' },
      specification: {
        ...specification,
        resourceTypeName: resourceType?.name ?? specification.resourceType,
        ...(manufacturer
          ? {
              manufacturer: {
                id: manufacturer.id,
                ...(manufacturer.name ? { name: manufacturer.name } : {}),
                '@referredType': manufacturer['@referredType'],
              },
            }
          : {}),
        ...(model ? { model } : {}),
        ...(resourceLayer
          ? {
              resourceLayer: {
                id: resourceLayer.id,
                code: resourceLayer.code,
                name: resourceLayer.name,
                '@referredType': 'ResourceLayer',
              },
            }
          : {}),
      },
      ...(statusCatalogEntry ? { statusCatalogEntry } : {}),
      childCount: (this.relationships.get(id) ?? []).filter(
        (item) => item.relationshipType === 'containsAsChild',
      ).length,
    };
  }

  public getResourcePortsView(ctoId: string): ResourcePortsView | undefined {
    const cto = this.getPhysicalResource(ctoId);
    if (!cto) return undefined;
    const splitters = this.childrenOf(ctoId, 'Splitter');
    return {
      '@type': 'ResourcePortsView',
      ctoId,
      groups: splitters.map((splitter) => {
        const splitRatio = characteristicString(splitter, 'razao');
        return {
          splitter: {
            id: splitter.id,
            name: splitter.name,
            '@referredType': 'PhysicalResource' as const,
            resourceType: splitter.resourceType,
            ...(splitRatio ? { splitRatio } : {}),
          },
          ports: this.childrenOf(splitter.id, 'Port')
            .map((port) => this.portDetail(port, splitter, cto))
            .sort(comparePortDetails),
        };
      }),
    };
  }

  public getResourcePortDetail(portId: string): ResourcePortDetail | undefined {
    const port = this.getPhysicalResource(portId);
    if (!port || port.resourceType !== 'Port') return undefined;
    const splitter = this.parentsOf(portId).find((item) => item.resourceType === 'Splitter');
    const cto = splitter
      ? this.parentsOf(splitter.id).find((item) => item.resourceType === 'CTO')
      : undefined;
    return this.portDetail(port, splitter, cto);
  }

  private childrenOf(parentId: string, resourceType: string): PhysicalResource[] {
    return this.listResourceRelationships(parentId)
      .filter((relationship) => relationship.relationshipType === 'containsAsChild')
      .map((relationship) => this.getPhysicalResource(relationship.id))
      .filter((resource): resource is PhysicalResource => Boolean(resource && resource.resourceType === resourceType));
  }

  private parentsOf(childId: string): PhysicalResource[] {
    return [...this.relationships.entries()]
      .filter(([, relationships]) =>
        relationships.some(
          (relationship) => relationship.id === childId && relationship.relationshipType === 'containsAsChild',
        ),
      )
      .map(([id]) => this.getPhysicalResource(id))
      .filter((resource): resource is PhysicalResource => Boolean(resource));
  }

  private portDetail(
    port: PhysicalResource,
    splitter?: PhysicalResource,
    cto?: PhysicalResource,
  ): ResourcePortDetail {
    const drops = this.listIncidentResourceRelationships(port.id)
      .filter((relationship) => relationship.relationshipType === 'connectedTo')
      .map((relationship) => ({ relationship, resource: this.getPhysicalResource(relationship.id) }))
      .filter(
        (item): item is { relationship: ResourceRelationship; resource: PhysicalResource } =>
          Boolean(item.resource && item.resource.resourceType === 'DropCable'),
      )
      .map(({ relationship, resource }) => ({
        resource: {
          id: resource.id,
          name: resource.name,
          '@referredType': 'PhysicalResource' as const,
          resourceType: resource.resourceType,
        },
        active: relationshipIsActive(relationship),
        ...(relationship.validFor ? { validFor: { ...relationship.validFor } } : {}),
      }));
    const role = characteristicString(port, 'role');
    const index = characteristicNumber(port, 'index');
    const splitRatio = splitter ? characteristicString(splitter, 'razao') : undefined;
    return {
      '@type': 'ResourcePortDetail',
      resource: {
        ...port,
        usageState: role === 'FO.O' && drops.some((drop) => drop.active) ? 'active' : port.usageState,
      },
      ...(role ? { role } : {}),
      ...(index !== undefined ? { index } : {}),
      ...(splitter
        ? {
            splitter: {
              id: splitter.id,
              name: splitter.name,
              '@referredType': 'PhysicalResource',
              resourceType: splitter.resourceType,
            },
          }
        : {}),
      ...(cto
        ? {
            cto: {
              id: cto.id,
              name: cto.name,
              '@referredType': 'PhysicalResource',
              resourceType: cto.resourceType,
            },
          }
        : {}),
      ...(splitRatio ? { splitRatio } : {}),
      derivedUsageState: drops.some((drop) => drop.active) ? 'active' : 'idle',
      drops,
    };
  }

  public upsertPhysicalResource(resource: PhysicalResource): PhysicalResource {
    const stored = clonePhysicalResource({
      ...resource,
      resourceRelationship: resource.resourceRelationship.length
        ? resource.resourceRelationship
        : this.listResourceRelationships(resource.id),
    });
    this.physicalResources.set(stored.id, stored);
    return clonePhysicalResource(stored);
  }

  public getPhysicalResource(id: string): PhysicalResource | undefined {
    const resource = this.physicalResources.get(id);
    return resource ? clonePhysicalResource(resource) : undefined;
  }

  public listPhysicalResources(query?: ResourceQuery): PhysicalResource[] {
    return [...this.physicalResources.values()]
      .filter((resource) => filterResource(resource, query, this.categoryOfSpec))
      .map(clonePhysicalResource);
  }

  public countPhysicalResources(query?: ResourceQuery): number {
    return [...this.physicalResources.values()].filter((resource) =>
      filterResource(resource, query, this.categoryOfSpec),
    ).length;
  }

  public upsertLogicalResource(resource: LogicalResource): LogicalResource {
    const stored = cloneLogicalResource({
      ...resource,
      resourceRelationship: resource.resourceRelationship.length
        ? resource.resourceRelationship
        : this.listResourceRelationships(resource.id),
    });
    this.logicalResources.set(stored.id, stored);
    return cloneLogicalResource(stored);
  }

  public getLogicalResource(id: string): LogicalResource | undefined {
    const resource = this.logicalResources.get(id);
    return resource ? cloneLogicalResource(resource) : undefined;
  }

  public listLogicalResources(query?: ResourceQuery): LogicalResource[] {
    return [...this.logicalResources.values()]
      .filter((resource) => filterResource(resource, query, this.categoryOfSpec))
      .map(cloneLogicalResource);
  }

  public countLogicalResources(query?: ResourceQuery): number {
    return [...this.logicalResources.values()].filter((resource) =>
      filterResource(resource, query, this.categoryOfSpec),
    ).length;
  }

  public upsertResourceRelationship(
    resourceId: string,
    relationship: ResourceRelationship,
  ): ResourceRelationship {
    const current = this.relationships.get(resourceId) ?? [];
    const next = [
      ...current.filter(
        (item) =>
          !(item.id === relationship.id && item.relationshipType === relationship.relationshipType),
      ),
      cloneRelationship(relationship),
    ];
    this.relationships.set(resourceId, next);

    const physical = this.physicalResources.get(resourceId);
    if (physical) {
      physical.resourceRelationship = next.map(cloneRelationship);
      this.physicalResources.set(resourceId, clonePhysicalResource(physical));
    }

    const logical = this.logicalResources.get(resourceId);
    if (logical) {
      logical.resourceRelationship = next.map(cloneRelationship);
      this.logicalResources.set(resourceId, cloneLogicalResource(logical));
    }

    return cloneRelationship(relationship);
  }

  public deleteResourceRelationship(
    resourceId: string,
    relatedResourceId: string,
    relationshipType: string,
  ): boolean {
    const current = this.relationships.get(resourceId) ?? [];
    const next = current.filter(
      (item) => !(item.id === relatedResourceId && item.relationshipType === relationshipType),
    );
    this.relationships.set(resourceId, next);
    return next.length !== current.length;
  }

  public listResourceRelationships(resourceId: string): ResourceRelationship[] {
    return (this.relationships.get(resourceId) ?? []).map(cloneRelationship);
  }

  public listIncidentResourceRelationships(resourceId: string): ResourceRelationship[] {
    const outgoing = this.listResourceRelationships(resourceId);
    const incoming = [...this.relationships.entries()].flatMap(([fromId, relationships]) =>
      relationships
        .filter((relationship) => relationship.id === resourceId)
        .map((relationship) => ({
          id: fromId,
          relationshipType: relationship.relationshipType,
          '@referredType': 'Resource' as const,
          ...(relationship.validFor ? { validFor: { ...relationship.validFor } } : {}),
        })),
    );
    return [...outgoing, ...incoming];
  }

  public listResources(query?: ResourceQuery): Resource[] {
    if (query?.kind === 'PhysicalResource') {
      return this.listPhysicalResources(query);
    }

    if (query?.kind === 'LogicalResource') {
      return this.listLogicalResources(query);
    }

    return [...this.listPhysicalResources(query), ...this.listLogicalResources(query)];
  }

  public countResources(query?: ResourceQuery): number {
    if (query?.kind === 'PhysicalResource') return this.countPhysicalResources(query);
    if (query?.kind === 'LogicalResource') return this.countLogicalResources(query);
    return this.countPhysicalResources(query) + this.countLogicalResources(query);
  }
}

const characteristicString = (resource: PhysicalResource, name: string): string | undefined => {
  const value = resource.characteristic.find((item) => item.name === name)?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const characteristicNumber = (resource: PhysicalResource, name: string): number | undefined => {
  const value = characteristicString(resource, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const relationshipIsActive = (relationship: ResourceRelationship): boolean => {
  const end = relationship.validFor?.endDateTime;
  return !end || new Date(end).getTime() > Date.now();
};

const comparePortDetails = (a: ResourcePortDetail, b: ResourcePortDetail): number => {
  if (a.role !== b.role) return a.role === 'FO.I' ? -1 : b.role === 'FO.I' ? 1 : 0;
  return (a.index ?? 0) - (b.index ?? 0);
};

const cloneResourceSpecification = (spec: ResourceSpecification): ResourceSpecification => ({
  ...spec,
  resourceSpecificationCharacteristic: spec.resourceSpecificationCharacteristic.map((item) => ({
    ...item,
  })),
  relatedParty: spec.relatedParty.map((item) => ({ ...item })),
  ...(spec.validFor ? { validFor: { ...spec.validFor } } : {}),
});

const cloneResourceFunctionSpecification = (
  spec: ResourceFunctionSpecification,
): ResourceFunctionSpecification => ({
  ...spec,
  resourceFunctionSpecificationCharacteristic: spec.resourceFunctionSpecificationCharacteristic.map(
    (item) => ({ ...item }),
  ),
  ...(spec.validFor ? { validFor: { ...spec.validFor } } : {}),
});

const cloneResourceCategory = (category: ResourceCategory): ResourceCategory => ({
  ...category,
});

const cloneResourceType = (type: ResourceType): ResourceType => ({
  ...type,
});

const clonePhysicalResource = (resource: PhysicalResource): PhysicalResource => ({
  ...resource,
  ...(resource.place ? { place: { ...resource.place } } : {}),
  relatedParty: resource.relatedParty.map((item) => ({ ...item })),
  resourceRelationship: resource.resourceRelationship.map((item) => ({ ...item })),
  characteristic: resource.characteristic.map((item) => ({ ...item })),
  ...(resource.validFor ? { validFor: { ...resource.validFor } } : {}),
});

const cloneLogicalResource = (resource: LogicalResource): LogicalResource => ({
  ...resource,
  ...(resource.place ? { place: { ...resource.place } } : {}),
  relatedParty: resource.relatedParty.map((item) => ({ ...item })),
  resourceRelationship: resource.resourceRelationship.map((item) => ({ ...item })),
  characteristic: resource.characteristic.map((item) => ({ ...item })),
  ...(resource.validFor ? { validFor: { ...resource.validFor } } : {}),
});

const cloneRelationship = (relationship: ResourceRelationship): ResourceRelationship => ({
  ...relationship,
  ...(relationship.validFor ? { validFor: { ...relationship.validFor } } : {}),
});

const filterSpec = (spec: ResourceSpecification, query?: ResourceSpecificationQuery): boolean => {
  if (!query) return true;
  if (query.name && !spec.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  if (query.category && spec.category !== query.category) return false;
  if (query.resourceType && spec.resourceType !== query.resourceType) return false;
  if (!query.includeEnded && spec.validFor?.endDateTime) return false;
  return true;
};

const filterFunctionSpec = (
  spec: ResourceFunctionSpecification,
  query?: ResourceFunctionSpecificationQuery,
): boolean => {
  if (!query) return true;
  if (query.name && !spec.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  return true;
};

const filterResource = (
  resource: Resource,
  query?: ResourceQuery,
  categoryOfSpec?: (specId: string) => string | undefined,
): boolean => {
  if (!query) return true;
  if (query.name && !resource.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  if (query.status && resource.status !== query.status) return false;
  if (query.resourceSpecificationIdIn && query.resourceSpecificationIdIn.length > 0) {
    if (!query.resourceSpecificationIdIn.includes(resource.resourceSpecificationId)) return false;
  } else if (
    query.resourceSpecificationId &&
    resource.resourceSpecificationId !== query.resourceSpecificationId
  ) {
    return false;
  }
  if (query.resourceTypeIn && query.resourceTypeIn.length > 0) {
    if (!query.resourceTypeIn.includes(resource.resourceType)) return false;
  } else if (query.resourceType && resource.resourceType !== query.resourceType) {
    return false;
  }
  if (query.category && categoryOfSpec?.(resource.resourceSpecificationId) !== query.category)
    return false;
  if (query.placeId && resource.place?.id !== query.placeId) return false;
  if (query.kind && resource['@type'] !== query.kind) return false;
  if (
    query.relatedPartyId &&
    !resource.relatedParty.some((item) => item.id === query.relatedPartyId)
  )
    return false;
  return true;
};
