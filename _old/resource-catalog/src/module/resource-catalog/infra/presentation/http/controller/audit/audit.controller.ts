import {
    Controller,
    Get,
    HttpStatus,
    Param,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { ListAuditQueryDto } from '@/module/resource-catalog/application/dto/audit/request/list-audit-query.dto';
import { AuditDto } from '@/module/resource-catalog/application/dto/audit/response/audit.dto';
import { GetAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/get-audit.usecase';
import { ListAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/list-audit.usecase';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDtoFor } from '@/shared/application/dto/tmf/tmf-error-dto-for';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { Role } from '@/shared/domain/decorator/role.decorator';
import { UserRead } from '@/shared/domain/entity/user.entity';

import { AuditPresenter } from '../../presenter/audit/audit.presenter';

@UseGuards(AuthGuard)
@ApiTags(Routes.tmf.audit.tag)
@Controller({ path: Routes.tmf.audit.root, version: '1' })
export class Audit {
    constructor(
        private readonly listAuditUseCase: ListAuditUseCase,
        private readonly getAuditUseCase: GetAuditUseCase,
    ) {}

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.audit.list.summary })
    @ApiOkResponse({ type: AuditDto, isArray: true })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @ApiQuery({
        name: 'fields',
        required: false,
        description:
            'Comma-separated list of fields to include in the response',
    })
    @Get(Routes.tmf.audit.list.route)
    async list(
        @Query() query: ListAuditQueryDto,
        @Res({ passthrough: true }) response: FastifyReply,
    ): Promise<AuditDto[]> {
        try {
            const result = await this.listAuditUseCase.exec(query);
            if (result.isRight()) {
                response.header(
                    'Access-Control-Expose-Headers',
                    'X-Result-Count, X-Total-Count',
                );
                response.header('X-Result-Count', result.value.items.length);
                response.header('X-Total-Count', result.value.total);
            }
            return AuditPresenter.toHttpList(result, query.fields);
        } catch (err: any) {
            throw AuditPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.audit.get.summary })
    @ApiOkResponse({ type: AuditDto })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        type: TmfErrorDtoFor(HttpStatus.NOT_FOUND),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @ApiQuery({
        name: 'fields',
        required: false,
        description:
            'Comma-separated list of fields to include in the response',
    })
    @Get(Routes.tmf.audit.get.route)
    async get(
        @Param('id') id: string,
        @Query('fields') fields?: string,
    ): Promise<AuditDto> {
        try {
            const found = await this.getAuditUseCase.exec(id);
            return AuditPresenter.toHttp(found, fields);
        } catch (err: any) {
            throw AuditPresenter.toErrorDefault(err);
        }
    }
}
