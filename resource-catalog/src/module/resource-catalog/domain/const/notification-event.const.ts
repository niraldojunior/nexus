export const NotificationEvent = {
    RESOURCE_CATALOG_CREATE_EVENT: 'ResourceCatalogCreateEvent',
    RESOURCE_CATALOG_DELETE_EVENT: 'ResourceCatalogDeleteEvent',
    RESOURCE_CATALOG_STATUS_CHANGE_EVENT: 'ResourceCatalogStatusChangeEvent',
    RESOURCE_CATALOG_ATTRIBUTE_VALUE_CHANGE_EVENT:
        'ResourceCatalogAttributeValueChangeEvent',
    RESOURCE_CATEGORY_CREATE_EVENT: 'ResourceCategoryCreateEvent',
    RESOURCE_CATEGORY_DELETE_EVENT: 'ResourceCategoryDeleteEvent',
    RESOURCE_CATEGORY_STATUS_CHANGE_EVENT: 'ResourceCategoryStatusChangeEvent',
    RESOURCE_CATEGORY_ATTRIBUTE_VALUE_CHANGE_EVENT:
        'ResourceCategoryAttributeValueChangeEvent',
    RESOURCE_SPECIFICATION_CREATE_EVENT: 'ResourceSpecificationCreateEvent',
    RESOURCE_SPECIFICATION_DELETE_EVENT: 'ResourceSpecificationDeleteEvent',
    RESOURCE_SPECIFICATION_STATUS_CHANGE_EVENT:
        'ResourceSpecificationStatusChangeEvent',
    RESOURCE_SPECIFICATION_ATTRIBUTE_VALUE_CHANGE_EVENT:
        'ResourceSpecificationAttributeValueChangeEvent',
    RESOURCE_CANDIDATE_CREATE_EVENT: 'ResourceCandidateCreateEvent',
    RESOURCE_CANDIDATE_STATUS_CHANGE_EVENT:
        'ResourceCandidateStatusChangeEvent',
    RESOURCE_CANDIDATE_ATTRIBUTE_VALUE_CHANGE_EVENT:
        'ResourceCandidateAttributeValueChangeEvent',
} as const;

export type NotificationEvent =
    (typeof NotificationEvent)[keyof typeof NotificationEvent];

export const NotificationType = {
    RESOURCE_CATALOG: 'resourceCatalog',
    RESOURCE_CATEGORY: 'resourceCategory',
    RESOURCE_SPECIFICATION: 'resourceSpecification',
    RESOURCE_CANDIDATE: 'resourceCandidate',
} as const;

export type NotificationType =
    (typeof NotificationType)[keyof typeof NotificationType];
