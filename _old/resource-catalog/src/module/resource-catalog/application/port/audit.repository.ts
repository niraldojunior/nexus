import { AuditModel } from '../../domain/model/audit.model';
import { PagedResultModel } from '../../domain/model/common.model';

export const AUDIT_REPOSITORY = 'AUDIT_REPOSITORY';

export interface AuditFindAllParams {
    offset?: number;
    limit?: number;
    sort?: Partial<Record<string, 'ASC' | 'DESC'>>;
    filters?: {
        id?: string;
        userId?: string;
        entityId?: string;
        entityType?: string;
        action?: string;
        timestampStart?: string;
        timestampEnd?: string;
    };
}

export interface AuditRepository {
    create(data: AuditModel): Promise<AuditModel>;
    findById(id: string): Promise<AuditModel | null>;
    findAll(params?: AuditFindAllParams): Promise<PagedResultModel<AuditModel>>;
}
