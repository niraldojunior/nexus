import { TmfPersistentModel } from './common.model';

export interface ResourceCategoryCatalogRefModel {
    id: string;
}

export class ResourceCategoryModel extends TmfPersistentModel {
    public static readonly propertyKeys = [
        'id',
        'href',
        'name',
        'description',
        'lifecycleStatus',
        'version',
        'category',
        'resourceCatalog',
        'validFor',
        '@type',
        '@baseType',
        '@schemaLocation',
        'createdAt',
        'updatedAt',
    ] as const;

    name: string;
    description?: string;
    version?: string;
    category?: string;
    resourceCatalog: ResourceCategoryCatalogRefModel[];
}
