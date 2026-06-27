import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiCreatedResponse,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { CreateHubDto } from '@/module/resource-catalog/application/dto/hub/request/create-hub.dto';
import { ListHubDto } from '@/module/resource-catalog/application/dto/hub/request/list-hub.dto';
import { HubDto } from '@/module/resource-catalog/application/dto/hub/response/hub.dto';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateHubUseCase } from '@/module/resource-catalog/application/usecase/hub/create-hub.usecase';
import { DeleteHubUseCase } from '@/module/resource-catalog/application/usecase/hub/delete-hub.usecase';
import { ListHubUseCase } from '@/module/resource-catalog/application/usecase/hub/list-hub.usecase';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDtoFor } from '@/shared/application/dto/tmf/tmf-error-dto-for';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { Role } from '@/shared/domain/decorator/role.decorator';
import { UserRead, UserWrite } from '@/shared/domain/entity/user.entity';

import { HubPresenter } from '../../presenter/hub/hub.presenter';

@UseGuards(AuthGuard)
@ApiTags(Routes.tmf.hub.tag)
@Controller({ path: Routes.tmf.hub.root, version: '1' })
export class Hub {
    constructor(
        private readonly listHubUseCase: ListHubUseCase,
        private readonly createHubUseCase: CreateHubUseCase,
        private readonly deleteHubUseCase: DeleteHubUseCase,
        private readonly createAuditUseCase: CreateAuditUseCase,
    ) {}

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.hub.list.summary })
    @ApiOkResponse({ type: HubDto, isArray: true })
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
    @Get(Routes.tmf.hub.list.route)
    async list(
        @Query() query: ListHubDto,
        @Res({ passthrough: true }) response: FastifyReply,
    ): Promise<HubDto[]> {
        try {
            const result = await this.listHubUseCase.exec(query);
            if (result.isRight()) {
                response.header(
                    'Access-Control-Expose-Headers',
                    'X-Result-Count, X-Total-Count',
                );
                response.header('X-Result-Count', result.value.items.length);
                response.header('X-Total-Count', result.value.total);
            }
            return HubPresenter.toHttpList(result, query.fields);
        } catch (err: any) {
            throw HubPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.hub.create.summary })
    @ApiCreatedResponse({ type: HubDto })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Post(Routes.tmf.hub.create.route)
    async create(
        @Body() dto: CreateHubDto,
        @Headers('x-user') userId: string,
    ): Promise<HubDto> {
        try {
            const created = await this.createHubUseCase.exec(dto);
            if (created.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.CREATE,
                    entityId: created.value.id,
                    entityType: ResourceType.HUB,
                });
            }
            return HubPresenter.toHttp(created);
        } catch (err: any) {
            throw HubPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.hub.delete.summary })
    @ApiNoContentResponse()
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        type: TmfErrorDtoFor(HttpStatus.NOT_FOUND),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Delete(Routes.tmf.hub.delete.route)
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(
        @Param('id') id: string,
        @Headers('x-user') userId: string,
    ): Promise<void> {
        try {
            await this.deleteHubUseCase.exec(id);
            await this.createAuditUseCase.exec({
                userId,
                action: AuditAction.DELETE,
                entityId: id,
                entityType: ResourceType.HUB,
            });
        } catch (err: any) {
            throw HubPresenter.toErrorDefault(err);
        }
    }
}
