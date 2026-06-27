import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { UtilCodeFormatRequestDto } from '@/module/utils/application/dto/request/code-format.dto';
import { UtilCompressRequestDto } from '@/module/utils/application/dto/request/compress.dto';
import { UtilDecompressRequestDto } from '@/module/utils/application/dto/request/decompress.dto';
import { UtilXmlToJsonRequestDto } from '@/module/utils/application/dto/request/xml-to-json.dto';
import { UtilCodeFormatResponseDto } from '@/module/utils/application/dto/response/code-format.dto';
import { UtilCompressResponseDto } from '@/module/utils/application/dto/response/compress.dto';
import { UtilDecompressResponseDto } from '@/module/utils/application/dto/response/decompress.dto';
import { UtilXmlToJsonResponseDto } from '@/module/utils/application/dto/response/xml-to-json.dto';
import { CodeFormatUseCase } from '@/module/utils/application/usecase/code-format.usecase';
import { CompressUseCase } from '@/module/utils/application/usecase/compress.usecase';
import { DecompressUseCase } from '@/module/utils/application/usecase/decompress.usecase';
import { XmlToJsonUseCase } from '@/module/utils/application/usecase/xml-to-json.usecase';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDto } from '@/shared/application/dto/tmf/tmf-error.dto';

import { CodeFormatPresenter } from '../../presenter/utils/code-format.presenter';
import { CompressPresenter } from '../../presenter/utils/compress.presenter';
import { DecompressPresenter } from '../../presenter/utils/decompress.presenter';
import { XmlToJsonPresenter } from '../../presenter/utils/xml-to-json.presenter';

@Controller({ path: Routes.utils.root })
export class Utils {
    constructor(
        private readonly compressUc: CompressUseCase,
        private readonly decompressUc: DecompressUseCase,
        private readonly xmlToJsonUc: XmlToJsonUseCase,
        private readonly codeFormatUc: CodeFormatUseCase,
    ) {}

    @ApiOperation({ summary: Routes.utils.compress.summary })
    @ApiOkResponse({
        type: UtilCompressResponseDto,
    })
    @ApiResponse({
        type: TmfErrorDto,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
    })
    @Post(Routes.utils.compress.route)
    @HttpCode(HttpStatus.OK)
    compress(@Body() dto: UtilCompressRequestDto): UtilCompressResponseDto {
        try {
            const result = this.compressUc.exec(dto);
            return CompressPresenter.toHttp(result);
        } catch (error: any) {
            throw CompressPresenter.toErrorDefault(error);
        }
    }

    @ApiOperation({ summary: Routes.utils.decompress.summary })
    @ApiOkResponse({
        type: UtilDecompressResponseDto,
    })
    @ApiResponse({
        type: TmfErrorDto,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
    })
    @Post(Routes.utils.decompress.route)
    @HttpCode(HttpStatus.OK)
    decompress(
        @Body() dto: UtilDecompressRequestDto,
    ): UtilDecompressResponseDto {
        try {
            const result = this.decompressUc.exec(dto);
            return DecompressPresenter.toHttp(result);
        } catch (error: any) {
            throw DecompressPresenter.toErrorDefault(error);
        }
    }

    @ApiOperation({ summary: Routes.utils.xmlToJson.summary })
    @ApiOkResponse({
        type: UtilXmlToJsonResponseDto,
    })
    @ApiResponse({
        type: TmfErrorDto,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
    })
    @Post(Routes.utils.xmlToJson.route)
    @HttpCode(HttpStatus.OK)
    xmlToJson(@Body() dto: UtilXmlToJsonRequestDto): UtilXmlToJsonResponseDto {
        try {
            const result = this.xmlToJsonUc.exec(dto);
            return XmlToJsonPresenter.toHttp(result);
        } catch (error: any) {
            throw XmlToJsonPresenter.toErrorDefault(error);
        }
    }

    @ApiOperation({ summary: Routes.utils.codeFormat.summary })
    @ApiOkResponse({
        type: UtilCodeFormatResponseDto,
    })
    @ApiResponse({
        type: TmfErrorDto,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
    })
    @Post(Routes.utils.codeFormat.route)
    @HttpCode(HttpStatus.OK)
    async codeFormat(
        @Body() dto: UtilCodeFormatRequestDto,
    ): Promise<UtilCodeFormatResponseDto> {
        try {
            const result = await this.codeFormatUc.exec(dto);
            return CodeFormatPresenter.toHttp(result);
        } catch (error: any) {
            throw CodeFormatPresenter.toErrorDefault(error);
        }
    }
}
