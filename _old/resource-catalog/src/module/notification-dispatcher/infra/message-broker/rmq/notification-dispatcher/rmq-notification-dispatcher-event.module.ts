import { Module } from '@nestjs/common';

import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { RmqNotificationDispatcherEventService } from './rmq-notification-dispatcher-event.service';

@Module({
    imports: [EnvironmentConfigModule, LoggerModule],
    providers: [RmqNotificationDispatcherEventService],
    exports: [RmqNotificationDispatcherEventService],
})
export class RmqNotificationDispatcherEventModule {}
