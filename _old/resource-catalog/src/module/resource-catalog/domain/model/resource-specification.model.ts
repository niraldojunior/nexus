import { TmfPersistentModel } from './common.model';

export interface ResourceSpecificationCatalogRefModel {
    id: string;
}

export interface ResourceSpecificationCategoryRefModel {
    id: string;
}

export interface ResourceSpecificationCharacteristicModel {
    name?: string;
    valueType?: string;
    value?: unknown;
    [key: string]: unknown;
}

export class ResourceSpecificationModel extends TmfPersistentModel {
    public static readonly propertyKeys = [
        'id',
        'href',
        'name',
        'description',
        'lifecycleStatus',
        'version',
        'category',
        'validFor',
        'uniqueKey',
        'resourceCatalog',
        'resourceCategory',
        'resourceSpecCharacteristic',
        '@type',
        '@baseType',
        '@schemaLocation',
        'createdAt',
        'updatedAt',
        'lastUpdate',
    ] as const;

    name: string;
    description?: string;
    version?: string;
    category?: string;
    uniqueKey: string;
    resourceCatalog: ResourceSpecificationCatalogRefModel[];
    resourceCategory: ResourceSpecificationCategoryRefModel[];
    resourceSpecCharacteristic?: ResourceSpecificationCharacteristicModel[];
}
