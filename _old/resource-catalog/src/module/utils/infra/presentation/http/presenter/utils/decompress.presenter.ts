import { HttpException, HttpStatus } from '@nestjs/common';

import { UtilDecompressResponseDto } from '@/module/utils/application/dto/response/decompress.dto';
import { UtilDecompressResponse } from '@/module/utils/application/usecase/decompress.usecase';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';

export class DecompressPresenter {
    static toHttp(result: UtilDecompressResponse): UtilDecompressResponseDto {
        if (result.isLeft()) {
            throw result.value;
        }
        return new UtilDecompressResponseDto(result.value);
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
