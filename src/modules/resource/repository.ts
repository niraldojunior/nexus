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
  ResourceSpecification,
  ResourceSpecificationQuery,
} from './domain.js';
import type { IResourceRepository } from './resource-repository-interface.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES } from './catalog.js';

export class ResourceRepository implements IResourceRepository {
  private readonly resourceCategories = new Map<string, ResourceCategory>();
  private readonly resourceTypes = new Map<string, ResourceType>();
  private readonly resourceSpecifications = new Map<string, ResourceSpecification>();
  private readonly resourceFunctionSpecifications = new Map<string, ResourceFunctionSpecification>();
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

  private readonly categoryOfSpec = (specId: string): string | undefined => this.resourceSpecifications.get(specId)?.category;

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

  public upsertResourceFunctionSpecification(spec: ResourceFunctionSpecification): ResourceFunctionSpecification {
    const stored = cloneResourceFunctionSpecification(spec);
    this.resourceFunctionSpecifications.set(stored.id, stored);
    return cloneResourceFunctionSpecification(stored);
  }

  public getResourceFunctionSpecification(id: string): ResourceFunctionSpecification | undefined {
    const spec = this.resourceFunctionSpecifications.get(id);
    return spec ? cloneResourceFunctionSpecification(spec) : undefined;
  }

  public listResourceFunctionSpecifications(query?: ResourceFunctionSpecificationQuery): ResourceFunctionSpecification[] {
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

  public upsertPhysicalResource(resource: PhysicalResource): PhysicalResource {
    const stored = clonePhysicalResource({
      ...resource,
      resourceRelationship: resource.resourceRelationship.length ? resource.resourceRelationship : this.listResourceRelationships(resource.id),
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
    return [...this.physicalResources.values()].filter((resource) => filterResource(resource, query, this.categoryOfSpec)).length;
  }

  public upsertLogicalResource(resource: LogicalResource): LogicalResource {
    const stored = cloneLogicalResource({
      ...resource,
      resourceRelationship: resource.resourceRelationship.length ? resource.resourceRelationship : this.listResourceRelationships(resource.id),
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
    return [...this.logicalResources.values()].filter((resource) => filterResource(resource, query, this.categoryOfSpec)).length;
  }

  public upsertResourceRelationship(resourceId: string, relationship: ResourceRelationship): ResourceRelationship {
    const current = this.relationships.get(resourceId) ?? [];
    const next = [
      ...current.filter(
        (item) => !(item.id === relationship.id && item.relationshipType === relationship.relationshipType),
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

  public deleteResourceRelationship(resourceId: string, relatedResourceId: string, relationshipType: string): boolean {
    const current = this.relationships.get(resourceId) ?? [];
    const next = current.filter((item) => !(item.id === relatedResourceId && item.relationshipType === relationshipType));
    this.relationships.set(resourceId, next);
    return next.length !== current.length;
  }

  public listResourceRelationships(resourceId: string): ResourceRelationship[] {
    return (this.relationships.get(resourceId) ?? []).map(cloneRelationship);
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

const cloneResourceSpecification = (spec: ResourceSpecification): ResourceSpecification => ({
  ...spec,
  resourceSpecificationCharacteristic: spec.resourceSpecificationCharacteristic.map((item) => ({ ...item })),
  relatedParty: spec.relatedParty.map((item) => ({ ...item })),
  ...(spec.validFor ? { validFor: { ...spec.validFor } } : {}),
});

const cloneResourceFunctionSpecification = (spec: ResourceFunctionSpecification): ResourceFunctionSpecification => ({
  ...spec,
  resourceFunctionSpecificationCharacteristic: spec.resourceFunctionSpecificationCharacteristic.map((item) => ({ ...item })),
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

const filterFunctionSpec = (spec: ResourceFunctionSpecification, query?: ResourceFunctionSpecificationQuery): boolean => {
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
  } else if (query.resourceSpecificationId && resource.resourceSpecificationId !== query.resourceSpecificationId) {
    return false;
  }
  if (query.resourceTypeIn && query.resourceTypeIn.length > 0) {
    if (!query.resourceTypeIn.includes(resource.resourceType)) return false;
  } else if (query.resourceType && resource.resourceType !== query.resourceType) {
    return false;
  }
  if (query.category && categoryOfSpec?.(resource.resourceSpecificationId) !== query.category) return false;
  if (query.placeId && resource.place?.id !== query.placeId) return false;
  if (query.kind && resource['@type'] !== query.kind) return false;
  if (query.relatedPartyId && !resource.relatedParty.some((item) => item.id === query.relatedPartyId)) return false;
  return true;
};
