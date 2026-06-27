import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';

import { TmfListQueryDto } from '../../common/request/tmf-list-query.dto';

export class ListAuditQueryDto extends TmfListQueryDto {
    @Transform(({ value }) => {
        const order: Partial<
            Record<Extract<keyof AuditModel, string>, 'ASC' | 'DESC'>
        > = {};
        value = Array.isArray(value) ? value : [value];
        for (const val of value) {
            const [key, direction] = val.split('=');
            if (
                AuditModel.propertyKeys.includes(key) &&
                ['ASC', 'DESC'].includes(
                    typeof direction === 'string'
                        ? direction.toUpperCase()
                        : '',
                )
            ) {
                order[key] = direction;
            }
        }
        return order;
    })
    @ApiPropertyOptional({
        description: 'Order by fields',
        example: ['timestamp=DESC', 'id=ASC'],
        type: String,
        isArray: true,
    })
    @IsOptional()
    sort?: Partial<Record<Extract<keyof AuditModel, string>, 'ASC' | 'DESC'>>;

    @ApiPropertyOptional({
        description: 'Unique identifier of the audit record',
        example: '609569321638850560',
    })
    @IsString()
    @IsOptional()
    id?: string;

    @ApiPropertyOptional({
        description: 'User identifier filter (contains, case-insensitive)',
        example: '609569321638850561',
    })
    @IsString()
    @IsOptional()
    userId?: string;

    @ApiPropertyOptional({
        description: 'Entity identifier filter (contains, case-insensitive)',
        example: '609569321638850562',
    })
    @IsString()
    @IsOptional()
    entityId?: string;

    @ApiPropertyOptional({
        description: 'Entity type filter (exact match)',
        example: 'Hub',
    })
    @IsString()
    @IsOptional()
    entityType?: string;

    @ApiPropertyOptional({
        description: 'Action filter (exact match)',
        example: 'CREATE',
    })
    @IsString()
    @IsOptional()
    action?: string;

    @ApiPropertyOptional({
        description:
            'Filter audit records with timestamp on or after this date (ISO 8601)',
        example: '2024-01-01T00:00:00.000Z',
    })
    @IsString()
    @IsOptional()
    timestampStart?: string;

    @ApiPropertyOptional({
        description:
            'Filter audit records with timestamp on or before this date (ISO 8601)',
        example: '2024-12-31T23:59:59.999Z',
    })
    @IsString()
    @IsOptional()
    timestampEnd?: string;
}
