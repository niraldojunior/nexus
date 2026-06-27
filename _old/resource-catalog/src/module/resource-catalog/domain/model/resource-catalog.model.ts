import { TmfPersistentModel } from './common.model';

export class ResourceCatalogModel extends TmfPersistentModel {
    public static readonly propertyKeys = [
        'id',
        'href',
        'name',
        'description',
        'lifecycleStatus',
        'version',
        'validFor',
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
}
