import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { NotificationListener } from './notification-listener.controller';

@Module({
    imports: [LoggerModule, HttpModule],
    controllers: [NotificationListener],
    providers: [],
    exports: [],
})
export class NotificationListenerHttpModule {}
