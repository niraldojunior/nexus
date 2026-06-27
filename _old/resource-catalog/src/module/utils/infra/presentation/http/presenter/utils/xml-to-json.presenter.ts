import { HttpException, HttpStatus } from '@nestjs/common';

import { UtilXmlToJsonResponseDto } from '@/module/utils/application/dto/response/xml-to-json.dto';
import { UtilXmlToJsonResponse } from '@/module/utils/application/usecase/xml-to-json.usecase';
import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';

export class XmlToJsonPresenter {
    static toHttp(result: UtilXmlToJsonResponse): UtilXmlToJsonResponseDto {
        if (result.isLeft()) {
            throw result.value;
        }
        return new UtilXmlToJsonResponseDto(result.value);
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
