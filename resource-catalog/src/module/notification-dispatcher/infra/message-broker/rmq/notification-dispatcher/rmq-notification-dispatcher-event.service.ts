import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RmqOptions, Transport } from '@nestjs/microservices';
import { RmqUrl } from '@nestjs/microservices/external/rmq-url.interface';
import amqp, {
    AmqpConnectionManager,
    Channel,
    ChannelWrapper,
} from 'amqp-connection-manager';

import { EventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import {
    RmqNotificationPattern,
    RmqPattern,
} from '@/shared/application/const/message-broker-internal-patterns.const';
import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { CustomDeserialize } from '@/shared/infra/message-broker/rmq/rmq-deserializer.service';
import { safeStringify } from '@/shared/util/json.util';
import { getDlqWithDefaults } from '@/shared/util/message-broker-get-dlq-queue-default-ending.util';

@Injectable()
export class RmqNotificationDispatcherEventService
    implements OnModuleInit, OnModuleDestroy
{
    private logContext = {
        context: this.constructor.name,
        description: this.constructor.name,
    };
    private ready = false;

    private connection: AmqpConnectionManager;
    private client: ChannelWrapper;

    constructor(
        private readonly config: EnvironmentConfigService,
        private readonly logger: LoggerService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.connection = amqp.connect([this.config.get<RmqUrl>('RMQ_HOST')]);

        this.client = this.connection.createChannel({
            setup: async (channel: Channel) => {
                return await Promise.all([
                    this.notificationDispatcherEventDlq(channel),
                    this.notificationDispatcherEvent(channel),
                ]);
            },
            json: true,
        });

        this.logger.info(
            {
                ...this.logContext,
                description: `${this.constructor.name}: Connecting to RabbitMQ...`,
            },
            safeStringify({
                host: this.config.get<string>('RMQ_HOST'),
            }),
        );

        const trigger = setTimeout(() => {
            const msg = `${this.constructor.name}: Timeout while connecting to RabbitMQ`;
            this.logger.error(
                {
                    ...this.logContext,
                    description: msg,
                },
                safeStringify({
                    host: this.config.get<string>('RMQ_HOST'),
                }),
            );
            throw new Error(msg);
        }, 10000);

        this.client.on('connect', () => {
            clearTimeout(trigger);
            this.ready = true;
        });

        await this.client.waitForConnect();

        this.logger.info(
            {
                ...this.logContext,
                description: `${this.constructor.name}: RabbitMQ Publisher connected`,
            },
            safeStringify({
                timestamp: new Date().toISOString(),
            }),
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.client.close();
        await this.connection.close();
    }

    async sendMessage(
        pattern: RmqNotificationPattern,
        data: EventEnvelope<any> & { retries: number },
        opts: { retry?: boolean; delay?: number; retryCount?: number } = {},
    ): Promise<void> {
        let maxAttemps = 100;
        while (!this.ready && maxAttemps-- > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const queue = this.config.get(
            'RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT',
        );
        opts.delay ??= opts.retry
            ? this.config.get<number>('RMQ_RETRY_DELAY')
            : 0;
        opts.retryCount ??= opts.retry ? data.retries + 1 : 0;

        this.logger.info(
            {
                ...this.logContext,
                description: `${this.constructor.name}: Send to queue: ${queue}.${pattern}`,
            },
            safeStringify({
                message: `Send to queue: ${queue}.${pattern}`,
                isDelayedExchange: this.config.get<boolean>(
                    'RMQ_DELAYED_EXCHANGE',
                ),
                opts,
                data,
            }),
        );

        if (this.config.get<boolean>('RMQ_DELAYED_EXCHANGE')) {
            return await this.publish(queue, pattern, data, opts);
        }

        setTimeout(
            () => void this.publish(queue, pattern, data, opts),
            opts.delay,
        );
    }

    getOptions(): RmqOptions {
        return {
            transport: Transport.RMQ,
            options: {
                urls: [this.config.get<RmqUrl>('RMQ_HOST')],
                queue: this.config.get(
                    'RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT',
                ),
                // Use the queue as the routing key
                routingKey: this.config.get(
                    'RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT',
                ),
                // noAck = false means we must ack manually
                noAck: false,
                noAssert: false,
                deserializer: new CustomDeserialize(
                    [
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_CREATE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_STATUS_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_ATTRIBUTE_VALUE_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_DELETE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_CREATE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_STATUS_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_ATTRIBUTE_VALUE_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_DELETE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CANDIDATE_CREATE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CANDIDATE_STATUS_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_CANDIDATE_ATTRIBUTE_VALUE_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_CREATE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_STATUS_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_ATTRIBUTE_VALUE_CHANGE,
                        RmqPattern.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_DELETE,
                    ],
                    this.config.get('RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT'),
                ),
                persistent: true,
                prefetchCount: this.config.get<number>('RMQ_PREFETCH_COUNT'),
                maxConnectionAttempts: -1,
                queueOptions: {
                    durable: true,
                    deadLetterExchange: this.config.get(
                        'RMQ_DEAD_LETTER_EXCHANGE',
                    ),
                    deadLetterRoutingKey: '',
                    deadLetterExchangeType: 'fanout',
                    defaultRequeueRejected: false,
                },
            },
        };
    }

    private async publish(
        queue: string,
        pattern: string,
        data: EventEnvelope<any> & { retries: number },
        opts: { retry?: boolean; delay?: number; retryCount?: number },
    ): Promise<void> {
        await this.client
            .publish(
                this.config.get('RMQ_EXCHANGE'),
                queue,
                { pattern, data },
                {
                    headers: {
                        'x-delay': opts.delay,
                        'x-retry-count': opts.retryCount,
                    },
                } as any,
            )
            .catch((error) => {
                this.logger.error(
                    {
                        ...this.logContext,
                        description: `${this.constructor.name}: Error sending message to queue: ${queue}.${pattern}`,
                    },
                    safeStringify({
                        message: `Error sending message to queue: ${queue}.${pattern}`,
                        error: error.message,
                        name: error.name,
                        description: error.description,
                        stack: error.stack,
                    }),
                );
                throw error;
            });
    }

    private async notificationDispatcherEventDlq(
        channel: Channel,
    ): Promise<void> {
        const dlx = {
            name: this.config.get('RMQ_DEAD_LETTER_EXCHANGE'),
            queue: getDlqWithDefaults(
                this.config.get('RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT'),
            ),
            routingKey: '',
            type: 'fanout',
            options: {
                durable: true,
                messageTtl: this.config.get<number>(
                    'RMQ_DLQ_MSG_TTL_NOTIFICATION_DISPATCHER_EVENT',
                ),
                maxLength: this.config.get<number>(
                    'RMQ_DLQ_MAX_LENGTH_NOTIFICATION_DISPATCHER_EVENT',
                ),
            },
        };

        await channel.assertExchange(dlx.name, dlx.type, dlx.options);
        await channel.assertQueue(dlx.queue, dlx.options);
        await channel.bindQueue(dlx.queue, dlx.name, dlx.routingKey);
    }

    private async notificationDispatcherEvent(channel: Channel): Promise<void> {
        const main = {
            exchange: this.config.get('RMQ_EXCHANGE'),
            queue: this.config.get('RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT'),
            routingKey: this.config.get(
                'RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT',
            ), // Use the queue as the routing key
            ...(this.config.get<boolean>('RMQ_DELAYED_EXCHANGE')
                ? {
                      type: 'x-delayed-message',
                      options: {
                          durable: true,
                          auto_delete: false,
                          internal: false,
                          arguments: { 'x-delayed-type': 'direct' },
                      },
                  }
                : { type: 'direct', options: { durable: true } }),
            queueOptions: {
                durable: true,
                deadLetterExchange: this.config.get('RMQ_DEAD_LETTER_EXCHANGE'),
                deadLetterRoutingKey: '',
                deadLetterExchangeType: 'fanout',
                defaultRequeueRejected: false,
            },
        };

        await channel.assertExchange(main.exchange, main.type, main.options);
        await channel.assertQueue(main.queue, main.queueOptions);
        await channel.bindQueue(main.queue, main.exchange, main.routingKey);
    }
}
