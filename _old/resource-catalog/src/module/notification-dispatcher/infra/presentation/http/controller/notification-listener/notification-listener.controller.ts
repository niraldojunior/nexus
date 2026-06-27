import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
    ApiAcceptedResponse,
    ApiBody,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import {
    NotificationListenerAcceptedResponseDto,
    ResourceSpecificationAttributeValueChangeNotificationEventDto,
    ResourceSpecificationCreateNotificationEventDto,
} from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { Routes } from '@/shared/application/const/route.const';

@ApiTags(Routes.tmf.listener.tag)
@Controller({ path: Routes.tmf.listener.root, version: '1' })
export class NotificationListener {
    @ApiOperation({
        summary: Routes.tmf.listener.resourceSpecificationCreate.summary,
    })
    @ApiBody({ type: ResourceSpecificationCreateNotificationEventDto })
    @ApiAcceptedResponse({ type: NotificationListenerAcceptedResponseDto })
    @Post(Routes.tmf.listener.resourceSpecificationCreate.route)
    @HttpCode(HttpStatus.ACCEPTED)
    resourceSpecificationCreate(
        @Body() event: ResourceSpecificationCreateNotificationEventDto,
    ): NotificationListenerAcceptedResponseDto {
        return {
            received: true,
            event: event.eventId,
        };
    }

    @ApiOperation({
        summary:
            Routes.tmf.listener.resourceSpecificationAttributeValueChange
                .summary,
    })
    @ApiBody({
        type: ResourceSpecificationAttributeValueChangeNotificationEventDto,
    })
    @ApiAcceptedResponse({ type: NotificationListenerAcceptedResponseDto })
    @Post(Routes.tmf.listener.resourceSpecificationAttributeValueChange.route)
    @HttpCode(HttpStatus.ACCEPTED)
    resourceSpecificationAttributeValueChange(
        @Body()
        event: ResourceSpecificationAttributeValueChangeNotificationEventDto,
    ): NotificationListenerAcceptedResponseDto {
        return {
            received: true,
            event: event.eventId,
        };
    }
}
