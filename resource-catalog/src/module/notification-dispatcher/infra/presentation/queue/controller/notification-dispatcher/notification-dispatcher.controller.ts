import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { ResourceCatalogNotificationEventMessageDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { ResourceCatalogEventResponseDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/response/resource-catalog-event.dto';
import { ResourceCatalogEventUseCase } from '@/module/notification-dispatcher/application/usecase/notification-dispatcher/listener-resource-catalog-event.usecase';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { MESSAGE_BROKER_PATTERNS } from '@/shared/application/const/message-broker-patterns.const';
import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { RmqService } from '@/shared/infra/message-broker/rmq/rmq.service';
import { safeParse } from '@/shared/util/json.util';

import { ResourceCatalogEventPresenter } from '../../presenter/notification-dispatcher/resource-catalog-event.presenter';

@Controller()
export class NotificationDispatcher {
    constructor(
        private readonly rmq: RmqService,
        private readonly configService: EnvironmentConfigService,
        private readonly resourceCatalogEventUc: ResourceCatalogEventUseCase,
    ) {}

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_CREATE_EVENT,
    )
    async handleResourceCatalogCreateEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_STATUS_CHANGE_EVENT,
    )
    async handleResourceCatalogStatusChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_ATTRIBUTE_VALUE_CHANGE_EVENT,
    )
    async handleResourceCatalogAttributeValueChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATALOG_DELETE_EVENT,
    )
    async handleResourceCatalogDeleteEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_CREATE_EVENT,
    )
    async handleResourceCategoryCreateEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_STATUS_CHANGE_EVENT,
    )
    async handleResourceCategoryStatusChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_ATTRIBUTE_VALUE_CHANGE_EVENT,
    )
    async handleResourceCategoryAttributeValueChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CATEGORY_DELETE_EVENT,
    )
    async handleResourceCategoryDeleteEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CANDIDATE_CREATE_EVENT,
    )
    async handleResourceCandidateCreateEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CANDIDATE_STATUS_CHANGE_EVENT,
    )
    async handleResourceCandidateStatusChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_CANDIDATE_ATTRIBUTE_VALUE_CHANGE_EVENT,
    )
    async handleResourceCandidateAttributeValueChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_CREATE_EVENT,
    )
    async handleResourceSpecificationCreateEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_STATUS_CHANGE_EVENT,
    )
    async handleResourceSpecificationStatusChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_ATTRIBUTE_VALUE_CHANGE_EVENT,
    )
    async handleResourceSpecificationAttributeValueChangeEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    @MessagePattern(
        MESSAGE_BROKER_PATTERNS.NOTIFICATION_DISPATCHER_RESOURCE_SPECIFICATION_DELETE_EVENT,
    )
    async handleResourceSpecificationDeleteEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        return this.handleEvent(context);
    }

    private async handleEvent(
        @Ctx() context: RmqContext,
    ): Promise<ResourceCatalogEventResponseDto> {
        const msg = context.getMessage();
        const headers = msg.properties.headers;

        try {
            const event: ResourceCatalogNotificationEventMessageDto = safeParse(
                msg.content.toString(),
            );
            const pattern = context.getPattern()?.split('.').pop();
            const notificationEventKey = Object.values(NotificationEvent).find(
                (v) => v === pattern,
            );

            if (!pattern || !notificationEventKey) {
                throw new Error(`Invalid notification event type: ${pattern}`);
            }

            const dto = ResourceCatalogNotificationEventMessageDto.of(
                event.data,
                notificationEventKey,
                headers['x-retry-count'],
            );

            const result = await this.resourceCatalogEventUc.exec(dto);
            const response = ResourceCatalogEventPresenter.of(result);
            this.rmq.ack(context);
            return response;
        } catch (error: any) {
            const maxRetries =
                this.configService.get<number>('RMQ_RETRY_COUNT');
            headers.statusCode = error.status;
            if (maxRetries && headers['x-retry-count'] < maxRetries) {
                this.rmq.sendToQueue(context);
                throw error;
            }
            this.rmq.sendToDeadLetterQueue(context);
            throw ResourceCatalogEventPresenter.toErrorDefault(error);
        }
    }
}
