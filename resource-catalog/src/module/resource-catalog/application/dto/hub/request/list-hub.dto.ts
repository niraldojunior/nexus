import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { TmfListQueryDto } from '@/module/resource-catalog/application/dto/common/request/tmf-list-query.dto';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';

export class ListHubDto extends TmfListQueryDto {
    @Transform(({ value }) => {
        const order: Partial<
            Record<Extract<keyof HubSubscriptionModel, string>, 'ASC' | 'DESC'>
        > = {};
        value = Array.isArray(value) ? value : [value];
        for (const val of value) {
            const [key, direction] = val.split('=');
            if (
                HubSubscriptionModel.propertyKeys.includes(key) &&
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
        example: ['createdAt=DESC', 'id=ASC'],
        type: String,
        isArray: true,
    })
    @IsOptional()
    sort?: Partial<
        Record<Extract<keyof HubSubscriptionModel, string>, 'ASC' | 'DESC'>
    >;

    @ApiPropertyOptional({
        description: 'Unique identifier of the subscription',
        example: '609569321638850560',
    })
    @IsString()
    @IsOptional()
    id?: string;

    @ApiPropertyOptional({
        description: 'Callback filter (contains, case-insensitive)',
        example: 'localhost:3001/listener',
    })
    @IsString()
    @IsOptional()
    callback?: string;

    @ApiPropertyOptional({
        description: 'Event expression filter (contains, case-insensitive)',
        example: 'ResourceSpecificationCreateEvent',
    })
    @IsString()
    @IsOptional()
    event?: string;

    @ApiPropertyOptional({
        description:
            'Optional credentials for subscriber authentication, if required by the callback endpoint',
        example: 'Y2xpZW50SWQ6c2VjcmV0',
    })
    @IsString()
    @IsOptional()
    credentials?: string;

    @ApiPropertyOptional({
        description: 'Active subscription filter',
        example: true,
    })
    @Transform(({ value }) => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        return String(value).toLowerCase() === 'true';
    })
    @IsBoolean()
    @IsOptional()
    active?: boolean;

    @ApiPropertyOptional({
        description:
            'Filter subscriptions created on or after this date (ISO 8601)',
        example: '2024-01-01T00:00:00.000Z',
    })
    @IsString()
    @IsOptional()
    createdAtStart?: string;

    @ApiPropertyOptional({
        description:
            'Filter subscriptions created on or before this date (ISO 8601)',
        example: '2024-12-31T23:59:59.999Z',
    })
    @IsString()
    @IsOptional()
    createdAtEnd?: string;

    @ApiPropertyOptional({
        description:
            'Filter subscriptions updated on or after this date (ISO 8601)',
        example: '2024-01-01T00:00:00.000Z',
    })
    @IsString()
    @IsOptional()
    updatedAtStart?: string;

    @ApiPropertyOptional({
        description:
            'Filter subscriptions updated on or before this date (ISO 8601)',
        example: '2024-12-31T23:59:59.999Z',
    })
    @IsString()
    @IsOptional()
    updatedAtEnd?: string;
}
