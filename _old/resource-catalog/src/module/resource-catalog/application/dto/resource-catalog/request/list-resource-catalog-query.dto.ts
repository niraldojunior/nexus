import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { TmfListQueryDto } from '@/module/resource-catalog/application/dto/common/request/tmf-list-query.dto';
import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';

export class ListResourceCatalogQueryDto extends TmfListQueryDto {
    @Transform(({ value }) => {
        const order: Partial<
            Record<Extract<keyof ResourceCatalogModel, string>, 'ASC' | 'DESC'>
        > = {};
        value = Array.isArray(value) ? value : [value];
        for (const val of value) {
            const [key, direction] = val.split('=');
            if (
                ResourceCatalogModel.propertyKeys.includes(key) &&
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
        Record<Extract<keyof ResourceCatalogModel, string>, 'ASC' | 'DESC'>
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
        example: 'Corporate Resource Catalog',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Description filter (contains, case-insensitive)',
        example: 'This is a sample resource catalog description',
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
        description: 'Catalog validity filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    validAt?: string;

    @ApiPropertyOptional({
        description: 'Catalog creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtStart?: string;

    @ApiPropertyOptional({
        description: 'Catalog creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtEnd?: string;

    @ApiPropertyOptional({
        description: 'Catalog update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtStart?: string;

    @ApiPropertyOptional({
        description: 'Catalog update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtEnd?: string;
}
