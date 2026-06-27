import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';

export const RESOURCE_CANDIDATE_REPOSITORY = 'RESOURCE_CANDIDATE_REPOSITORY';

export interface ResourceCandidateFindAllParams {
    offset?: number;
    limit?: number;
    sort?: Partial<Record<string, 'ASC' | 'DESC'>>;
    filters?: {
        lifecycleStatus?: ResourceCandidateModel['lifecycleStatus'];
        name?: string;
        description?: string;
        version?: string;
        resourceSpecificationId?: string;
        resourceCatalogId?: string;
        resourceCategoryId?: string;
        createdAtStart?: string;
        createdAtEnd?: string;
        updatedAtStart?: string;
        updatedAtEnd?: string;
    };
}

export interface ResourceCandidateRepository {
    create(data: ResourceCandidateModel): Promise<ResourceCandidateModel>;
    findById(id: string): Promise<ResourceCandidateModel | null>;
    findAll(
        params?: ResourceCandidateFindAllParams,
    ): Promise<PagedResultModel<ResourceCandidateModel>>;
    patchById(
        id: string,
        patch: Partial<ResourceCandidateModel>,
    ): Promise<ResourceCandidateModel | null>;
    findBySpecificationId(
        specificationId: string,
    ): Promise<ResourceCandidateModel[]>;
}
