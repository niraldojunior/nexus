import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { EventService, RelatedParty } from '../../shared/tmf/index.js';
import type {
  AdministrativeState,
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
  LogicalResource,
  OperationalState,
  PhysicalResource,
  Resource,
  ResourceFunctionActivationInput,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceKind,
  ResourceQuery,
  ResourceRelationship,
  ResourceCategory,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationQuery,
  ResourceStatus,
  UsageState,
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
  UpdateResourceFunctionSpecificationInput,
  UpdateResourceSpecificationInput,
} from './domain.js';
import type { IResourceRepository } from './resource-repository-interface.js';

type ResourceServiceDependencies = {
  lookupPlace?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
  lookupParty?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
};

export class ResourceService {
  public constructor(
    private readonly repository: IResourceRepository,
    private readonly eventService: EventService,
    private readonly dependencies: ResourceServiceDependencies = {},
  ) {}

  public createResourceSpecification(input: CreateResourceSpecificationInput): ResourceSpecification {
    assertName(input.name);
    const category = this.getResourceCategoryOrThrow(input.category);
    const resourceType = this.getResourceTypeOrThrow(input.resourceType);
    this.assertResourceTypeMatchesCategory(resourceType, category);
    const id = createCanonicalId();
    const spec: ResourceSpecification = {
      '@type': 'ResourceSpecification',
      id,
      href: `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${id}`,
      name: input.name.trim(),
      category: category.code,
      resourceType: resourceType.code,
      resourceSpecificationCharacteristic: input.resourceSpecificationCharacteristic ?? [],
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertResourceSpecification(spec);
    this.emit('ResourceSpecificationCreateEvent', stored.id, 'ResourceSpecification', stored);
    return stored;
  }

  public updateResourceSpecification(id: string, input: UpdateResourceSpecificationInput): ResourceSpecification {
    const current = this.getResourceSpecificationOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    const nextCategoryCode = input.category !== undefined ? input.category.trim() : current.category;
    const nextResourceTypeCode = input.resourceType !== undefined ? input.resourceType.trim() : current.resourceType;
    const nextCategory = this.getResourceCategoryOrThrow(nextCategoryCode);
    const nextResourceType = this.getResourceTypeOrThrow(nextResourceTypeCode);
    this.assertResourceTypeMatchesCategory(nextResourceType, nextCategory);

    const updated = this.repository.upsertResourceSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      category: nextCategory.code,
      resourceType: nextResourceType.code,
      resourceSpecificationCharacteristic: input.resourceSpecificationCharacteristic ?? current.resourceSpecificationCharacteristic,
      relatedParty: input.relatedParty
        ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit('ResourceSpecificationAttributeValueChangeEvent', updated.id, 'ResourceSpecification', updated);
    return updated;
  }

  public deleteResourceSpecification(id: string): ResourceSpecification {
    const current = this.getResourceSpecificationOrThrow(id);
    const terminated = this.repository.upsertResourceSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('ResourceSpecificationAttributeValueChangeEvent', terminated.id, 'ResourceSpecification', terminated);
    return terminated;
  }

  public listResourceSpecifications(query?: ResourceSpecificationQuery): ResourceSpecification[] {
    return this.repository.listResourceSpecifications(query);
  }

  public getResourceSpecification(id: string): ResourceSpecification | undefined {
    return this.repository.getResourceSpecification(id);
  }

  public listResourceCategories(): ResourceCategory[] {
    return this.repository.listResourceCategories();
  }

  public listResourceTypes(): ResourceType[] {
    return this.repository.listResourceTypes();
  }

  public createResourceFunctionSpecification(input: CreateResourceFunctionSpecificationInput): ResourceFunctionSpecification {
    assertName(input.name);
    const id = createCanonicalId();
    const spec: ResourceFunctionSpecification = {
      '@type': 'ResourceFunctionSpecification',
      id,
      href: `/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification/${id}`,
      name: input.name.trim(),
      resourceFunctionSpecificationCharacteristic: input.resourceFunctionSpecificationCharacteristic ?? [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertResourceFunctionSpecification(spec);
    this.emit('ResourceFunctionSpecificationCreateEvent', stored.id, 'ResourceFunctionSpecification', stored);
    return stored;
  }

  public updateResourceFunctionSpecification(
    id: string,
    input: UpdateResourceFunctionSpecificationInput,
  ): ResourceFunctionSpecification {
    const current = this.getResourceFunctionSpecificationOrThrow(id);
    if (input.name !== undefined) assertName(input.name);

    const updated = this.repository.upsertResourceFunctionSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceFunctionSpecificationCharacteristic:
        input.resourceFunctionSpecificationCharacteristic ?? current.resourceFunctionSpecificationCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit(
      'ResourceFunctionSpecificationAttributeValueChangeEvent',
      updated.id,
      'ResourceFunctionSpecification',
      updated,
    );
    return updated;
  }

  public deleteResourceFunctionSpecification(id: string): ResourceFunctionSpecification {
    const current = this.getResourceFunctionSpecificationOrThrow(id);
    const terminated = this.repository.upsertResourceFunctionSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit(
      'ResourceFunctionSpecificationAttributeValueChangeEvent',
      terminated.id,
      'ResourceFunctionSpecification',
      terminated,
    );
    return terminated;
  }

  public listResourceFunctionSpecifications(query?: ResourceFunctionSpecificationQuery): ResourceFunctionSpecification[] {
    return this.repository.listResourceFunctionSpecifications(query);
  }

  public getResourceFunctionSpecification(id: string): ResourceFunctionSpecification | undefined {
    return this.repository.getResourceFunctionSpecification(id);
  }

  public createPhysicalResource(input: CreatePhysicalResourceInput): PhysicalResource {
    assertName(input.name);
    const spec = this.getResourceSpecificationOrThrow(input.resourceSpecificationId);
    const id = createCanonicalId();
    const place = this.resolvePlace(input.placeId, input.placeType);
    const resource: PhysicalResource = {
      '@type': 'PhysicalResource',
      id,
      href: `/tmf-api/resourceInventoryManagement/v4/resource/${id}`,
      name: input.name.trim(),
      resourceSpecificationId: spec.id,
      resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
      resourceType: spec.resourceType,
      status: input.status ?? 'active',
      administrativeState: input.administrativeState ?? 'unlocked',
      operationalState: input.operationalState ?? 'enabled',
      usageState: input.usageState ?? 'idle',
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      resourceRelationship: [],
      characteristic: input.characteristic ?? [],
      ...(place ? { place } : {}),
      ...(input.manufacturer ? { manufacturer: input.manufacturer } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
      ...(input.partNumber ? { partNumber: input.partNumber } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertPhysicalResource(resource);
    for (const relationship of input.resourceRelationship ?? []) {
      this.addResourceRelationship(stored.id, relationship);
    }
    const finalResource = this.getPhysicalResourceOrThrow(stored.id);
    this.emit('ResourceCreateEvent', finalResource.id, 'PhysicalResource', finalResource);
    return finalResource;
  }

  public updatePhysicalResource(id: string, input: UpdatePhysicalResourceInput): PhysicalResource {
    const current = this.getPhysicalResourceOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    if (input.resourceSpecificationId !== undefined) this.getResourceSpecificationOrThrow(input.resourceSpecificationId);

    const place = input.placeId !== undefined ? this.resolvePlace(input.placeId, input.placeType) : current.place;
    const updated = this.repository.upsertPhysicalResource({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceSpecificationId: input.resourceSpecificationId ?? current.resourceSpecificationId,
      resourceSpecification: {
        id: input.resourceSpecificationId ?? current.resourceSpecificationId,
        '@referredType': 'ResourceSpecification',
      },
      resourceType: current.resourceType,
      status: input.status ?? current.status,
      administrativeState: input.administrativeState ?? current.administrativeState,
      operationalState: input.operationalState ?? current.operationalState,
      usageState: input.usageState ?? current.usageState,
      relatedParty: input.relatedParty
        ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      resourceRelationship: current.resourceRelationship,
      characteristic: input.characteristic ?? current.characteristic,
      ...(place ? { place } : {}),
      ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
      ...(input.partNumber !== undefined ? { partNumber: input.partNumber } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit(
      current.status !== updated.status ? 'ResourceStateChangeEvent' : 'ResourceAttributeValueChangeEvent',
      updated.id,
      'PhysicalResource',
      updated,
    );
    return updated;
  }

  public deletePhysicalResource(id: string): PhysicalResource {
    const current = this.getPhysicalResourceOrThrow(id);
    const terminated = this.repository.upsertPhysicalResource({
      ...current,
      status: 'terminated',
      administrativeState: 'locked',
      operationalState: 'disabled',
      usageState: 'idle',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('ResourceStateChangeEvent', terminated.id, 'PhysicalResource', terminated);
    return terminated;
  }

  public getPhysicalResource(id: string): PhysicalResource | undefined {
    return this.repository.getPhysicalResource(id);
  }

  public listPhysicalResources(query?: ResourceQuery): PhysicalResource[] {
    return this.repository.listPhysicalResources({ ...query, kind: 'PhysicalResource' });
  }

  public createLogicalResource(input: CreateLogicalResourceInput): LogicalResource {
    assertName(input.name);
    const spec = this.getResourceSpecificationOrThrow(input.resourceSpecificationId);
    const place = this.resolvePlace(input.placeId, input.placeType);
    const supporting = input.supportingPhysicalResourceId
      ? this.getPhysicalResourceOrThrow(input.supportingPhysicalResourceId)
      : undefined;
    const id = createCanonicalId();
    const resource: LogicalResource = {
      '@type': 'LogicalResource',
      id,
      href: `/tmf-api/resourceInventoryManagement/v4/resource/${id}`,
      name: input.name.trim(),
      resourceSpecificationId: spec.id,
      resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
      resourceType: spec.resourceType,
      status: input.status ?? 'active',
      administrativeState: input.administrativeState ?? 'unlocked',
      operationalState: input.operationalState ?? 'enabled',
      usageState: input.usageState ?? 'idle',
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      resourceRelationship: [],
      characteristic: input.characteristic ?? [],
      ...(place ? { place } : {}),
      ...(supporting ? { supportingPhysicalResourceId: supporting.id } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertLogicalResource(resource);
    for (const relationship of input.resourceRelationship ?? []) {
      this.addResourceRelationship(stored.id, relationship);
    }
    const finalResource = this.getLogicalResourceOrThrow(stored.id);
    this.emit('ResourceCreateEvent', finalResource.id, 'LogicalResource', finalResource);
    return finalResource;
  }

  public updateLogicalResource(id: string, input: UpdateLogicalResourceInput): LogicalResource {
    const current = this.getLogicalResourceOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    if (input.resourceSpecificationId !== undefined) this.getResourceSpecificationOrThrow(input.resourceSpecificationId);
    const place = input.placeId !== undefined ? this.resolvePlace(input.placeId, input.placeType) : current.place;
    const supporting = input.supportingPhysicalResourceId !== undefined
      ? this.getPhysicalResourceOrThrow(input.supportingPhysicalResourceId)
      : current.supportingPhysicalResourceId
        ? this.getPhysicalResourceOrThrow(current.supportingPhysicalResourceId)
        : undefined;

    const updated = this.repository.upsertLogicalResource({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceSpecificationId: input.resourceSpecificationId ?? current.resourceSpecificationId,
      resourceSpecification: {
        id: input.resourceSpecificationId ?? current.resourceSpecificationId,
        '@referredType': 'ResourceSpecification',
      },
      resourceType: current.resourceType,
      status: input.status ?? current.status,
      administrativeState: input.administrativeState ?? current.administrativeState,
      operationalState: input.operationalState ?? current.operationalState,
      usageState: input.usageState ?? current.usageState,
      relatedParty: input.relatedParty
        ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      resourceRelationship: current.resourceRelationship,
      characteristic: input.characteristic ?? current.characteristic,
      ...(place ? { place } : {}),
      ...(supporting ? { supportingPhysicalResourceId: supporting.id } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit(
      current.status !== updated.status ? 'ResourceStateChangeEvent' : 'ResourceAttributeValueChangeEvent',
      updated.id,
      'LogicalResource',
      updated,
    );
    return updated;
  }

  public deleteLogicalResource(id: string): LogicalResource {
    const current = this.getLogicalResourceOrThrow(id);
    const terminated = this.repository.upsertLogicalResource({
      ...current,
      status: 'terminated',
      administrativeState: 'locked',
      operationalState: 'disabled',
      usageState: 'idle',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('ResourceStateChangeEvent', terminated.id, 'LogicalResource', terminated);
    return terminated;
  }

  public getLogicalResource(id: string): LogicalResource | undefined {
    return this.repository.getLogicalResource(id);
  }

  public listLogicalResources(query?: ResourceQuery): LogicalResource[] {
    return this.repository.listLogicalResources({ ...query, kind: 'LogicalResource' });
  }

  public getResource(id: string): Resource | undefined {
    return this.repository.getPhysicalResource(id) ?? this.repository.getLogicalResource(id);
  }

  public listResources(query?: ResourceQuery): Resource[] {
    if (query?.kind === 'PhysicalResource') {
      return this.repository.listPhysicalResources(query);
    }

    if (query?.kind === 'LogicalResource') {
      return this.repository.listLogicalResources(query);
    }

    return this.repository.listResources(query);
  }

  public addResourceRelationship(resourceId: string, input: ResourceRelationship): ResourceRelationship {
    assertName(input.relationshipType, 'relationshipType');
    this.getResourceOrThrow(resourceId);
    this.getResourceOrThrow(input.id);
    const relationship = this.repository.upsertResourceRelationship(resourceId, input);
    const current = this.getResourceOrThrow(resourceId);
    this.emit('ResourceRelationshipCreateEvent', resourceId, current['@type'], {
      resourceId,
      relationship,
    });
    return relationship;
  }

  public removeResourceRelationship(resourceId: string, relatedResourceId: string, relationshipType: string): boolean {
    this.getResourceOrThrow(resourceId);
    this.getResourceOrThrow(relatedResourceId);
    const removed = this.repository.deleteResourceRelationship(resourceId, relatedResourceId, relationshipType);
    if (removed) {
      const current = this.getResourceOrThrow(resourceId);
      this.emit('ResourceRelationshipDeleteEvent', resourceId, current['@type'], {
        resourceId,
        relatedResourceId,
        relationshipType,
      });
    }
    return removed;
  }

  public listResourceRelationships(resourceId: string): ResourceRelationship[] {
    this.getResourceOrThrow(resourceId);
    return this.repository.listResourceRelationships(resourceId);
  }

  public activateResource(input: ResourceFunctionActivationInput): Resource {
    const current = this.getResourceOrThrow(input.resourceId);
    const status = activationToStatus(input.action);
    const resource =
      current['@type'] === 'PhysicalResource'
        ? this.repository.upsertPhysicalResource({
            ...current,
            status,
            administrativeState: status === 'terminated' ? 'locked' : 'unlocked',
            operationalState: status === 'active' ? 'enabled' : 'disabled',
            usageState: status === 'active' ? 'busy' : 'idle',
          })
        : this.repository.upsertLogicalResource({
            ...current,
            status,
            administrativeState: status === 'terminated' ? 'locked' : 'unlocked',
            operationalState: status === 'active' ? 'enabled' : 'disabled',
            usageState: status === 'active' ? 'busy' : 'idle',
          });

    this.emit('ResourceFunctionActivationEvent', resource.id, resource['@type'], {
      resourceId: resource.id,
      action: input.action ?? 'activate',
      reason: input.reason,
      resource,
    });
    return resource;
  }

  private emit(eventType: string, entityId: string, entityType: string, payload: unknown): void {
    this.eventService.appendEvent({
      eventType,
      source: `resource.${entityType}`,
      correlationId: entityId,
      eventData: {
        entityId,
        entityType,
        payload,
      },
    });
  }

  private resolvePlace(
    placeId: string | undefined,
    placeType: string | undefined,
  ): { id: string; '@referredType': string } | undefined {
    if (!placeId) return undefined;
    const lookup = this.dependencies.lookupPlace?.(placeId);
    if (!lookup) {
      throw new AppError('place not found', { code: 'RESOURCE_PLACE_NOT_FOUND', statusCode: 404 });
    }
    return {
      id: lookup.id,
      '@referredType': placeType ?? lookup['@referredType'] ?? 'GeographicLocation',
    };
  }

  private getResourceSpecificationOrThrow(id: string): ResourceSpecification {
    const spec = this.repository.getResourceSpecification(id);
    if (!spec) throw new AppError('resource specification not found', { code: 'RESOURCE_SPEC_NOT_FOUND', statusCode: 404 });
    return spec;
  }

  private getResourceCategoryOrThrow(code: string): ResourceCategory {
    assertName(code, 'category');
    const category = this.repository.getResourceCategory(code.trim());
    if (!category) throw new AppError('resource category not found', { code: 'RESOURCE_CATEGORY_NOT_FOUND', statusCode: 404 });
    if (category.status !== 'active') {
      throw new AppError('resource category is inactive', { code: 'RESOURCE_CATEGORY_INACTIVE', statusCode: 409 });
    }
    return category;
  }

  private getResourceTypeOrThrow(code: string): ResourceType {
    assertName(code, 'resourceType');
    const resourceType = this.repository.getResourceType(code.trim());
    if (!resourceType) throw new AppError('resource type not found', { code: 'RESOURCE_TYPE_NOT_FOUND', statusCode: 404 });
    if (resourceType.status !== 'active') {
      throw new AppError('resource type is inactive', { code: 'RESOURCE_TYPE_INACTIVE', statusCode: 409 });
    }
    return resourceType;
  }

  private assertResourceTypeMatchesCategory(resourceType: ResourceType, category: ResourceCategory): void {
    if (resourceType.categoryCode !== category.code) {
      throw new AppError('resource type is not allowed for category', {
        code: 'RESOURCE_TYPE_CATEGORY_MISMATCH',
        statusCode: 409,
      });
    }
  }

  private getResourceFunctionSpecificationOrThrow(id: string): ResourceFunctionSpecification {
    const spec = this.repository.getResourceFunctionSpecification(id);
    if (!spec) {
      throw new AppError('resource function specification not found', {
        code: 'RESOURCE_FUNCTION_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    }
    return spec;
  }

  private getPhysicalResourceOrThrow(id: string): PhysicalResource {
    const resource = this.repository.getPhysicalResource(id);
    if (!resource) throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }

  private getLogicalResourceOrThrow(id: string): LogicalResource {
    const resource = this.repository.getLogicalResource(id);
    if (!resource) throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }

  private getResourceOrThrow(id: string): Resource {
    const resource = this.getResource(id);
    if (!resource) throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }
}

const assertName = (value: unknown, field = 'name'): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
};

const buildTimePeriod = (startDateTime: string | undefined, endDateTime: string): { startDateTime?: string; endDateTime: string } => {
  const period: { startDateTime?: string; endDateTime: string } = { endDateTime };
  if (startDateTime) {
    period.startDateTime = startDateTime;
  }
  return period;
};

const normalizeRelatedParties = (
  relatedParty: RelatedParty[] | undefined,
  lookupParty?: ResourceServiceDependencies['lookupParty'],
): RelatedParty[] => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;

  return parties.map((party) => {
    const found = lookupParty(party.id);
    if (!found) {
      throw new AppError('related party not found', { code: 'RESOURCE_PARTY_NOT_FOUND', statusCode: 404 });
    }
    const ref: RelatedParty = {
      id: found.id,
      '@referredType': found['@referredType'],
    };
    if (found.href) ref.href = found.href;
    if (found.name) ref.name = found.name;
    if (party.role) ref.role = party.role;
    return ref;
  });
};

const activationToStatus = (action: ResourceFunctionActivationInput['action']): ResourceStatus => {
  if (action === 'suspend') return 'suspended';
  if (action === 'terminate') return 'terminated';
  return 'active';
};
