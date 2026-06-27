import { Module } from '@nestjs/common';

import { NotificationListenerHttpModule } from './controller/notification-listener/notification-listener.module';

@Module({
    imports: [NotificationListenerHttpModule],
})
export class HttpModule {}
