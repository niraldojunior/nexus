import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';

class ResourceCategoryCatalogRefPatchDto {
    @ApiPropertyOptional({
        description: 'Catalog identifier',
        example: 'router',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    id?: string;
}

class ResourceCategoryValidForPatchDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource category validity',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    startDateTime?: string;

    @ApiPropertyOptional({
        description: 'End date-time for resource category validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    @IsDateString()
    @IsOptional()
    endDateTime?: string;
}

export class PatchResourceCategoryDto {
    @ApiPropertyOptional({
        description: 'Resource category name',
        example: 'Roteador Premium',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({
        description: 'Resource category description',
        example: 'Categoria para equipamentos premium de roteamento',
    })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    description?: string;

    @ApiPropertyOptional({
        description: 'Business lifecycle status',
        enum: LifecycleStatus,
    })
    @IsEnum(LifecycleStatus)
    @IsOptional()
    lifecycleStatus?: LifecycleStatus;

    @ApiPropertyOptional({
        description: 'Version for category payload',
        example: '1.0.1',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    version?: string;

    @ApiPropertyOptional({
        description: 'Business category classifier',
        example: 'ONT',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    category?: string;

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: ResourceType.RESOURCE_CATEGORY,
        enum: [ResourceType.RESOURCE_CATEGORY],
    })
    @IsEnum([ResourceType.RESOURCE_CATEGORY])
    @IsOptional()
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'CatalogEntity',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    '@baseType'?: string;

    @ApiPropertyOptional({
        description: 'TMF schema location',
        example: 'https://example.org/schema/resource-category.schema.json',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    '@schemaLocation'?: string;

    @ApiPropertyOptional({
        description: 'Validity window for resource category',
        type: ResourceCategoryValidForPatchDto,
    })
    @ValidateNested()
    @Type(() => ResourceCategoryValidForPatchDto)
    @IsOptional()
    validFor?: ResourceCategoryValidForPatchDto;

    @ApiPropertyOptional({
        description: 'TMF catalogs linked to this category',
        type: ResourceCategoryCatalogRefPatchDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceCategoryCatalogRefPatchDto)
    resourceCatalog?: ResourceCategoryCatalogRefPatchDto[];
}
