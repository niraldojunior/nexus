import { HttpStatus } from '@nestjs/common';

import { ResourceCatalogEventResponseDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/response/resource-catalog-event.dto';
import { ResourceCatalogEventResponse } from '@/module/notification-dispatcher/application/usecase/notification-dispatcher/listener-resource-catalog-event.usecase';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { AppError } from '@/shared/application/error/app.error';

export class ResourceCatalogEventPresenter {
    static of(
        result: ResourceCatalogEventResponse,
    ): ResourceCatalogEventResponseDto {
        if (result.isLeft()) {
            throw result.value;
        }
        return ResourceCatalogEventResponseDto.of(result.value);
    }

    static toErrorDefault(error: any): void {
        throw new AppError(
            error.message ||
                StatusCodeConstant[HttpStatus.INTERNAL_SERVER_ERROR].message,
            error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            { cause: error.cause || error.reason },
        );
    }
}
