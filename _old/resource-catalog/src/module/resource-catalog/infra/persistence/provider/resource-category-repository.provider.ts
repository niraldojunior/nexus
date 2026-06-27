import { Provider } from '@nestjs/common';

import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { getTmf634InMemorySeedData } from '../in-memory/in-memory.seed';
import { ResourceCategoryInMemoryRepository } from '../in-memory/resource-category-in-memory.repository';
import { ResourceCategorySqliteRepository } from '../sqlite/resource-category-sqlite.repository';
import { ResourceCategoryTypeOrmRepository } from '../typeorm/repository/resource-category-typeorm.repository';

export class ResourceCategoryRepositoryProvider {
    static get(): Provider {
        return {
            provide: RESOURCE_CATEGORY_REPOSITORY,
            useFactory: async (
                logger: LoggerService,
                repository?: ResourceCategoryTypeOrmRepository,
            ): Promise<ResourceCategoryRepository> => {
                if (repository) {
                    return repository;
                }

                const seed = getTmf634InMemorySeedData();

                if (
                    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.Sqlite
                ) {
                    return await ResourceCategorySqliteRepository.getInstance(
                        logger,
                        seed.resourceCategories,
                    );
                }

                return new ResourceCategoryInMemoryRepository(
                    logger,
                    seed.resourceCategories,
                );
            },
            inject:
                env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB
                    ? [LoggerService, ResourceCategoryTypeOrmRepository]
                    : [LoggerService],
        };
    }
}
