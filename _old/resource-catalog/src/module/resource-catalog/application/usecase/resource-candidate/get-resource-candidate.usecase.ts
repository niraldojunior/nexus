import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    RESOURCE_CANDIDATE_REPOSITORY,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type GetResourceCandidateResponse = Either<
    NotFoundException,
    ResourceCandidateModel
>;

@Injectable()
export class GetResourceCandidateUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(RESOURCE_CANDIDATE_REPOSITORY)
        private readonly repository: ResourceCandidateRepository,
    ) {}

    async exec(id: string): Promise<GetResourceCandidateResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const found = await this.repository.findById(id);

            if (!found) {
                return left(
                    new NotFoundException(
                        `ResourceCandidate with id '${id}' was not found`,
                    ),
                );
            }

            return right(found);
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
