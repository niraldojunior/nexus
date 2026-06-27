import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { CreateResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/create-resource-specification.dto';
import { ListResourceSpecificationQueryDto } from '@/module/resource-catalog/application/dto/resource-specification/request/list-resource-specification-query.dto';
import { PatchResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/patch-resource-specification.dto';
import { ResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/response/resource-specification.dto';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/create-resource-specification.usecase';
import { GetResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/get-resource-specification.usecase';
import { ListResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/list-resource-specification.usecase';
import { PatchResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/patch-resource-specification.usecase';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDtoFor } from '@/shared/application/dto/tmf/tmf-error-dto-for';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { Role } from '@/shared/domain/decorator/role.decorator';
import { UserRead, UserWrite } from '@/shared/domain/entity/user.entity';
import { env } from '@/shared/infra/config/env/environment-config.service';

import { ResourceSpecificationPresenter } from '../../presenter/resource-specification/resource-specification.presenter';

@UseGuards(AuthGuard)
@ApiTags(Routes.tmf.resourceSpecification.tag)
@Controller({ path: Routes.tmf.resourceSpecification.root, version: '1' })
export class ResourceSpecification {
    constructor(
        private readonly createResourceSpecificationUc: CreateResourceSpecificationUseCase,
        private readonly listResourceSpecificationUc: ListResourceSpecificationUseCase,
        private readonly getResourceSpecificationUc: GetResourceSpecificationUseCase,
        private readonly patchResourceSpecificationUc: PatchResourceSpecificationUseCase,
        private readonly createAuditUseCase: CreateAuditUseCase,
    ) {}

    @Role(Object.values(UserWrite))
    @ApiOperation({
        summary: Routes.tmf.resourceSpecification.create.summary,
    })
    @ApiCreatedResponse({ type: ResourceSpecificationDto })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.CONFLICT,
        type: TmfErrorDtoFor(HttpStatus.CONFLICT),
    })
    @ApiResponse({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        type: TmfErrorDtoFor(HttpStatus.UNPROCESSABLE_ENTITY),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Post(Routes.tmf.resourceSpecification.create.route)
    async create(
        @Body() dto: CreateResourceSpecificationDto,
        @Headers('x-user') userId: string,
    ): Promise<ResourceSpecificationDto> {
        try {
            const basePath = this.resolveBasePath();
            const created = await this.createResourceSpecificationUc.exec(
                dto,
                basePath,
            );
            if (created.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.CREATE,
                    entityId: created.value.id,
                    entityType: ResourceType.RESOURCE_SPECIFICATION,
                });
            }
            return ResourceSpecificationPresenter.toHttp(created, basePath);
        } catch (err: any) {
            throw ResourceSpecificationPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceSpecification.list.summary })
    @ApiOkResponse({ type: ResourceSpecificationDto, isArray: true })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Get(Routes.tmf.resourceSpecification.list.route)
    async list(
        @Query() query: ListResourceSpecificationQueryDto,
        @Res({ passthrough: true }) response: FastifyReply,
    ): Promise<ResourceSpecificationDto[]> {
        try {
            const basePath = this.resolveBasePath();
            const result = await this.listResourceSpecificationUc.exec(query);
            if (result.isRight()) {
                response.header(
                    'Access-Control-Expose-Headers',
                    'X-Result-Count, X-Total-Count',
                );
                response.header('X-Result-Count', result.value.items.length);
                response.header('X-Total-Count', result.value.total);
            }
            return ResourceSpecificationPresenter.toHttpList(
                result,
                basePath,
                query.fields,
            );
        } catch (err) {
            throw ResourceSpecificationPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceSpecification.get.summary })
    @ApiOkResponse({ type: ResourceSpecificationDto })
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
    @Get(Routes.tmf.resourceSpecification.get.route)
    async get(
        @Param('id') id: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceSpecificationDto> {
        try {
            const basePath = this.resolveBasePath();
            const found = await this.getResourceSpecificationUc.exec(id);
            return ResourceSpecificationPresenter.toHttp(
                found,
                basePath,
                fields,
            );
        } catch (err) {
            throw ResourceSpecificationPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.resourceSpecification.patch.summary })
    @ApiOkResponse({ type: ResourceSpecificationDto })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        type: TmfErrorDtoFor(HttpStatus.NOT_FOUND),
    })
    @ApiResponse({
        status: HttpStatus.CONFLICT,
        type: TmfErrorDtoFor(HttpStatus.CONFLICT),
    })
    @ApiResponse({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        type: TmfErrorDtoFor(HttpStatus.UNPROCESSABLE_ENTITY),
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
    @Patch(Routes.tmf.resourceSpecification.patch.route)
    @HttpCode(HttpStatus.OK)
    async patch(
        @Param('id') id: string,
        @Body() dto: PatchResourceSpecificationDto,
        @Headers('x-user') userId: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceSpecificationDto> {
        try {
            const basePath = this.resolveBasePath();
            const updated = await this.patchResourceSpecificationUc.exec(
                id,
                dto,
                basePath,
            );
            if (updated.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.UPDATE,
                    entityId: id,
                    entityType: ResourceType.RESOURCE_SPECIFICATION,
                });
            }
            return ResourceSpecificationPresenter.toHttp(
                updated,
                basePath,
                fields,
            );
        } catch (err) {
            throw ResourceSpecificationPresenter.toErrorDefault(err);
        }
    }

    private resolveBasePath(): string {
        const routePrefix = env<string>('API_ROUTE_PREFIX', '');
        const prefix = routePrefix ? `/${routePrefix}` : '';
        return `${prefix}/v1`;
    }
}
