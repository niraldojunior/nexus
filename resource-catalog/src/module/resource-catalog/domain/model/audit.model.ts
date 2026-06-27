import { AuditAction } from '../const/audit-action.const';
import { ResourceType } from '../const/resource-type.const';

export class AuditModel {
    public static readonly propertyKeys = [
        'id',
        'userId',
        'action',
        'entityId',
        'entityType',
        'timestamp',
    ] as const;

    id: string;
    userId: string;
    action: AuditAction;
    entityId: string;
    entityType: ResourceType;
    timestamp: Date;
}
