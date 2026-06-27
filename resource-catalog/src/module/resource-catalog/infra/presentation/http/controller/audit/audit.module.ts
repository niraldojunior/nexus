import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { GetAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/get-audit.usecase';
import { ListAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/list-audit.usecase';
import { AuditRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/audit-repository.provider';
import { Tmf634TypeOrmModule } from '@/module/resource-catalog/infra/persistence/typeorm/tmf634-typeorm.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { Audit } from './audit.controller';

const useMongoPersistence =
    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB;

@Module({
    imports: [
        LoggerModule,
        JwtModule,
        EnvironmentConfigModule,
        ...(useMongoPersistence ? [Tmf634TypeOrmModule] : []),
    ],
    controllers: [Audit],
    providers: [
        AuditRepositoryProvider.get(),
        GetAuditUseCase,
        ListAuditUseCase,
    ],
})
export class AuditHttpModule {}
