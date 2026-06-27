import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
    imports: [EventEmitterModule.forRoot({ global: true, maxListeners: 15 })],
})
export class EventEmitterAppModule {}
