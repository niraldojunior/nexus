import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';

export const RESOURCE_CATEGORY_REPOSITORY = 'RESOURCE_CATEGORY_REPOSITORY';

export interface ResourceCategoryFindAllParams {
    offset?: number;
    limit?: number;
    sort?: Partial<Record<string, 'ASC' | 'DESC'>>;
    filters?: Partial<
        Pick<ResourceCategoryModel, 'lifecycleStatus' | 'name' | 'category'> & {
            id: string | string[];
            description: string;
            version: string;
            resourceCatalogId: string;
            validAt: string;
            createdAtStart: string;
            createdAtEnd: string;
            updatedAtStart: string;
            updatedAtEnd: string;
        }
    >;
}

export interface ResourceCategoryRepository {
    create(data: ResourceCategoryModel): Promise<ResourceCategoryModel>;
    findById(id: string): Promise<ResourceCategoryModel | null>;
    findAll(
        params?: ResourceCategoryFindAllParams,
    ): Promise<PagedResultModel<ResourceCategoryModel>>;
    patchById(
        id: string,
        patch: Partial<ResourceCategoryModel>,
    ): Promise<ResourceCategoryModel | null>;
}
