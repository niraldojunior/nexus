export const ResourceType = {
    RESOURCE_CATALOG: 'ResourceCatalog',
    RESOURCE_CATEGORY: 'ResourceCategory',
    RESOURCE_SPECIFICATION: 'ResourceSpecification',
    RESOURCE_CANDIDATE: 'ResourceCandidate',
    HUB: 'Hub',
} as const;

export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];
