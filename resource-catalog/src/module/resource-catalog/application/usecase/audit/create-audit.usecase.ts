import { Inject, Injectable } from '@nestjs/common';

import {
    AUDIT_REPOSITORY,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export interface CreateAuditInput {
    userId: string;
    action: AuditAction;
    entityId: string;
    entityType: ResourceType;
}

@Injectable()
export class CreateAuditUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(AUDIT_REPOSITORY)
        private readonly repository: AuditRepository,
    ) {}

    async exec(input: CreateAuditInput): Promise<void> {
        const audit: AuditModel = {
            id: Snowflake.nextId().toString(),
            userId: input.userId || 'unknown',
            action: input.action,
            entityId: input.entityId,
            entityType: input.entityType,
            timestamp: new Date(),
        };

        try {
            await this.repository.create(audit);
        } catch (err) {
            this.logger.error(
                {
                    description: 'AUDIT - FALHA AO REGISTRAR AUDITORIA',
                    context: this.constructor.name,
                },
                safeStringify({ audit, err }),
            );
        }
    }
}
