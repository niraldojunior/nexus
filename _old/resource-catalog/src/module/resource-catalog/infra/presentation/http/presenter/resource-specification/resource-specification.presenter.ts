import { HttpStatus } from '@nestjs/common';

import { ResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/response/resource-specification.dto';
import { CreateResourceSpecificationResponse } from '@/module/resource-catalog/application/usecase/resource-specification/create-resource-specification.usecase';
import { GetResourceSpecificationResponse } from '@/module/resource-catalog/application/usecase/resource-specification/get-resource-specification.usecase';
import { ListResourceSpecificationResponse } from '@/module/resource-catalog/application/usecase/resource-specification/list-resource-specification.usecase';
import { PatchResourceSpecificationResponse } from '@/module/resource-catalog/application/usecase/resource-specification/patch-resource-specification.usecase';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';
import {
    filterByRequestedFields,
    parseRequestedFields,
} from '@/shared/util/tmf-list-query.util';

export class ResourceSpecificationPresenter {
    static toHttp(
        result:
            | GetResourceSpecificationResponse
            | CreateResourceSpecificationResponse
            | PatchResourceSpecificationResponse,
        basePath: string,
        fields?: string,
    ): ResourceSpecificationDto {
        if (result.isLeft()) {
            throw result.value;
        }

        const model = result.value;
        const requestedFields = parseRequestedFields(
            fields,
            ResourceSpecificationModel.propertyKeys,
        );

        return this.toHttpWithSelectedFields(model, basePath, requestedFields);
    }

    static toHttpList(
        result: ListResourceSpecificationResponse,
        basePath: string,
        fields?: string,
    ): ResourceSpecificationDto[] {
        if (result.isLeft()) {
            throw result.value;
        }

        const { items: models } = result.value;
        const requestedFields = parseRequestedFields(
            fields,
            ResourceSpecificationModel.propertyKeys,
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
        model: ResourceSpecificationModel,
        basePath: string,
        requestedFields?: string[],
    ): ResourceSpecificationDto {
        const href =
            model.href || `${basePath}/resourceSpecification/${model.id}`;
        const updatedAt = this.toIsoString(model.updatedAt);

        const fullPayload = {
            id: model.id,
            href,
            name: model.name,
            description: model.description,
            lifecycleStatus: model.lifecycleStatus,
            version: model.version,
            category: model.category,
            validFor: {
                startDateTime: this.toIsoString(model.validFor?.startDateTime),
                endDateTime: this.toIsoString(model.validFor?.endDateTime),
            },
            resourceCatalog: model.resourceCatalog,
            resourceCategory: model.resourceCategory,
            resourceSpecCharacteristic: model.resourceSpecCharacteristic,
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: this.toIsoString(model.createdAt),
            updatedAt,
            lastUpdate: updatedAt,
        };

        return new ResourceSpecificationDto(
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
