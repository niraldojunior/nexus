import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';

export interface EventEnvelope<TPayload> {
    eventId: string;
    eventType: NotificationEvent;
    eventTime: string;
    targetUri: string;
    credentials?: string;
    event: TPayload;
}

export function createEventEnvelope<TPayload>(
    eventType: NotificationEvent,
    event: TPayload,
): EventEnvelope<TPayload> {
    return {
        eventId: Snowflake.nextId().toString(),
        eventType,
        eventTime: new Date().toISOString(),
        targetUri: '', // You can set a default value or handle it as needed
        event,
    };
}
