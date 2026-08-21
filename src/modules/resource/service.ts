import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { EventService, RelatedParty } from '../../shared/tmf/index.js';
import type {
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
  LogicalResource,
  PhysicalResource,
  Resource,
  ResourceFunctionActivationInput,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
  ResourceCategory,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationQuery,
  ResourceStatus,
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
  UpdateResourceFunctionSpecificationInput,
  UpdateResourceSpecificationInput,
} from './domain.js';
import type { IResourceRepository } from './resource-repository-interface.js';
import type { MapFeatureSynchronizer } from '../geo/map-feature-synchronizer.js';

type ResourceServiceDependencies = {
  lookupPlace?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  lookupParty?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  mapFeatureSynchronizer?: MapFeatureSynchronizer;
};

export class ResourceService {
  public constructor(
    private readonly repository: IResourceRepository,
    private readonly eventService: EventService,
    private readonly dependencies: ResourceServiceDependencies = {},
  ) {}

  public async createResourceSpecification(
    input: CreateResourceSpecificationInput,
  ): Promise<ResourceSpecification> {
    assertName(input.name);
    const category = await this.getResourceCategoryOrThrow(input.category);
    const resourceType = await this.getResourceTypeOrThrow(input.resourceType);
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
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceSpecification(spec);
    await this.emit('ResourceSpecificationCreateEvent', stored.id, 'ResourceSpecification', stored);
    return stored;
  }

  public async updateResourceSpecification(
    id: string,
    input: UpdateResourceSpecificationInput,
  ): Promise<ResourceSpecification> {
    const current = await this.getResourceSpecificationOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    const nextCategoryCode =
      input.category !== undefined ? input.category.trim() : current.category;
    const nextResourceTypeCode =
      input.resourceType !== undefined ? input.resourceType.trim() : current.resourceType;
    const nextCategory = await this.getResourceCategoryOrThrow(nextCategoryCode);
    const nextResourceType = await this.getResourceTypeOrThrow(nextResourceTypeCode);
    this.assertResourceTypeMatchesCategory(nextResourceType, nextCategory);

    const updated = await this.repository.upsertResourceSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      category: nextCategory.code,
      resourceType: nextResourceType.code,
      resourceSpecificationCharacteristic:
        input.resourceSpecificationCharacteristic ?? current.resourceSpecificationCharacteristic,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      'ResourceSpecificationAttributeValueChangeEvent',
      updated.id,
      'ResourceSpecification',
      updated,
    );
    return updated;
  }

  public async deleteResourceSpecification(id: string): Promise<ResourceSpecification> {
    const current = await this.getResourceSpecificationOrThrow(id);
    const terminated = await this.repository.upsertResourceSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ResourceSpecificationAttributeValueChangeEvent',
      terminated.id,
      'ResourceSpecification',
      terminated,
    );
    return terminated;
  }

  public async listResourceSpecifications(
    query?: ResourceSpecificationQuery,
  ): Promise<ResourceSpecification[]> {
    return await this.repository.listResourceSpecifications(query);
  }

  public async getResourceSpecification(id: string): Promise<ResourceSpecification | undefined> {
    return await this.repository.getResourceSpecification(id);
  }

  public async listResourceCategories(): Promise<ResourceCategory[]> {
    return await this.repository.listResourceCategories();
  }

  public async listResourceTypes(): Promise<ResourceType[]> {
    return await this.repository.listResourceTypes();
  }

  public async createResourceFunctionSpecification(
    input: CreateResourceFunctionSpecificationInput,
  ): Promise<ResourceFunctionSpecification> {
    assertName(input.name);
    const id = createCanonicalId();
    const spec: ResourceFunctionSpecification = {
      '@type': 'ResourceFunctionSpecification',
      id,
      href: `/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification/${id}`,
      name: input.name.trim(),
      resourceFunctionSpecificationCharacteristic:
        input.resourceFunctionSpecificationCharacteristic ?? [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceFunctionSpecification(spec);
    await this.emit(
      'ResourceFunctionSpecificationCreateEvent',
      stored.id,
      'ResourceFunctionSpecification',
      stored,
    );
    return stored;
  }

  public async updateResourceFunctionSpecification(
    id: string,
    input: UpdateResourceFunctionSpecificationInput,
  ): Promise<ResourceFunctionSpecification> {
    const current = await this.getResourceFunctionSpecificationOrThrow(id);
    if (input.name !== undefined) assertName(input.name);

    const updated = await this.repository.upsertResourceFunctionSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceFunctionSpecificationCharacteristic:
        input.resourceFunctionSpecificationCharacteristic ??
        current.resourceFunctionSpecificationCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      'ResourceFunctionSpecificationAttributeValueChangeEvent',
      updated.id,
      'ResourceFunctionSpecification',
      updated,
    );
    return updated;
  }

  public async deleteResourceFunctionSpecification(
    id: string,
  ): Promise<ResourceFunctionSpecification> {
    const current = await this.getResourceFunctionSpecificationOrThrow(id);
    const terminated = await this.repository.upsertResourceFunctionSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ResourceFunctionSpecificationAttributeValueChangeEvent',
      terminated.id,
      'ResourceFunctionSpecification',
      terminated,
    );
    return terminated;
  }

  public async listResourceFunctionSpecifications(
    query?: ResourceFunctionSpecificationQuery,
  ): Promise<ResourceFunctionSpecification[]> {
    return await this.repository.listResourceFunctionSpecifications(query);
  }

  public async getResourceFunctionSpecification(
    id: string,
  ): Promise<ResourceFunctionSpecification | undefined> {
    return await this.repository.getResourceFunctionSpecification(id);
  }

  public async createPhysicalResource(
    input: CreatePhysicalResourceInput,
  ): Promise<PhysicalResource> {
    assertName(input.name);
    const spec = await this.getResourceSpecificationOrThrow(input.resourceSpecificationId);
    const id = createCanonicalId();
    const place = await this.resolvePlace(input.placeId, input.placeType);
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
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      resourceRelationship: [],
      characteristic: input.characteristic ?? [],
      ...(place ? { place } : {}),
      ...(input.manufacturer ? { manufacturer: input.manufacturer } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
      ...(input.partNumber ? { partNumber: input.partNumber } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertPhysicalResource(resource);
    for (const relationship of input.resourceRelationship ?? []) {
      await this.addResourceRelationship(stored.id, relationship);
    }
    const finalResource = await this.getPhysicalResourceOrThrow(stored.id);
    await this.syncMapFeature(finalResource);
    await this.emit('ResourceCreateEvent', finalResource.id, 'PhysicalResource', finalResource);
    return finalResource;
  }

  public async updatePhysicalResource(
    id: string,
    input: UpdatePhysicalResourceInput,
  ): Promise<PhysicalResource> {
    const current = await this.getPhysicalResourceOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    if (input.resourceSpecificationId !== undefined)
      await this.getResourceSpecificationOrThrow(input.resourceSpecificationId);

    // `place` some do objeto base (não só do spread condicional de baixo) porque
    // `placeId: null` (desvincular do local, aba Recursos do painel unificado, C2) precisa
    // apagar um `current.place` existente — `exactOptionalPropertyTypes` não aceita
    // `place: undefined` explícito, só a chave ausente.
    const { place: _currentPlace, ...currentWithoutPlace } = current;
    const place =
      input.placeId !== undefined
        ? await this.resolvePlace(input.placeId, input.placeType)
        : current.place;
    const updated = await this.repository.upsertPhysicalResource({
      ...currentWithoutPlace,
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
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
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

    await this.syncMapFeature(updated);

    await this.emit(
      current.status !== updated.status
        ? 'ResourceStateChangeEvent'
        : 'ResourceAttributeValueChangeEvent',
      updated.id,
      'PhysicalResource',
      updated,
    );
    return updated;
  }

  public async deletePhysicalResource(id: string): Promise<PhysicalResource> {
    const current = await this.getPhysicalResourceOrThrow(id);
    const terminated = await this.repository.upsertPhysicalResource({
      ...current,
      status: 'terminated',
      administrativeState: 'locked',
      operationalState: 'disabled',
      usageState: 'idle',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.syncMapFeature(terminated);
    await this.emit('ResourceStateChangeEvent', terminated.id, 'PhysicalResource', terminated);
    return terminated;
  }

  public async getPhysicalResource(id: string): Promise<PhysicalResource | undefined> {
    return await this.repository.getPhysicalResource(id);
  }

  public async listPhysicalResources(query?: ResourceQuery): Promise<PhysicalResource[]> {
    return await this.repository.listPhysicalResources({ ...query, kind: 'PhysicalResource' });
  }

  public async createLogicalResource(input: CreateLogicalResourceInput): Promise<LogicalResource> {
    assertName(input.name);
    const spec = await this.getResourceSpecificationOrThrow(input.resourceSpecificationId);
    const place = await this.resolvePlace(input.placeId, input.placeType);
    const supporting = input.supportingPhysicalResourceId
      ? await this.getPhysicalResourceOrThrow(input.supportingPhysicalResourceId)
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
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      resourceRelationship: [],
      characteristic: input.characteristic ?? [],
      ...(place ? { place } : {}),
      ...(supporting ? { supportingPhysicalResourceId: supporting.id } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertLogicalResource(resource);
    for (const relationship of input.resourceRelationship ?? []) {
      await this.addResourceRelationship(stored.id, relationship);
    }
    const finalResource = await this.getLogicalResourceOrThrow(stored.id);
    await this.emit('ResourceCreateEvent', finalResource.id, 'LogicalResource', finalResource);
    return finalResource;
  }

  public async updateLogicalResource(
    id: string,
    input: UpdateLogicalResourceInput,
  ): Promise<LogicalResource> {
    const current = await this.getLogicalResourceOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    if (input.resourceSpecificationId !== undefined)
      await this.getResourceSpecificationOrThrow(input.resourceSpecificationId);
    // `place` some do objeto base (mesmo motivo do updatePhysicalResource): só assim
    // `placeId: null` (desvincular do local) consegue apagar um `current.place` existente
    // sob `exactOptionalPropertyTypes`.
    const { place: _currentPlace, ...currentWithoutPlace } = current;
    const place =
      input.placeId !== undefined
        ? await this.resolvePlace(input.placeId, input.placeType)
        : current.place;
    const supporting =
      input.supportingPhysicalResourceId !== undefined
        ? await this.getPhysicalResourceOrThrow(input.supportingPhysicalResourceId)
        : current.supportingPhysicalResourceId
          ? await this.getPhysicalResourceOrThrow(current.supportingPhysicalResourceId)
          : undefined;

    const updated = await this.repository.upsertLogicalResource({
      ...currentWithoutPlace,
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
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      resourceRelationship: current.resourceRelationship,
      characteristic: input.characteristic ?? current.characteristic,
      ...(place ? { place } : {}),
      ...(supporting ? { supportingPhysicalResourceId: supporting.id } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      current.status !== updated.status
        ? 'ResourceStateChangeEvent'
        : 'ResourceAttributeValueChangeEvent',
      updated.id,
      'LogicalResource',
      updated,
    );
    return updated;
  }

  public async deleteLogicalResource(id: string): Promise<LogicalResource> {
    const current = await this.getLogicalResourceOrThrow(id);
    const terminated = await this.repository.upsertLogicalResource({
      ...current,
      status: 'terminated',
      administrativeState: 'locked',
      operationalState: 'disabled',
      usageState: 'idle',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit('ResourceStateChangeEvent', terminated.id, 'LogicalResource', terminated);
    return terminated;
  }

  public async getLogicalResource(id: string): Promise<LogicalResource | undefined> {
    return await this.repository.getLogicalResource(id);
  }

  public async listLogicalResources(query?: ResourceQuery): Promise<LogicalResource[]> {
    return await this.repository.listLogicalResources({ ...query, kind: 'LogicalResource' });
  }

  public async getResource(id: string): Promise<Resource | undefined> {
    return (
      (await this.repository.getPhysicalResource(id)) ??
      (await this.repository.getLogicalResource(id))
    );
  }

  public async listResources(query?: ResourceQuery): Promise<Resource[]> {
    if (query?.kind === 'PhysicalResource') {
      return await this.repository.listPhysicalResources(query);
    }

    if (query?.kind === 'LogicalResource') {
      return await this.repository.listLogicalResources(query);
    }

    return await this.repository.listResources(query);
  }

  public async countResources(query?: ResourceQuery): Promise<number> {
    return await this.repository.countResources(query);
  }

  public async addResourceRelationship(
    resourceId: string,
    input: ResourceRelationship,
  ): Promise<ResourceRelationship> {
    assertName(input.relationshipType, 'relationshipType');
    await this.getResourceOrThrow(resourceId);
    await this.getResourceOrThrow(input.id);
    const relationship = await this.repository.upsertResourceRelationship(resourceId, input);
    const current = await this.getResourceOrThrow(resourceId);
    await this.emit('ResourceRelationshipCreateEvent', resourceId, current['@type'], {
      resourceId,
      relationship,
    });
    return relationship;
  }

  public async removeResourceRelationship(
    resourceId: string,
    relatedResourceId: string,
    relationshipType: string,
  ): Promise<boolean> {
    await this.getResourceOrThrow(resourceId);
    await this.getResourceOrThrow(relatedResourceId);
    const removed = await this.repository.deleteResourceRelationship(
      resourceId,
      relatedResourceId,
      relationshipType,
    );
    if (removed) {
      const current = await this.getResourceOrThrow(resourceId);
      await this.emit('ResourceRelationshipDeleteEvent', resourceId, current['@type'], {
        resourceId,
        relatedResourceId,
        relationshipType,
      });
    }
    return removed;
  }

  public async listResourceRelationships(resourceId: string): Promise<ResourceRelationship[]> {
    await this.getResourceOrThrow(resourceId);
    return await this.repository.listResourceRelationships(resourceId);
  }

  public async activateResource(input: ResourceFunctionActivationInput): Promise<Resource> {
    const current = await this.getResourceOrThrow(input.resourceId);
    const status = activationToStatus(input.action);
    const resource =
      current['@type'] === 'PhysicalResource'
        ? await this.repository.upsertPhysicalResource({
            ...current,
            status,
            administrativeState: status === 'terminated' ? 'locked' : 'unlocked',
            operationalState: status === 'active' ? 'enabled' : 'disabled',
            usageState: status === 'active' ? 'busy' : 'idle',
          })
        : await this.repository.upsertLogicalResource({
            ...current,
            status,
            administrativeState: status === 'terminated' ? 'locked' : 'unlocked',
            operationalState: status === 'active' ? 'enabled' : 'disabled',
            usageState: status === 'active' ? 'busy' : 'idle',
          });

    await this.emit('ResourceFunctionActivationEvent', resource.id, resource['@type'], {
      resourceId: resource.id,
      action: input.action ?? 'activate',
      reason: input.reason,
      resource,
    });
    return resource;
  }

  private async emit(
    eventType: string,
    entityId: string,
    entityType: string,
    payload: unknown,
  ): Promise<void> {
    await this.eventService.appendEvent({
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

  private async resolvePlace(
    placeId: string | null | undefined,
    placeType: string | undefined,
  ): Promise<{ id: string; '@referredType': string } | undefined> {
    if (!placeId) return undefined;
    const lookup = await this.dependencies.lookupPlace?.(placeId);
    if (!lookup) {
      throw new AppError('place not found', { code: 'RESOURCE_PLACE_NOT_FOUND', statusCode: 404 });
    }
    return {
      id: lookup.id,
      '@referredType': placeType ?? lookup['@referredType'] ?? 'GeographicLocation',
    };
  }

  private async syncMapFeature(resource: PhysicalResource): Promise<void> {
    // Resource ainda não possui tenant próprio no modelo de persistência; o inventário
    // atual é servido pelo tenant default, mesma regra do endpoint de tiles.
    await this.dependencies.mapFeatureSynchronizer?.syncEntity(resource.id, 'default');
  }

  private async getResourceSpecificationOrThrow(id: string): Promise<ResourceSpecification> {
    const spec = await this.repository.getResourceSpecification(id);
    if (!spec)
      throw new AppError('resource specification not found', {
        code: 'RESOURCE_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    return spec;
  }

  private async getResourceCategoryOrThrow(code: string): Promise<ResourceCategory> {
    assertName(code, 'category');
    const category = await this.repository.getResourceCategory(code.trim());
    if (!category)
      throw new AppError('resource category not found', {
        code: 'RESOURCE_CATEGORY_NOT_FOUND',
        statusCode: 404,
      });
    if (category.status !== 'active') {
      throw new AppError('resource category is inactive', {
        code: 'RESOURCE_CATEGORY_INACTIVE',
        statusCode: 409,
      });
    }
    return category;
  }

  private async getResourceTypeOrThrow(code: string): Promise<ResourceType> {
    assertName(code, 'resourceType');
    const resourceType = await this.repository.getResourceType(code.trim());
    if (!resourceType)
      throw new AppError('resource type not found', {
        code: 'RESOURCE_TYPE_NOT_FOUND',
        statusCode: 404,
      });
    if (resourceType.status !== 'active') {
      throw new AppError('resource type is inactive', {
        code: 'RESOURCE_TYPE_INACTIVE',
        statusCode: 409,
      });
    }
    return resourceType;
  }

  private assertResourceTypeMatchesCategory(
    resourceType: ResourceType,
    category: ResourceCategory,
  ): void {
    if (resourceType.categoryCode !== category.code) {
      throw new AppError('resource type is not allowed for category', {
        code: 'RESOURCE_TYPE_CATEGORY_MISMATCH',
        statusCode: 409,
      });
    }
  }

  private async getResourceFunctionSpecificationOrThrow(
    id: string,
  ): Promise<ResourceFunctionSpecification> {
    const spec = await this.repository.getResourceFunctionSpecification(id);
    if (!spec) {
      throw new AppError('resource function specification not found', {
        code: 'RESOURCE_FUNCTION_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    }
    return spec;
  }

  private async getPhysicalResourceOrThrow(id: string): Promise<PhysicalResource> {
    const resource = await this.repository.getPhysicalResource(id);
    if (!resource)
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }

  private async getLogicalResourceOrThrow(id: string): Promise<LogicalResource> {
    const resource = await this.repository.getLogicalResource(id);
    if (!resource)
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }

  private async getResourceOrThrow(id: string): Promise<Resource> {
    const resource = await this.getResource(id);
    if (!resource)
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }
}

const assertName = (value: unknown, field = 'name'): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(`${field} is required`, {
      code: 'RESOURCE_REQUIRED_FIELD',
      statusCode: 400,
    });
  }
};

const buildTimePeriod = (
  startDateTime: string | undefined,
  endDateTime: string,
): { startDateTime?: string; endDateTime: string } => {
  const period: { startDateTime?: string; endDateTime: string } = { endDateTime };
  if (startDateTime) {
    period.startDateTime = startDateTime;
  }
  return period;
};

const normalizeRelatedParties = async (
  relatedParty: RelatedParty[] | undefined,
  lookupParty?: ResourceServiceDependencies['lookupParty'],
): Promise<RelatedParty[]> => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;

  return await Promise.all(
    parties.map(async (party) => {
      const found = await lookupParty(party.id);
      if (!found) {
        throw new AppError('related party not found', {
          code: 'RESOURCE_PARTY_NOT_FOUND',
          statusCode: 404,
        });
      }
      const ref: RelatedParty = {
        id: found.id,
        '@referredType': found['@referredType'],
      };
      if (found.href) ref.href = found.href;
      if (found.name) ref.name = found.name;
      if (party.role) ref.role = party.role;
      return ref;
    }),
  );
};

const activationToStatus = (action: ResourceFunctionActivationInput['action']): ResourceStatus => {
  if (action === 'suspend') return 'suspended';
  if (action === 'terminate') return 'terminated';
  return 'active';
};
