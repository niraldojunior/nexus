import { Module } from '@nestjs/common';
import { RmqOptions } from '@nestjs/microservices';

import { RmqNotificationDispatcherEventService } from '@/module/notification-dispatcher/infra/message-broker/rmq/notification-dispatcher/rmq-notification-dispatcher-event.service';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { RmqService } from './rmq.service';

@Module({
    imports: [EnvironmentConfigModule, LoggerModule],
    providers: [RmqService, RmqNotificationDispatcherEventService],
    exports: [RmqService],
})
export class RmqModule {
    constructor(
        private readonly rmqNotificationDispatcherEventService: RmqNotificationDispatcherEventService,
    ) {}
    getConnections(): RmqOptions[] {
        return [this.rmqNotificationDispatcherEventService.getOptions()];
    }
}
