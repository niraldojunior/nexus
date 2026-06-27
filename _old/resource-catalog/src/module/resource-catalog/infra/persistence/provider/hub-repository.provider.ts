import { Provider } from '@nestjs/common';

import {
    HUB_SUBSCRIPTION_REPOSITORY,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { HubSubscriptionInMemoryRepository } from '../in-memory/hub-subscription-in-memory.repository';
import { HubSubscriptionSqliteRepository } from '../sqlite/hub-subscription-sqlite.repository';
import { HubSubscriptionTypeOrmRepository } from '../typeorm/repository/hub-subscription-typeorm.repository';

export class HubSubscriptionRepositoryProvider {
    static get(): Provider {
        return {
            provide: HUB_SUBSCRIPTION_REPOSITORY,
            useFactory: (
                logger: LoggerService,
                repository?: HubSubscriptionTypeOrmRepository,
            ): HubSubscriptionRepository => {
                if (repository) {
                    return repository;
                }

                if (
                    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.Sqlite
                ) {
                    return HubSubscriptionSqliteRepository.getInstance(logger);
                }

                return new HubSubscriptionInMemoryRepository(logger);
            },
            inject:
                env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB
                    ? [LoggerService, HubSubscriptionTypeOrmRepository]
                    : [LoggerService],
        };
    }
}
