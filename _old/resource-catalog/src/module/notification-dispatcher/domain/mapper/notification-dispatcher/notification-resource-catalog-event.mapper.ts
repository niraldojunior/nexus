import { ResourceCatalogNotificationEventMessageDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { NotificationListenerResourceSpecificationEventDto } from '@/module/notification-dispatcher/application/port/notification-listener/notification-listener.reposiory';

export class NotificationResourceCatalogEventMapper {
    static of(
        dto: ResourceCatalogNotificationEventMessageDto,
    ): NotificationListenerResourceSpecificationEventDto {
        const { data } = dto;

        if (!data) {
            throw new Error('Dados insuficientes para mapear o evento');
        }

        return {
            ...data,
            targetUri: undefined,
            credentials: undefined,
            retries: undefined,
        } as NotificationListenerResourceSpecificationEventDto;
    }
}
