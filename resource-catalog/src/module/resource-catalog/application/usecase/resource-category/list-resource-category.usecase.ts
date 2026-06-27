import { Inject, Injectable } from '@nestjs/common';

import { ListResourceCategoryQueryDto } from '@/module/resource-catalog/application/dto/resource-category/request/list-resource-category-query.dto';
import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { normalizePagination } from '@/shared/util/tmf-list-query.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';

export type ListResourceCategoryResponse = Either<
    InternalServerError,
    PagedResultModel<ResourceCategoryModel>
>;

@Injectable()
export class ListResourceCategoryUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATEGORY_REPOSITORY)
        private readonly repository: ResourceCategoryRepository,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly resourceCatalogRepository: ResourceCatalogRepository,
    ) {}

    async exec(
        query: ListResourceCategoryQueryDto,
    ): Promise<ListResourceCategoryResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const pagination = normalizePagination(query);
            const result = await this.repository.findAll({
                offset: pagination.offset,
                limit: pagination.limit,
                sort: query.sort,
                filters: {
                    id: query.id,
                    name: query.name,
                    description: query.description,
                    lifecycleStatus: query.lifecycleStatus,
                    version: query.version,
                    category: query.category,
                    resourceCatalogId: query.resourceCatalog,
                    validAt: query.validAt,
                    createdAtStart: query.createdAtStart,
                    createdAtEnd: query.createdAtEnd,
                    updatedAtStart: query.updatedAtStart,
                    updatedAtEnd: query.updatedAtEnd,
                },
            });

            const { items } = await this.resourceCatalogRepository.findAll({
                filters: {
                    id: result.items.flatMap((item) =>
                        item.resourceCatalog.map((rc) => rc.id),
                    ),
                },
            });

            result.items.forEach((item) => {
                item.resourceCatalog = item.resourceCatalog.map((rc: any) => {
                    const found = items.find((r) => r.id === rc.id);

                    return {
                        id: rc.id,
                        name: found?.name ?? rc.name,
                        href: found?.href ?? rc.href,
                    };
                });
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
