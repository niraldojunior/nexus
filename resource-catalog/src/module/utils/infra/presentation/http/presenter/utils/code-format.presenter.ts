import { HttpException, HttpStatus } from '@nestjs/common';

import { UtilCodeFormatResponseDto } from '@/module/utils/application/dto/response/code-format.dto';
import { UtilCodeFormatResponse } from '@/module/utils/application/usecase/code-format.usecase';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';

export class CodeFormatPresenter {
    static toHttp(result: UtilCodeFormatResponse): UtilCodeFormatResponseDto {
        if (result.isLeft()) {
            throw result.value;
        }
        return new UtilCodeFormatResponseDto(result.value);
    }

    static toErrorDefault(error: any): void {
        throw new HttpException(
            error.message ||
                StatusCodeConstant[HttpStatus.INTERNAL_SERVER_ERROR].message,
            error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            { cause: error.cause || error.reason },
        );
    }
}
