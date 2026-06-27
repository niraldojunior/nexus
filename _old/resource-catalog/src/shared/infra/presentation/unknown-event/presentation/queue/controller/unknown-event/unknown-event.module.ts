import { Module } from '@nestjs/common';

import { RmqModule } from '@/shared/infra/message-broker/rmq/rmq.module';

import { UnknownEventController } from './unknown-event.controller';

@Module({
    imports: [RmqModule],
    controllers: [UnknownEventController],
})
export class UnknownEventModule {}
