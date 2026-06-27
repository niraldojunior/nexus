import { Module } from '@nestjs/common';

import { NotificationDispatcherProviderModule } from '@/module/notification-dispatcher/infra/provider/notification-dispatcher-event/notification-dispatcher.module';
import { TMF634_EVENT_DISPATCHER } from '@/module/resource-catalog/application/port/event-dispatcher.port';
import { EventDispatcherService } from '@/module/resource-catalog/infra/service/event-dispatcher.service';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { HubSubscriptionRepositoryProvider } from '../persistence/provider/hub-repository.provider';
import { Tmf634TypeOrmModule } from '../persistence/typeorm/tmf634-typeorm.module';

const useMongoPersistence =
    env<DatabaseType>('DATABASE_TYPE') === DatabaseType.MongoDB;

@Module({
    imports: [
        LoggerModule,
        EnvironmentConfigModule,
        NotificationDispatcherProviderModule,
        ...(useMongoPersistence ? [Tmf634TypeOrmModule] : []),
    ],
    providers: [
        HubSubscriptionRepositoryProvider.get(),
        {
            provide: TMF634_EVENT_DISPATCHER,
            useExisting: EventDispatcherService,
        },
        EventDispatcherService,
    ],
    exports: [TMF634_EVENT_DISPATCHER],
})
export class EventDispatcherServiceModule {}
