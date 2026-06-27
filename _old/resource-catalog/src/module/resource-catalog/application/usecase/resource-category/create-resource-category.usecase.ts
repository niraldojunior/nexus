import {
    Inject,
    Injectable,
    UnprocessableEntityException,
} from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { CreateResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/create-resource-category.dto';
import {
    EventDispatcherPort,
    TMF634_EVENT_DISPATCHER,
} from '@/module/resource-catalog/application/port/event-dispatcher.port';
import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { ConflictError } from '@/shared/application/error/conflict.error';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';

export type CreateResourceCategoryResponse = Either<
    InternalServerError | BadRequestError | ConflictError,
    ResourceCategoryModel
>;

@Injectable()
export class CreateResourceCategoryUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly resourceCatalogRepository: ResourceCatalogRepository,
        @Inject(RESOURCE_CATEGORY_REPOSITORY)
        private readonly repository: ResourceCategoryRepository,
        @Inject(TMF634_EVENT_DISPATCHER)
        private readonly eventDispatcher: EventDispatcherPort,
    ) {}

    async exec(
        dto: CreateResourceCategoryDto,
        basePath: string,
    ): Promise<CreateResourceCategoryResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const id = Snowflake.nextId().toString();
            const now = new Date();

            if (dto.validFor.startDateTime && dto.validFor.endDateTime) {
                const startDateTime = new Date(dto.validFor.startDateTime);
                const endDateTime = new Date(dto.validFor.endDateTime);
                if (endDateTime < startDateTime) {
                    return left(
                        new BadRequestError(
                            'validFor.endDateTime must be greater than validFor.startDateTime',
                        ),
                    );
                }
            }

            await this.ensureResourceCatalogExist(dto.resourceCatalog);

            const existing = (
                await this.repository.findAll({ filters: { name: dto.name } })
            ).items.filter((e) =>
                e.resourceCatalog.some((rc) =>
                    dto.resourceCatalog.some((drc) => drc.id === rc.id),
                ),
            );

            if (existing.length) {
                return left(
                    new ConflictError(
                        `ResourceCategory with name '${dto.name}' already exists in the specified resource catalog`,
                    ),
                );
            }

            const created = await this.repository.create({
                id,
                href: `${basePath}/resourceCategory/${id}`,
                name: dto.name,
                description: dto.description,
                lifecycleStatus: dto.lifecycleStatus,
                resourceCatalog: dto.resourceCatalog,
                version: dto.version,
                category: dto.category,
                validFor: dto.validFor,
                '@type': dto['@type'],
                '@baseType': dto['@baseType'],
                '@schemaLocation': dto['@schemaLocation'],
                createdAt: now,
                updatedAt: now,
            });

            await this.eventDispatcher.dispatchResourceCategoryCreate(
                createEventEnvelope(
                    NotificationEvent.RESOURCE_CATEGORY_CREATE_EVENT,
                    {
                        resourceCategory: created,
                    },
                ),
            );

            return right(created);
        } catch (err: any) {
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                }),
            );
            return left(err);
        }
    }

    private async ensureResourceCatalogExist(
        resourceCatalog: { id: string }[],
    ): Promise<void> {
        const ids = Array.from(
            new Set(
                resourceCatalog
                    .map((item) => item.id?.trim())
                    .filter((id): id is string => Boolean(id)),
            ),
        );

        if (!ids.length) {
            throw new UnprocessableEntityException(
                'resourceCatalog must include at least one valid id',
            );
        }

        const resolved = await this.resourceCatalogRepository.findAll({
            filters: { id: ids },
        });
        const missingIds = ids.filter(
            (id) => !resolved.items.find((item) => item.id === id),
        );

        if (missingIds.length) {
            throw new UnprocessableEntityException(
                `resourceCatalog references not found: ${missingIds.join(', ')}`,
            );
        }
    }
}
