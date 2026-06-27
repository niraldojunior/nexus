import { Provider } from '@nestjs/common';

import {
    RESOURCE_CANDIDATE_REPOSITORY,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { getTmf634InMemorySeedData } from '../in-memory/in-memory.seed';
import { ResourceCandidateInMemoryRepository } from '../in-memory/resource-candidate-in-memory.repository';
import { ResourceCandidateSqliteRepository } from '../sqlite/resource-candidate-sqlite.repository';
import { ResourceCandidateTypeOrmRepository } from '../typeorm/repository/resource-candidate-typeorm.repository';

export class ResourceCandidateRepositoryProvider {
    static get(): Provider {
        return {
            provide: RESOURCE_CANDIDATE_REPOSITORY,
            useFactory: async (
                logger: LoggerService,
                repository?: ResourceCandidateTypeOrmRepository,
            ): Promise<ResourceCandidateRepository> => {
                if (repository) {
                    return repository;
                }

                const seed = getTmf634InMemorySeedData();

                if (
                    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.Sqlite
                ) {
                    return await ResourceCandidateSqliteRepository.getInstance(
                        logger,
                        seed.resourceCandidates,
                    );
                }

                return new ResourceCandidateInMemoryRepository(
                    logger,
                    seed.resourceCandidates,
                );
            },
            inject:
                env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB
                    ? [LoggerService, ResourceCandidateTypeOrmRepository]
                    : [LoggerService],
        };
    }
}
