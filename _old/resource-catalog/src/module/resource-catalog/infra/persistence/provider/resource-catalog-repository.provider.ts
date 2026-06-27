import { Provider } from '@nestjs/common';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { getTmf634InMemorySeedData } from '../in-memory/in-memory.seed';
import { ResourceCatalogInMemoryRepository } from '../in-memory/resource-catalog-in-memory.repository';
import { ResourceCatalogSqliteRepository } from '../sqlite/resource-catalog-sqlite.repository';
import { ResourceCatalogTypeOrmRepository } from '../typeorm/repository/resource-catalog-typeorm.repository';

export class ResourceCatalogRepositoryProvider {
    static get(): Provider {
        return {
            provide: RESOURCE_CATALOG_REPOSITORY,
            useFactory: async (
                logger: LoggerService,
                repository?: ResourceCatalogTypeOrmRepository,
            ): Promise<ResourceCatalogRepository> => {
                if (repository) {
                    return repository;
                }

                const seed = getTmf634InMemorySeedData();

                if (
                    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.Sqlite
                ) {
                    return await ResourceCatalogSqliteRepository.getInstance(
                        logger,
                        seed.resourceCatalogs,
                    );
                }

                return new ResourceCatalogInMemoryRepository(
                    logger,
                    seed.resourceCatalogs,
                );
            },
            inject:
                env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB
                    ? [LoggerService, ResourceCatalogTypeOrmRepository]
                    : [LoggerService],
        };
    }
}
