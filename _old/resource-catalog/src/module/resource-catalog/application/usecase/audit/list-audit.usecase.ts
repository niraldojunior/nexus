import { Inject, Injectable } from '@nestjs/common';

import { ListAuditQueryDto } from '@/module/resource-catalog/application/dto/audit/request/list-audit-query.dto';
import {
    AUDIT_REPOSITORY,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { normalizePagination } from '@/shared/util/tmf-list-query.util';

export type ListAuditResponse = Either<
    BadRequestError,
    PagedResultModel<AuditModel>
>;

@Injectable()
export class ListAuditUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(AUDIT_REPOSITORY)
        private readonly repository: AuditRepository,
    ) {}

    async exec(query: ListAuditQueryDto): Promise<ListAuditResponse> {
        this.logger.setContext(this.constructor.name);

        try {
            const pagination = normalizePagination(query);
            const result = await this.repository.findAll({
                offset: pagination.offset,
                limit: pagination.limit,
                sort: query.sort,
                filters: {
                    id: query.id,
                    userId: query.userId,
                    entityId: query.entityId,
                    entityType: query.entityType,
                    action: query.action,
                    timestampStart: query.timestampStart,
                    timestampEnd: query.timestampEnd,
                },
            });

            return right(result);
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
