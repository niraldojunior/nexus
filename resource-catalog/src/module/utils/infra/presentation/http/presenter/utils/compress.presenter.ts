import { HttpException, HttpStatus } from '@nestjs/common';

import { UtilCompressResponseDto } from '@/module/utils/application/dto/response/compress.dto';
import { UtilCompressResponse } from '@/module/utils/application/usecase/compress.usecase';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';

export class CompressPresenter {
    static toHttp(result: UtilCompressResponse): UtilCompressResponseDto {
        if (result.isLeft()) {
            throw result.value;
        }
        return new UtilCompressResponseDto(result.value);
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
