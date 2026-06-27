import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { UNKNOWN_EVENT_PATTERN } from '@/shared/application/const/message-broker-unknown-event-pattern.const';
import { RmqService } from '@/shared/infra/message-broker/rmq/rmq.service';
import { safeParse } from '@/shared/util/json.util';

@Controller()
export class UnknownEventController {
    constructor(private readonly rmq: RmqService) {}

    // This method is used to handle unknown events in the queue.
    // It logs the event pattern and acknowledges the message.
    @MessagePattern(UNKNOWN_EVENT_PATTERN)
    handleUnidentifiedEvents(@Ctx() context: RmqContext): void {
        try {
            const msg = context.getMessage();
            const { pattern }: { pattern: string } =
                safeParse(Buffer.from(msg.content).toString()) || {};
            Logger.log(`Unknown event: ${pattern}`);
        } catch (error) {
            Logger.error(error);
            throw error;
        } finally {
            this.rmq.ack(context);
        }
    }
}
