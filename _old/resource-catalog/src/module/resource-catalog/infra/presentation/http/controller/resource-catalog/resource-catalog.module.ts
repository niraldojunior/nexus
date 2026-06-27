import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/create-resource-catalog.usecase';
import { GetResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/get-resource-catalog.usecase';
import { ListResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/list-resource-catalog.usecase';
import { PatchResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/patch-resource-catalog.usecase';
import { AuditRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/audit-repository.provider';
import { ResourceCatalogRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-catalog-repository.provider';
import { Tmf634TypeOrmModule } from '@/module/resource-catalog/infra/persistence/typeorm/tmf634-typeorm.module';
import { ResourceCategoryHttpModule } from '@/module/resource-catalog/infra/presentation/http/controller/resource-category/resource-category.module';
import { EventDispatcherServiceModule } from '@/module/resource-catalog/infra/service/event-dispatcher.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { ResourceCatalog } from './resource-catalog.controller';

const useMongoPersistence =
    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB;

@Module({
    imports: [
        LoggerModule,
        ResourceCategoryHttpModule,
        JwtModule,
        EnvironmentConfigModule,
        EventDispatcherServiceModule,
        ...(useMongoPersistence ? [Tmf634TypeOrmModule] : []),
    ],
    controllers: [ResourceCatalog],
    providers: [
        ResourceCatalogRepositoryProvider.get(),
        AuditRepositoryProvider.get(),
        CreateAuditUseCase,
        CreateResourceCatalogUseCase,
        ListResourceCatalogUseCase,
        GetResourceCatalogUseCase,
        PatchResourceCatalogUseCase,
    ],
})
export class ResourceCatalogHttpModule {}
