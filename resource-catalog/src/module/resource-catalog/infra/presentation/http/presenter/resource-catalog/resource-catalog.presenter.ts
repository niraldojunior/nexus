import { HttpStatus } from '@nestjs/common';

import { ResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/response/resource-catalog.dto';
import { CreateResourceCatalogResponse } from '@/module/resource-catalog/application/usecase/resource-catalog/create-resource-catalog.usecase';
import { GetResourceCatalogResponse } from '@/module/resource-catalog/application/usecase/resource-catalog/get-resource-catalog.usecase';
import { ListResourceCatalogResponse } from '@/module/resource-catalog/application/usecase/resource-catalog/list-resource-catalog.usecase';
import { PatchResourceCatalogResponse } from '@/module/resource-catalog/application/usecase/resource-catalog/patch-resource-catalog.usecase';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';
import {
    filterByRequestedFields,
    parseRequestedFields,
} from '@/shared/util/tmf-list-query.util';

export class ResourceCatalogPresenter {
    static toHttp(
        result:
            | GetResourceCatalogResponse
            | CreateResourceCatalogResponse
            | PatchResourceCatalogResponse,
        basePath: string,
        fields?: string,
    ): ResourceCatalogDto {
        if (result.isLeft()) {
            throw result.value;
        }

        const model = result.value;
        const requestedFields = parseRequestedFields(
            fields,
            ResourceCatalogModel.propertyKeys,
        );

        return this.toHttpWithSelectedFields(model, basePath, requestedFields);
    }

    static toHttpList(
        result: ListResourceCatalogResponse,
        basePath: string,
        fields?: string,
    ): ResourceCatalogDto[] {
        if (result.isLeft()) {
            throw result.value;
        }

        const models = result.value.items;

        const requestedFields = parseRequestedFields(
            fields,
            ResourceCatalogModel.propertyKeys,
        );

        return models.map((model) =>
            this.toHttpWithSelectedFields(model, basePath, requestedFields),
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
        model: ResourceCatalogModel,
        basePath: string,
        requestedFields?: string[],
    ): ResourceCatalogDto {
        const href = model.href || `${basePath}/resourceCatalog/${model.id}`;
        const updatedAt = this.toIsoString(model.updatedAt);

        const fullPayload = {
            id: model.id,
            href,
            name: model.name,
            description: model.description,
            lifecycleStatus: model.lifecycleStatus,
            version: model.version,
            validFor: {
                startDateTime: this.toIsoString(model.validFor?.startDateTime),
                endDateTime: this.toIsoString(model.validFor?.endDateTime),
            },
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: this.toIsoString(model.createdAt),
            updatedAt,
            lastUpdate: updatedAt,
        };

        return new ResourceCatalogDto(
            filterByRequestedFields(fullPayload, requestedFields),
        );
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
