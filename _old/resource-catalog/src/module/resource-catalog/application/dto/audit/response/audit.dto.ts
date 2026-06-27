import { ApiProperty } from '@nestjs/swagger';

import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';

export class AuditDto {
    @ApiProperty({ description: 'Audit record unique identifier' })
    id: string;

    @ApiProperty({
        description: 'Identifier of the user who performed the action',
    })
    userId: string;

    @ApiProperty({
        description: 'Action performed on the entity',
        enum: Object.values(AuditAction),
        example: AuditAction.CREATE,
    })
    action: string;

    @ApiProperty({ description: 'Identifier of the affected entity' })
    entityId: string;

    @ApiProperty({
        description: 'Type of the affected entity',
        enum: Object.values(ResourceType),
        example: ResourceType.HUB,
    })
    entityType: string;

    @ApiProperty({
        description: 'Timestamp of the action (ISO 8601)',
        example: new Date().toISOString(),
    })
    timestamp: string;
}
