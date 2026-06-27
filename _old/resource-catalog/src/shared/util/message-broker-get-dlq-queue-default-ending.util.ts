import { MESSAGE_BROKER_DLQ_DEFAULT_PREFIX } from '@/shared/application/const/message-broker-dlq-default.const';

export const getDlqWithDefaults = (queue: string): string => {
    return `${MESSAGE_BROKER_DLQ_DEFAULT_PREFIX}${queue.replace(/^Q_/, '')}`;
};
