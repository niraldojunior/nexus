import { Inject, Injectable } from '@nestjs/common';

import { ListResourceCatalogQueryDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/list-resource-catalog-query.dto';
import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { normalizePagination } from '@/shared/util/tmf-list-query.util';

export type ListResourceCatalogResponse = Either<
    InternalServerError,
    PagedResultModel<ResourceCatalogModel>
>;

@Injectable()
export class ListResourceCatalogUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly repository: ResourceCatalogRepository,
    ) {}

    async exec(
        query: ListResourceCatalogQueryDto,
    ): Promise<ListResourceCatalogResponse> {
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
                    validAt: query.validAt,
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
