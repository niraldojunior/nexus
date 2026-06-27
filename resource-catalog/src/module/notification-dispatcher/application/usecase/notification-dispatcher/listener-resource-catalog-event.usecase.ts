import { Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { NotificationResourceCatalogEventMapper } from '@/module/notification-dispatcher/domain/mapper/notification-dispatcher/notification-resource-catalog-event.mapper';
import { NotificationResourceSpecificationTargetMapper } from '@/module/notification-dispatcher/domain/mapper/notification-dispatcher/notification-resource-specification-target.mapper';
import { NotificationDispatcherHttpPortImpl } from '@/module/notification-dispatcher/infra/provider/notification-dispatcher-http/notification-dispatcher-http.provider';
import { EVENT } from '@/shared/application/const/event.constant';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { ResourceCatalogNotificationEventMessageDto } from '../../dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { NotificationDispatcherHttpPort } from '../../port/notification-listener/notification-listener.reposiory';

export type ResourceCatalogEventResponse = Either<InternalServerError, void>;

export class ResourceCatalogEventUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(NotificationDispatcherHttpPortImpl)
        private readonly notification: NotificationDispatcherHttpPort,
        @Inject(EventEmitter2)
        private readonly eventEmitter: EventEmitter2,
    ) {}

    async exec(
        dto: ResourceCatalogNotificationEventMessageDto,
    ): Promise<ResourceCatalogEventResponse> {
        try {
            const notification = NotificationResourceCatalogEventMapper.of(dto);

            const target =
                NotificationResourceSpecificationTargetMapper.of(dto);

            const result = await this.notification.dispatch(
                notification,
                target,
            );

            this.eventEmitter.emit(EVENT.NOTIFICATION_DISPATCHED, dto);

            return right(result);
        } catch (err: any) {
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                }),
            );
            return left(err);
        }
    }
}
