import { Inject, Injectable } from '@nestjs/common';

import { ListResourceCandidateQueryDto } from '@/module/resource-catalog/application/dto/resource-candidate/request/list-resource-candidate-query.dto';
import {
    RESOURCE_CANDIDATE_REPOSITORY,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { normalizePagination } from '@/shared/util/tmf-list-query.util';

export type ListResourceCandidateResponse = Either<
    InternalServerError,
    PagedResultModel<ResourceCandidateModel>
>;

@Injectable()
export class ListResourceCandidateUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CANDIDATE_REPOSITORY)
        private readonly repository: ResourceCandidateRepository,
    ) {}

    async exec(
        query: ListResourceCandidateQueryDto,
    ): Promise<ListResourceCandidateResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const pagination = normalizePagination(query);
            const result = await this.repository.findAll({
                offset: pagination.offset,
                limit: pagination.limit,
                sort: query.sort,
                filters: {
                    name: query.name,
                    description: query.description,
                    version: query.version,
                    lifecycleStatus: query.lifecycleStatus,
                    resourceSpecificationId: query.resourceSpecification,
                    resourceCatalogId: query.resourceCatalog,
                    resourceCategoryId: query.resourceCategory,
                    createdAtStart: query.createdAtStart,
                    createdAtEnd: query.createdAtEnd,
                    updatedAtStart: query.updatedAtStart,
                    updatedAtEnd: query.updatedAtEnd,
                },
            });

            return right(result);
        } catch (err: any) {
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                }),
            );
            return left(err);
        }
    }
}
