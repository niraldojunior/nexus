import { Inject, Injectable } from '@nestjs/common';

import { NotificationEventDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { EventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { RmqPattern } from '@/shared/application/const/message-broker-internal-patterns.const';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { NotificationDispatcherPort } from '@/shared/application/port/notification-dispatcher/notification-dispatcher.repository';

import { RmqNotificationDispatcherEventService } from '../../message-broker/rmq/notification-dispatcher/rmq-notification-dispatcher-event.service';

@Injectable()
export class NotificationDispatcherPortImpl implements NotificationDispatcherPort {
    constructor(
        @Inject(RmqNotificationDispatcherEventService)
        private readonly service: RmqNotificationDispatcherEventService,
    ) {}

    async event(
        data: EventEnvelope<NotificationEventDto>,
        opts?: { retry?: boolean; delay?: number; retryCount?: number },
    ): Promise<void> {
        if (!Object.values(RmqPattern).includes(data.eventType)) {
            throw new BadRequestError(
                `Unsupported event type: ${data.eventType}. Supported event types are: ${Object.values(RmqPattern).join(', ')}`,
            );
        }

        await this.service.sendMessage(
            data.eventType,
            { ...data, retries: opts?.retryCount ?? 0 },
            opts,
        );
    }
}
