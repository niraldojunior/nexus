import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { EventService, RelatedParty } from '../../shared/tmf/index.js';
import type { GeoService } from '../geo/service.js';
import type { ResourceService } from '../resource/service.js';
import type {
  CreateServiceCandidateInput,
  CreateServiceCategoryInput,
  CreateServiceInput,
  CreateServiceSpecificationInput,
  CustomerFacingService,
  ResourceFacingService,
  Service,
  ServiceCandidate,
  ServiceCandidateQuery,
  ServiceCategory,
  ServiceCategoryQuery,
  ServiceKind,
  ServiceQuery,
  ServiceReference,
  ServiceRelationship,
  ServiceSpecification,
  ServiceSpecificationQuery,
  ServiceState,
  UpdateServiceCandidateInput,
  UpdateServiceCategoryInput,
  UpdateServiceInput,
  UpdateServiceSpecificationInput,
} from './domain.js';
import type { IServiceRepository } from './service-repository-interface.js';

type ServiceDependencies = {
  lookupParty?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
  lookupPlace?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
  lookupResource?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
  lookupService?: (id: string) => Service | undefined;
};

export class ServiceService {
  public constructor(
    private readonly repository: IServiceRepository,
    private readonly eventService: EventService,
    private readonly dependencies: ServiceDependencies = {},
  ) {}

  public createServiceSpecification(input: CreateServiceSpecificationInput): ServiceSpecification {
    assertName(input.name);
    assertName(input.category, 'category');
    const id = createCanonicalId();
    const spec: ServiceSpecification = {
      '@type': 'ServiceSpecification',
      id,
      href: `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${id}`,
      name: input.name.trim(),
      category: input.category.trim(),
      serviceType: input.serviceType,
      serviceSpecificationCharacteristic: input.serviceSpecificationCharacteristic ?? [],
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertServiceSpecification(spec);
    this.emit('ServiceSpecificationCreateEvent', stored.id, 'ServiceSpecification', stored);
    return stored;
  }

  public updateServiceSpecification(id: string, input: UpdateServiceSpecificationInput): ServiceSpecification {
    const current = this.getServiceSpecificationOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    if (input.category !== undefined) assertName(input.category, 'category');

    const updated = this.repository.upsertServiceSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      category: input.category !== undefined ? input.category.trim() : current.category,
      serviceType: input.serviceType ?? current.serviceType,
      serviceSpecificationCharacteristic: input.serviceSpecificationCharacteristic ?? current.serviceSpecificationCharacteristic,
      relatedParty: input.relatedParty
        ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit('ServiceSpecificationAttributeValueChangeEvent', updated.id, 'ServiceSpecification', updated);
    return updated;
  }

  public deleteServiceSpecification(id: string): ServiceSpecification {
    const current = this.getServiceSpecificationOrThrow(id);
    const terminated = this.repository.upsertServiceSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('ServiceSpecificationAttributeValueChangeEvent', terminated.id, 'ServiceSpecification', terminated);
    return terminated;
  }

  public listServiceSpecifications(query?: ServiceSpecificationQuery): ServiceSpecification[] {
    return this.repository.listServiceSpecifications(query);
  }

  public getServiceSpecification(id: string): ServiceSpecification | undefined {
    return this.repository.getServiceSpecification(id);
  }

  public createServiceCategory(input: CreateServiceCategoryInput): ServiceCategory {
    assertName(input.name);
    const id = createCanonicalId();
    const category: ServiceCategory = {
      '@type': 'ServiceCategory',
      id,
      href: `/tmf-api/serviceCatalogManagement/v4/serviceCategory/${id}`,
      name: input.name.trim(),
      serviceCategoryCharacteristic: input.serviceCategoryCharacteristic ?? [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.parentCategoryId ? { parentServiceCategory: { id: input.parentCategoryId, '@referredType': 'ServiceCategory' } } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertServiceCategory(category);
    this.emit('ServiceCategoryCreateEvent', stored.id, 'ServiceCategory', stored);
    return stored;
  }

  public updateServiceCategory(id: string, input: UpdateServiceCategoryInput): ServiceCategory {
    const current = this.getServiceCategoryOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    const updated = this.repository.upsertServiceCategory({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      serviceCategoryCharacteristic: input.serviceCategoryCharacteristic ?? current.serviceCategoryCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parentCategoryId !== undefined
        ? { parentServiceCategory: { id: input.parentCategoryId, '@referredType': 'ServiceCategory' } }
        : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    this.emit('ServiceCategoryAttributeValueChangeEvent', updated.id, 'ServiceCategory', updated);
    return updated;
  }

  public deleteServiceCategory(id: string): ServiceCategory {
    const current = this.getServiceCategoryOrThrow(id);
    const terminated = this.repository.upsertServiceCategory({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('ServiceCategoryAttributeValueChangeEvent', terminated.id, 'ServiceCategory', terminated);
    return terminated;
  }

  public listServiceCategories(query?: ServiceCategoryQuery): ServiceCategory[] {
    return this.repository.listServiceCategories(query);
  }

  public getServiceCategory(id: string): ServiceCategory | undefined {
    return this.repository.getServiceCategory(id);
  }

  public createServiceCandidate(input: CreateServiceCandidateInput): ServiceCandidate {
    assertName(input.name);
    const spec = this.getServiceSpecificationOrThrow(input.serviceSpecificationId);
    const category = input.serviceCategoryId ? this.getServiceCategoryOrThrow(input.serviceCategoryId) : undefined;
    const id = createCanonicalId();
    const candidate: ServiceCandidate = {
      '@type': 'ServiceCandidate',
      id,
      href: `/tmf-api/serviceCatalogManagement/v4/serviceCandidate/${id}`,
      name: input.name.trim(),
      status: input.status ?? 'active',
      serviceSpecification: { id: spec.id, '@referredType': 'ServiceSpecification' },
      serviceCandidateCharacteristic: input.serviceCandidateCharacteristic ?? [],
      ...(input.description ? { description: input.description } : {}),
      ...(category ? { serviceCategory: { id: category.id, '@referredType': 'ServiceCategory' } } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertServiceCandidate(candidate);
    this.emit('ServiceCandidateCreateEvent', stored.id, 'ServiceCandidate', stored);
    return stored;
  }

  public updateServiceCandidate(id: string, input: UpdateServiceCandidateInput): ServiceCandidate {
    const current = this.getServiceCandidateOrThrow(id);
    if (input.name !== undefined) assertName(input.name);
    if (input.serviceSpecificationId !== undefined) this.getServiceSpecificationOrThrow(input.serviceSpecificationId);
    if (input.serviceCategoryId !== undefined) this.getServiceCategoryOrThrow(input.serviceCategoryId);

    const updated = this.repository.upsertServiceCandidate({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      status: input.status ?? current.status,
      serviceSpecification: {
        id: input.serviceSpecificationId ?? current.serviceSpecification.id,
        '@referredType': 'ServiceSpecification',
      },
      serviceCandidateCharacteristic: input.serviceCandidateCharacteristic ?? current.serviceCandidateCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.serviceCategoryId !== undefined
        ? { serviceCategory: { id: input.serviceCategoryId, '@referredType': 'ServiceCategory' } }
        : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit('ServiceCandidateAttributeValueChangeEvent', updated.id, 'ServiceCandidate', updated);
    return updated;
  }

  public deleteServiceCandidate(id: string): ServiceCandidate {
    const current = this.getServiceCandidateOrThrow(id);
    const terminated = this.repository.upsertServiceCandidate({
      ...current,
      status: 'terminated',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('ServiceCandidateAttributeValueChangeEvent', terminated.id, 'ServiceCandidate', terminated);
    return terminated;
  }

  public listServiceCandidates(query?: ServiceCandidateQuery): ServiceCandidate[] {
    return this.repository.listServiceCandidates(query);
  }

  public getServiceCandidate(id: string): ServiceCandidate | undefined {
    return this.repository.getServiceCandidate(id);
  }

  public createService(input: CreateServiceInput): Service {
    return input['@type'] === 'ResourceFacingService' || 'supportingResource' in input
      ? this.createResourceFacingService(input)
      : this.createCustomerFacingService(input);
  }

  public updateService(id: string, input: UpdateServiceInput): Service {
    const current = this.getServiceOrThrow(id);
    if (current['@type'] === 'CustomerFacingService') {
      return this.updateCustomerFacingService(id, input as UpdateServiceInput);
    }
    return this.updateResourceFacingService(id, input as UpdateServiceInput);
  }

  public createCustomerFacingService(input: CreateServiceInput): CustomerFacingService {
    if (input['@type'] && input['@type'] !== 'CustomerFacingService') {
      throw new AppError('service type mismatch', { code: 'SERVICE_TYPE_MISMATCH', statusCode: 422 });
    }
    const normalized = this.normalizeCustomerFacingInput(input as CreateServiceInput);
    const spec = this.getServiceSpecificationOrThrow(normalized.serviceSpecificationId);
    assertServiceType(spec.serviceType, 'CFS');
    assertName(normalized.name);
    assertSubscriberId(normalized.subscriberId);
    assertServiceState(normalized.state);
    const supportingService = this.resolveSupportingServices(normalized.supportingService, 'ResourceFacingService');
    const relatedParty = normalizeRelatedParties(normalized.relatedParty, this.dependencies.lookupParty);
    const place = normalizePlaces(normalized.place, this.dependencies.lookupPlace);
    const supportingResource = (normalized as Partial<CreateServiceInput> & { supportingResource?: ServiceReference[] }).supportingResource;
    if (supportingResource && supportingResource.length > 0) {
      throw new AppError('CFS cannot reference supportingResource directly', { code: 'SERVICE_CFS_SUPPORTING_RESOURCE', statusCode: 422 });
    }
    if (supportingService.length === 0) {
      throw new AppError('CFS requires supportingService', { code: 'SERVICE_SUPPORTING_SERVICE_REQUIRED', statusCode: 422 });
    }
    this.ensureSubscriberParty(relatedParty);

    const id = createCanonicalId();
    const service: CustomerFacingService = {
      '@type': 'CustomerFacingService',
      id,
      href: `/tmf-api/serviceInventoryManagement/v4/service/${id}`,
      name: normalized.name.trim(),
      serviceSpecificationId: spec.id,
      serviceSpecification: { id: spec.id, '@referredType': 'ServiceSpecification' },
      serviceType: normalized.serviceType?.trim(),
      category: normalized.category?.trim(),
      state: normalized.state ?? 'active',
      serviceDate: normalized.serviceDate,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      isServiceEnabled: normalized.isServiceEnabled,
      hasStarted: normalized.hasStarted,
      serviceCharacteristic: normalized.serviceCharacteristic ?? [],
      relatedParty,
      place,
      serviceRelationship: normalizeServiceRelationships(normalized.serviceRelationship, this.dependencies.lookupService),
      subscriberId: normalized.subscriberId.trim(),
      supportingService,
      ...(normalized.validFor ? { validFor: normalized.validFor } : {}),
    };

    const stored = this.repository.upsertCustomerFacingService(service);
    this.emit('ServiceCreateEvent', stored.id, stored['@type'], stored);
    return stored;
  }

  public createResourceFacingService(input: CreateServiceInput): ResourceFacingService {
    if (input['@type'] && input['@type'] !== 'ResourceFacingService') {
      throw new AppError('service type mismatch', { code: 'SERVICE_TYPE_MISMATCH', statusCode: 422 });
    }
    const normalized = this.normalizeResourceFacingInput(input as CreateServiceInput);
    const spec = this.getServiceSpecificationOrThrow(normalized.serviceSpecificationId);
    assertServiceType(spec.serviceType, 'RFS');
    assertName(normalized.name);
    assertServiceState(normalized.state);
    const supportingResource = this.resolveSupportingResources(normalized.supportingResource);
    const supportingService = this.resolveSupportingServices(normalized.supportingService, 'ResourceFacingService');
    const relatedParty = normalizeRelatedParties(normalized.relatedParty, this.dependencies.lookupParty);
    const place = normalizePlaces(normalized.place, this.dependencies.lookupPlace);
    this.ensureNoSubscriber(relatedParty, normalized);
    if (supportingResource.length === 0) {
      throw new AppError('RFS requires supportingResource', { code: 'SERVICE_SUPPORTING_RESOURCE_REQUIRED', statusCode: 422 });
    }

    const id = createCanonicalId();
    const service: ResourceFacingService = {
      '@type': 'ResourceFacingService',
      id,
      href: `/tmf-api/serviceInventoryManagement/v4/service/${id}`,
      name: normalized.name.trim(),
      serviceSpecificationId: spec.id,
      serviceSpecification: { id: spec.id, '@referredType': 'ServiceSpecification' },
      serviceType: normalized.serviceType?.trim(),
      category: normalized.category?.trim(),
      state: normalized.state ?? 'active',
      serviceDate: normalized.serviceDate,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      isServiceEnabled: normalized.isServiceEnabled,
      hasStarted: normalized.hasStarted,
      serviceCharacteristic: normalized.serviceCharacteristic ?? [],
      relatedParty,
      place,
      serviceRelationship: normalizeServiceRelationships(normalized.serviceRelationship, this.dependencies.lookupService),
      supportingResource,
      supportingService,
      ...(normalized.validFor ? { validFor: normalized.validFor } : {}),
    };

    const stored = this.repository.upsertResourceFacingService(service);
    this.emit('ServiceCreateEvent', stored.id, stored['@type'], stored);
    return stored;
  }

  public updateCustomerFacingService(id: string, input: UpdateServiceInput): CustomerFacingService {
    const current = this.getCustomerFacingServiceOrThrow(id);
    const normalized = this.normalizeCustomerFacingInput(input as UpdateServiceInput);
    if (normalized.serviceSpecificationId !== undefined && normalized.serviceSpecificationId !== current.serviceSpecificationId) {
      this.getServiceSpecificationOrThrow(normalized.serviceSpecificationId);
    }

    const updated = this.repository.upsertCustomerFacingService({
      ...current,
      name: normalized.name !== undefined ? normalized.name.trim() : current.name,
      serviceSpecificationId: normalized.serviceSpecificationId ?? current.serviceSpecificationId,
      serviceSpecification: {
        id: normalized.serviceSpecificationId ?? current.serviceSpecificationId,
        '@referredType': 'ServiceSpecification',
      },
      serviceType: normalized.serviceType ?? current.serviceType,
      category: normalized.category ?? current.category,
      state: normalized.state ?? current.state,
      serviceDate: normalized.serviceDate ?? current.serviceDate,
      startDate: normalized.startDate ?? current.startDate,
      endDate: normalized.endDate ?? current.endDate,
      isServiceEnabled: normalized.isServiceEnabled ?? current.isServiceEnabled,
      hasStarted: normalized.hasStarted ?? current.hasStarted,
      serviceCharacteristic: normalized.serviceCharacteristic ?? current.serviceCharacteristic,
      relatedParty: normalized.relatedParty
        ? normalizeRelatedParties(normalized.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      place: normalized.place ? normalizePlaces(normalized.place, this.dependencies.lookupPlace) : current.place,
      serviceRelationship: normalized.serviceRelationship
        ? normalizeServiceRelationships(normalized.serviceRelationship, this.dependencies.lookupService)
        : current.serviceRelationship,
      subscriberId: normalized.subscriberId !== undefined ? normalized.subscriberId.trim() : current.subscriberId,
      supportingService: normalized.supportingService
        ? this.resolveSupportingServices(normalized.supportingService, 'ResourceFacingService')
        : current.supportingService,
      ...(normalized.validFor !== undefined ? { validFor: normalized.validFor } : {}),
    });

    this.emit(current.state !== updated.state ? 'ServiceStateChangeEvent' : 'ServiceAttributeValueChangeEvent', updated.id, updated['@type'], updated);
    return updated;
  }

  public updateResourceFacingService(id: string, input: UpdateServiceInput): ResourceFacingService {
    const current = this.getResourceFacingServiceOrThrow(id);
    const normalized = this.normalizeResourceFacingInput(input as UpdateServiceInput);
    if (normalized.serviceSpecificationId !== undefined && normalized.serviceSpecificationId !== current.serviceSpecificationId) {
      this.getServiceSpecificationOrThrow(normalized.serviceSpecificationId);
    }

    const updated = this.repository.upsertResourceFacingService({
      ...current,
      name: normalized.name !== undefined ? normalized.name.trim() : current.name,
      serviceSpecificationId: normalized.serviceSpecificationId ?? current.serviceSpecificationId,
      serviceSpecification: {
        id: normalized.serviceSpecificationId ?? current.serviceSpecificationId,
        '@referredType': 'ServiceSpecification',
      },
      serviceType: normalized.serviceType ?? current.serviceType,
      category: normalized.category ?? current.category,
      state: normalized.state ?? current.state,
      serviceDate: normalized.serviceDate ?? current.serviceDate,
      startDate: normalized.startDate ?? current.startDate,
      endDate: normalized.endDate ?? current.endDate,
      isServiceEnabled: normalized.isServiceEnabled ?? current.isServiceEnabled,
      hasStarted: normalized.hasStarted ?? current.hasStarted,
      serviceCharacteristic: normalized.serviceCharacteristic ?? current.serviceCharacteristic,
      relatedParty: normalized.relatedParty
        ? normalizeRelatedParties(normalized.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      place: normalized.place ? normalizePlaces(normalized.place, this.dependencies.lookupPlace) : current.place,
      serviceRelationship: normalized.serviceRelationship
        ? normalizeServiceRelationships(normalized.serviceRelationship, this.dependencies.lookupService)
        : current.serviceRelationship,
      supportingResource: normalized.supportingResource
        ? this.resolveSupportingResources(normalized.supportingResource)
        : current.supportingResource,
      supportingService: normalized.supportingService
        ? this.resolveSupportingServices(normalized.supportingService, 'ResourceFacingService')
        : current.supportingService,
      ...(normalized.validFor !== undefined ? { validFor: normalized.validFor } : {}),
    });

    this.emit(current.state !== updated.state ? 'ServiceStateChangeEvent' : 'ServiceAttributeValueChangeEvent', updated.id, updated['@type'], updated);
    return updated;
  }

  public deleteService(id: string): Service {
    const current = this.getServiceOrThrow(id);
    const terminated =
      current['@type'] === 'CustomerFacingService'
        ? this.repository.upsertCustomerFacingService({
            ...current,
            state: 'terminated',
            validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
          })
        : this.repository.upsertResourceFacingService({
            ...current,
            state: 'terminated',
            validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
          });

    this.emit('ServiceStateChangeEvent', terminated.id, terminated['@type'], terminated);
    return terminated;
  }

  public listServices(query?: ServiceQuery): Service[] {
    return this.repository.listServices(query);
  }

  public countServices(query?: ServiceQuery): number {
    return this.repository.countServices(query);
  }

  public getService(id: string): Service | undefined {
    return this.repository.getCustomerFacingService(id) ?? this.repository.getResourceFacingService(id);
  }

  public addServiceRelationship(serviceId: string, relationship: ServiceRelationship): ServiceRelationship {
    assertName(relationship.relationshipType, 'relationshipType');
    const current = this.getServiceOrThrow(serviceId);
    this.getServiceOrThrow(relationship.id);
    const updated = this.updateService(serviceId, {
      serviceRelationship: [...current.serviceRelationship.filter((item) => !(item.id === relationship.id && item.relationshipType === relationship.relationshipType)), relationship],
    } as UpdateServiceInput);
    this.emit('ServiceRelationshipCreateEvent', serviceId, current['@type'], { serviceId, relationship });
    return relationship;
  }

  public removeServiceRelationship(serviceId: string, relatedServiceId: string, relationshipType: string): boolean {
    const current = this.getServiceOrThrow(serviceId);
    const next = current.serviceRelationship.filter((item) => !(item.id === relatedServiceId && item.relationshipType === relationshipType));
    if (next.length === current.serviceRelationship.length) return false;
    this.updateService(serviceId, { serviceRelationship: next } as UpdateServiceInput);
    this.emit('ServiceRelationshipDeleteEvent', serviceId, current['@type'], { serviceId, relatedServiceId, relationshipType });
    return true;
  }

  public listServiceRelationships(serviceId: string): ServiceRelationship[] {
    const current = this.getServiceOrThrow(serviceId);
    return current.serviceRelationship;
  }

  private emit(eventType: string, entityId: string, entityType: string, payload: unknown): void {
    this.eventService.appendEvent({
      eventType,
      source: `service.${entityType}`,
      correlationId: entityId,
      eventData: {
        entityId,
        entityType,
        payload,
      },
    });
  }

  private getServiceSpecificationOrThrow(id: string): ServiceSpecification {
    const spec = this.repository.getServiceSpecification(id);
    if (!spec) throw new AppError('service specification not found', { code: 'SERVICE_SPEC_NOT_FOUND', statusCode: 404 });
    return spec;
  }

  private getServiceCategoryOrThrow(id: string): ServiceCategory {
    const category = this.repository.getServiceCategory(id);
    if (!category) throw new AppError('service category not found', { code: 'SERVICE_CATEGORY_NOT_FOUND', statusCode: 404 });
    return category;
  }

  private getServiceCandidateOrThrow(id: string): ServiceCandidate {
    const candidate = this.repository.getServiceCandidate(id);
    if (!candidate) throw new AppError('service candidate not found', { code: 'SERVICE_CANDIDATE_NOT_FOUND', statusCode: 404 });
    return candidate;
  }

  private getCustomerFacingServiceOrThrow(id: string): CustomerFacingService {
    const service = this.repository.getCustomerFacingService(id);
    if (!service) throw new AppError('service not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    return service;
  }

  private getResourceFacingServiceOrThrow(id: string): ResourceFacingService {
    const service = this.repository.getResourceFacingService(id);
    if (!service) throw new AppError('service not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    return service;
  }

  private getServiceOrThrow(id: string): Service {
    const service = this.getService(id);
    if (!service) throw new AppError('service not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    return service;
  }

  private normalizeCustomerFacingInput(input: Partial<CreateServiceInput>): CreateServiceInput & { subscriberId: string } {
    return {
      ...(input as CreateServiceInput),
    } as CreateServiceInput & { subscriberId: string };
  }

  private normalizeResourceFacingInput(input: Partial<CreateServiceInput>): CreateServiceInput & { supportingResource: ServiceReference[] } {
    return {
      ...(input as CreateServiceInput),
    } as CreateServiceInput & { supportingResource: ServiceReference[] };
  }

  private resolveSupportingServices(
    references: ServiceReference[] | undefined,
    expectedType: ServiceKind,
  ): ServiceReference[] {
    const list = references ?? [];
    return list.map((reference) => {
      const found = this.dependencies.lookupService?.(reference.id);
      if (!found) throw new AppError('supporting service not found', { code: 'SERVICE_SUPPORTING_SERVICE_NOT_FOUND', statusCode: 422 });
      if (found['@type'] !== expectedType) {
        throw new AppError('supporting service type mismatch', { code: 'SERVICE_SUPPORTING_SERVICE_TYPE_MISMATCH', statusCode: 422 });
      }
      return refFromService(found, reference.role);
    });
  }

  private resolveSupportingResources(references: ServiceReference[] | undefined): ServiceReference[] {
    const list = references ?? [];
    return list.map((reference) => {
      const found = this.dependencies.lookupResource?.(reference.id);
      if (!found) throw new AppError('supporting resource not found', { code: 'SERVICE_SUPPORTING_RESOURCE_NOT_FOUND', statusCode: 422 });
      const ref: ServiceReference = {
        id: found.id,
        '@referredType': found['@referredType'],
      };
      if (found.href !== undefined) ref.href = found.href;
      if (found.name !== undefined) ref.name = found.name;
      if (reference.role) ref.role = reference.role;
      return ref;
    });
  }

  private ensureSubscriberParty(relatedParty: RelatedParty[]): void {
    if (!this.dependencies.lookupParty) return;
    const subscriber = relatedParty.find((item) => item.role === 'subscriber');
    if (subscriber && !this.dependencies.lookupParty(subscriber.id)) {
      throw new AppError('subscriber not found', { code: 'SERVICE_PARTY_NOT_FOUND', statusCode: 404 });
    }
  }

  private ensureNoSubscriber(relatedParty: RelatedParty[], input: Partial<CreateServiceInput>): void {
    if (input && 'subscriberId' in input && input.subscriberId) {
      throw new AppError('resource facing service cannot have subscriberId', { code: 'SERVICE_RFS_SUBSCRIBER_NOT_ALLOWED', statusCode: 422 });
    }
    if (relatedParty.some((item) => item.role === 'subscriber')) {
      throw new AppError('resource facing service cannot have subscriber relatedParty', { code: 'SERVICE_RFS_SUBSCRIBER_NOT_ALLOWED', statusCode: 422 });
    }
  }
}

const refFromService = (service: Service, role?: string): ServiceReference => ({
  id: service.id,
  '@referredType': service['@type'],
  ...(service.href ? { href: service.href } : {}),
  ...(service.name ? { name: service.name } : {}),
  ...(role ? { role } : {}),
});

const assertName = (value: unknown, field = 'name'): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
};

const assertSubscriberId = (value: unknown): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('subscriberId is required', { code: 'SERVICE_SUBSCRIBER_REQUIRED', statusCode: 422 });
  }
};

const assertServiceType = (value: string, expected: 'CFS' | 'RFS'): void => {
  if (value !== expected) {
    throw new AppError('serviceSpecification type mismatch', { code: 'SERVICE_SPEC_TYPE_MISMATCH', statusCode: 422 });
  }
};

const assertServiceState = (value: ServiceState | undefined): void => {
  if (value === undefined) return;
  if (
    value !== 'feasibilityChecked' &&
    value !== 'designed' &&
    value !== 'reserved' &&
    value !== 'inactive' &&
    value !== 'active' &&
    value !== 'terminated'
  ) {
    throw new AppError('invalid service state', { code: 'SERVICE_STATE_INVALID', statusCode: 422 });
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
  lookupParty?: ServiceDependencies['lookupParty'],
): RelatedParty[] => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;

  return parties.map((party) => {
    const found = lookupParty(party.id);
    if (!found) {
      throw new AppError('related party not found', { code: 'SERVICE_PARTY_NOT_FOUND', statusCode: 404 });
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

const normalizePlaces = (
  place: ServiceReference[] | undefined,
  lookupPlace?: ServiceDependencies['lookupPlace'],
): ServiceReference[] => {
  const list = place ?? [];
  if (!lookupPlace) return list;

  return list.map((item) => {
    const found = lookupPlace(item.id);
    if (!found) {
      throw new AppError('place not found', { code: 'SERVICE_PLACE_NOT_FOUND', statusCode: 404 });
    }
    const ref: ServiceReference = {
      id: found.id,
      '@referredType': found['@referredType'],
    };
    if (found.href !== undefined) ref.href = found.href;
    if (found.name !== undefined) ref.name = found.name;
    if (item.role) ref.role = item.role;
    return ref;
  });
};

const normalizeServiceRelationships = (
  relationships: ServiceRelationship[] | undefined,
  lookupService?: ServiceDependencies['lookupService'],
): ServiceRelationship[] => {
  const list = relationships ?? [];
  if (!lookupService) return list;

  return list.map((relationship) => {
    const found = lookupService(relationship.id);
    if (!found) {
      throw new AppError('service relationship target not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    }
    return {
      id: found.id,
      '@referredType': 'Service',
      relationshipType: relationship.relationshipType,
      ...(relationship.validFor ? { validFor: relationship.validFor } : {}),
    };
  });
};
