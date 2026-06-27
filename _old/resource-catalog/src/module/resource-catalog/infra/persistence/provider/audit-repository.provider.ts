import { Provider } from '@nestjs/common';

import {
    AUDIT_REPOSITORY,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { AuditInMemoryRepository } from '../in-memory/audit-in-memory.repository';
import { AuditSqliteRepository } from '../sqlite/audit-sqlite.repository';
import { AuditTypeOrmRepository } from '../typeorm/repository/audit-typeorm.repository';

export class AuditRepositoryProvider {
    static get(): Provider {
        return {
            provide: AUDIT_REPOSITORY,
            useFactory: (
                logger: LoggerService,
                repository?: AuditTypeOrmRepository,
            ): AuditRepository => {
                if (repository) {
                    return repository;
                }

                if (
                    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.Sqlite
                ) {
                    return AuditSqliteRepository.getInstance(logger);
                }

                return new AuditInMemoryRepository(logger);
            },
            inject:
                env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB
                    ? [LoggerService, AuditTypeOrmRepository]
                    : [LoggerService],
        };
    }
}
