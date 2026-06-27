import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type GetResourceCatalogResponse = Either<
    NotFoundException,
    ResourceCatalogModel
>;

@Injectable()
export class GetResourceCatalogUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly repository: ResourceCatalogRepository,
    ) {}

    async exec(id: string): Promise<GetResourceCatalogResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const found = await this.repository.findById(id);

            if (!found) {
                return left(
                    new NotFoundException(
                        `ResourceCatalog with id '${id}' was not found`,
                    ),
                );
            }

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
