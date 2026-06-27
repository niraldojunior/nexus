import { NotificationEventDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { EventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';

export interface NotificationDispatcherPort {
    event(
        data: EventEnvelope<NotificationEventDto>,
        opts?: { retry?: boolean; delay?: number; retryCount?: number },
    ): Promise<void>;
}
