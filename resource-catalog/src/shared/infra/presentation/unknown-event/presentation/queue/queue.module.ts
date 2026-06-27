import { Module } from '@nestjs/common';

import { UnknownEventModule } from './controller/unknown-event/unknown-event.module';

@Module({
    imports: [UnknownEventModule],
})
export class QueueModule {}
