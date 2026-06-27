import { HttpStatus } from '@nestjs/common';

import { AuditDto } from '@/module/resource-catalog/application/dto/audit/response/audit.dto';
import { GetAuditResponse } from '@/module/resource-catalog/application/usecase/audit/get-audit.usecase';
import { ListAuditResponse } from '@/module/resource-catalog/application/usecase/audit/list-audit.usecase';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';
import {
    filterByRequestedFields,
    parseRequestedFields,
} from '@/shared/util/tmf-list-query.util';

export class AuditPresenter {
    static toHttp(result: GetAuditResponse, fields?: string): AuditDto {
        if (result.isLeft()) {
            throw result.value;
        }
        return this.toHttpWithSelectedFields(result.value, fields);
    }

    static toHttpList(result: ListAuditResponse, fields?: string): AuditDto[] {
        if (result.isLeft()) {
            throw result.value;
        }
        return result.value.items.map((model) =>
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
        model: AuditModel,
        fields?: string,
    ): AuditDto {
        const requestedFields = parseRequestedFields(
            fields,
            AuditModel.propertyKeys,
        );

        const payload = {
            id: model.id,
            userId: model.userId,
            action: model.action,
            entityId: model.entityId,
            entityType: model.entityType,
            timestamp:
                model.timestamp instanceof Date
                    ? model.timestamp.toISOString()
                    : model.timestamp,
        };

        return filterByRequestedFields(payload, requestedFields) as AuditDto;
    }
}
