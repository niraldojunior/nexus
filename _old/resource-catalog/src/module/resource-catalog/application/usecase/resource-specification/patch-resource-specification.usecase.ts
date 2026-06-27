import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { PatchResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/patch-resource-specification.dto';
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
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import {
    RESOURCE_CATALOG_REPOSITORY,
    ResourceCatalogRepository,
} from '../../port/resource-catalog.repository';

export type PatchResourceSpecificationResponse = Either<
    BadRequestException | NotFoundException,
    ResourceSpecificationModel
>;

@Injectable()
export class PatchResourceSpecificationUseCase {
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
        id: string,
        dto: PatchResourceSpecificationDto,
        basePath: string,
    ): Promise<PatchResourceSpecificationResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const current = await this.repository.findById(id);

            if (!current) {
                return left(
                    new NotFoundException(
                        `ResourceSpecification with id '${id}' was not found`,
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

            const effectiveCatalog =
                patch.resourceCatalog ?? current.resourceCatalog;
            const effectiveCategory =
                patch.resourceCategory ?? current.resourceCategory;
            const effectiveCharacteristics =
                patch.resourceSpecCharacteristic ??
                current.resourceSpecCharacteristic;
            const effectiveValidFor = patch.validFor ?? current.validFor;

            const validation =
                ResourceSpecificationMinimumStructureRule.validate({
                    resourceCatalog: effectiveCatalog,
                    resourceCategory: effectiveCategory,
                    resourceSpecCharacteristic: effectiveCharacteristics,
                    validFor: effectiveValidFor,
                });

            if (!validation.valid) {
                return left(
                    new UnprocessableEntityException(
                        validation.errors.join('; '),
                    ),
                );
            }

            await this.ensureResourceCatalogExist(effectiveCatalog);
            await this.ensureResourceCategoriesExist(effectiveCategory);

            const newUniqueKey =
                ResourceSpecificationUniqueKeyRule.computeFromSpec({
                    resourceCategory: effectiveCategory,
                    resourceSpecCharacteristic: effectiveCharacteristics,
                });

            if (!newUniqueKey) {
                return left(
                    new BadRequestException(
                        'Unable to compute unique key from provided data',
                    ),
                );
            }

            if (newUniqueKey && newUniqueKey !== current.uniqueKey) {
                const conflict = await this.repository.existsByBusinessKey(
                    newUniqueKey,
                    id,
                );
                if (conflict) {
                    return left(
                        new ConflictException(
                            `Patch would conflict with an existing ResourceSpecification (uniqueKey: ${newUniqueKey})`,
                        ),
                    );
                }
                patch.uniqueKey = newUniqueKey;
            }

            patch.updatedAt = new Date();

            const updated = await this.repository.patchById(id, patch);

            if (!updated) {
                return left(
                    new NotFoundException(
                        `ResourceSpecification with id '${id}' was not found`,
                    ),
                );
            }

            const catalogChanged = patch.resourceCatalog !== undefined;
            const categoryChanged = patch.resourceCategory !== undefined;

            if (catalogChanged || categoryChanged) {
                await this.reconcileCandidates(current, updated, basePath);
            }

            if (current.lifecycleStatus !== updated.lifecycleStatus) {
                await this.eventDispatcher.dispatchResourceSpecificationStatusChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_SPECIFICATION_STATUS_CHANGE_EVENT,
                        {
                            resourceSpecification: updated,
                        },
                    ),
                );
            } else {
                await this.eventDispatcher.dispatchResourceSpecificationAttributeValueChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_SPECIFICATION_ATTRIBUTE_VALUE_CHANGE_EVENT,
                        {
                            resourceSpecification: updated,
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
        dto: PatchResourceSpecificationDto,
        current: ResourceSpecificationModel,
    ): Partial<ResourceSpecificationModel> {
        const patch: Partial<ResourceSpecificationModel> = {};

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

        if (dto.resourceCategory !== undefined) {
            patch.resourceCategory = dto.resourceCategory
                .filter((item) => Boolean(item.id))
                .map((item) => ({
                    id: item.id as string,
                }));
        }

        if (dto.resourceCatalog !== undefined) {
            patch.resourceCatalog = dto.resourceCatalog
                .filter((item) => Boolean(item.id))
                .map((item) => ({
                    id: item.id as string,
                }));
        }

        const normalizedCharacteristics =
            ResourceSpecificationCharacteristicMapper.normalize(dto);
        if (normalizedCharacteristics !== undefined) {
            patch.resourceSpecCharacteristic = normalizedCharacteristics;
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

        const resolved = await this.resourceCategoryRepository.findAll({
            filters: { id: ids },
        });
        const missingIds = ids.filter(
            (id) => !resolved.items.find((item) => item.id === id),
        );

        if (missingIds.length) {
            throw new UnprocessableEntityException(
                `resourceCategory references not found: ${missingIds.join(', ')}`,
            );
        }
    }

    private async reconcileCandidates(
        previous: ResourceSpecificationModel,
        updated: ResourceSpecificationModel,
        basePath: string,
    ): Promise<void> {
        const existingCandidates =
            await this.resourceCandidateRepository.findBySpecificationId(
                updated.id,
            );

        const existingByCatalogId = new Map(
            existingCandidates.map((c) => [c.catalog.id, c]),
        );

        const previousCatalogIds = (previous.resourceCatalog ?? []).map(
            (c) => c.id,
        );
        const newCatalogs = updated.resourceCatalog ?? [];
        const newCatalogIds = newCatalogs.map((c) => c.id);
        const newCategoryRefs = (updated.resourceCategory ?? []).map((cat) => ({
            id: cat.id,
        }));

        // Retire candidates for removed catalogs
        for (const catalogId of previousCatalogIds) {
            if (newCatalogIds.includes(catalogId)) {
                continue;
            }

            const candidate = existingByCatalogId.get(catalogId);
            if (!candidate) {
                continue;
            }

            await this.resourceCandidateRepository.patchById(candidate.id, {
                lifecycleStatus: LifecycleStatus.DISABLED,
                updatedAt: new Date(),
            });
            await this.eventDispatcher.dispatchResourceCandidateStatusChange(
                createEventEnvelope(
                    NotificationEvent.RESOURCE_CANDIDATE_STATUS_CHANGE_EVENT,
                    {
                        resourceCandidate: {
                            ...candidate,
                            lifecycleStatus: LifecycleStatus.DISABLED,
                        },
                    },
                ),
            );
        }

        // Create candidates for new catalogs; update categories for unchanged catalogs
        for (const catalogRef of newCatalogs) {
            const existing = existingByCatalogId.get(catalogRef.id);

            if (!existing) {
                // New catalog — create candidate
                const candidateId = Snowflake.nextId().toString();
                const now = new Date();
                const newCandidate: ResourceCandidateModel = {
                    id: candidateId,
                    href: `${basePath}/resourceCandidate/${candidateId}`,
                    name: updated.name,
                    lifecycleStatus: LifecycleStatus.ACTIVE,
                    resourceSpecification: {
                        id: updated.id,
                    },
                    category: newCategoryRefs,
                    catalog: { id: catalogRef.id },
                    '@type': ResourceType.RESOURCE_CANDIDATE,
                    createdAt: now,
                    updatedAt: now,
                };
                await this.resourceCandidateRepository.create(newCandidate);
                await this.eventDispatcher.dispatchResourceCandidateCreate(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CANDIDATE_CREATE_EVENT,
                        { resourceCandidate: newCandidate },
                    ),
                );
                continue;
            }

            // Existing catalog — sync categories if changed
            const currentCategoryIds = existing.category
                .map((c) => c.id)
                .sort()
                .join(',');
            const newCategoryIds = newCategoryRefs
                .map((c) => c.id)
                .sort()
                .join(',');

            if (currentCategoryIds === newCategoryIds) {
                continue;
            }

            const patched = await this.resourceCandidateRepository.patchById(
                existing.id,
                {
                    category: newCategoryRefs,
                    updatedAt: new Date(),
                },
            );

            if (!patched) {
                continue;
            }

            await this.eventDispatcher.dispatchResourceCandidateAttributeValueChange(
                createEventEnvelope(
                    NotificationEvent.RESOURCE_CANDIDATE_ATTRIBUTE_VALUE_CHANGE_EVENT,
                    { resourceCandidate: patched },
                ),
            );
        }
    }
}
