import { ResourceCatalogNotificationEventMessageDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { NotificationListenerResourceSpecificationTargetDto } from '@/module/notification-dispatcher/application/port/notification-listener/notification-listener.reposiory';

export class NotificationResourceSpecificationTargetMapper {
    static of(
        dto: ResourceCatalogNotificationEventMessageDto,
    ): NotificationListenerResourceSpecificationTargetDto {
        const { data } = dto;

        if (!(data && data.targetUri)) {
            throw new Error('Dados insuficientes para obter o target');
        }

        return {
            recipient: data.targetUri,
            credentials: data.credentials,
        };
    }
}
