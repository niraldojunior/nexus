import {
    ResourceCandidateAttributeValueChangeEventDto,
    ResourceCandidateCreateEventDto,
    ResourceCandidateStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-candidate-event.dto';
import {
    ResourceCatalogAttributeValueChangeEventDto,
    ResourceCatalogCreateEventDto,
    ResourceCatalogStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-catalog-event.dto';
import {
    ResourceCategoryAttributeValueChangeEventDto,
    ResourceCategoryCreateEventDto,
    ResourceCategoryStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-category-event.dto';
import {
    ResourceSpecificationAttributeValueChangeEventDto,
    ResourceSpecificationCreateEventDto,
    ResourceSpecificationStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-specification-event.dto';

export const TMF634_EVENT_DISPATCHER = 'TMF634_EVENT_DISPATCHER';

export interface EventDispatcherPort {
    dispatchResourceCatalogCreate(
        event: ResourceCatalogCreateEventDto,
    ): Promise<void>;
    dispatchResourceCatalogAttributeValueChange(
        event: ResourceCatalogAttributeValueChangeEventDto,
    ): Promise<void>;
    dispatchResourceCatalogStatusChange(
        event: ResourceCatalogStatusChangeEventDto,
    ): Promise<void>;

    dispatchResourceCategoryCreate(
        event: ResourceCategoryCreateEventDto,
    ): Promise<void>;
    dispatchResourceCategoryAttributeValueChange(
        event: ResourceCategoryAttributeValueChangeEventDto,
    ): Promise<void>;
    dispatchResourceCategoryStatusChange(
        event: ResourceCategoryStatusChangeEventDto,
    ): Promise<void>;

    dispatchResourceSpecificationCreate(
        event: ResourceSpecificationCreateEventDto,
    ): Promise<void>;
    dispatchResourceSpecificationAttributeValueChange(
        event: ResourceSpecificationAttributeValueChangeEventDto,
    ): Promise<void>;
    dispatchResourceSpecificationStatusChange(
        event: ResourceSpecificationStatusChangeEventDto,
    ): Promise<void>;

    dispatchResourceCandidateCreate(
        event: ResourceCandidateCreateEventDto,
    ): Promise<void>;
    dispatchResourceCandidateAttributeValueChange(
        event: ResourceCandidateAttributeValueChangeEventDto,
    ): Promise<void>;
    dispatchResourceCandidateStatusChange(
        event: ResourceCandidateStatusChangeEventDto,
    ): Promise<void>;
}
