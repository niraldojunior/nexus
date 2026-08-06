import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { EventService, RelatedParty, EntityRef } from '../../shared/tmf/index.js';
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
import type { IOrderRepository } from './order-repository-interface.js';
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
};

export class OrderService {
  public constructor(
    private readonly repository: IOrderRepository,
    private readonly eventService: EventService,
    private readonly dependencies: OrderDependencies,
  ) {}

  public async createServiceQualification(
    input: CreateServiceQualificationInput,
  ): Promise<ServiceQualification> {
    const place = await this.resolvePlace(input.placeId);
    const id = createCanonicalId();
    const result = await this.evaluateQualification(place?.id, input.serviceSpecificationId);
    const qualification: ServiceQualification = {
      '@type': 'ServiceQualification',
      id,
      href: `/tmf-api/serviceQualificationManagement/v4/serviceQualification/${id}`,
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
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceQualification(qualification);
    await this.emit('ServiceQualificationCreateEvent', stored, 'order.ServiceQualification');
    return stored;
  }

  public async updateServiceQualification(
    id: string,
    input: UpdateServiceQualificationInput,
  ): Promise<ServiceQualification> {
    const current = await this.getServiceQualificationOrThrow(id);
    const updated = await this.repository.upsertServiceQualification({
      ...current,
      state: input.state ?? current.state,
      place: input.placeId
        ? [
            (await this.resolvePlace(input.placeId)) ?? {
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
    );
    return updated;
  }

  public async listServiceQualifications(
    query?: ServiceQualificationQuery,
  ): Promise<ServiceQualification[]> {
    return await this.repository.listServiceQualifications(query);
  }

  public async getServiceQualification(id: string): Promise<ServiceQualification | undefined> {
    return await this.repository.getServiceQualification(id);
  }

  public async deleteServiceQualification(id: string): Promise<ServiceQualification> {
    const current = await this.getServiceQualificationOrThrow(id);
    const terminated = await this.repository.upsertServiceQualification({
      ...current,
      state: 'terminated',
    });
    await this.emit(
      'ServiceQualificationStateChangeEvent',
      terminated,
      'order.ServiceQualification',
    );
    return terminated;
  }

  public async createServiceOrder(input: CreateServiceOrderInput): Promise<ServiceOrder> {
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
      href: `/tmf-api/serviceOrderingManagement/v4/serviceOrder/${id}`,
      state: input.state ?? 'acknowledged',
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      serviceOrderItem: [],
      note: [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertServiceOrder(baseOrder);
    try {
      const processedItems = await Promise.all(
        input.serviceOrderItem.map(async (item) => await this.executeOrderItem(item)),
      );
      const completed = await this.repository.upsertServiceOrder({
        ...stored,
        state: 'completed',
        serviceOrderItem: processedItems,
      });
      await this.emit('ServiceOrderCreateEvent', completed, 'order.ServiceOrder');
      return completed;
    } catch (error) {
      const failed = await this.repository.upsertServiceOrder({ ...stored, state: 'failed' });
      await this.emit('ServiceOrderStateChangeEvent', failed, 'order.ServiceOrder');
      throw error;
    }
  }

  public async updateServiceOrder(
    id: string,
    input: UpdateServiceOrderInput,
  ): Promise<ServiceOrder> {
    const current = await this.getServiceOrderOrThrow(id);
    const updated = await this.repository.upsertServiceOrder({
      ...current,
      state: input.state ?? current.state,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    await this.emit('ServiceOrderStateChangeEvent', updated, 'order.ServiceOrder');
    return updated;
  }

  public async listServiceOrders(query?: ServiceOrderQuery): Promise<ServiceOrder[]> {
    return await this.repository.listServiceOrders(query);
  }

  public async getServiceOrder(id: string): Promise<ServiceOrder | undefined> {
    return await this.repository.getServiceOrder(id);
  }

  public async cancelServiceOrder(id: string): Promise<ServiceOrder> {
    const current = await this.getServiceOrderOrThrow(id);
    const cancelled = await this.repository.upsertServiceOrder({
      ...current,
      state: 'cancelled',
    });
    await this.emit('ServiceOrderStateChangeEvent', cancelled, 'order.ServiceOrder');
    return cancelled;
  }

  public async createResourceOrder(input: CreateResourceOrderInput): Promise<ResourceOrder> {
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
      href: `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${id}`,
      state: input.state ?? 'acknowledged',
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      resourceOrderItem: [],
      note: [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceOrder(baseOrder);
    try {
      const processedItems = await Promise.all(
        input.resourceOrderItem.map(async (item) => await this.executeResourceOrderItem(item)),
      );
      const completed = await this.repository.upsertResourceOrder({
        ...stored,
        state: 'completed',
        resourceOrderItem: processedItems,
      });
      await this.emit('ResourceOrderCreateEvent', completed, 'order.ResourceOrder');
      return completed;
    } catch (error) {
      const failed = await this.repository.upsertResourceOrder({ ...stored, state: 'failed' });
      await this.emit('ResourceOrderStateChangeEvent', failed, 'order.ResourceOrder');
      throw error;
    }
  }

  public async updateResourceOrder(
    id: string,
    input: UpdateResourceOrderInput,
  ): Promise<ResourceOrder> {
    const current = await this.getResourceOrderOrThrow(id);
    const updated = await this.repository.upsertResourceOrder({
      ...current,
      state: input.state ?? current.state,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    await this.emit('ResourceOrderStateChangeEvent', updated, 'order.ResourceOrder');
    return updated;
  }

  public async listResourceOrders(query?: ResourceOrderQuery): Promise<ResourceOrder[]> {
    return await this.repository.listResourceOrders(query);
  }

  public async getResourceOrder(id: string): Promise<ResourceOrder | undefined> {
    return await this.repository.getResourceOrder(id);
  }

  public async cancelResourceOrder(id: string): Promise<ResourceOrder> {
    const current = await this.getResourceOrderOrThrow(id);
    const cancelled = await this.repository.upsertResourceOrder({
      ...current,
      state: 'cancelled',
    });
    await this.emit('ResourceOrderStateChangeEvent', cancelled, 'order.ResourceOrder');
    return cancelled;
  }

  private async executeOrderItem(
    item: CreateServiceOrderInput['serviceOrderItem'][number],
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
    const serviceResult = await this.dependencies.serviceService.deleteService(item.serviceId);
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
  ): Promise<ResourceOrderItem> {
    const itemId = createCanonicalId();
    if (item.action === 'add') {
      if (!item.resource) {
        throw new AppError('resource payload required', {
          code: 'RESOURCE_ORDER_RESOURCE_REQUIRED',
          statusCode: 422,
        });
      }
      const resourceResult = await this.createResourceFromInput(item.resource);
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
    const current = await this.dependencies.resourceService.getResource(item.resourceId);
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

    const resourceResult = await this.deleteResourceByType(item.resourceId, current);
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
  ): Promise<{ qualified: boolean; reason?: string }> {
    if (!placeId) {
      return { qualified: false, reason: 'placeId required' };
    }

    const site = await this.dependencies.geoService.getSite(placeId);
    const address = await this.dependencies.geoService.getAddress(placeId);
    const location = await this.dependencies.geoService.getLocation(placeId);
    const resourceHit =
      (await this.dependencies.resourceService.listPhysicalResources({ placeId, status: 'active' }))
        .length > 0 ||
      (await this.dependencies.resourceService.listLogicalResources({ placeId, status: 'active' }))
        .length > 0;

    if (!site && !address && !location) {
      return { qualified: false, reason: 'place not found' };
    }

    return resourceHit
      ? { qualified: true }
      : { qualified: false, reason: 'no active supporting resource' };
  }

  private async resolvePlace(id: string | undefined): Promise<EntityRef | undefined> {
    if (!id) return undefined;
    const site = await this.dependencies.geoService.getSite(id);
    if (site)
      return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
    const address = await this.dependencies.geoService.getAddress(id);
    if (address)
      return { id: address.id, '@referredType': 'GeographicAddress', href: address.href };
    const location = await this.dependencies.geoService.getLocation(id);
    if (location)
      return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
    return undefined;
  }

  private async emit(
    eventType: string,
    payload: unknown,
    source = 'order.ServiceOrder',
  ): Promise<void> {
    const correlationId = (payload as { id?: string }).id;
    await this.eventService.appendEvent({
      eventType,
      source,
      eventData: payload as Record<string, unknown>,
      ...(correlationId ? { correlationId } : {}),
    });
  }

  private async getServiceQualificationOrThrow(id: string): Promise<ServiceQualification> {
    const qualification = await this.repository.getServiceQualification(id);
    if (!qualification)
      throw new AppError('service qualification not found', {
        code: 'SERVICE_QUALIFICATION_NOT_FOUND',
        statusCode: 404,
      });
    return qualification;
  }

  private async getServiceOrderOrThrow(id: string): Promise<ServiceOrder> {
    const order = await this.repository.getServiceOrder(id);
    if (!order)
      throw new AppError('service order not found', {
        code: 'SERVICE_ORDER_NOT_FOUND',
        statusCode: 404,
      });
    return order;
  }

  private async getResourceOrderOrThrow(id: string): Promise<ResourceOrder> {
    const order = await this.repository.getResourceOrder(id);
    if (!order)
      throw new AppError('resource order not found', {
        code: 'RESOURCE_ORDER_NOT_FOUND',
        statusCode: 404,
      });
    return order;
  }

  private async createResourceFromInput(input: ResourceOrderPayload): Promise<Resource> {
    if (input['@type'] === 'LogicalResource') {
      return await this.dependencies.resourceService.createLogicalResource(
        input as unknown as CreateLogicalResourceInput,
      );
    }
    return await this.dependencies.resourceService.createPhysicalResource(
      input as unknown as CreatePhysicalResourceInput,
    );
  }

  private async updateResourceFromInput(
    resourceId: string,
    input: ResourceOrderPayload,
    current: Resource,
  ): Promise<Resource> {
    if (current['@type'] === 'LogicalResource') {
      return await this.dependencies.resourceService.updateLogicalResource(
        resourceId,
        input as UpdateLogicalResourceInput,
      );
    }
    return await this.dependencies.resourceService.updatePhysicalResource(
      resourceId,
      input as UpdatePhysicalResourceInput,
    );
  }

  private async deleteResourceByType(resourceId: string, current: Resource): Promise<Resource> {
    if (current['@type'] === 'LogicalResource') {
      return await this.dependencies.resourceService.deleteLogicalResource(resourceId);
    }
    return await this.dependencies.resourceService.deletePhysicalResource(resourceId);
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
