import { HttpStatus } from '@nestjs/common';

import { ResourceCandidateDto } from '@/module/resource-catalog/application/dto/resource-candidate/response/resource-candidate.dto';
import { GetResourceCandidateResponse } from '@/module/resource-catalog/application/usecase/resource-candidate/get-resource-candidate.usecase';
import { ListResourceCandidateResponse } from '@/module/resource-catalog/application/usecase/resource-candidate/list-resource-candidate.usecase';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';
import {
    filterByRequestedFields,
    parseRequestedFields,
} from '@/shared/util/tmf-list-query.util';

export class ResourceCandidatePresenter {
    static toHttp(
        result: GetResourceCandidateResponse,
        basePath: string,
        fields?: string,
    ): ResourceCandidateDto {
        if (result.isLeft()) {
            throw result.value;
        }

        const requestedFields = parseRequestedFields(
            fields,
            ResourceCandidateModel.propertyKeys,
        );

        return this.toHttpWithSelectedFields(
            result.value,
            basePath,
            requestedFields,
        );
    }

    static toHttpList(
        result: ListResourceCandidateResponse,
        basePath: string,
        fields?: string,
    ): ResourceCandidateDto[] {
        if (result.isLeft()) {
            throw result.value;
        }
        const models = result.value.items;
        const requestedFields = parseRequestedFields(
            fields,
            ResourceCandidateModel.propertyKeys,
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
        model: ResourceCandidateModel,
        basePath: string,
        requestedFields?: string[],
    ): ResourceCandidateDto {
        const href = model.href || `${basePath}/resourceCandidate/${model.id}`;
        const lastUpdate = this.toIsoString(model.updatedAt);

        const fullPayload = {
            id: model.id,
            href,
            name: model.name,
            description: model.description,
            lifecycleStatus: model.lifecycleStatus,
            version: model.version,
            resourceSpecification: model.resourceSpecification,
            category: model.category,
            catalog: model.catalog,
            validFor: model.validFor,
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: this.toIsoString(model.createdAt),
            lastUpdate,
        };

        const filtered = filterByRequestedFields(fullPayload, requestedFields);
        return new ResourceCandidateDto(filtered);
    }

    private static toIsoString(
        value?: Date | string | null,
    ): string | undefined {
        if (!value) {
            return undefined;
        }
        if (typeof value === 'string') {
            return value;
        }
        return value.toISOString();
    }
}
