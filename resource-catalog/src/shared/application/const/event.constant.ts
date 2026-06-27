export const EVENT = {
    ORDER_RECEIVED: 'order.received',
    NOTIFICATION_DISPATCHED: 'notification.dispatched',
} as const;

export type EVENT = (typeof EVENT)[keyof typeof EVENT];
