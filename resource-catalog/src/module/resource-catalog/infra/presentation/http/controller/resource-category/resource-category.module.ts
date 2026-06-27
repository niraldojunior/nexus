import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/create-resource-category.usecase';
import { GetResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/get-resource-category.usecase';
import { ListResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/list-resource-category.usecase';
import { PatchResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/patch-resource-category.usecase';
import { AuditRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/audit-repository.provider';
import { ResourceCatalogRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-catalog-repository.provider';
import { ResourceCategoryRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/resource-category-repository.provider';
import { Tmf634TypeOrmModule } from '@/module/resource-catalog/infra/persistence/typeorm/tmf634-typeorm.module';
import { EventDispatcherServiceModule } from '@/module/resource-catalog/infra/service/event-dispatcher.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { ResourceCategory } from './resource-category.controller';

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
    controllers: [ResourceCategory],
    providers: [
        ResourceCatalogRepositoryProvider.get(),
        ResourceCategoryRepositoryProvider.get(),
        AuditRepositoryProvider.get(),
        CreateAuditUseCase,
        CreateResourceCategoryUseCase,
        ListResourceCategoryUseCase,
        GetResourceCategoryUseCase,
        PatchResourceCategoryUseCase,
    ],
    exports: [],
})
export class ResourceCategoryHttpModule {}
