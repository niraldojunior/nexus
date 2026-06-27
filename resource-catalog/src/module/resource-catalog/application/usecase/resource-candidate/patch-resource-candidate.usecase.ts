import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { PatchResourceCandidateDto } from '@/module/resource-catalog/application/dto/resource-candidate/request/patch-resource-candidate.dto';
import {
    EventDispatcherPort,
    TMF634_EVENT_DISPATCHER,
} from '@/module/resource-catalog/application/port/event-dispatcher.port';
import {
    RESOURCE_CANDIDATE_REPOSITORY,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type PatchResourceCandidateResponse = Either<
    NotFoundException,
    ResourceCandidateModel
>;

@Injectable()
export class PatchResourceCandidateUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CANDIDATE_REPOSITORY)
        private readonly repository: ResourceCandidateRepository,
        @Inject(TMF634_EVENT_DISPATCHER)
        private readonly eventDispatcher: EventDispatcherPort,
    ) {}

    async exec(
        id: string,
        dto: PatchResourceCandidateDto,
    ): Promise<PatchResourceCandidateResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const current = await this.repository.findById(id);

            if (!current) {
                return left(
                    new NotFoundException(
                        `ResourceCandidate with id '${id}' was not found`,
                    ),
                );
            }

            const patch = this.normalizePatch(dto);

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
                        `ResourceCandidate with id '${id}' was not found`,
                    ),
                );
            }

            if (current.lifecycleStatus !== updated.lifecycleStatus) {
                await this.eventDispatcher.dispatchResourceCandidateStatusChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CANDIDATE_STATUS_CHANGE_EVENT,
                        { resourceCandidate: updated },
                    ),
                );
            } else {
                await this.eventDispatcher.dispatchResourceCandidateAttributeValueChange(
                    createEventEnvelope(
                        NotificationEvent.RESOURCE_CANDIDATE_ATTRIBUTE_VALUE_CHANGE_EVENT,
                        { resourceCandidate: updated },
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
        dto: PatchResourceCandidateDto,
    ): Partial<ResourceCandidateModel> {
        const patch: Partial<ResourceCandidateModel> = {};

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

        return patch;
    }
}
