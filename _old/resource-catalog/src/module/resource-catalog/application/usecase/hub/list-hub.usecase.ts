import { Inject, Injectable } from '@nestjs/common';

import { ListHubDto } from '@/module/resource-catalog/application/dto/hub/request/list-hub.dto';
import {
    HUB_SUBSCRIPTION_REPOSITORY,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { normalizePagination } from '@/shared/util/tmf-list-query.util';

export type ListHubResponse = Either<
    BadRequestError,
    PagedResultModel<HubSubscriptionModel>
>;

@Injectable()
export class ListHubUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(HUB_SUBSCRIPTION_REPOSITORY)
        private readonly repository: HubSubscriptionRepository,
    ) {}

    async exec(query: ListHubDto): Promise<ListHubResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const pagination = normalizePagination(query);
            const result = await this.repository.findAll({
                offset: pagination.offset,
                limit: pagination.limit,
                sort: query.sort,
                filters: {
                    id: query.id,
                    callback: query.callback,
                    event: query.event,
                    credentials: query.credentials,
                    active: query.active,
                    createdAtStart: query.createdAtStart,
                    createdAtEnd: query.createdAtEnd,
                    updatedAtStart: query.updatedAtStart,
                    updatedAtEnd: query.updatedAtEnd,
                },
            });

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
