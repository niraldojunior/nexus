import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';

export type GetResourceCategoryResponse = Either<
    NotFoundException,
    ResourceCategoryModel
>;

@Injectable()
export class GetResourceCategoryUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATEGORY_REPOSITORY)
        private readonly repository: ResourceCategoryRepository,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly resourceCatalogRepository: ResourceCatalogRepository,
    ) {}

    async exec(id: string): Promise<GetResourceCategoryResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const found = await this.repository.findById(id);

            if (!found) {
                return left(
                    new NotFoundException(
                        `ResourceCategory with id '${id}' was not found`,
                    ),
                );
            }

            const resourceCatalog =
                await this.resourceCatalogRepository.findAll({
                    filters: { id: found.resourceCatalog.map((rc) => rc.id) },
                });

            found.resourceCatalog = resourceCatalog.items.map((rc) => ({
                id: rc.id,
                name: rc.name,
                href: rc.href,
            }));

            return right(found);
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
