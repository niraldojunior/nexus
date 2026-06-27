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

import { CreateResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/create-resource-catalog.dto';
import { ListResourceCatalogQueryDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/list-resource-catalog-query.dto';
import { PatchResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/patch-resource-catalog.dto';
import { ResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/response/resource-catalog.dto';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/create-resource-catalog.usecase';
import { GetResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/get-resource-catalog.usecase';
import { ListResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/list-resource-catalog.usecase';
import { PatchResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/patch-resource-catalog.usecase';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDtoFor } from '@/shared/application/dto/tmf/tmf-error-dto-for';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { Role } from '@/shared/domain/decorator/role.decorator';
import { UserRead, UserWrite } from '@/shared/domain/entity/user.entity';
import { env } from '@/shared/infra/config/env/environment-config.service';

import { ResourceCatalogPresenter } from '../../presenter/resource-catalog/resource-catalog.presenter';

@UseGuards(AuthGuard)
@ApiTags(Routes.tmf.resourceCatalog.tag)
@Controller({ path: Routes.tmf.resourceCatalog.root, version: '1' })
export class ResourceCatalog {
    constructor(
        private readonly createResourceCatalogUc: CreateResourceCatalogUseCase,
        private readonly listResourceCatalogUc: ListResourceCatalogUseCase,
        private readonly getResourceCatalogUc: GetResourceCatalogUseCase,
        private readonly patchResourceCatalogUc: PatchResourceCatalogUseCase,
        private readonly createAuditUseCase: CreateAuditUseCase,
    ) {}

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.resourceCatalog.create.summary })
    @ApiCreatedResponse({ type: ResourceCatalogDto })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        type: TmfErrorDtoFor(HttpStatus.UNPROCESSABLE_ENTITY),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Post(Routes.tmf.resourceCatalog.create.route)
    async create(
        @Body() dto: CreateResourceCatalogDto,
        @Headers('x-user') userId: string,
    ): Promise<ResourceCatalogDto> {
        try {
            const basePath = this.resolveBasePath();
            const created = await this.createResourceCatalogUc.exec(
                dto,
                basePath,
            );
            if (created.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.CREATE,
                    entityId: created.value.id,
                    entityType: ResourceType.RESOURCE_CATALOG,
                });
            }
            return ResourceCatalogPresenter.toHttp(created, basePath);
        } catch (err: any) {
            throw ResourceCatalogPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCatalog.list.summary })
    @ApiOkResponse({ type: ResourceCatalogDto, isArray: true })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Get(Routes.tmf.resourceCatalog.list.route)
    async list(
        @Query() query: ListResourceCatalogQueryDto,
        @Res({ passthrough: true }) response: FastifyReply,
    ): Promise<ResourceCatalogDto[]> {
        try {
            const basePath = this.resolveBasePath();
            const result = await this.listResourceCatalogUc.exec(query);
            if (result.isRight()) {
                response.header(
                    'Access-Control-Expose-Headers',
                    'X-Result-Count, X-Total-Count',
                );
                response.header('X-Result-Count', result.value.items.length);
                response.header('X-Total-Count', result.value.total);
            }
            return ResourceCatalogPresenter.toHttpList(
                result,
                basePath,
                query.fields,
            );
        } catch (err) {
            throw ResourceCatalogPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCatalog.get.summary })
    @ApiOkResponse({ type: ResourceCatalogDto })
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
    @Get(Routes.tmf.resourceCatalog.get.route)
    async get(
        @Param('id') id: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceCatalogDto> {
        try {
            const basePath = this.resolveBasePath();
            const found = await this.getResourceCatalogUc.exec(id);
            return ResourceCatalogPresenter.toHttp(found, basePath, fields);
        } catch (err) {
            throw ResourceCatalogPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.resourceCatalog.patch.summary })
    @ApiOkResponse({ type: ResourceCatalogDto })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        type: TmfErrorDtoFor(HttpStatus.NOT_FOUND),
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
    @Patch(Routes.tmf.resourceCatalog.patch.route)
    @HttpCode(HttpStatus.OK)
    async patch(
        @Param('id') id: string,
        @Body() dto: PatchResourceCatalogDto,
        @Headers('x-user') userId: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceCatalogDto> {
        try {
            const basePath = this.resolveBasePath();
            const updated = await this.patchResourceCatalogUc.exec(id, dto);
            if (updated.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.UPDATE,
                    entityId: id,
                    entityType: ResourceType.RESOURCE_CATALOG,
                });
            }
            return ResourceCatalogPresenter.toHttp(updated, basePath, fields);
        } catch (err) {
            throw ResourceCatalogPresenter.toErrorDefault(err);
        }
    }

    private resolveBasePath(): string {
        const routePrefix = env<string>('API_ROUTE_PREFIX', '');
        const prefix = routePrefix ? `/${routePrefix}` : '';
        return `${prefix}/v1`;
    }
}
