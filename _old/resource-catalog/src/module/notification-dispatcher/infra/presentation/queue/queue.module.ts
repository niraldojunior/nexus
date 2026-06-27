import { Module } from '@nestjs/common';

import { NotificationDispatcherModule } from './controller/notification-dispatcher/notification-dispatcher.module';

@Module({
    imports: [NotificationDispatcherModule],
})
export class QueueModule {}
