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

import { CreateResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/create-resource-category.dto';
import { ListResourceCategoryQueryDto } from '@/module/resource-catalog/application/dto/resource-category/request/list-resource-category-query.dto';
import { PatchResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/patch-resource-category.dto';
import { ResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/response/resource-category.dto';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { CreateResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/create-resource-category.usecase';
import { GetResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/get-resource-category.usecase';
import { ListResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/list-resource-category.usecase';
import { PatchResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/patch-resource-category.usecase';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDtoFor } from '@/shared/application/dto/tmf/tmf-error-dto-for';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { Role } from '@/shared/domain/decorator/role.decorator';
import { UserRead, UserWrite } from '@/shared/domain/entity/user.entity';
import { env } from '@/shared/infra/config/env/environment-config.service';

import { ResourceCategoryPresenter } from '../../presenter/resource-category/resource-category.presenter';

@UseGuards(AuthGuard)
@ApiTags(Routes.tmf.resourceCategory.tag)
@Controller({ path: Routes.tmf.resourceCategory.root, version: '1' })
export class ResourceCategory {
    constructor(
        private readonly createResourceCategoryUc: CreateResourceCategoryUseCase,
        private readonly listResourceCategoryUc: ListResourceCategoryUseCase,
        private readonly getResourceCategoryUc: GetResourceCategoryUseCase,
        private readonly patchResourceCategoryUc: PatchResourceCategoryUseCase,
        private readonly createAuditUseCase: CreateAuditUseCase,
    ) {}

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.resourceCategory.create.summary })
    @ApiCreatedResponse({ type: ResourceCategoryDto })
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
    @Post(Routes.tmf.resourceCategory.create.route)
    async create(
        @Body() dto: CreateResourceCategoryDto,
        @Headers('x-user') userId: string,
    ): Promise<ResourceCategoryDto> {
        try {
            const basePath = this.resolveBasePath();
            const created = await this.createResourceCategoryUc.exec(
                dto,
                basePath,
            );
            if (created.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.CREATE,
                    entityId: created.value.id,
                    entityType: ResourceType.RESOURCE_CATEGORY,
                });
            }
            return ResourceCategoryPresenter.toHttp(created, basePath);
        } catch (err) {
            throw ResourceCategoryPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCategory.list.summary })
    @ApiOkResponse({ type: ResourceCategoryDto, isArray: true })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Get(Routes.tmf.resourceCategory.list.route)
    async list(
        @Query() query: ListResourceCategoryQueryDto,
        @Res({ passthrough: true }) response: FastifyReply,
    ): Promise<ResourceCategoryDto[]> {
        try {
            const basePath = this.resolveBasePath();
            const result = await this.listResourceCategoryUc.exec(query);
            if (result.isRight()) {
                response.header(
                    'Access-Control-Expose-Headers',
                    'X-Result-Count, X-Total-Count',
                );
                response.header('X-Result-Count', result.value.items.length);
                response.header('X-Total-Count', result.value.total);
            }
            return ResourceCategoryPresenter.toHttpList(
                result,
                basePath,
                query.fields,
            );
        } catch (err) {
            throw ResourceCategoryPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCategory.get.summary })
    @ApiOkResponse({ type: ResourceCategoryDto })
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
    @Get(Routes.tmf.resourceCategory.get.route)
    async get(
        @Param('id') id: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceCategoryDto> {
        try {
            const basePath = this.resolveBasePath();
            const found = await this.getResourceCategoryUc.exec(id);
            return ResourceCategoryPresenter.toHttp(found, basePath, fields);
        } catch (err) {
            throw ResourceCategoryPresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCategory.patch.summary })
    @ApiOkResponse({ type: ResourceCategoryDto })
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
    @Patch(Routes.tmf.resourceCategory.patch.route)
    @HttpCode(HttpStatus.OK)
    async patch(
        @Param('id') id: string,
        @Body() dto: PatchResourceCategoryDto,
        @Headers('x-user') userId: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceCategoryDto> {
        try {
            const basePath = this.resolveBasePath();
            const updated = await this.patchResourceCategoryUc.exec(id, dto);
            if (updated.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.UPDATE,
                    entityId: id,
                    entityType: ResourceType.RESOURCE_CATEGORY,
                });
            }
            return ResourceCategoryPresenter.toHttp(updated, basePath, fields);
        } catch (err) {
            throw ResourceCategoryPresenter.toErrorDefault(err);
        }
    }

    private resolveBasePath(): string {
        const routePrefix = env<string>('API_ROUTE_PREFIX', '');
        const prefix = routePrefix ? `/${routePrefix}` : '';
        return `${prefix}/v1`;
    }
}
