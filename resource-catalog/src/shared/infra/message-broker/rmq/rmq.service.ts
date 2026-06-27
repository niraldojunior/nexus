import { Injectable } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { getDlqWithDefaults } from '@/shared/util/message-broker-get-dlq-queue-default-ending.util';

@Injectable()
export class RmqService {
    private logContext = {
        context: this.constructor.name,
        description: this.constructor.name,
    };

    constructor(
        private readonly config: EnvironmentConfigService,
        private readonly logger: LoggerService,
    ) {}

    ack(context: RmqContext): void {
        const channel = context.getChannelRef();
        const eventMessage = context.getMessage();
        this.logger.debug(
            {
                ...this.logContext,
                description: `${this.constructor.name}: Ack`,
            },
            'Ack',
        );
        channel.ack(eventMessage);
    }

    nack(context: RmqContext): void {
        const channel = context.getChannelRef();
        const eventMessage = context.getMessage();
        this.logger.debug(
            {
                ...this.logContext,
                description: `${this.constructor.name}: Nack`,
            },
            'Nack',
        );
        channel.nack(eventMessage, false, false);
    }

    sendToQueue(context: RmqContext, queue?: string): void {
        const message = context.getMessage();
        queue ??= message.fields.routingKey;
        this.logger.info(
            {
                ...this.logContext,
                description: `${this.constructor.name}: Send to queue: ${queue}`,
            },
            safeStringify({
                message: `Send to queue: ${queue}`,
                isDelayedExchange: this.config.get<boolean>(
                    'RMQ_DELAYED_EXCHANGE',
                ),
                headers: message.properties.headers,
                data: message.content.toString(),
            }),
        );

        if (this.config.get<boolean>('RMQ_DELAYED_EXCHANGE')) {
            return this.sendToDelayQueue(context, queue);
        }
        return this.sendToRetryQueue(context, queue);
    }

    sendToDeadLetterQueue(context: RmqContext, queue?: string): void {
        const queueOrigin = context.getMessage().fields.routingKey;
        const channel = context.getChannelRef();
        const message = context.getMessage();
        const content = message.content.toString();
        queue ??= getDlqWithDefaults(queueOrigin);

        this.logger.info(
            {
                ...this.logContext,
                description: `${this.constructor.name}: Send to DLQ: ${queue}`,
            },
            safeStringify({
                message: `Send to dead letter queue: ${queue}`,
                isDelayedExchange: this.config.get<boolean>(
                    'RMQ_DELAYED_EXCHANGE',
                ),
                headers: message.properties.headers,
                data: message.content.toString(),
            }),
        );

        channel.sendToQueue(queue, Buffer.from(content), {
            persistent: true,
        });
        this.ack(context);
    }

    async publishWithConfirm(
        context: RmqContext,
        exchange: string,
        routingKey: string,
        content: any,
    ): Promise<unknown> {
        const channel = context.getChannelRef();
        return Promise.race([
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Publish Timeout')), 5000),
            ),
            new Promise((resolve, reject) => {
                const onReturn = (msg: any) => {
                    channel.off('return', onReturn);
                    reject(
                        new Error('Error publishing message', {
                            cause: {
                                replyCode: msg.fields.replyCode,
                                replyText: msg.fields.replyText,
                            },
                        }),
                    );
                };

                channel.on('return', onReturn);

                channel.publish(
                    exchange,
                    routingKey,
                    Buffer.from(safeStringify(content)),
                    { mandatory: true },
                    (err, _ok) => {
                        channel.off('return', onReturn);
                        if (err) {
                            this.logger.error(
                                {
                                    ...this.logContext,
                                    description: `${this.constructor.name}: Publish to: ${routingKey}`,
                                },
                                safeStringify({
                                    msg: 'Error publishing message:',
                                    err,
                                }),
                            );
                            reject(err);
                            return;
                        }
                        resolve(undefined);
                    },
                );
            }),
        ]);
    }

    private sendToRetryQueue(context: RmqContext, queue?: string): void {
        const channel = context.getChannelRef();
        const message = context.getMessage();
        const content = message.content.toString();
        const headers = message.properties.headers;
        const retryDelay = this.config.get<number>('RMQ_RETRY_DELAY');
        queue ??= message.fields.routingKey;

        const retryCount = message.properties.headers['x-retry-count'] || 0;
        headers['x-retry-count'] = retryCount + 1;
        headers['x-delay'] = retryDelay;

        setTimeout(() => {
            channel.sendToQueue(queue, Buffer.from(content), {
                persistent: true,
                headers,
            });
            this.ack(context);
        }, retryDelay);
    }

    private sendToDelayQueue(context: RmqContext, queue?: string): void {
        const channel = context.getChannelRef();
        const message = context.getMessage();
        const content = message.content.toString();
        const headers = message.properties.headers;
        const retryDelay = this.config.get<number>('RMQ_RETRY_DELAY');
        queue ??= message.fields.routingKey;

        const retryCount = message.properties.headers['x-retry-count'] || 0;
        headers['x-retry-count'] = retryCount + 1;
        headers['x-delay'] = retryDelay;

        channel.publish(
            this.config.get('RMQ_EXCHANGE'),
            queue, // Use the queue as the routing key
            Buffer.from(content),
            {
                persistent: true,
                headers,
            },
        );
        this.ack(context);
    }
}
