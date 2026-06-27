import { HttpStatus } from '@nestjs/common';

import { ResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/response/resource-category.dto';
import { CreateResourceCategoryResponse } from '@/module/resource-catalog/application/usecase/resource-category/create-resource-category.usecase';
import { GetResourceCategoryResponse } from '@/module/resource-catalog/application/usecase/resource-category/get-resource-category.usecase';
import { ListResourceCategoryResponse } from '@/module/resource-catalog/application/usecase/resource-category/list-resource-category.usecase';
import { PatchResourceCategoryResponse } from '@/module/resource-catalog/application/usecase/resource-category/patch-resource-category.usecase';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';
import {
    filterByRequestedFields,
    parseRequestedFields,
} from '@/shared/util/tmf-list-query.util';

export class ResourceCategoryPresenter {
    static toHttp(
        result:
            | GetResourceCategoryResponse
            | CreateResourceCategoryResponse
            | PatchResourceCategoryResponse,
        basePath: string,
        fields?: string,
    ): ResourceCategoryDto {
        if (result.isLeft()) {
            throw result.value;
        }

        const requestedFields = parseRequestedFields(
            fields,
            ResourceCategoryModel.propertyKeys,
        );

        return this.toHttpWithSelectedFields(
            result.value,
            basePath,
            requestedFields,
        );
    }

    static toHttpList(
        result: ListResourceCategoryResponse,
        basePath: string,
        fields?: string,
    ): ResourceCategoryDto[] {
        if (result.isLeft()) {
            throw result.value;
        }

        const models = result.value.items;

        const requestedFields = parseRequestedFields(
            fields,
            ResourceCategoryModel.propertyKeys,
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
        model: ResourceCategoryModel,
        basePath: string,
        requestedFields?: string[],
    ): ResourceCategoryDto {
        const href = model.href || `${basePath}/resourceCategory/${model.id}`;

        const fullPayload = {
            id: model.id,
            href,
            name: model.name,
            description: model.description,
            lifecycleStatus: model.lifecycleStatus,
            version: model.version,
            category: model.category,
            resourceCatalog: model.resourceCatalog,
            validFor: {
                startDateTime: this.toIsoString(model.validFor?.startDateTime),
                endDateTime: this.toIsoString(model.validFor?.endDateTime),
            },
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: this.toIsoString(model.createdAt),
            updatedAt: this.toIsoString(model.updatedAt),
        };

        return new ResourceCategoryDto(
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
