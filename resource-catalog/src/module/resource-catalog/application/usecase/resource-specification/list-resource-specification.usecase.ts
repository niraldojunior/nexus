import { Inject, Injectable } from '@nestjs/common';

import { ListResourceSpecificationQueryDto } from '@/module/resource-catalog/application/dto/resource-specification/request/list-resource-specification-query.dto';
import {
    RESOURCE_SPECIFICATION_REPOSITORY,
    ResourceSpecificationRepository,
} from '@/module/resource-catalog/application/port/resource-specification.repository';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { normalizePagination } from '@/shared/util/tmf-list-query.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';
import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '../../port/resource-category.repository';

export type ListResourceSpecificationResponse = Either<
    InternalServerError,
    PagedResultModel<ResourceSpecificationModel>
>;

@Injectable()
export class ListResourceSpecificationUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_SPECIFICATION_REPOSITORY)
        private readonly repository: ResourceSpecificationRepository,
        @Inject(RESOURCE_CATEGORY_REPOSITORY)
        private readonly resourceCategoryRepository: ResourceCategoryRepository,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly resourceCatalogRepository: ResourceCatalogRepository,
    ) {}

    async exec(
        query: ListResourceSpecificationQueryDto,
    ): Promise<ListResourceSpecificationResponse> {
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
                    validAt: query.validAt,
                    resourceCatalogId: query.resourceCatalog,
                    resourceCategoryId: query.resourceCategory,
                    resourceSpecCharacteristicName:
                        query.resourceSpecCharacteristicName,
                    resourceSpecCharacteristicValue:
                        query.resourceSpecCharacteristicValue,
                    createdAtStart: query.createdAtStart,
                    createdAtEnd: query.createdAtEnd,
                    updatedAtStart: query.updatedAtStart,
                    updatedAtEnd: query.updatedAtEnd,
                },
            });

            const { items: catalogs } =
                await this.resourceCatalogRepository.findAll({
                    filters: {
                        id: result.items.flatMap((item) =>
                            item.resourceCatalog.map((rc) => rc.id),
                        ),
                    },
                });

            const { items: categories } =
                await this.resourceCategoryRepository.findAll({
                    filters: {
                        id: result.items.flatMap((item) =>
                            item.resourceCategory.map((rc) => rc.id),
                        ),
                    },
                });

            result.items.forEach((item) => {
                item.resourceCatalog = item.resourceCatalog.map((rc: any) => {
                    const found = catalogs.find((r) => r.id === rc.id);

                    return {
                        id: rc.id,
                        name: found?.name ?? rc.name,
                        href: found?.href ?? rc.href,
                    };
                });
                item.resourceCategory = item.resourceCategory.map((rc: any) => {
                    const found = categories.find((r) => r.id === rc.id);

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
