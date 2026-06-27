import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { TmfListQueryDto } from '@/module/resource-catalog/application/dto/common/request/tmf-list-query.dto';
import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';

export class ListResourceSpecificationQueryDto extends TmfListQueryDto {
    @Transform(({ value }) => {
        const order: Partial<
            Record<
                Extract<keyof ResourceSpecificationModel, string>,
                'ASC' | 'DESC'
            >
        > = {};
        value = Array.isArray(value) ? value : [value];
        for (const val of value) {
            const [key, direction] = val.split('=');
            if (
                ResourceSpecificationModel.propertyKeys.includes(key) &&
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
        Record<
            Extract<keyof ResourceSpecificationModel, string>,
            'ASC' | 'DESC'
        >
    >;

    @ApiPropertyOptional({
        description: 'Exact id filter',
        example: '7391531910851620867',
    })
    @IsString()
    @IsOptional()
    id?: string;

    @ApiPropertyOptional({
        description: 'Exact name filter',
        example: 'CPE ZTE F670L',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Description filter (contains, case-insensitive)',
        example: 'Especificação para CPE ZTE F670L',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Exact lifecycleStatus filter',
        enum: LifecycleStatus,
    })
    @IsEnum(LifecycleStatus)
    @IsOptional()
    lifecycleStatus?: LifecycleStatus;

    @ApiPropertyOptional({
        description: 'Exact version filter',
        example: '1.0.0',
    })
    @IsString()
    @IsOptional()
    version?: string;

    @ApiPropertyOptional({
        description: 'Exact category filter',
        example: 'CPE',
    })
    @IsString()
    @IsOptional()
    category?: string;

    @ApiPropertyOptional({
        description: 'Filter by linked ResourceCatalog Id',
        example: '7391531910851620864',
    })
    @IsString()
    @IsOptional()
    resourceCatalog?: string;

    @ApiPropertyOptional({
        description: 'Filter by linked ResourceCategory Id',
        example: '7391531910851620861',
    })
    @IsString()
    @IsOptional()
    resourceCategory?: string;

    @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
    @ApiPropertyOptional({
        description:
            'Filter by linked ResourceSpecCharacteristic name (one or multiple values)',
        example: ['Model', 'Brand'],
        type: String,
        isArray: true,
    })
    @IsString({ each: true })
    @IsOptional()
    resourceSpecCharacteristicName?: string[];

    @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
    @ApiPropertyOptional({
        description:
            'Filter by linked ResourceSpecCharacteristic value (one or multiple values)',
        example: ['INT-6RGMX', 'ZTE'],
        type: String,
        isArray: true,
    })
    @IsString({ each: true })
    @IsOptional()
    resourceSpecCharacteristicValue?: string[];

    @ApiPropertyOptional({
        description: 'Validity filter date-time',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    validAt?: string;

    @ApiPropertyOptional({
        description: 'Specification creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtStart?: string;

    @ApiPropertyOptional({
        description: 'Specification creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtEnd?: string;

    @ApiPropertyOptional({
        description: 'Specification update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtStart?: string;

    @ApiPropertyOptional({
        description: 'Specification update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtEnd?: string;
}
