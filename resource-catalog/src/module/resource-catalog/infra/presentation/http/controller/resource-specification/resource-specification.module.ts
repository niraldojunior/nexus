import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/create-resource-specification.usecase';
import { GetResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/get-resource-specification.usecase';
import { ListResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/list-resource-specification.usecase';
import { PatchResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/patch-resource-specification.usecase';
import { AuditRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/audit-repository.provider';
import { ResourceCandidateRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-candidate-repository.provider';
import { ResourceCatalogRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-catalog-repository.provider';
import { ResourceCategoryRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-category-repository.provider';
import { ResourceSpecificationRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-specification-repository.provider';
import { Tmf634TypeOrmModule } from '@/module/resource-catalog/infra/persistence/typeorm/tmf634-typeorm.module';
import { ResourceCategoryHttpModule } from '@/module/resource-catalog/infra/presentation/http/controller/resource-category/resource-category.module';
import { EventDispatcherServiceModule } from '@/module/resource-catalog/infra/service/event-dispatcher.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { ResourceSpecification } from './resource-specification.controller';

const useMongoPersistence = env('DATABASE_TYPE') === DatabaseType.MongoDB;

@Module({
    imports: [
        LoggerModule,
        ResourceCategoryHttpModule,
        JwtModule,
        EnvironmentConfigModule,
        EventDispatcherServiceModule,
        ...(useMongoPersistence ? [Tmf634TypeOrmModule] : []),
    ],
    controllers: [ResourceSpecification],
    providers: [
        ResourceSpecificationRepositoryProvider.get(),
        ResourceCandidateRepositoryProvider.get(),
        ResourceCatalogRepositoryProvider.get(),
        ResourceCategoryRepositoryProvider.get(),
        AuditRepositoryProvider.get(),
        CreateAuditUseCase,
        CreateResourceSpecificationUseCase,
        ListResourceSpecificationUseCase,
        GetResourceSpecificationUseCase,
        PatchResourceSpecificationUseCase,
    ],
})
export class ResourceSpecificationHttpModule {}
