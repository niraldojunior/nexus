import { Module } from '@nestjs/common';

import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { RmqModule } from '@/shared/infra/message-broker/rmq/rmq.module';

import { RmqNotificationDispatcherEventModule } from '../../message-broker/rmq/notification-dispatcher/rmq-notification-dispatcher-event.module';
import { RmqNotificationDispatcherEventService } from '../../message-broker/rmq/notification-dispatcher/rmq-notification-dispatcher-event.service';
import { NotificationDispatcherPortImpl } from './notification-dispatcher.provider';

@Module({
    imports: [
        EnvironmentConfigModule,
        LoggerModule,
        RmqModule,
        RmqNotificationDispatcherEventModule,
    ],
    providers: [
        NotificationDispatcherPortImpl,
        RmqNotificationDispatcherEventService,
    ],
    exports: [
        NotificationDispatcherPortImpl,
        RmqNotificationDispatcherEventService,
    ],
})
export class NotificationDispatcherProviderModule {}
