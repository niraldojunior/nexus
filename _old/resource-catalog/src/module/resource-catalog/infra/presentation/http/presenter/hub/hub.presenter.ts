import { HttpStatus } from '@nestjs/common';

import { HubDto } from '@/module/resource-catalog/application/dto/hub/response/hub.dto';
import { CreateHubResponse } from '@/module/resource-catalog/application/usecase/hub/create-hub.usecase';
import { ListHubResponse } from '@/module/resource-catalog/application/usecase/hub/list-hub.usecase';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';
import {
    filterByRequestedFields,
    parseRequestedFields,
} from '@/shared/util/tmf-list-query.util';

export class HubPresenter {
    static toHttp(result: CreateHubResponse, fields?: string): HubDto {
        if (result.isLeft()) {
            throw result.value;
        }

        const model = result.value;
        return this.toHttpWithSelectedFields(model, fields);
    }

    static toHttpList(result: ListHubResponse, fields?: string): HubDto[] {
        if (result.isLeft()) {
            throw result.value;
        }
        const models = result.value.items;
        return models.map((model) =>
            this.toHttpWithSelectedFields(model, fields),
        );
    }

    static toErrorDefault(error: any): void {
        throw new AppError(
            error.message ||
                StatusCodeConstant[HttpStatus.INTERNAL_SERVER_ERROR].message,
            error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            { cause: error.cause || error.reason },
        );
    }

    private static toHttpWithSelectedFields(
        model: HubSubscriptionModel,
        fields?: string,
    ): HubDto {
        const requestedFields = parseRequestedFields(
            fields,
            HubSubscriptionModel.propertyKeys,
        );

        const updatedAt = this.toIsoString(model.updatedAt);
        const payload = {
            id: model.id,
            callback: model.callback,
            event: model.event,
            query: model.query,
            credentials: model.credentials,
            active: model.active,
            createdAt: this.toIsoString(model.createdAt),
            updatedAt,
            lastUpdate: updatedAt,
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
        };

        return filterByRequestedFields(payload, requestedFields) as HubDto;
    }

    private static toIsoString(
        value?: string | Date | null,
    ): string | undefined {
        if (!value) {
            return undefined;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        return value;
    }
}
