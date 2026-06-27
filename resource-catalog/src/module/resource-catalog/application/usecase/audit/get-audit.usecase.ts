import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    AUDIT_REPOSITORY,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export type GetAuditResponse = Either<NotFoundException, AuditModel>;

@Injectable()
export class GetAuditUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(AUDIT_REPOSITORY)
        private readonly repository: AuditRepository,
    ) {}

    async exec(id: string): Promise<GetAuditResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const found = await this.repository.findById(id);

            if (!found) {
                return left(
                    new NotFoundException(
                        `Audit record with id '${id}' was not found`,
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
