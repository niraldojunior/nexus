import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';

import { EventEnvelope } from './tmf634-event.dto';

export type ResourceCategoryCreateEventDto = EventEnvelope<{
    resourceCategory: ResourceCategoryModel;
}>;

export type ResourceCategoryAttributeValueChangeEventDto = EventEnvelope<{
    resourceCategory: ResourceCategoryModel;
}>;

export type ResourceCategoryStatusChangeEventDto = EventEnvelope<{
    resourceCategory: ResourceCategoryModel;
}>;
