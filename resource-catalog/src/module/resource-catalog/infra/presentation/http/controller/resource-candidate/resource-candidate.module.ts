import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { GetResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/get-resource-candidate.usecase';
import { ListResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/list-resource-candidate.usecase';
import { PatchResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/patch-resource-candidate.usecase';
import { AuditRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/audit-repository.provider';
import { ResourceCandidateRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-candidate-repository.provider';
import { Tmf634TypeOrmModule } from '@/module/resource-catalog/infra/persistence/typeorm/tmf634-typeorm.module';
import { EventDispatcherServiceModule } from '@/module/resource-catalog/infra/service/event-dispatcher.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { ResourceCandidate } from './resource-candidate.controller';

const useMongoPersistence =
    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB;

@Module({
    imports: [
        LoggerModule,
        JwtModule,
        EnvironmentConfigModule,
        EventDispatcherServiceModule,
        ...(useMongoPersistence ? [Tmf634TypeOrmModule] : []),
    ],
    controllers: [ResourceCandidate],
    providers: [
        AuditRepositoryProvider.get(),
        ResourceCandidateRepositoryProvider.get(),
        GetResourceCandidateUseCase,
        ListResourceCandidateUseCase,
        PatchResourceCandidateUseCase,
        CreateAuditUseCase,
    ],
    exports: [],
})
export class ResourceCandidateHttpModule {}
