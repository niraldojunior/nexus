import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    RESOURCE_SPECIFICATION_REPOSITORY,
    ResourceSpecificationRepository,
} from '@/module/resource-catalog/application/port/resource-specification.repository';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';
import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '../../port/resource-category.repository';

export type GetResourceSpecificationResponse = Either<
    NotFoundException,
    ResourceSpecificationModel
>;

@Injectable()
export class GetResourceSpecificationUseCase {
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

    async exec(id: string): Promise<GetResourceSpecificationResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const found = await this.repository.findById(id);

            if (!found) {
                return left(
                    new NotFoundException(
                        `ResourceSpecification with id '${id}' was not found`,
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

            const resourceCategory =
                await this.resourceCategoryRepository.findAll({
                    filters: { id: found.resourceCategory.map((rc) => rc.id) },
                });

            found.resourceCategory = resourceCategory.items.map((rc) => ({
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
