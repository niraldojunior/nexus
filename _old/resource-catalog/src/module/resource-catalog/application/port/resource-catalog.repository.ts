import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';

export const RESOURCE_CATALOG_REPOSITORY = 'RESOURCE_CATALOG_REPOSITORY';

export interface ResourceCatalogFindAllParams {
    offset?: number;
    limit?: number;
    sort?: Partial<Record<string, 'ASC' | 'DESC'>>;
    filters?: Partial<
        Pick<ResourceCatalogModel, 'lifecycleStatus' | 'name'> & {
            id: string | string[];
            description: string;
            version: string;
            validAt: string;
            createdAtStart: string;
            createdAtEnd: string;
            updatedAtStart: string;
            updatedAtEnd: string;
        }
    >;
}

export interface ResourceCatalogRepository {
    create(data: ResourceCatalogModel): Promise<ResourceCatalogModel>;
    findById(id: string): Promise<ResourceCatalogModel | null>;
    findAll(
        params?: ResourceCatalogFindAllParams,
    ): Promise<PagedResultModel<ResourceCatalogModel>>;
    patchById(
        id: string,
        patch: Partial<ResourceCatalogModel>,
    ): Promise<ResourceCatalogModel | null>;
}
