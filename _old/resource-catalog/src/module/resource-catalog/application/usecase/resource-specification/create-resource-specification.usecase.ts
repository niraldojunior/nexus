import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    UnprocessableEntityException,
} from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { CreateResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/create-resource-specification.dto';
import {
    EventDispatcherPort,
    TMF634_EVENT_DISPATCHER,
} from '@/module/resource-catalog/application/port/event-dispatcher.port';
import {
    RESOURCE_CANDIDATE_REPOSITORY,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import {
    RESOURCE_CATEGORY_REPOSITORY,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import {
    RESOURCE_SPECIFICATION_REPOSITORY,
    ResourceSpecificationRepository,
} from '@/module/resource-catalog/application/port/resource-specification.repository';
import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { ResourceSpecificationCharacteristicMapper } from '@/module/resource-catalog/domain/mapper/resource-specification-characteristic.mapper';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { ResourceSpecificationMinimumStructureRule } from '@/module/resource-catalog/domain/rule/resource-specification-minimum-structure.rule';
import { ResourceSpecificationUniqueKeyRule } from '@/module/resource-catalog/domain/rule/resource-specification-unique-key.rule';
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';

export type CreateResourceSpecificationResponse = Either<
    | InternalServerError
    | UnprocessableEntityException
    | ConflictException
    | BadRequestException,
    ResourceSpecificationModel
>;

@Injectable()
export class CreateResourceSpecificationUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_SPECIFICATION_REPOSITORY)
        private readonly repository: ResourceSpecificationRepository,
        @Inject(RESOURCE_CATALOG_REPOSITORY)
        private readonly resourceCatalogRepository: ResourceCatalogRepository,
        @Inject(RESOURCE_CATEGORY_REPOSITORY)
        private readonly resourceCategoryRepository: ResourceCategoryRepository,
        @Inject(RESOURCE_CANDIDATE_REPOSITORY)
        private readonly resourceCandidateRepository: ResourceCandidateRepository,
        @Inject(TMF634_EVENT_DISPATCHER)
        private readonly eventDispatcher: EventDispatcherPort,
    ) {}

    async exec(
        dto: CreateResourceSpecificationDto,
        basePath: string,
    ): Promise<CreateResourceSpecificationResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const id = Snowflake.nextId().toString();
            const normalizedCharacteristics =
                ResourceSpecificationCharacteristicMapper.normalize(dto);

            const validation =
                ResourceSpecificationMinimumStructureRule.validate({
                    resourceCatalog: dto.resourceCatalog,
                    resourceCategory: dto.resourceCategory,
                    resourceSpecCharacteristic: normalizedCharacteristics,
                    validFor: dto.validFor,
                });

            if (!validation.valid) {
                return left(
                    new UnprocessableEntityException(
                        validation.errors.join('; '),
                    ),
                );
            }

            if (dto.validFor.startDateTime && dto.validFor.endDateTime) {
                const startDateTime = new Date(dto.validFor.startDateTime);
                const endDateTime = new Date(dto.validFor.endDateTime);
                if (endDateTime < startDateTime) {
                    return left(
                        new BadRequestException(
                            'validFor.endDateTime must be greater than validFor.startDateTime',
                        ),
                    );
                }
            }

            await this.ensureResourceCatalogExist(dto.resourceCatalog);
            await this.ensureResourceCategoriesExist(dto.resourceCategory);

            const uniqueKey =
                ResourceSpecificationUniqueKeyRule.computeFromSpec({
                    resourceCategory: dto.resourceCategory,
                    resourceSpecCharacteristic: normalizedCharacteristics,
                });

            if (!uniqueKey) {
                return left(
                    new BadRequestException(
                        'Unable to compute unique key from provided data',
                    ),
                );
            }

            const exists = await this.repository.existsByBusinessKey(uniqueKey);
            if (exists) {
                return left(
                    new ConflictException(
                        `A ResourceSpecification with the same corporate key already exists (uniqueKey: ${uniqueKey})`,
                    ),
                );
            }

            const now = new Date();
            const created = await this.repository.create({
                id,
                href: `${basePath}/resourceSpecification/${id}`,
                name: dto.name,
                description: dto.description,
                lifecycleStatus: dto.lifecycleStatus,
                version: dto.version,
                category: dto.category,
                resourceCatalog: dto.resourceCatalog,
                resourceCategory: dto.resourceCategory,
                validFor: dto.validFor,
                resourceSpecCharacteristic: normalizedCharacteristics,
                uniqueKey,
                '@type': dto['@type'],
                '@baseType': dto['@baseType'],
                '@schemaLocation': dto['@schemaLocation'],
                createdAt: now,
                updatedAt: now,
            });

            await this.createCandidatesForSpec(created, basePath);

            await this.eventDispatcher.dispatchResourceSpecificationCreate(
                createEventEnvelope(
                    NotificationEvent.RESOURCE_SPECIFICATION_CREATE_EVENT,
                    {
                        resourceSpecification: created,
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

        const items = await this.resourceCatalogRepository.findAll({
            filters: { id: ids },
            limit: ids.length,
        });

        if (items.total !== ids.length) {
            const foundIds = new Set(items.items.map((item) => item.id));
            const missingIds = ids.filter((id) => !foundIds.has(id));
            throw new UnprocessableEntityException(
                `resourceCatalog references not found: ${missingIds.join(', ')}`,
            );
        }
    }

    private async ensureResourceCategoriesExist(
        resourceCategory?: { id?: string }[],
    ): Promise<void> {
        if (!resourceCategory?.length) {
            return;
        }

        const ids = Array.from(
            new Set(
                resourceCategory
                    .map((item) => item.id?.trim())
                    .filter((id): id is string => Boolean(id)),
            ),
        );

        if (!ids.length) {
            throw new UnprocessableEntityException(
                'resourceCategory must include at least one valid id',
            );
        }

        const items = await this.resourceCategoryRepository.findAll({
            filters: { id: ids },
            limit: ids.length,
        });

        if (items.total !== ids.length) {
            const foundIds = new Set(items.items.map((item) => item.id));
            const missingIds = ids.filter((id) => !foundIds.has(id));
            throw new UnprocessableEntityException(
                `resourceCategory references not found: ${missingIds.join(', ')}`,
            );
        }
    }

    private async createCandidatesForSpec(
        spec: ResourceSpecificationModel,
        basePath: string,
    ): Promise<void> {
        const catalogs = spec.resourceCatalog ?? [];

        if (!catalogs.length) {
            return;
        }

        const categoryRefs = (spec.resourceCategory ?? []).map((cat) => ({
            id: cat.id,
        }));

        for (const catalogRef of catalogs) {
            if (!catalogRef.id) {
                continue;
            }
            const candidateId = Snowflake.nextId().toString();
            const now = new Date();
            const candidate: ResourceCandidateModel = {
                id: candidateId,
                href: `${basePath}/resourceCandidate/${candidateId}`,
                name: spec.name,
                lifecycleStatus: LifecycleStatus.ACTIVE,
                resourceSpecification: {
                    id: spec.id,
                },
                category: categoryRefs,
                catalog: {
                    id: catalogRef.id,
                },
                '@type': ResourceType.RESOURCE_CANDIDATE,
                createdAt: now,
                updatedAt: now,
            };

            await this.resourceCandidateRepository.create(candidate);

            await this.eventDispatcher.dispatchResourceCandidateCreate(
                createEventEnvelope(
                    NotificationEvent.RESOURCE_CANDIDATE_CREATE_EVENT,
                    { resourceCandidate: candidate },
                ),
            );
        }
    }
}
