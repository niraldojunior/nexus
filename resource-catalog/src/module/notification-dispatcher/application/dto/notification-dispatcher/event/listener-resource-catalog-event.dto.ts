import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { RmqBaseRequestDto } from '@/shared/application/dto/message-broker/rmq-base-request.dto';
import { safeParse, safeStringify } from '@/shared/util/json.util';

class NotificationListenerValidForDto {
    @ApiProperty({
        description: 'Start date-time for resource specification validity',
        example: new Date().toISOString(),
    })
    startDateTime: string;

    @ApiPropertyOptional({
        description: 'End date-time for resource specification validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    endDateTime?: string;
}

class NotificationListenerCatalogRefDto {
    @ApiProperty({
        description: 'Catalog identifier',
        example: '7391531911851660864',
    })
    id: string;

    @ApiPropertyOptional({
        description: 'Catalog href',
        example: '/api/v1/resourceCatalog/7391531911851660864',
    })
    href?: string;

    @ApiPropertyOptional({
        description: 'Catalog name',
        example: 'Atacado',
    })
    name?: string;
}

class NotificationListenerCategoryRefDto {
    @ApiProperty({
        description: 'Category identifier',
        example: '7391531910851660864',
    })
    id: string;

    @ApiPropertyOptional({
        description: 'Category href',
        example: '/api/v1/resourceCategory/7391531910851660864',
    })
    href?: string;

    @ApiPropertyOptional({
        description: 'Category name',
        example: 'Roteador',
    })
    name?: string;
}

class NotificationListenerCharacteristicDto {
    @ApiProperty({
        description: 'Characteristic name',
        example: 'Brand',
    })
    name: string;

    @ApiProperty({
        description: 'Characteristic value type',
        example: 'string',
    })
    valueType: string;

    @ApiProperty({
        description: 'Characteristic value',
        example: 'ZTE',
    })
    value: unknown;
}

class NotificationListenerResourceSpecificationDto {
    @ApiProperty({
        description: 'Resource specification identifier',
        example: '7391531910851620864',
    })
    id: string;

    @ApiPropertyOptional({
        description: 'Resource specification href',
        example: '/api/v1/resourceSpecification/7391531910851620864',
    })
    href?: string;

    @ApiProperty({
        description: 'Resource specification name',
        example: 'CPE ZTE F670L',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Resource specification description',
    })
    description?: string;

    @ApiProperty({
        description: 'Resource specification lifecycle status',
        example: 'Active',
    })
    lifecycleStatus: string;

    @ApiPropertyOptional({
        description: 'Resource specification version',
        example: '1.0.0',
    })
    version?: string;

    @ApiPropertyOptional({
        description: 'Business category classifier',
        example: 'CPE',
    })
    category?: string;

    @ApiProperty({
        description: 'Business unique key',
        example: 'ROUTER|ZTE|F670L|STD',
    })
    uniqueKey: string;

    @ApiProperty({
        description: 'Resource specification validity',
        type: NotificationListenerValidForDto,
    })
    validFor: NotificationListenerValidForDto;

    @ApiProperty({
        description: 'Catalog references used by specification',
        type: NotificationListenerCatalogRefDto,
        isArray: true,
    })
    resourceCatalog: NotificationListenerCatalogRefDto[];

    @ApiProperty({
        description: 'Category references used by specification',
        type: NotificationListenerCategoryRefDto,
        isArray: true,
    })
    resourceCategory: NotificationListenerCategoryRefDto[];

    @ApiProperty({
        description: 'Specification characteristics',
        type: NotificationListenerCharacteristicDto,
        isArray: true,
    })
    resourceSpecCharacteristic: NotificationListenerCharacteristicDto[];

    @ApiProperty({
        description: 'Entity creation timestamp',
        example: new Date().toISOString(),
    })
    createdAt: string;

    @ApiProperty({
        description: 'Entity update timestamp',
        example: new Date().toISOString(),
    })
    updatedAt: string;
}

class NotificationListenerResourceSpecificationEventPayloadDto {
    @ApiProperty({
        description: 'Resource specification payload',
        type: NotificationListenerResourceSpecificationDto,
    })
    resourceSpecification: NotificationListenerResourceSpecificationDto;
}

class NotificationListenerResourceSpecificationEventBaseDto {
    @ApiProperty({
        description: 'Unique identifier of the event',
        example: '7391531910851620864',
    })
    @IsString()
    eventId: string;

    @ApiProperty({
        description: 'Event type identifier',
        example: 'ResourceSpecificationCreateEvent',
    })
    eventType: string;

    @ApiProperty({
        description: 'Event timestamp in ISO format',
        example: new Date().toISOString(),
    })
    eventTime: string;

    targetUri: string;
    credentials?: string;

    @ApiProperty({
        description: 'Event payload wrapper',
        type: NotificationListenerResourceSpecificationEventPayloadDto,
    })
    event: NotificationListenerResourceSpecificationEventPayloadDto;
}

export class NotificationEventDto extends NotificationListenerResourceSpecificationEventBaseDto {
    @ApiProperty({
        description: 'Event type identifier',
        example: 'ResourceSpecificationCreateEvent',
        enum: NotificationEvent,
    })
    declare eventType: NotificationEvent;
}

export class ResourceSpecificationCreateNotificationEventDto extends NotificationListenerResourceSpecificationEventBaseDto {
    @ApiProperty({
        description: 'Event type identifier',
        example: 'ResourceSpecificationCreateEvent',
        enum: NotificationEvent,
    })
    declare eventType: NotificationEvent;
}

export class ResourceSpecificationAttributeValueChangeNotificationEventDto extends NotificationListenerResourceSpecificationEventBaseDto {
    @ApiProperty({
        description: 'Event type identifier',
        example: 'ResourceSpecificationAttributeValueChangeEvent',
        enum: NotificationEvent,
    })
    declare eventType: NotificationEvent;
}

export class NotificationListenerAcceptedResponseDto {
    @ApiProperty({
        description: 'Indicates the listener accepted the event payload',
        example: true,
    })
    received: boolean;

    @ApiProperty({
        description: 'Received event payload',
        example: '7391531910851620864',
    })
    event: string;
}

export class ResourceCatalogNotificationEventMessageDto extends RmqBaseRequestDto<
    NotificationEventDto,
    NotificationEvent
> {
    static of(
        event:
            | NotificationEventDto
            | ResourceCatalogNotificationEventMessageDto,
        pattern: NotificationEvent,
        retries = 0,
    ): ResourceCatalogNotificationEventMessageDto {
        const isMessageDto = !!(
            event as ResourceCatalogNotificationEventMessageDto
        ).data;

        if (isMessageDto) {
            const dto = new ResourceCatalogNotificationEventMessageDto(
                safeParse(
                    safeStringify(
                        (event as ResourceCatalogNotificationEventMessageDto)
                            .data,
                    ),
                ),
                pattern,
                retries,
            );
            return dto;
        }

        return new ResourceCatalogNotificationEventMessageDto(
            safeParse(
                safeStringify(
                    event as ResourceCatalogNotificationEventMessageDto,
                ),
            ),
            pattern,
            retries,
        );
    }
}
