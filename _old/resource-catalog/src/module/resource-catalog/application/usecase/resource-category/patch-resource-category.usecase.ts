import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { PatchResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/patch-resource-category.dto';
import {
    EventDispatcherPort,
    TMF634_EVENT_DISPATCHER,
} from '@/module/resource-catalog/application/port/event-dispatcher.port';
import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { ConflictError } from '@/shared/application/error/conflict.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type PatchResourceCategoryResponse = Either<
    | NotFoundException
    | BadRequestException
    | ConflictError
    | UnprocessableEntityException,
    ResourceCategoryModel
>;

@Injectable()
export class PatchResourceCategoryUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATEGORY_REPOSITORY)
        private readonly repository: ResourceCategoryRepository,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly resourceCatalogRepository: ResourceCatalogRepository,
        @Inject(TMF634_EVENT_DISPATCHER)
        private readonly eventDispatcher: EventDispatcherPort,
    ) {}

    async exec(
        id: string,
        dto: PatchResourceCategoryDto,
    ): Promise<PatchResourceCategoryResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const current = await this.repository.findById(id);

            if (!current) {
                return left(
                    new NotFoundException(
                        `ResourceCategory with id '${id}' was not found`,
                    ),
                );
            }

            await this.ensureResourceCatalogExist(
                dto.resourceCatalog ?? current.resourceCatalog,
            );

            const patch = this.normalizePatch(dto, current);

            if (!Object.keys(patch).length) {
                return left(
                    new BadRequestException(
                        'At least one attribute must be provided for patch',
                    ),
                );
            }

            if (patch.validFor?.startDateTime && patch.validFor.endDateTime) {
                const startDateTime = new Date(patch.validFor.startDateTime);
                const endDateTime = new Date(patch.validFor.endDateTime);
                if (endDateTime < startDateTime) {
                    return left(
                        new BadRequestException(
                            'validFor.endDateTime must be greater than validFor.startDateTime',
                        ),
                    );
                }
            }

            if (patch.resourceCatalog?.length) {
                const existing = (
                    await this.repository.findAll({
                        filters: { name: dto.name },
                    })
                ).items.filter(
                    (e) =>
                        e.id !== id &&
                        e.resourceCatalog.some((rc) =>
                            patch.resourceCatalog?.some(
                                (drc) => drc.id === rc.id,
                            ),
                        ),
                );

                if (existing.length) {
                    return left(
                        new ConflictError(
                            `ResourceCategory with name '${dto.name}' already exists in the specified resource catalog`,
                        ),
                    );
                }
            }

            patch.updatedAt = new Date();

            const updated = await this.repository.patchById(id, patch);

            if (!updated) {
                return left(
                    new NotFoundException(
                        `ResourceCategory with id '${id}' was not found`,
                    ),
                );
            }

            if (current.lifecycleStatus !== updated.lifecycleStatus) {
                await this.eventDispatcher.dispatchResourceCategoryStatusChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CATEGORY_STATUS_CHANGE_EVENT,
                        {
                            resourceCategory: updated,
                        },
                    ),
                );
            } else {
                await this.eventDispatcher.dispatchResourceCategoryAttributeValueChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CATEGORY_ATTRIBUTE_VALUE_CHANGE_EVENT,
                        {
                            resourceCategory: updated,
                        },
                    ),
                );
            }

            return right(updated);
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

    private normalizePatch(
        dto: PatchResourceCategoryDto,
        current: ResourceCategoryModel,
    ): Partial<ResourceCategoryModel> {
        const patch: Partial<ResourceCategoryModel> = {};

        if (dto.name !== undefined) {
            patch.name = dto.name;
        }
        if (dto.resourceCatalog !== undefined) {
            patch.resourceCatalog = dto.resourceCatalog
                .map((item) => ({ id: item.id?.trim() }))
                .filter((item): item is { id: string } => Boolean(item.id));
        }
        if (dto.description !== undefined) {
            patch.description = dto.description;
        }
        if (dto.lifecycleStatus !== undefined) {
            patch.lifecycleStatus = dto.lifecycleStatus;
        }
        if (dto.version !== undefined) {
            patch.version = dto.version;
        }
        if (dto.category !== undefined) {
            patch.category = dto.category;
        }
        if (dto['@type'] !== undefined) {
            patch['@type'] = dto['@type'];
        }
        if (dto['@baseType'] !== undefined) {
            patch['@baseType'] = dto['@baseType'];
        }
        if (dto['@schemaLocation'] !== undefined) {
            patch['@schemaLocation'] = dto['@schemaLocation'];
        }

        if (dto.validFor) {
            patch.validFor = {
                ...current.validFor,
                ...dto.validFor,
            };
        }

        return patch;
    }

    private async ensureResourceCatalogExist(
        resourceCatalog?: { id?: string }[],
    ): Promise<void> {
        if (!resourceCatalog?.length) {
            return;
        }

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
