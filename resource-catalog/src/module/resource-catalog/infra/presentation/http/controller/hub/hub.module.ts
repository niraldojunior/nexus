import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { NotificationDispatcherProviderModule } from '@/module/notification-dispatcher/infra/provider/notification-dispatcher-event/notification-dispatcher.module';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateHubUseCase } from '@/module/resource-catalog/application/usecase/hub/create-hub.usecase';
import { DeleteHubUseCase } from '@/module/resource-catalog/application/usecase/hub/delete-hub.usecase';
import { ListHubUseCase } from '@/module/resource-catalog/application/usecase/hub/list-hub.usecase';
import { AuditRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/audit-repository.provider';
import { HubSubscriptionRepositoryProvider } from '@/module/resource-catalog/infra/persistence/provider/hub-repository.provider';
import { Tmf634TypeOrmModule } from '@/module/resource-catalog/infra/persistence/typeorm/tmf634-typeorm.module';
import { EventDispatcherServiceModule } from '@/module/resource-catalog/infra/service/event-dispatcher.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { Hub } from './hub.controller';

const useMongoPersistence =
    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB;

@Module({
    imports: [
        LoggerModule,
        HttpModule,
        NotificationDispatcherProviderModule,
        JwtModule,
        EnvironmentConfigModule,
        EventDispatcherServiceModule,
        ...(useMongoPersistence ? [Tmf634TypeOrmModule] : []),
    ],
    controllers: [Hub],
    providers: [
        HubSubscriptionRepositoryProvider.get(),
        AuditRepositoryProvider.get(),
        ListHubUseCase,
        CreateHubUseCase,
        DeleteHubUseCase,
        CreateAuditUseCase,
    ],
    exports: [],
})
export class HubHttpModule {}
