import { Module } from '@nestjs/common';

import { ResourceCatalogEventUseCase } from '@/module/notification-dispatcher/application/usecase/notification-dispatcher/listener-resource-catalog-event.usecase';
import { NotificationDispatcherHttpProviderModule } from '@/module/notification-dispatcher/infra/provider/notification-dispatcher-http/notification-dispatcher-http.module';
import { ProviderModule } from '@/module/notification-dispatcher/infra/provider/provider.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { EventEmitterAppModule } from '@/shared/infra/event/event-emitter.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { RmqModule } from '@/shared/infra/message-broker/rmq/rmq.module';

import { NotificationDispatcher } from './notification-dispatcher.controller';

@Module({
    imports: [
        EnvironmentConfigModule,
        LoggerModule,
        RmqModule,
        EventEmitterAppModule,
        ProviderModule,
        NotificationDispatcherHttpProviderModule,
    ],
    controllers: [NotificationDispatcher],
    providers: [ResourceCatalogEventUseCase],
})
export class NotificationDispatcherModule {}
