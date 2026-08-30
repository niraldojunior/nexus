import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildHref, type EventService, type RelatedParty, type EntityRef } from '../../shared/tmf/index.js';
import type { GeoService } from '../geo/service.js';
import type { ResourceService } from '../resource/service.js';
import type { PartyService } from '../party/service.js';
import type { ServiceService } from '../service/service.js';
import type {
  CreateServiceOrderInput,
  CreateServiceQualificationInput,
  CreateResourceOrderInput,
  ResourceOrder,
  ResourceOrderItem,
  ResourceOrderQuery,
  ResourceOrderPayload,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderQuery,
  ServiceQualification,
  ServiceQualificationQuery,
  UpdateServiceOrderInput,
  UpdateServiceQualificationInput,
  UpdateResourceOrderInput,
} from './domain.js';
import type { IOrderRepository, OrderTenantScope } from './order-repository-interface.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { recordMutation } from '../../shared/persistence/audit-outbox.js';

const DEFAULT_TENANT_ID = 'default';
const tenantOf = (context?: RequestContext): string => context?.tenantId ?? DEFAULT_TENANT_ID;
const scopeOf = (context?: RequestContext): OrderTenantScope => ({ tenantId: tenantOf(context) });
import type { CreateServiceInput, UpdateServiceInput } from '../service/index.js';
import type {
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  Resource,
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
} from '../resource/index.js';

type OrderDependencies = {
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
  serviceService: ServiceService;
  geoService: GeoService;
  resourceService: ResourceService;
  partyService: PartyService;
  /** Trilha de auditoria + outbox (C7) — best-effort, ver nota em resource/service.ts. */
  db?: DatabaseClient;
};

export class OrderService {
  public constructor(
    private readonly repository: IOrderRepository,
    private readonly eventService: EventService,
    private readonly dependencies: OrderDependencies,
  ) {}

  public async createServiceQualification(
    input: CreateServiceQualificationInput,
    context?: RequestContext,
  ): Promise<ServiceQualification> {
    const place = await this.resolvePlace(input.placeId, context);
    const id = createCanonicalId();
    const result = await this.evaluateQualification(
      place?.id,
      input.serviceSpecificationId,
      context,
    );
    const qualification: ServiceQualification = {
      '@type': 'ServiceQualification',
      id,
      href: buildHref('serviceQualification', id),
      state: 'done',
      place: place ? [place] : [],
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      serviceCharacteristic: input.serviceCharacteristic ?? [],
      serviceQualificationItem: [
        {
          id: createCanonicalId(),
          ...(input.serviceSpecificationId
            ? {
                serviceSpecification: {
                  id: input.serviceSpecificationId,
                  '@referredType': 'ServiceSpecification',
                },
              }
            : {}),
          ...(input.serviceType ? { serviceType: input.serviceType } : {}),
          eligibility: result.qualified ? 'qualified' : 'unqualified',
          reason: result.reason,
        },
      ],
      tenantId: tenantOf(context),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceQualification(qualification);
    await this.emit(
      'ServiceQualificationCreateEvent',
      stored,
      'order.ServiceQualification',
      context,
    );
    return stored;
  }

  public async updateServiceQualification(
    id: string,
    input: UpdateServiceQualificationInput,
    context?: RequestContext,
  ): Promise<ServiceQualification> {
    const current = await this.getServiceQualificationOrThrow(id, context);
    const updated = await this.repository.upsertServiceQualification({
      ...current,
      state: input.state ?? current.state,
      place: input.placeId
        ? [
            (await this.resolvePlace(input.placeId, context)) ?? {
              id: input.placeId,
              '@referredType': input.placeType ?? 'GeographicSite',
            },
          ]
        : current.place,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      serviceCharacteristic: input.serviceCharacteristic ?? current.serviceCharacteristic,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    await this.emit(
      'ServiceQualificationAttributeValueChangeEvent',
      updated,
      'order.ServiceQualification',
      context,
    );
    return updated;
  }

  public async listServiceQualifications(
    query?: ServiceQualificationQuery,
    context?: RequestContext,
  ): Promise<ServiceQualification[]> {
    return await this.repository.listServiceQualifications({
      ...query,
      tenantId: tenantOf(context),
    });
  }

  public async getServiceQualification(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceQualification | undefined> {
    return await this.repository.getServiceQualification(id, scopeOf(context));
  }

  public async deleteServiceQualification(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceQualification> {
    const current = await this.getServiceQualificationOrThrow(id, context);
    const terminated = await this.repository.upsertServiceQualification({
      ...current,
      state: 'terminated',
    });
    await this.emit(
      'ServiceQualificationStateChangeEvent',
      terminated,
      'order.ServiceQualification',
      context,
    );
    return terminated;
  }

  public async createServiceOrder(
    input: CreateServiceOrderInput,
    context?: RequestContext,
  ): Promise<ServiceOrder> {
    if (!input.serviceOrderItem || input.serviceOrderItem.length === 0) {
      throw new AppError('serviceOrderItem required', {
        code: 'SERVICE_ORDER_ITEM_REQUIRED',
        statusCode: 422,
      });
    }

    const id = createCanonicalId();
    const baseOrder: ServiceOrder = {
      '@type': 'ServiceOrder',
      id,
      href: buildHref('serviceOrder', id),
      state: input.state ?? 'acknowledged',
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      serviceOrderItem: [],
      note: [],
      tenantId: tenantOf(context),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceOrder(baseOrder);
    try {
      const processedItems = await Promise.all(
        input.serviceOrderItem.map(async (item) => await this.executeOrderItem(item, context)),
      );
      const completed = await this.repository.upsertServiceOrder({
        ...stored,
        state: 'completed',
        serviceOrderItem: processedItems,
      });
      await this.emit('ServiceOrderCreateEvent', completed, 'order.ServiceOrder', context);
      return completed;
    } catch (error) {
      const failed = await this.repository.upsertServiceOrder({ ...stored, state: 'failed' });
      await this.emit('ServiceOrderStateChangeEvent', failed, 'order.ServiceOrder', context);
      throw error;
    }
  }

  public async updateServiceOrder(
    id: string,
    input: UpdateServiceOrderInput,
    context?: RequestContext,
  ): Promise<ServiceOrder> {
    const current = await this.getServiceOrderOrThrow(id, context);
    const updated = await this.repository.upsertServiceOrder({
      ...current,
      state: input.state ?? current.state,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    await this.emit('ServiceOrderStateChangeEvent', updated, 'order.ServiceOrder', context);
    return updated;
  }

  public async listServiceOrders(
    query?: ServiceOrderQuery,
    context?: RequestContext,
  ): Promise<ServiceOrder[]> {
    return await this.repository.listServiceOrders({ ...query, tenantId: tenantOf(context) });
  }

  public async getServiceOrder(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceOrder | undefined> {
    return await this.repository.getServiceOrder(id, scopeOf(context));
  }

  public async cancelServiceOrder(id: string, context?: RequestContext): Promise<ServiceOrder> {
    const current = await this.getServiceOrderOrThrow(id, context);
    const cancelled = await this.repository.upsertServiceOrder({
      ...current,
      state: 'cancelled',
    });
    await this.emit('ServiceOrderStateChangeEvent', cancelled, 'order.ServiceOrder', context);
    return cancelled;
  }

  public async createResourceOrder(
    input: CreateResourceOrderInput,
    context?: RequestContext,
  ): Promise<ResourceOrder> {
    if (!input.resourceOrderItem || input.resourceOrderItem.length === 0) {
      throw new AppError('resourceOrderItem required', {
        code: 'RESOURCE_ORDER_ITEM_REQUIRED',
        statusCode: 422,
      });
    }

    const id = createCanonicalId();
    const baseOrder: ResourceOrder = {
      '@type': 'ResourceOrder',
      id,
      href: buildHref('resourceOrder', id),
      state: input.state ?? 'acknowledged',
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      resourceOrderItem: [],
      note: [],
      tenantId: tenantOf(context),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceOrder(baseOrder);
    try {
      const processedItems = await Promise.all(
        input.resourceOrderItem.map(
          async (item) => await this.executeResourceOrderItem(item, context),
        ),
      );
      const completed = await this.repository.upsertResourceOrder({
        ...stored,
        state: 'completed',
        resourceOrderItem: processedItems,
      });
      await this.emit('ResourceOrderCreateEvent', completed, 'order.ResourceOrder', context);
      return completed;
    } catch (error) {
      const failed = await this.repository.upsertResourceOrder({ ...stored, state: 'failed' });
      await this.emit('ResourceOrderStateChangeEvent', failed, 'order.ResourceOrder', context);
      throw error;
    }
  }

  public async updateResourceOrder(
    id: string,
    input: UpdateResourceOrderInput,
    context?: RequestContext,
  ): Promise<ResourceOrder> {
    const current = await this.getResourceOrderOrThrow(id, context);
    const updated = await this.repository.upsertResourceOrder({
      ...current,
      state: input.state ?? current.state,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    await this.emit('ResourceOrderStateChangeEvent', updated, 'order.ResourceOrder', context);
    return updated;
  }

  public async listResourceOrders(
    query?: ResourceOrderQuery,
    context?: RequestContext,
  ): Promise<ResourceOrder[]> {
    return await this.repository.listResourceOrders({ ...query, tenantId: tenantOf(context) });
  }

  public async getResourceOrder(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceOrder | undefined> {
    return await this.repository.getResourceOrder(id, scopeOf(context));
  }

  public async cancelResourceOrder(id: string, context?: RequestContext): Promise<ResourceOrder> {
    const current = await this.getResourceOrderOrThrow(id, context);
    const cancelled = await this.repository.upsertResourceOrder({
      ...current,
      state: 'cancelled',
    });
    await this.emit('ResourceOrderStateChangeEvent', cancelled, 'order.ResourceOrder', context);
    return cancelled;
  }

  private async executeOrderItem(
    item: CreateServiceOrderInput['serviceOrderItem'][number],
    context?: RequestContext,
  ): Promise<ServiceOrderItem> {
    const itemId = createCanonicalId();
    if (item.action === 'add') {
      if (!item.service) {
        throw new AppError('service payload required', {
          code: 'SERVICE_ORDER_SERVICE_REQUIRED',
          statusCode: 422,
        });
      }
      const serviceResult = await this.dependencies.serviceService.createService(
        item.service as CreateServiceInput,
        context,
      );
      return {
        id: itemId,
        action: item.action,
        service: item.service,
        serviceResult,
        note: item.note,
      };
    }

    if (item.action === 'modify') {
      if (!item.serviceId || !item.service) {
        throw new AppError('serviceId and service payload required', {
          code: 'SERVICE_ORDER_SERVICE_REQUIRED',
          statusCode: 422,
        });
      }
      const serviceResult = await this.dependencies.serviceService.updateService(
        item.serviceId,
        item.service as UpdateServiceInput,
        context,
      );
      return {
        id: itemId,
        action: item.action,
        serviceId: item.serviceId,
        service: item.service,
        serviceResult,
        note: item.note,
      };
    }

    if (!item.serviceId) {
      throw new AppError('serviceId required', {
        code: 'SERVICE_ORDER_SERVICE_REQUIRED',
        statusCode: 422,
      });
    }
    const serviceResult = await this.dependencies.serviceService.deleteService(
      item.serviceId,
      context,
    );
    return {
      id: itemId,
      action: item.action,
      serviceId: item.serviceId,
      serviceResult,
      note: item.note,
    };
  }

  private async executeResourceOrderItem(
    item: CreateResourceOrderInput['resourceOrderItem'][number],
    context?: RequestContext,
  ): Promise<ResourceOrderItem> {
    const itemId = createCanonicalId();
    if (item.action === 'add') {
      if (!item.resource) {
        throw new AppError('resource payload required', {
          code: 'RESOURCE_ORDER_RESOURCE_REQUIRED',
          statusCode: 422,
        });
      }
      const resourceResult = await this.createResourceFromInput(item.resource, context);
      return {
        id: itemId,
        action: item.action,
        resource: item.resource,
        resourceResult,
        note: item.note,
      };
    }

    if (!item.resourceId) {
      throw new AppError('resourceId required', {
        code: 'RESOURCE_ORDER_RESOURCE_REQUIRED',
        statusCode: 422,
      });
    }
    const current = await this.dependencies.resourceService.getResource(item.resourceId, context);
    if (!current) {
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    }

    if (item.action === 'modify') {
      if (!item.resource) {
        throw new AppError('resource payload required', {
          code: 'RESOURCE_ORDER_RESOURCE_REQUIRED',
          statusCode: 422,
        });
      }
      const resourceResult = await this.updateResourceFromInput(
        item.resourceId,
        item.resource,
        current,
        context,
      );
      return {
        id: itemId,
        action: item.action,
        resourceId: item.resourceId,
        resource: item.resource,
        resourceResult,
        note: item.note,
      };
    }

    const resourceResult = await this.deleteResourceByType(item.resourceId, current, context);
    return {
      id: itemId,
      action: item.action,
      resourceId: item.resourceId,
      resourceResult,
      note: item.note,
    };
  }

  // `_serviceSpecificationId` ainda nao participa da decisao: a qualificacao hoje olha so o lugar e
  // a existencia de recurso ativo. O parametro fica na assinatura porque a regra alvo (TMF645) deve
  // considerar a especificacao do servico pedido.
  private async evaluateQualification(
    placeId: string | undefined,
    _serviceSpecificationId: string | undefined,
    context?: RequestContext,
  ): Promise<{ qualified: boolean; reason?: string }> {
    if (!placeId) {
      return { qualified: false, reason: 'placeId required' };
    }

    const site = await this.dependencies.geoService.getSite(placeId, context);
    const address = await this.dependencies.geoService.getAddress(placeId, context);
    const location = await this.dependencies.geoService.getLocation(placeId, context);
    const resourceHit =
      (
        await this.dependencies.resourceService.listPhysicalResources(
          { placeId, status: 'active' },
          context,
        )
      ).length > 0 ||
      (
        await this.dependencies.resourceService.listLogicalResources(
          { placeId, status: 'active' },
          context,
        )
      ).length > 0;

    if (!site && !address && !location) {
      return { qualified: false, reason: 'place not found' };
    }

    return resourceHit
      ? { qualified: true }
      : { qualified: false, reason: 'no active supporting resource' };
  }

  private async resolvePlace(
    id: string | undefined,
    context?: RequestContext,
  ): Promise<EntityRef | undefined> {
    if (!id) return undefined;
    const site = await this.dependencies.geoService.getSite(id, context);
    if (site)
      return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
    const address = await this.dependencies.geoService.getAddress(id, context);
    if (address)
      return { id: address.id, '@referredType': 'GeographicAddress', href: address.href };
    const location = await this.dependencies.geoService.getLocation(id, context);
    if (location)
      return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
    return undefined;
  }

  private async emit(
    eventType: string,
    payload: unknown,
    source = 'order.ServiceOrder',
    context?: RequestContext,
  ): Promise<void> {
    const correlationId = (payload as { id?: string }).id;
    const event = await this.eventService.appendEvent({
      eventType,
      source,
      eventData: payload as Record<string, unknown>,
      ...(correlationId ? { correlationId } : {}),
    });

    if (this.dependencies.db && context && correlationId) {
      // source é "order.ServiceQualification"/"order.ServiceOrder"/"order.ResourceOrder" —
      // o entityType da auditoria é a parte depois do ponto.
      const entityType = source.split('.').slice(1).join('.') || source;
      await recordMutation(this.dependencies.db, context, {
        action: eventType.includes('Create') ? 'create' : 'update',
        entityType,
        entityId: correlationId,
        after: payload,
        event,
        topic: 'tmf688.order',
      });
    }
  }

  private async getServiceQualificationOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceQualification> {
    const qualification = await this.repository.getServiceQualification(id, scopeOf(context));
    if (!qualification)
      throw new AppError('service qualification not found', {
        code: 'SERVICE_QUALIFICATION_NOT_FOUND',
        statusCode: 404,
      });
    return qualification;
  }

  private async getServiceOrderOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ServiceOrder> {
    const order = await this.repository.getServiceOrder(id, scopeOf(context));
    if (!order)
      throw new AppError('service order not found', {
        code: 'SERVICE_ORDER_NOT_FOUND',
        statusCode: 404,
      });
    return order;
  }

  private async getResourceOrderOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceOrder> {
    const order = await this.repository.getResourceOrder(id, scopeOf(context));
    if (!order)
      throw new AppError('resource order not found', {
        code: 'RESOURCE_ORDER_NOT_FOUND',
        statusCode: 404,
      });
    return order;
  }

  private async createResourceFromInput(
    input: ResourceOrderPayload,
    context?: RequestContext,
  ): Promise<Resource> {
    if (input['@type'] === 'LogicalResource') {
      return await this.dependencies.resourceService.createLogicalResource(
        input as unknown as CreateLogicalResourceInput,
        context,
      );
    }
    return await this.dependencies.resourceService.createPhysicalResource(
      input as unknown as CreatePhysicalResourceInput,
      context,
    );
  }

  private async updateResourceFromInput(
    resourceId: string,
    input: ResourceOrderPayload,
    current: Resource,
    context?: RequestContext,
  ): Promise<Resource> {
    if (current['@type'] === 'LogicalResource') {
      return await this.dependencies.resourceService.updateLogicalResource(
        resourceId,
        input as UpdateLogicalResourceInput,
        context,
      );
    }
    return await this.dependencies.resourceService.updatePhysicalResource(
      resourceId,
      input as UpdatePhysicalResourceInput,
      context,
    );
  }

  private async deleteResourceByType(
    resourceId: string,
    current: Resource,
    context?: RequestContext,
  ): Promise<Resource> {
    if (current['@type'] === 'LogicalResource') {
      return await this.dependencies.resourceService.deleteLogicalResource(resourceId, context);
    }
    return await this.dependencies.resourceService.deletePhysicalResource(resourceId, context);
  }
}

const normalizeRelatedParties = async (
  relatedParty: RelatedParty[] | undefined,
  lookupParty?: OrderDependencies['lookupParty'],
): Promise<RelatedParty[]> => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;
  return await Promise.all(
    parties.map(async (party) => {
      const found = await lookupParty(party.id);
      if (!found)
        throw new AppError('related party not found', {
          code: 'ORDER_PARTY_NOT_FOUND',
          statusCode: 404,
        });
      const ref: RelatedParty = { id: found.id, '@referredType': found['@referredType'] };
      if (found.href !== undefined) ref.href = found.href;
      if (found.name !== undefined) ref.name = found.name;
      if (party.role) ref.role = party.role;
      return ref;
    }),
  );
};
