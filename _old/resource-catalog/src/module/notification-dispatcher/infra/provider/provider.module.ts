import { Module } from '@nestjs/common';

import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { RmqNotificationDispatcherEventService } from '../message-broker/rmq/notification-dispatcher/rmq-notification-dispatcher-event.service';
import { NotificationDispatcherProviderModule } from './notification-dispatcher-event/notification-dispatcher.module';
import { NotificationDispatcherPortImpl } from './notification-dispatcher-event/notification-dispatcher.provider';
import { NotificationDispatcherHttpProviderModule } from './notification-dispatcher-http/notification-dispatcher-http.module';

@Module({
    imports: [
        EnvironmentConfigModule,
        LoggerModule,
        NotificationDispatcherHttpProviderModule,
        NotificationDispatcherProviderModule,
    ],
    providers: [
        NotificationDispatcherPortImpl,
        RmqNotificationDispatcherEventService,
    ],
    exports: [NotificationDispatcherPortImpl],
})
export class ProviderModule {}
