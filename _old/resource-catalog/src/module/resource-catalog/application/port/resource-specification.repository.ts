import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';

export const RESOURCE_SPECIFICATION_REPOSITORY =
    'RESOURCE_SPECIFICATION_REPOSITORY';

export interface ResourceSpecificationFindAllParams {
    offset?: number;
    limit?: number;
    sort?: Partial<Record<string, 'ASC' | 'DESC'>>;
    filters?: Partial<
        Pick<
            ResourceSpecificationModel,
            'lifecycleStatus' | 'name' | 'category'
        >
    > & {
        id?: string;
        description?: string;
        version?: string;
        validAt?: string | Date;
        resourceCatalogId?: string;
        resourceCategoryId?: string;
        resourceSpecCharacteristicName?: string[];
        resourceSpecCharacteristicValue?: string[];
        createdAtStart?: string;
        createdAtEnd?: string;
        updatedAtStart?: string;
        updatedAtEnd?: string;
    };
}

export interface ResourceSpecificationRepository {
    create(
        data: ResourceSpecificationModel,
    ): Promise<ResourceSpecificationModel>;
    findById(id: string): Promise<ResourceSpecificationModel | null>;
    findAll(
        params?: ResourceSpecificationFindAllParams,
    ): Promise<PagedResultModel<ResourceSpecificationModel>>;
    patchById(
        id: string,
        patch: Partial<ResourceSpecificationModel>,
    ): Promise<ResourceSpecificationModel | null>;
    existsByBusinessKey(
        uniqueKey: string,
        excludeId?: string,
    ): Promise<boolean>;
}
