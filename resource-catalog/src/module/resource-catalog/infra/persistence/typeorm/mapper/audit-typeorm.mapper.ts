import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';

import { AuditDocument } from '../document/audit.document';

export class AuditTypeOrmMapper {
    static toDocument(model: AuditModel): AuditDocument {
        return {
            id: model.id,
            userId: model.userId,
            action: model.action,
            entityId: model.entityId,
            entityType: model.entityType,
            timestamp: model.timestamp,
        };
    }

    static toModel(document: AuditDocument): AuditModel {
        return {
            id: document.id,
            userId: document.userId,
            action: document.action as AuditAction,
            entityId: document.entityId,
            entityType: document.entityType as ResourceType,
            timestamp: document.timestamp,
        };
    }
}
