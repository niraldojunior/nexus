import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';

import { EventEnvelope } from './tmf634-event.dto';

export type ResourceSpecificationCreateEventDto = EventEnvelope<{
    resourceSpecification: ResourceSpecificationModel;
}>;

export type ResourceSpecificationAttributeValueChangeEventDto = EventEnvelope<{
    resourceSpecification: ResourceSpecificationModel;
}>;

export type ResourceSpecificationStatusChangeEventDto = EventEnvelope<{
    resourceSpecification: ResourceSpecificationModel;
}>;
