import { Inject, Injectable } from '@nestjs/common';

import { NotificationEventDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { NotificationDispatcherPortImpl } from '@/module/notification-dispatcher/infra/provider/notification-dispatcher-event/notification-dispatcher.provider';
import {
    ResourceCandidateAttributeValueChangeEventDto,
    ResourceCandidateCreateEventDto,
    ResourceCandidateStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-candidate-event.dto';
import {
    ResourceCatalogAttributeValueChangeEventDto,
    ResourceCatalogCreateEventDto,
    ResourceCatalogStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-catalog-event.dto';
import {
    ResourceCategoryAttributeValueChangeEventDto,
    ResourceCategoryCreateEventDto,
    ResourceCategoryStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-category-event.dto';
import {
    ResourceSpecificationAttributeValueChangeEventDto,
    ResourceSpecificationCreateEventDto,
    ResourceSpecificationStatusChangeEventDto,
} from '@/module/resource-catalog/application/dto/event/resource-specification-event.dto';
import { EventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { EventDispatcherPort } from '@/module/resource-catalog/application/port/event-dispatcher.port';
import {
    HUB_SUBSCRIPTION_REPOSITORY,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { NotificationDispatcherPort } from '@/shared/application/port/notification-dispatcher/notification-dispatcher.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { NotificationType } from '../../domain/const/notification-event.const';
import {
    evaluateHubQuery,
    parseHubQuery,
} from '../../domain/util/hub-query-filter.util';

@Injectable()
export class EventDispatcherService implements EventDispatcherPort {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(NotificationDispatcherPortImpl)
        private readonly notificationAdapter: NotificationDispatcherPort,
        @Inject(HUB_SUBSCRIPTION_REPOSITORY)
        private readonly hubRepository: HubSubscriptionRepository,
    ) {}

    async dispatchResourceCatalogCreate(
        event: ResourceCatalogCreateEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCatalogAttributeValueChange(
        event: ResourceCatalogAttributeValueChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCatalogStatusChange(
        event: ResourceCatalogStatusChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCategoryCreate(
        event: ResourceCategoryCreateEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCategoryAttributeValueChange(
        event: ResourceCategoryAttributeValueChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCategoryStatusChange(
        event: ResourceCategoryStatusChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceSpecificationCreate(
        event: ResourceSpecificationCreateEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceSpecificationAttributeValueChange(
        event: ResourceSpecificationAttributeValueChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceSpecificationStatusChange(
        event: ResourceSpecificationStatusChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCandidateCreate(
        event: ResourceCandidateCreateEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCandidateAttributeValueChange(
        event: ResourceCandidateAttributeValueChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    async dispatchResourceCandidateStatusChange(
        event: ResourceCandidateStatusChangeEventDto,
    ): Promise<void> {
        await this.dispatch(event);
    }

    private async dispatch(event: EventEnvelope<unknown>): Promise<void> {
        const startedAt = Date.now();
        const subscribers = await this.hubRepository.findAllActiveByEvent(
            event.eventType,
        );
        const resourceId = this.resolveResourceId(event);
        this.logger.setContext(this.constructor.name);

        this.logger.info(
            { description: this.constructor.name },
            safeStringify({
                action: 'dispatch',
                status: 'start',
                eventType: event.eventType,
                resourceId,
                targetSubscribers: subscribers.length,
                message: 'TMF634 event dispatch started',
            }),
        );

        let successCount = 0;
        let failedCount = 0;

        for (const subscriber of subscribers) {
            try {
                if (subscriber.query) {
                    const parsed = parseHubQuery(subscriber.query);
                    if (parsed && !evaluateHubQuery(event.event, parsed)) {
                        this.logger.info(
                            { description: this.constructor.name },
                            safeStringify({
                                action: 'dispatch',
                                status: 'skip',
                                eventType: event.eventType,
                                resourceId,
                                subscriberId: subscriber.id,
                                targetUri: subscriber.callback,
                                credentials: !!subscriber.credentials,
                                query: subscriber.query,
                                parsed,
                                message:
                                    'Event payload does not match subscriber query filter, skipping',
                            }),
                        );
                        continue;
                    }
                }

                event.targetUri = subscriber.callback; // attach callback url to event envelope for later use in notification adapter
                event.credentials = subscriber.credentials; // attach credentials to event envelope for later use in notification adapter

                await this.notificationAdapter.event(
                    event as EventEnvelope<NotificationEventDto>,
                );

                successCount += 1;
            } catch (error) {
                failedCount += 1;
                this.logger.warn(
                    { description: this.constructor.name },
                    safeStringify({
                        action: 'dispatch',
                        status: 'warn',
                        eventType: event.eventType,
                        resourceId,
                        subscriberId: subscriber.id,
                        targetUri: subscriber.callback,
                        credentials: !!subscriber.credentials,
                        message: {
                            error: (error as Error).message,
                            stack: (error as Error).stack,
                        },
                    }),
                );
            }
        }

        this.logger.info(
            { description: this.constructor.name },
            safeStringify({
                action: 'dispatch',
                status: 'success',
                eventType: event.eventType,
                resourceId,
                successCount,
                failedCount,
                elapsedMs: Date.now() - startedAt,
                message: 'TMF634 event dispatch finished',
            }),
        );
    }

    private resolveResourceId(event: EventEnvelope<unknown>): string {
        if (!event.event || typeof event.event !== 'object') {
            return 'n/a';
        }

        const payload = event.event as Record<string, unknown>;
        const keys: NotificationType[] = [
            'resourceCatalog',
            'resourceCategory',
            'resourceSpecification',
            'resourceCandidate',
        ];

        for (const key of keys) {
            const node = payload[key];
            if (node && typeof node === 'object' && 'id' in node) {
                const id = (node as { id?: unknown }).id;
                if (typeof id === 'string' && id.trim()) {
                    return id;
                }
            }
        }

        return 'n/a';
    }
}
