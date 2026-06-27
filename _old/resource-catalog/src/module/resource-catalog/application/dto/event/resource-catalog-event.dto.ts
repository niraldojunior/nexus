import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';

import { EventEnvelope } from './tmf634-event.dto';

export type ResourceCatalogCreateEventDto = EventEnvelope<{
    resourceCatalog: ResourceCatalogModel;
}>;

export type ResourceCatalogAttributeValueChangeEventDto = EventEnvelope<{
    resourceCatalog: ResourceCatalogModel;
}>;

export type ResourceCatalogStatusChangeEventDto = EventEnvelope<{
    resourceCatalog: ResourceCatalogModel;
}>;
