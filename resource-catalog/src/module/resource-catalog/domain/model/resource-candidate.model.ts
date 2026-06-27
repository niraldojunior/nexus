import { TmfPersistentModel } from './common.model';

export interface ResourceCandidateSpecificationRefModel {
    id: string;
}

export interface ResourceCandidateCategoryRefModel {
    id: string;
}

export interface ResourceCandidateCatalogRefModel {
    id: string;
}

export class ResourceCandidateModel extends TmfPersistentModel {
    public static readonly propertyKeys = [
        'id',
        'href',
        'name',
        'description',
        'lifecycleStatus',
        'version',
        'resourceSpecification',
        'category',
        'catalog',
        'validFor',
        '@type',
        '@baseType',
        '@schemaLocation',
        'createdAt',
        'lastUpdate',
    ] as const;

    name: string;
    description?: string;
    version?: string;
    resourceSpecification: ResourceCandidateSpecificationRefModel;
    category: ResourceCandidateCategoryRefModel[];
    catalog: ResourceCandidateCatalogRefModel;
}
