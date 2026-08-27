import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CharacteristicValue, EventService, RelatedParty } from '../../shared/tmf/index.js';
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
  ServiceSpecCharacteristic,
  ServiceSpecification,
  ServiceSpecificationBulkItem,
  ServiceSpecificationBulkItemResult,
  ServiceSpecificationBulkResult,
  ServiceSpecificationQuery,
  ServiceState,
  UpdateServiceCandidateInput,
  UpdateServiceCategoryInput,
  UpdateServiceInput,
  UpdateServiceSpecificationInput,
} from './domain.js';
import type { IServiceRepository, ServiceTenantScope } from './service-repository-interface.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { recordMutation } from '../../shared/persistence/audit-outbox.js';

const DEFAULT_TENANT_ID = 'default';
const tenantOf = (context?: RequestContext): string => context?.tenantId ?? DEFAULT_TENANT_ID;
const scopeOf = (context?: RequestContext): ServiceTenantScope => ({
  tenantId: tenantOf(context),
});

type ServiceDependencies = {
  lookupParty?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  lookupPlace?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  lookupResource?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  lookupService?: (id: string) => Promise<Service | undefined> | Service | undefined;
  /** Trilha de auditoria + outbox (C7) — best-effort, ver nota em resource/service.ts. */
  db?: DatabaseClient;
};

export class ServiceService {
  public constructor(
    private readonly repository: IServiceRepository,
    private readonly eventService: EventService,
    private readonly dependencies: ServiceDependencies = {},
  ) {}

  public async createServiceSpecification(
    input: CreateServiceSpecificationInput,
    context?: RequestContext,
  ): Promise<ServiceSpecification> {
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
      serviceSpecificationCharacteristic: normalizeSpecCharacteristics(
        input.serviceSpecificationCharacteristic,
      ),
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      tenantId: tenantOf(context),
      ...(input.description ? { description: input.description } : {}),
      ...(input.observation ? { observation: input.observation } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceSpecification(spec);
    await this.emit(
      'ServiceSpecificationCreateEvent',
      stored.id,
      'ServiceSpecification',
      stored,
      context,
    );
    return stored;
  }

  // Carga em massa do catálogo (Configurações → Catálogo de Serviços → Carga em massa). Mesmo
  // padrão do Resource (ver ResourceService.bulkCreateResourceSpecifications): reusa
  // createServiceSpecification linha a linha para herdar validação canônica e evento TMF688 por
  // item, mas segue o lote inteiro em vez de abortar na primeira falha.
  public async bulkCreateServiceSpecifications(
    items: ServiceSpecificationBulkItem[],
    context?: RequestContext,
  ): Promise<ServiceSpecificationBulkResult> {
    const results: ServiceSpecificationBulkItemResult[] = [];
    for (const item of items) {
      try {
        const created = await this.createServiceSpecification(item.input, context);
        results.push({ line: item.line, status: 'created', id: created.id, name: created.name });
      } catch (error) {
        results.push({
          line: item.line,
          status: 'error',
          name: item.input.name,
          code: error instanceof AppError ? error.code : 'SERVICE_SPEC_BULK_FAILED',
          message: error instanceof Error ? error.message : 'Falha ao criar especificação.',
        });
      }
    }
    const created = results.filter((result) => result.status === 'created').length;
    return { total: items.length, created, failed: items.length - created, results };
  }

  public async updateServiceSpecification(
    id: string,
    input: UpdateServiceSpecificationInput,
    context?: RequestContext,
  ): Promise<ServiceSpecification> {
    const current = await this.getServiceSpecificationOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    if (input.category !== undefined) assertName(input.category, 'category');

    const updated = await this.repository.upsertServiceSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      category: input.category !== undefined ? input.category.trim() : current.category,
      serviceType: input.serviceType ?? current.serviceType,
      serviceSpecificationCharacteristic:
        input.serviceSpecificationCharacteristic !== undefined
          ? normalizeSpecCharacteristics(input.serviceSpecificationCharacteristic)
          : current.serviceSpecificationCharacteristic,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.observation !== undefined ? { observation: input.observation } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      'ServiceSpecificationAttributeValueChangeEvent',
      updated.id,
      'ServiceSpecification',
      updated,
      context,
    );
    return updated;
  }

  public async deleteServiceSpecification(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceSpecification> {
    const current = await this.getServiceSpecificationOrThrow(id, context);
    const terminated = await this.repository.upsertServiceSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ServiceSpecificationAttributeValueChangeEvent',
      terminated.id,
      'ServiceSpecification',
      terminated,
      context,
    );
    return terminated;
  }

  public async listServiceSpecifications(
    query?: ServiceSpecificationQuery,
    context?: RequestContext,
  ): Promise<ServiceSpecification[]> {
    return await this.repository.listServiceSpecifications({
      ...query,
      tenantId: tenantOf(context),
    });
  }

  public async getServiceSpecification(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceSpecification | undefined> {
    return await this.repository.getServiceSpecification(id, scopeOf(context));
  }

  public async createServiceCategory(
    input: CreateServiceCategoryInput,
    context?: RequestContext,
  ): Promise<ServiceCategory> {
    assertName(input.name);
    const id = createCanonicalId();
    const category: ServiceCategory = {
      '@type': 'ServiceCategory',
      id,
      href: `/tmf-api/serviceCatalogManagement/v4/serviceCategory/${id}`,
      name: input.name.trim(),
      serviceCategoryCharacteristic: input.serviceCategoryCharacteristic ?? [],
      tenantId: tenantOf(context),
      ...(input.description ? { description: input.description } : {}),
      ...(input.parentCategoryId
        ? {
            parentServiceCategory: {
              id: input.parentCategoryId,
              '@referredType': 'ServiceCategory',
            },
          }
        : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceCategory(category);
    await this.emit('ServiceCategoryCreateEvent', stored.id, 'ServiceCategory', stored, context);
    return stored;
  }

  public async updateServiceCategory(
    id: string,
    input: UpdateServiceCategoryInput,
    context?: RequestContext,
  ): Promise<ServiceCategory> {
    const current = await this.getServiceCategoryOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    const updated = await this.repository.upsertServiceCategory({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      serviceCategoryCharacteristic:
        input.serviceCategoryCharacteristic ?? current.serviceCategoryCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parentCategoryId !== undefined
        ? {
            parentServiceCategory: {
              id: input.parentCategoryId,
              '@referredType': 'ServiceCategory',
            },
          }
        : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    await this.emit(
      'ServiceCategoryAttributeValueChangeEvent',
      updated.id,
      'ServiceCategory',
      updated,
      context,
    );
    return updated;
  }

  public async deleteServiceCategory(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceCategory> {
    const current = await this.getServiceCategoryOrThrow(id, context);
    const terminated = await this.repository.upsertServiceCategory({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ServiceCategoryAttributeValueChangeEvent',
      terminated.id,
      'ServiceCategory',
      terminated,
      context,
    );
    return terminated;
  }

  public async listServiceCategories(
    query?: ServiceCategoryQuery,
    context?: RequestContext,
  ): Promise<ServiceCategory[]> {
    return await this.repository.listServiceCategories({ ...query, tenantId: tenantOf(context) });
  }

  public async getServiceCategory(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceCategory | undefined> {
    return await this.repository.getServiceCategory(id, scopeOf(context));
  }

  public async createServiceCandidate(
    input: CreateServiceCandidateInput,
    context?: RequestContext,
  ): Promise<ServiceCandidate> {
    assertName(input.name);
    const spec = await this.getServiceSpecificationOrThrow(input.serviceSpecificationId, context);
    const category = input.serviceCategoryId
      ? await this.getServiceCategoryOrThrow(input.serviceCategoryId, context)
      : undefined;
    const id = createCanonicalId();
    const candidate: ServiceCandidate = {
      '@type': 'ServiceCandidate',
      id,
      href: `/tmf-api/serviceCatalogManagement/v4/serviceCandidate/${id}`,
      name: input.name.trim(),
      status: input.status ?? 'active',
      serviceSpecification: { id: spec.id, '@referredType': 'ServiceSpecification' },
      serviceCandidateCharacteristic: input.serviceCandidateCharacteristic ?? [],
      tenantId: tenantOf(context),
      ...(input.description ? { description: input.description } : {}),
      ...(category
        ? { serviceCategory: { id: category.id, '@referredType': 'ServiceCategory' } }
        : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceCandidate(candidate);
    await this.emit('ServiceCandidateCreateEvent', stored.id, 'ServiceCandidate', stored, context);
    return stored;
  }

  public async updateServiceCandidate(
    id: string,
    input: UpdateServiceCandidateInput,
    context?: RequestContext,
  ): Promise<ServiceCandidate> {
    const current = await this.getServiceCandidateOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    if (input.serviceSpecificationId !== undefined)
      await this.getServiceSpecificationOrThrow(input.serviceSpecificationId, context);
    if (input.serviceCategoryId !== undefined)
      await this.getServiceCategoryOrThrow(input.serviceCategoryId, context);

    const updated = await this.repository.upsertServiceCandidate({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      status: input.status ?? current.status,
      serviceSpecification: {
        id: input.serviceSpecificationId ?? current.serviceSpecification.id,
        '@referredType': 'ServiceSpecification',
      },
      serviceCandidateCharacteristic:
        input.serviceCandidateCharacteristic ?? current.serviceCandidateCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.serviceCategoryId !== undefined
        ? { serviceCategory: { id: input.serviceCategoryId, '@referredType': 'ServiceCategory' } }
        : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      'ServiceCandidateAttributeValueChangeEvent',
      updated.id,
      'ServiceCandidate',
      updated,
      context,
    );
    return updated;
  }

  public async deleteServiceCandidate(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceCandidate> {
    const current = await this.getServiceCandidateOrThrow(id, context);
    const terminated = await this.repository.upsertServiceCandidate({
      ...current,
      status: 'terminated',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ServiceCandidateAttributeValueChangeEvent',
      terminated.id,
      'ServiceCandidate',
      terminated,
      context,
    );
    return terminated;
  }

  public async listServiceCandidates(
    query?: ServiceCandidateQuery,
    context?: RequestContext,
  ): Promise<ServiceCandidate[]> {
    return await this.repository.listServiceCandidates({ ...query, tenantId: tenantOf(context) });
  }

  public async getServiceCandidate(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceCandidate | undefined> {
    return await this.repository.getServiceCandidate(id, scopeOf(context));
  }

  public async createService(input: CreateServiceInput, context?: RequestContext): Promise<Service> {
    return input['@type'] === 'ResourceFacingService' || 'supportingResource' in input
      ? await this.createResourceFacingService(input, context)
      : await this.createCustomerFacingService(input, context);
  }

  public async updateService(
    id: string,
    input: UpdateServiceInput,
    context?: RequestContext,
  ): Promise<Service> {
    const current = await this.getServiceOrThrow(id, context);
    if (current['@type'] === 'CustomerFacingService') {
      return await this.updateCustomerFacingService(id, input as UpdateServiceInput, context);
    }
    return await this.updateResourceFacingService(id, input as UpdateServiceInput, context);
  }

  public async createCustomerFacingService(
    input: CreateServiceInput,
    context?: RequestContext,
  ): Promise<CustomerFacingService> {
    if (input['@type'] && input['@type'] !== 'CustomerFacingService') {
      throw new AppError('service type mismatch', {
        code: 'SERVICE_TYPE_MISMATCH',
        statusCode: 422,
      });
    }
    const normalized = this.normalizeCustomerFacingInput(input as CreateServiceInput);
    const spec = await this.getServiceSpecificationOrThrow(
      normalized.serviceSpecificationId,
      context,
    );
    assertServiceType(spec.serviceType, 'CFS');
    assertName(normalized.name);
    assertSubscriberId(normalized.subscriberId);
    assertServiceState(normalized.state);
    const supportingService = await this.resolveSupportingServices(
      normalized.supportingService,
      'ResourceFacingService',
    );
    const relatedParty = await normalizeRelatedParties(
      normalized.relatedParty,
      this.dependencies.lookupParty,
    );
    const place = await normalizePlaces(normalized.place, this.dependencies.lookupPlace);
    const supportingResource = (
      normalized as Partial<CreateServiceInput> & { supportingResource?: ServiceReference[] }
    ).supportingResource;
    if (supportingResource && supportingResource.length > 0) {
      throw new AppError('CFS cannot reference supportingResource directly', {
        code: 'SERVICE_CFS_SUPPORTING_RESOURCE',
        statusCode: 422,
      });
    }
    if (supportingService.length === 0) {
      throw new AppError('CFS requires supportingService', {
        code: 'SERVICE_SUPPORTING_SERVICE_REQUIRED',
        statusCode: 422,
      });
    }
    await this.ensureSubscriberParty(relatedParty);

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
      serviceRelationship: await normalizeServiceRelationships(
        normalized.serviceRelationship,
        this.dependencies.lookupService,
      ),
      subscriberId: normalized.subscriberId.trim(),
      supportingService,
      tenantId: tenantOf(context),
      ...(normalized.validFor ? { validFor: normalized.validFor } : {}),
    };

    const stored = await this.repository.upsertCustomerFacingService(service);
    await this.emit('ServiceCreateEvent', stored.id, stored['@type'], stored, context);
    return stored;
  }

  public async createResourceFacingService(
    input: CreateServiceInput,
    context?: RequestContext,
  ): Promise<ResourceFacingService> {
    if (input['@type'] && input['@type'] !== 'ResourceFacingService') {
      throw new AppError('service type mismatch', {
        code: 'SERVICE_TYPE_MISMATCH',
        statusCode: 422,
      });
    }
    const normalized = this.normalizeResourceFacingInput(input as CreateServiceInput);
    const spec = await this.getServiceSpecificationOrThrow(
      normalized.serviceSpecificationId,
      context,
    );
    assertServiceType(spec.serviceType, 'RFS');
    assertName(normalized.name);
    assertServiceState(normalized.state);
    const supportingResource = await this.resolveSupportingResources(normalized.supportingResource);
    const supportingService = await this.resolveSupportingServices(
      normalized.supportingService,
      'ResourceFacingService',
    );
    const relatedParty = await normalizeRelatedParties(
      normalized.relatedParty,
      this.dependencies.lookupParty,
    );
    const place = await normalizePlaces(normalized.place, this.dependencies.lookupPlace);
    this.ensureNoSubscriber(relatedParty, normalized);
    if (supportingResource.length === 0) {
      throw new AppError('RFS requires supportingResource', {
        code: 'SERVICE_SUPPORTING_RESOURCE_REQUIRED',
        statusCode: 422,
      });
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
      serviceRelationship: await normalizeServiceRelationships(
        normalized.serviceRelationship,
        this.dependencies.lookupService,
      ),
      supportingResource,
      supportingService,
      tenantId: tenantOf(context),
      ...(normalized.validFor ? { validFor: normalized.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceFacingService(service);
    await this.emit('ServiceCreateEvent', stored.id, stored['@type'], stored, context);
    return stored;
  }

  public async updateCustomerFacingService(
    id: string,
    input: UpdateServiceInput,
    context?: RequestContext,
  ): Promise<CustomerFacingService> {
    const current = await this.getCustomerFacingServiceOrThrow(id, context);
    const normalized = this.normalizeCustomerFacingInput(input as UpdateServiceInput);
    if (
      normalized.serviceSpecificationId !== undefined &&
      normalized.serviceSpecificationId !== current.serviceSpecificationId
    ) {
      await this.getServiceSpecificationOrThrow(normalized.serviceSpecificationId, context);
    }

    const updated = await this.repository.upsertCustomerFacingService({
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
        ? await normalizeRelatedParties(normalized.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      place: normalized.place
        ? await normalizePlaces(normalized.place, this.dependencies.lookupPlace)
        : current.place,
      serviceRelationship: normalized.serviceRelationship
        ? await normalizeServiceRelationships(
            normalized.serviceRelationship,
            this.dependencies.lookupService,
          )
        : current.serviceRelationship,
      subscriberId:
        normalized.subscriberId !== undefined
          ? normalized.subscriberId.trim()
          : current.subscriberId,
      supportingService: normalized.supportingService
        ? await this.resolveSupportingServices(
            normalized.supportingService,
            'ResourceFacingService',
          )
        : current.supportingService,
      ...(normalized.validFor !== undefined ? { validFor: normalized.validFor } : {}),
    });

    await this.emit(
      current.state !== updated.state
        ? 'ServiceStateChangeEvent'
        : 'ServiceAttributeValueChangeEvent',
      updated.id,
      updated['@type'],
      updated,
      context,
    );
    return updated;
  }

  public async updateResourceFacingService(
    id: string,
    input: UpdateServiceInput,
    context?: RequestContext,
  ): Promise<ResourceFacingService> {
    const current = await this.getResourceFacingServiceOrThrow(id, context);
    const normalized = this.normalizeResourceFacingInput(input as UpdateServiceInput);
    if (
      normalized.serviceSpecificationId !== undefined &&
      normalized.serviceSpecificationId !== current.serviceSpecificationId
    ) {
      await this.getServiceSpecificationOrThrow(normalized.serviceSpecificationId, context);
    }

    const updated = await this.repository.upsertResourceFacingService({
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
        ? await normalizeRelatedParties(normalized.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      place: normalized.place
        ? await normalizePlaces(normalized.place, this.dependencies.lookupPlace)
        : current.place,
      serviceRelationship: normalized.serviceRelationship
        ? await normalizeServiceRelationships(
            normalized.serviceRelationship,
            this.dependencies.lookupService,
          )
        : current.serviceRelationship,
      supportingResource: normalized.supportingResource
        ? await this.resolveSupportingResources(normalized.supportingResource)
        : current.supportingResource,
      supportingService: normalized.supportingService
        ? await this.resolveSupportingServices(
            normalized.supportingService,
            'ResourceFacingService',
          )
        : current.supportingService,
      ...(normalized.validFor !== undefined ? { validFor: normalized.validFor } : {}),
    });

    await this.emit(
      current.state !== updated.state
        ? 'ServiceStateChangeEvent'
        : 'ServiceAttributeValueChangeEvent',
      updated.id,
      updated['@type'],
      updated,
      context,
    );
    return updated;
  }

  public async deleteService(id: string, context?: RequestContext): Promise<Service> {
    const current = await this.getServiceOrThrow(id, context);
    const terminated =
      current['@type'] === 'CustomerFacingService'
        ? await this.repository.upsertCustomerFacingService({
            ...current,
            state: 'terminated',
            validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
          })
        : await this.repository.upsertResourceFacingService({
            ...current,
            state: 'terminated',
            validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
          });

    await this.emit(
      'ServiceStateChangeEvent',
      terminated.id,
      terminated['@type'],
      terminated,
      context,
    );
    return terminated;
  }

  public async listServices(query?: ServiceQuery, context?: RequestContext): Promise<Service[]> {
    return await this.repository.listServices({ ...query, tenantId: tenantOf(context) });
  }

  public async countServices(query?: ServiceQuery, context?: RequestContext): Promise<number> {
    return await this.repository.countServices({ ...query, tenantId: tenantOf(context) });
  }

  public async getService(id: string, context?: RequestContext): Promise<Service | undefined> {
    return (
      (await this.repository.getCustomerFacingService(id, scopeOf(context))) ??
      (await this.repository.getResourceFacingService(id, scopeOf(context)))
    );
  }

  public async addServiceRelationship(
    serviceId: string,
    relationship: ServiceRelationship,
    context?: RequestContext,
  ): Promise<ServiceRelationship> {
    assertName(relationship.relationshipType, 'relationshipType');
    const current = await this.getServiceOrThrow(serviceId, context);
    await this.getServiceOrThrow(relationship.id, context);
    await this.updateService(
      serviceId,
      {
        serviceRelationship: [
          ...current.serviceRelationship.filter(
            (item) =>
              !(
                item.id === relationship.id &&
                item.relationshipType === relationship.relationshipType
              ),
          ),
          relationship,
        ],
      } as UpdateServiceInput,
      context,
    );
    await this.emit(
      'ServiceRelationshipCreateEvent',
      serviceId,
      current['@type'],
      { serviceId, relationship },
      context,
    );
    return relationship;
  }

  public async removeServiceRelationship(
    serviceId: string,
    relatedServiceId: string,
    relationshipType: string,
    context?: RequestContext,
  ): Promise<boolean> {
    const current = await this.getServiceOrThrow(serviceId, context);
    const next = current.serviceRelationship.filter(
      (item) => !(item.id === relatedServiceId && item.relationshipType === relationshipType),
    );
    if (next.length === current.serviceRelationship.length) return false;
    await this.updateService(
      serviceId,
      { serviceRelationship: next } as UpdateServiceInput,
      context,
    );
    await this.emit(
      'ServiceRelationshipDeleteEvent',
      serviceId,
      current['@type'],
      { serviceId, relatedServiceId, relationshipType },
      context,
    );
    return true;
  }

  public async listServiceRelationships(
    serviceId: string,
    context?: RequestContext,
  ): Promise<ServiceRelationship[]> {
    const current = await this.getServiceOrThrow(serviceId, context);
    return current.serviceRelationship;
  }

  private async emit(
    eventType: string,
    entityId: string,
    entityType: string,
    payload: unknown,
    context?: RequestContext,
  ): Promise<void> {
    const event = await this.eventService.appendEvent({
      eventType,
      source: `service.${entityType}`,
      correlationId: entityId,
      eventData: {
        entityId,
        entityType,
        payload,
      },
    });

    if (this.dependencies.db && context) {
      await recordMutation(this.dependencies.db, context, {
        action: eventType.includes('Create') ? 'create' : 'update',
        entityType,
        entityId,
        after: payload,
        event,
        topic: 'tmf688.service',
      });
    }
  }

  private async getServiceSpecificationOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceSpecification> {
    const spec = await this.repository.getServiceSpecification(id, scopeOf(context));
    if (!spec)
      throw new AppError('service specification not found', {
        code: 'SERVICE_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    return spec;
  }

  private async getServiceCategoryOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceCategory> {
    const category = await this.repository.getServiceCategory(id, scopeOf(context));
    if (!category)
      throw new AppError('service category not found', {
        code: 'SERVICE_CATEGORY_NOT_FOUND',
        statusCode: 404,
      });
    return category;
  }

  private async getServiceCandidateOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceCandidate> {
    const candidate = await this.repository.getServiceCandidate(id, scopeOf(context));
    if (!candidate)
      throw new AppError('service candidate not found', {
        code: 'SERVICE_CANDIDATE_NOT_FOUND',
        statusCode: 404,
      });
    return candidate;
  }

  private async getCustomerFacingServiceOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<CustomerFacingService> {
    const service = await this.repository.getCustomerFacingService(id, scopeOf(context));
    if (!service)
      throw new AppError('service not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    return service;
  }

  private async getResourceFacingServiceOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceFacingService> {
    const service = await this.repository.getResourceFacingService(id, scopeOf(context));
    if (!service)
      throw new AppError('service not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    return service;
  }

  private async getServiceOrThrow(id: string, context?: RequestContext): Promise<Service> {
    const service = await this.getService(id, context);
    if (!service)
      throw new AppError('service not found', { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
    return service;
  }

  private normalizeCustomerFacingInput(
    input: Partial<CreateServiceInput>,
  ): CreateServiceInput & { subscriberId: string } {
    return {
      ...(input as CreateServiceInput),
    } as CreateServiceInput & { subscriberId: string };
  }

  private normalizeResourceFacingInput(
    input: Partial<CreateServiceInput>,
  ): CreateServiceInput & { supportingResource: ServiceReference[] } {
    return {
      ...(input as CreateServiceInput),
    } as CreateServiceInput & { supportingResource: ServiceReference[] };
  }

  private async resolveSupportingServices(
    references: ServiceReference[] | undefined,
    expectedType: ServiceKind,
  ): Promise<ServiceReference[]> {
    const list = references ?? [];
    return await Promise.all(
      list.map(async (reference) => {
        const found = await this.dependencies.lookupService?.(reference.id);
        if (!found)
          throw new AppError('supporting service not found', {
            code: 'SERVICE_SUPPORTING_SERVICE_NOT_FOUND',
            statusCode: 422,
          });
        if (found['@type'] !== expectedType) {
          throw new AppError('supporting service type mismatch', {
            code: 'SERVICE_SUPPORTING_SERVICE_TYPE_MISMATCH',
            statusCode: 422,
          });
        }
        return refFromService(found, reference.role);
      }),
    );
  }

  private async resolveSupportingResources(
    references: ServiceReference[] | undefined,
  ): Promise<ServiceReference[]> {
    const list = references ?? [];
    return await Promise.all(
      list.map(async (reference) => {
        const found = await this.dependencies.lookupResource?.(reference.id);
        if (!found)
          throw new AppError('supporting resource not found', {
            code: 'SERVICE_SUPPORTING_RESOURCE_NOT_FOUND',
            statusCode: 422,
          });
        const ref: ServiceReference = {
          id: found.id,
          '@referredType': found['@referredType'],
        };
        if (found.href !== undefined) ref.href = found.href;
        if (found.name !== undefined) ref.name = found.name;
        if (reference.role) ref.role = reference.role;
        return ref;
      }),
    );
  }

  private async ensureSubscriberParty(relatedParty: RelatedParty[]): Promise<void> {
    if (!this.dependencies.lookupParty) return;
    const subscriber = relatedParty.find((item) => item.role === 'subscriber');
    if (subscriber && !(await this.dependencies.lookupParty(subscriber.id))) {
      throw new AppError('subscriber not found', {
        code: 'SERVICE_PARTY_NOT_FOUND',
        statusCode: 404,
      });
    }
  }

  private ensureNoSubscriber(
    relatedParty: RelatedParty[],
    input: Partial<CreateServiceInput>,
  ): void {
    if (input && 'subscriberId' in input && input.subscriberId) {
      throw new AppError('resource facing service cannot have subscriberId', {
        code: 'SERVICE_RFS_SUBSCRIBER_NOT_ALLOWED',
        statusCode: 422,
      });
    }
    if (relatedParty.some((item) => item.role === 'subscriber')) {
      throw new AppError('resource facing service cannot have subscriber relatedParty', {
        code: 'SERVICE_RFS_SUBSCRIBER_NOT_ALLOWED',
        statusCode: 422,
      });
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

// Descarta entradas sem nome e tolera o formato legado `{name, value, valueType}` (Characteristic),
// convertendo `value` em `characteristicValueSpecification` — specs gravadas antes da migração para
// ServiceSpecCharacteristic continuam legíveis sem precisar de backfill.
const normalizeSpecCharacteristics = (
  characteristics: ServiceSpecCharacteristic[] | undefined,
): ServiceSpecCharacteristic[] => {
  if (!characteristics) return [];
  return characteristics
    .filter((characteristic) => typeof characteristic.name === 'string' && characteristic.name.trim())
    .map((characteristic) => {
      const legacyValue = (characteristic as unknown as { value?: unknown }).value;
      if (
        characteristic.characteristicValueSpecification === undefined &&
        legacyValue !== undefined &&
        legacyValue !== null
      ) {
        return {
          ...characteristic,
          name: characteristic.name.trim(),
          characteristicValueSpecification: [{ value: legacyValue as CharacteristicValue }],
        };
      }
      return { ...characteristic, name: characteristic.name.trim() };
    });
};

const assertSubscriberId = (value: unknown): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('subscriberId is required', {
      code: 'SERVICE_SUBSCRIBER_REQUIRED',
      statusCode: 422,
    });
  }
};

const assertServiceType = (value: string, expected: 'CFS' | 'RFS'): void => {
  if (value !== expected) {
    throw new AppError('serviceSpecification type mismatch', {
      code: 'SERVICE_SPEC_TYPE_MISMATCH',
      statusCode: 422,
    });
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
  lookupParty?: ServiceDependencies['lookupParty'],
): Promise<RelatedParty[]> => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;

  return await Promise.all(
    parties.map(async (party) => {
      const found = await lookupParty(party.id);
      if (!found) {
        throw new AppError('related party not found', {
          code: 'SERVICE_PARTY_NOT_FOUND',
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

const normalizePlaces = async (
  place: ServiceReference[] | undefined,
  lookupPlace?: ServiceDependencies['lookupPlace'],
): Promise<ServiceReference[]> => {
  const list = place ?? [];
  if (!lookupPlace) return list;

  return await Promise.all(
    list.map(async (item) => {
      const found = await lookupPlace(item.id);
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
    }),
  );
};

const normalizeServiceRelationships = async (
  relationships: ServiceRelationship[] | undefined,
  lookupService?: ServiceDependencies['lookupService'],
): Promise<ServiceRelationship[]> => {
  const list = relationships ?? [];
  if (!lookupService) return list;

  return await Promise.all(
    list.map(async (relationship) => {
      const found = await lookupService(relationship.id);
      if (!found) {
        throw new AppError('service relationship target not found', {
          code: 'SERVICE_NOT_FOUND',
          statusCode: 404,
        });
      }
      return {
        id: found.id,
        '@referredType': 'Service',
        relationshipType: relationship.relationshipType,
        ...(relationship.validFor ? { validFor: relationship.validFor } : {}),
      };
    }),
  );
};
