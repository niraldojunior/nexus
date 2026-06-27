import { Provider } from '@nestjs/common';

import {
    RESOURCE_SPECIFICATION_REPOSITORY,
    ResourceSpecificationRepository,
} from '@/module/resource-catalog/application/port/resource-specification.repository';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { getTmf634InMemorySeedData } from '../in-memory/in-memory.seed';
import { ResourceSpecificationInMemoryRepository } from '../in-memory/resource-specification-in-memory.repository';
import { ResourceSpecificationSqliteRepository } from '../sqlite/resource-specification-sqlite.repository';
import { ResourceSpecificationTypeOrmRepository } from '../typeorm/repository/resource-specification-typeorm.repository';

export class ResourceSpecificationRepositoryProvider {
    static get(): Provider {
        return {
            provide: RESOURCE_SPECIFICATION_REPOSITORY,
            useFactory: async (
                logger: LoggerService,
                repository?: ResourceSpecificationTypeOrmRepository,
            ): Promise<ResourceSpecificationRepository> => {
                if (repository) {
                    return repository;
                }

                const seed = getTmf634InMemorySeedData();

                if (
                    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.Sqlite
                ) {
                    return await ResourceSpecificationSqliteRepository.getInstance(
                        logger,
                        seed.resourceSpecifications,
                    );
                }

                return new ResourceSpecificationInMemoryRepository(
                    logger,
                    seed.resourceSpecifications,
                );
            },
            inject:
                env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB
                    ? [LoggerService, ResourceSpecificationTypeOrmRepository]
                    : [LoggerService],
        };
    }
}
