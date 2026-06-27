import { Inject, Injectable } from '@nestjs/common';

import { CreateHubDto } from '@/module/resource-catalog/application/dto/hub/request/create-hub.dto';
import {
    HUB_SUBSCRIPTION_REPOSITORY,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { validateHubQueryForEvent } from '@/module/resource-catalog/domain/util/hub-query-filter.util';
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type CreateHubResponse = Either<BadRequestError, HubSubscriptionModel>;

@Injectable()
export class CreateHubUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(HUB_SUBSCRIPTION_REPOSITORY)
        private readonly repository: HubSubscriptionRepository,
    ) {}

    async exec(dto: CreateHubDto): Promise<CreateHubResponse> {
        const now = new Date();

        try {
            if (!Object.values(NotificationEvent).includes(dto.event)) {
                return left(
                    new BadRequestError(`Invalid event value: ${dto.event}`),
                );
            }

            if (dto.query) {
                const queryError = validateHubQueryForEvent(
                    dto.query,
                    dto.event,
                );
                if (queryError) {
                    return left(new BadRequestError(queryError));
                }
            }

            const found = await this.repository.findAll({
                filters: { callback: dto.callback, event: dto.event },
            });

            if (!found.total) {
                return right(
                    await this.repository.create({
                        id: Snowflake.nextId().toString(),
                        callback: dto.callback,
                        event: dto.event,
                        query: dto.query,
                        credentials: dto.credentials,
                        active: true,
                        '@type': dto['@type'],
                        '@baseType': dto['@baseType'],
                        '@schemaLocation': dto['@schemaLocation'],
                        createdAt: now,
                        updatedAt: now,
                    }),
                );
            }

            const existing = found.items[0];

            if (
                existing.active &&
                existing.credentials === dto.credentials &&
                existing.query === dto.query
            ) {
                return right(existing);
            }

            const result = await this.repository.patchById(existing.id, {
                ...dto,
                active: true,
                updatedAt: now,
            });

            return right(result as HubSubscriptionModel);
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
