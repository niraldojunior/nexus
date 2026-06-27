import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { PatchResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/patch-resource-catalog.dto';
import {
    EventDispatcherPort,
    TMF634_EVENT_DISPATCHER,
} from '@/module/resource-catalog/application/port/event-dispatcher.port';
import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type PatchResourceCatalogResponse = Either<
    NotFoundException | BadRequestException,
    ResourceCatalogModel
>;

@Injectable()
export class PatchResourceCatalogUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly repository: ResourceCatalogRepository,
        @Inject(TMF634_EVENT_DISPATCHER)
        private readonly eventDispatcher: EventDispatcherPort,
    ) {}

    async exec(
        id: string,
        dto: PatchResourceCatalogDto,
    ): Promise<PatchResourceCatalogResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const current = await this.repository.findById(id);

            if (!current) {
                return left(
                    new NotFoundException(
                        `ResourceCatalog with id '${id}' was not found`,
                    ),
                );
            }

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

            patch.updatedAt = new Date();

            const updated = await this.repository.patchById(id, patch);

            if (!updated) {
                return left(
                    new NotFoundException(
                        `ResourceCatalog with id '${id}' was not found`,
                    ),
                );
            }

            if (current.lifecycleStatus !== updated.lifecycleStatus) {
                await this.eventDispatcher.dispatchResourceCatalogStatusChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CATALOG_STATUS_CHANGE_EVENT,
                        {
                            resourceCatalog: updated,
                        },
                    ),
                );
            } else {
                await this.eventDispatcher.dispatchResourceCatalogAttributeValueChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CATALOG_ATTRIBUTE_VALUE_CHANGE_EVENT,
                        {
                            resourceCatalog: updated,
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
        dto: PatchResourceCatalogDto,
        current: ResourceCatalogModel,
    ): Partial<ResourceCatalogModel> {
        const patch: Partial<ResourceCatalogModel> = {};

        if (dto.name !== undefined) {
            patch.name = dto.name;
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
}
