import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { TmfListQueryDto } from '@/module/resource-catalog/application/dto/common/request/tmf-list-query.dto';
import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';

export class ListResourceCategoryQueryDto extends TmfListQueryDto {
    @Transform(({ value }) => {
        const order: Partial<
            Record<Extract<keyof ResourceCategoryModel, string>, 'ASC' | 'DESC'>
        > = {};
        value = Array.isArray(value) ? value : [value];
        for (const val of value) {
            const [key, direction] = val.split('=');
            if (
                ResourceCategoryModel.propertyKeys.includes(key) &&
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
        Record<Extract<keyof ResourceCategoryModel, string>, 'ASC' | 'DESC'>
    >;

    @ApiPropertyOptional({
        description: 'Exact id filter',
        example: '7391531910851620864',
    })
    @IsString()
    @IsOptional()
    id?: string;

    @ApiPropertyOptional({
        description: 'Exact name filter',
        example: 'Roteador',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Description filter (contains, case-insensitive)',
        example: 'Categoria para equipamentos de roteamento',
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
        description: 'Category validity filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    validAt?: string;

    @ApiPropertyOptional({
        description: 'Category creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtStart?: string;

    @ApiPropertyOptional({
        description: 'Category creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtEnd?: string;

    @ApiPropertyOptional({
        description: 'Category update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtStart?: string;

    @ApiPropertyOptional({
        description: 'Category update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtEnd?: string;
}
