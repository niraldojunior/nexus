import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
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

import { ListResourceCandidateQueryDto } from '@/module/resource-catalog/application/dto/resource-candidate/request/list-resource-candidate-query.dto';
import { PatchResourceCandidateDto } from '@/module/resource-catalog/application/dto/resource-candidate/request/patch-resource-candidate.dto';
import { ResourceCandidateDto } from '@/module/resource-catalog/application/dto/resource-candidate/response/resource-candidate.dto';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { GetResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/get-resource-candidate.usecase';
import { ListResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/list-resource-candidate.usecase';
import { PatchResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/patch-resource-candidate.usecase';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { Routes } from '@/shared/application/const/route.const';
import { TmfErrorDtoFor } from '@/shared/application/dto/tmf/tmf-error-dto-for';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { Role } from '@/shared/domain/decorator/role.decorator';
import { UserRead, UserWrite } from '@/shared/domain/entity/user.entity';
import { env } from '@/shared/infra/config/env/environment-config.service';

import { ResourceCandidatePresenter } from '../../presenter/resource-candidate/resource-candidate.presenter';

@UseGuards(AuthGuard)
@ApiTags(Routes.tmf.resourceCandidate.tag)
@Controller({ path: Routes.tmf.resourceCandidate.root, version: '1' })
export class ResourceCandidate {
    constructor(
        private readonly listResourceCandidateUc: ListResourceCandidateUseCase,
        private readonly getResourceCandidateUc: GetResourceCandidateUseCase,
        private readonly patchResourceCandidateUc: PatchResourceCandidateUseCase,
        private readonly createAuditUseCase: CreateAuditUseCase,
    ) {}

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCandidate.list.summary })
    @ApiOkResponse({ type: ResourceCandidateDto, isArray: true })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        type: TmfErrorDtoFor(HttpStatus.INTERNAL_SERVER_ERROR),
    })
    @Get(Routes.tmf.resourceCandidate.list.route)
    async list(
        @Query() query: ListResourceCandidateQueryDto,
        @Res({ passthrough: true }) response: FastifyReply,
    ): Promise<ResourceCandidateDto[]> {
        try {
            const basePath = this.resolveBasePath();
            const result = await this.listResourceCandidateUc.exec(query);
            if (result.isRight()) {
                response.header(
                    'Access-Control-Expose-Headers',
                    'X-Result-Count, X-Total-Count',
                );
                response.header('X-Result-Count', result.value.items.length);
                response.header('X-Total-Count', result.value.total);
            }
            return ResourceCandidatePresenter.toHttpList(
                result,
                basePath,
                query.fields,
            );
        } catch (err: any) {
            throw ResourceCandidatePresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserRead))
    @ApiOperation({ summary: Routes.tmf.resourceCandidate.get.summary })
    @ApiOkResponse({ type: ResourceCandidateDto })
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
    @Get(Routes.tmf.resourceCandidate.get.route)
    async get(
        @Param('id') id: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceCandidateDto> {
        try {
            const basePath = this.resolveBasePath();
            const found = await this.getResourceCandidateUc.exec(id);
            return ResourceCandidatePresenter.toHttp(found, basePath, fields);
        } catch (err: any) {
            throw ResourceCandidatePresenter.toErrorDefault(err);
        }
    }

    @Role(Object.values(UserWrite))
    @ApiOperation({ summary: Routes.tmf.resourceCandidate.patch.summary })
    @ApiOkResponse({ type: ResourceCandidateDto })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        type: TmfErrorDtoFor(HttpStatus.BAD_REQUEST),
    })
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
    @Patch(Routes.tmf.resourceCandidate.patch.route)
    @HttpCode(HttpStatus.OK)
    async patch(
        @Param('id') id: string,
        @Body() dto: PatchResourceCandidateDto,
        @Headers('x-user') userId: string,
        @Query('fields') fields?: string,
    ): Promise<ResourceCandidateDto> {
        try {
            const basePath = this.resolveBasePath();
            const updated = await this.patchResourceCandidateUc.exec(id, dto);
            if (updated.isRight()) {
                await this.createAuditUseCase.exec({
                    userId,
                    action: AuditAction.UPDATE,
                    entityId: id,
                    entityType: ResourceType.RESOURCE_CANDIDATE,
                });
            }
            return ResourceCandidatePresenter.toHttp(updated, basePath, fields);
        } catch (err: any) {
            throw ResourceCandidatePresenter.toErrorDefault(err);
        }
    }

    private resolveBasePath(): string {
        const routePrefix = env<string>('API_ROUTE_PREFIX', '');
        const prefix = routePrefix ? `/${routePrefix}` : '';
        return `${prefix}/v1`;
    }
}
