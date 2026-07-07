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
  ResourceOrderState,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderQuery,
  ServiceOrderState,
  ServiceQualification,
  ServiceQualificationItem,
  ServiceQualificationQuery,
  ServiceQualificationState,
  UpdateServiceOrderInput,
  UpdateServiceQualificationInput,
  UpdateResourceOrderInput,
} from './domain.js';
import type { IOrderRepository } from './order-repository-interface.js';
import type { CreateServiceInput, UpdateServiceInput } from '../service/index.js';
import type {
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  LogicalResource,
  PhysicalResource,
  Resource,
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
} from '../resource/index.js';

type OrderDependencies = {
  lookupParty?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
  lookupPlace?: (id: string) => { id: string; '@referredType': string; href?: string; name?: string } | undefined;
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

  public createServiceQualification(input: CreateServiceQualificationInput): ServiceQualification {
    const place = this.resolvePlace(input.placeId);
    const id = createCanonicalId();
    const result = this.evaluateQualification(place?.id, input.serviceSpecificationId);
    const qualification: ServiceQualification = {
      '@type': 'ServiceQualification',
      id,
      href: `/tmf-api/serviceQualificationManagement/v4/serviceQualification/${id}`,
      state: 'done',
      place: place ? [place] : [],
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      serviceCharacteristic: input.serviceCharacteristic ?? [],
      serviceQualificationItem: [
        {
          id: createCanonicalId(),
          ...(input.serviceSpecificationId ? { serviceSpecification: { id: input.serviceSpecificationId, '@referredType': 'ServiceSpecification' } } : {}),
          ...(input.serviceType ? { serviceType: input.serviceType } : {}),
          eligibility: result.qualified ? 'qualified' : 'unqualified',
          reason: result.reason,
        },
      ],
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertServiceQualification(qualification);
    this.emit('ServiceQualificationCreateEvent', stored, 'order.ServiceQualification');
    return stored;
  }

  public updateServiceQualification(id: string, input: UpdateServiceQualificationInput): ServiceQualification {
    const current = this.getServiceQualificationOrThrow(id);
    const updated = this.repository.upsertServiceQualification({
      ...current,
      state: input.state ?? current.state,
      place: input.placeId ? [this.resolvePlace(input.placeId) ?? { id: input.placeId, '@referredType': input.placeType ?? 'GeographicSite' }] : current.place,
      relatedParty: input.relatedParty ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty) : current.relatedParty,
      serviceCharacteristic: input.serviceCharacteristic ?? current.serviceCharacteristic,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    this.emit('ServiceQualificationAttributeValueChangeEvent', updated, 'order.ServiceQualification');
    return updated;
  }

  public listServiceQualifications(query?: ServiceQualificationQuery): ServiceQualification[] {
    return this.repository.listServiceQualifications(query);
  }

  public getServiceQualification(id: string): ServiceQualification | undefined {
    return this.repository.getServiceQualification(id);
  }

  public deleteServiceQualification(id: string): ServiceQualification {
    const current = this.getServiceQualificationOrThrow(id);
    const terminated = this.repository.upsertServiceQualification({
      ...current,
      state: 'terminated',
    });
    this.emit('ServiceQualificationStateChangeEvent', terminated, 'order.ServiceQualification');
    return terminated;
  }

  public createServiceOrder(input: CreateServiceOrderInput): ServiceOrder {
    if (!input.serviceOrderItem || input.serviceOrderItem.length === 0) {
      throw new AppError('serviceOrderItem required', { code: 'SERVICE_ORDER_ITEM_REQUIRED', statusCode: 422 });
    }

    const id = createCanonicalId();
    const baseOrder: ServiceOrder = {
      '@type': 'ServiceOrder',
      id,
      href: `/tmf-api/serviceOrderingManagement/v4/serviceOrder/${id}`,
      state: input.state ?? 'acknowledged',
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      serviceOrderItem: [],
      note: [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertServiceOrder(baseOrder);
    try {
      const processedItems = input.serviceOrderItem.map((item) => this.executeOrderItem(item));
      const completed = this.repository.upsertServiceOrder({
        ...stored,
        state: 'completed',
        serviceOrderItem: processedItems,
      });
      this.emit('ServiceOrderCreateEvent', completed, 'order.ServiceOrder');
      return completed;
    } catch (error) {
      const failed = this.repository.upsertServiceOrder({ ...stored, state: 'failed' });
      this.emit('ServiceOrderStateChangeEvent', failed, 'order.ServiceOrder');
      throw error;
    }
  }

  public updateServiceOrder(id: string, input: UpdateServiceOrderInput): ServiceOrder {
    const current = this.getServiceOrderOrThrow(id);
    const updated = this.repository.upsertServiceOrder({
      ...current,
      state: input.state ?? current.state,
      relatedParty: input.relatedParty ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty) : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    this.emit('ServiceOrderStateChangeEvent', updated, 'order.ServiceOrder');
    return updated;
  }

  public listServiceOrders(query?: ServiceOrderQuery): ServiceOrder[] {
    return this.repository.listServiceOrders(query);
  }

  public getServiceOrder(id: string): ServiceOrder | undefined {
    return this.repository.getServiceOrder(id);
  }

  public cancelServiceOrder(id: string): ServiceOrder {
    const current = this.getServiceOrderOrThrow(id);
    const cancelled = this.repository.upsertServiceOrder({
      ...current,
      state: 'cancelled',
    });
    this.emit('ServiceOrderStateChangeEvent', cancelled, 'order.ServiceOrder');
    return cancelled;
  }

  public createResourceOrder(input: CreateResourceOrderInput): ResourceOrder {
    if (!input.resourceOrderItem || input.resourceOrderItem.length === 0) {
      throw new AppError('resourceOrderItem required', { code: 'RESOURCE_ORDER_ITEM_REQUIRED', statusCode: 422 });
    }

    const id = createCanonicalId();
    const baseOrder: ResourceOrder = {
      '@type': 'ResourceOrder',
      id,
      href: `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${id}`,
      state: input.state ?? 'acknowledged',
      relatedParty: normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty),
      resourceOrderItem: [],
      note: [],
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertResourceOrder(baseOrder);
    try {
      const processedItems = input.resourceOrderItem.map((item) => this.executeResourceOrderItem(item));
      const completed = this.repository.upsertResourceOrder({
        ...stored,
        state: 'completed',
        resourceOrderItem: processedItems,
      });
      this.emit('ResourceOrderCreateEvent', completed, 'order.ResourceOrder');
      return completed;
    } catch (error) {
      const failed = this.repository.upsertResourceOrder({ ...stored, state: 'failed' });
      this.emit('ResourceOrderStateChangeEvent', failed, 'order.ResourceOrder');
      throw error;
    }
  }

  public updateResourceOrder(id: string, input: UpdateResourceOrderInput): ResourceOrder {
    const current = this.getResourceOrderOrThrow(id);
    const updated = this.repository.upsertResourceOrder({
      ...current,
      state: input.state ?? current.state,
      relatedParty: input.relatedParty ? normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty) : current.relatedParty,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });
    this.emit('ResourceOrderStateChangeEvent', updated, 'order.ResourceOrder');
    return updated;
  }

  public listResourceOrders(query?: ResourceOrderQuery): ResourceOrder[] {
    return this.repository.listResourceOrders(query);
  }

  public getResourceOrder(id: string): ResourceOrder | undefined {
    return this.repository.getResourceOrder(id);
  }

  public cancelResourceOrder(id: string): ResourceOrder {
    const current = this.getResourceOrderOrThrow(id);
    const cancelled = this.repository.upsertResourceOrder({
      ...current,
      state: 'cancelled',
    });
    this.emit('ResourceOrderStateChangeEvent', cancelled, 'order.ResourceOrder');
    return cancelled;
  }

  private executeOrderItem(item: CreateServiceOrderInput['serviceOrderItem'][number]): ServiceOrderItem {
    const itemId = createCanonicalId();
    if (item.action === 'add') {
      if (!item.service) {
        throw new AppError('service payload required', { code: 'SERVICE_ORDER_SERVICE_REQUIRED', statusCode: 422 });
      }
      const serviceResult = this.dependencies.serviceService.createService(item.service as CreateServiceInput);
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
        throw new AppError('serviceId and service payload required', { code: 'SERVICE_ORDER_SERVICE_REQUIRED', statusCode: 422 });
      }
      const serviceResult = this.dependencies.serviceService.updateService(item.serviceId, item.service as UpdateServiceInput);
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
      throw new AppError('serviceId required', { code: 'SERVICE_ORDER_SERVICE_REQUIRED', statusCode: 422 });
    }
    const serviceResult = this.dependencies.serviceService.deleteService(item.serviceId);
    return {
      id: itemId,
      action: item.action,
      serviceId: item.serviceId,
      serviceResult,
      note: item.note,
    };
  }

  private executeResourceOrderItem(item: CreateResourceOrderInput['resourceOrderItem'][number]): ResourceOrderItem {
    const itemId = createCanonicalId();
    if (item.action === 'add') {
      if (!item.resource) {
        throw new AppError('resource payload required', { code: 'RESOURCE_ORDER_RESOURCE_REQUIRED', statusCode: 422 });
      }
      const resourceResult = this.createResourceFromInput(item.resource);
      return {
        id: itemId,
        action: item.action,
        resource: item.resource,
        resourceResult,
        note: item.note,
      };
    }

    if (!item.resourceId) {
      throw new AppError('resourceId required', { code: 'RESOURCE_ORDER_RESOURCE_REQUIRED', statusCode: 422 });
    }
    const current = this.dependencies.resourceService.getResource(item.resourceId);
    if (!current) {
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    }

    if (item.action === 'modify') {
      if (!item.resource) {
        throw new AppError('resource payload required', { code: 'RESOURCE_ORDER_RESOURCE_REQUIRED', statusCode: 422 });
      }
      const resourceResult = this.updateResourceFromInput(item.resourceId, item.resource, current);
      return {
        id: itemId,
        action: item.action,
        resourceId: item.resourceId,
        resource: item.resource,
        resourceResult,
        note: item.note,
      };
    }

    const resourceResult = this.deleteResourceByType(item.resourceId, current);
    return {
      id: itemId,
      action: item.action,
      resourceId: item.resourceId,
      resourceResult,
      note: item.note,
    };
  }

  private evaluateQualification(placeId: string | undefined, serviceSpecificationId: string | undefined): { qualified: boolean; reason?: string } {
    if (!placeId) {
      return { qualified: false, reason: 'placeId required' };
    }

    const site = this.dependencies.geoService.getSite(placeId);
    const address = this.dependencies.geoService.getAddress(placeId);
    const location = this.dependencies.geoService.getLocation(placeId);
    const resourceHit =
      this.dependencies.resourceService.listPhysicalResources({ placeId, status: 'active' }).length > 0 ||
      this.dependencies.resourceService.listLogicalResources({ placeId, status: 'active' }).length > 0;

    if (!site && !address && !location) {
      return { qualified: false, reason: 'place not found' };
    }

    return resourceHit ? { qualified: true } : { qualified: false, reason: 'no active supporting resource' };
  }

  private resolvePlace(id: string | undefined): EntityRef | undefined {
    if (!id) return undefined;
    const site = this.dependencies.geoService.getSite(id);
    if (site) return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
    const address = this.dependencies.geoService.getAddress(id);
    if (address) return { id: address.id, '@referredType': 'GeographicAddress', href: address.href };
    const location = this.dependencies.geoService.getLocation(id);
    if (location) return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
    return undefined;
  }

  private emit(eventType: string, payload: unknown, source = 'order.ServiceOrder'): void {
    const correlationId = (payload as { id?: string }).id;
    this.eventService.appendEvent({
      eventType,
      source,
      eventData: payload as Record<string, unknown>,
      ...(correlationId ? { correlationId } : {}),
    });
  }

  private getServiceQualificationOrThrow(id: string): ServiceQualification {
    const qualification = this.repository.getServiceQualification(id);
    if (!qualification) throw new AppError('service qualification not found', { code: 'SERVICE_QUALIFICATION_NOT_FOUND', statusCode: 404 });
    return qualification;
  }

  private getServiceOrderOrThrow(id: string): ServiceOrder {
    const order = this.repository.getServiceOrder(id);
    if (!order) throw new AppError('service order not found', { code: 'SERVICE_ORDER_NOT_FOUND', statusCode: 404 });
    return order;
  }

  private getResourceOrderOrThrow(id: string): ResourceOrder {
    const order = this.repository.getResourceOrder(id);
    if (!order) throw new AppError('resource order not found', { code: 'RESOURCE_ORDER_NOT_FOUND', statusCode: 404 });
    return order;
  }

  private createResourceFromInput(input: ResourceOrderPayload): Resource {
    if (input['@type'] === 'LogicalResource') {
      return this.dependencies.resourceService.createLogicalResource(input as unknown as CreateLogicalResourceInput);
    }
    return this.dependencies.resourceService.createPhysicalResource(input as unknown as CreatePhysicalResourceInput);
  }

  private updateResourceFromInput(
    resourceId: string,
    input: ResourceOrderPayload,
    current: Resource,
  ): Resource {
    if (current['@type'] === 'LogicalResource') {
      return this.dependencies.resourceService.updateLogicalResource(resourceId, input as UpdateLogicalResourceInput);
    }
    return this.dependencies.resourceService.updatePhysicalResource(resourceId, input as UpdatePhysicalResourceInput);
  }

  private deleteResourceByType(resourceId: string, current: Resource): Resource {
    if (current['@type'] === 'LogicalResource') {
      return this.dependencies.resourceService.deleteLogicalResource(resourceId);
    }
    return this.dependencies.resourceService.deletePhysicalResource(resourceId);
  }
}

const normalizeRelatedParties = (
  relatedParty: RelatedParty[] | undefined,
  lookupParty?: OrderDependencies['lookupParty'],
): RelatedParty[] => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;
  return parties.map((party) => {
    const found = lookupParty(party.id);
    if (!found) throw new AppError('related party not found', { code: 'ORDER_PARTY_NOT_FOUND', statusCode: 404 });
    const ref: RelatedParty = { id: found.id, '@referredType': found['@referredType'] };
    if (found.href !== undefined) ref.href = found.href;
    if (found.name !== undefined) ref.name = found.name;
    if (party.role) ref.role = party.role;
    return ref;
  });
};
