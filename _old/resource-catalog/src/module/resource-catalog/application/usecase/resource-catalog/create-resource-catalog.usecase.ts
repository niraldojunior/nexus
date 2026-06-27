import { Inject, Injectable } from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { CreateResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/create-resource-catalog.dto';
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
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { ConflictError } from '@/shared/application/error/conflict.error';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type CreateResourceCatalogResponse = Either<
    InternalServerError | BadRequestError | ConflictError,
    ResourceCatalogModel
>;

@Injectable()
export class CreateResourceCatalogUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly repository: ResourceCatalogRepository,
        @Inject(TMF634_EVENT_DISPATCHER)
        private readonly eventDispatcher: EventDispatcherPort,
    ) {}

    async exec(
        dto: CreateResourceCatalogDto,
        basePath: string,
    ): Promise<CreateResourceCatalogResponse> {
        this.logger.setContext(this.constructor.name);

        try {
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

            const existing = await this.repository.findAll({
                filters: { name: dto.name },
            });

            if (existing.total) {
                return left(
                    new ConflictError(
                        `ResourceCatalog with name '${dto.name}' already exists`,
                    ),
                );
            }

            const id = Snowflake.nextId().toString();
            const now = new Date();
            const created = await this.repository.create({
                id,
                href: `${basePath}/resourceCatalog/${id}`,
                name: dto.name,
                description: dto.description,
                lifecycleStatus: dto.lifecycleStatus,
                version: dto.version,
                validFor: dto.validFor,
                '@type': dto['@type'],
                '@baseType': dto['@baseType'],
                '@schemaLocation': dto['@schemaLocation'],
                createdAt: now,
                updatedAt: now,
            });

            await this.eventDispatcher.dispatchResourceCatalogCreate(
                createEventEnvelope(
                    NotificationEvent.RESOURCE_CATALOG_CREATE_EVENT,
                    {
                        resourceCatalog: created,
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
}
