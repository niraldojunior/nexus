import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';

class ResourceCategoryCatalogRefCreateDto {
    @ApiProperty({
        description: 'Catalog identifier',
        example: '7391531910851620864',
    })
    @IsString()
    @IsNotEmpty()
    id: string;
}

class ResourceCategoryValidForCreateDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource category validity',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    startDateTime: string = new Date().toISOString();

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

export class CreateResourceCategoryDto {
    @ApiProperty({
        description: 'Resource category name',
        example: 'Roteador',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({
        description: 'Resource category description',
        example: 'Categoria para equipamentos de roteamento',
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
    lifecycleStatus: LifecycleStatus = LifecycleStatus.ACTIVE;

    @ApiPropertyOptional({
        description: 'Version for category payload',
        example: '1.0.0',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    version = '1.0.0';

    @ApiPropertyOptional({
        description: 'Business category classifier',
        example: 'CPE',
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
    '@type': string = ResourceType.RESOURCE_CATEGORY;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'CatalogEntity',
    })
    @IsString()
    @MaxLength(20)
    '@baseType': string = ResourceType.RESOURCE_CATEGORY;

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
        type: ResourceCategoryValidForCreateDto,
    })
    @ValidateNested()
    @Type(() => ResourceCategoryValidForCreateDto)
    @IsOptional()
    validFor: ResourceCategoryValidForCreateDto =
        new ResourceCategoryValidForCreateDto();

    @ApiPropertyOptional({
        description: 'TMF catalogs linked to this category',
        type: ResourceCategoryCatalogRefCreateDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceCategoryCatalogRefCreateDto)
    resourceCatalog: ResourceCategoryCatalogRefCreateDto[];
}
