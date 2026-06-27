import { Module } from '@nestjs/common';

import { QueueModule } from './presentation/queue/queue.module';

@Module({
    imports: [QueueModule],
})
export class UnknownEventAppModule {}
