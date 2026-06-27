import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TmfBaseResponseDto } from '@/shared/application/dto/tmf/tmf-base-response.dto';

class ResourceCategoryValidForDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource category validity',
        example: new Date().toISOString(),
    })
    startDateTime?: string;

    @ApiPropertyOptional({
        description: 'End date-time for resource category validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    endDateTime?: string;
}

class ResourceCategoryCatalogRefDto {
    @ApiProperty({
        description: 'Catalog identifier',
        example: '7391531910851620864',
    })
    id: string;

    @ApiPropertyOptional({
        description: 'Catalog href',
        example: '/api/v1/resourceCatalog/7391531910851620864',
    })
    href?: string;

    @ApiPropertyOptional({
        description: 'Catalog name',
        example: 'Roteador',
    })
    name?: string;
}

export class ResourceCategoryDto extends TmfBaseResponseDto {
    constructor(data: Partial<ResourceCategoryDto>) {
        super(data);
        Object.assign(this, data);
    }

    @ApiProperty({
        description: 'Unique identifier for the category',
        example: '7391531910851620861',
    })
    id: string;

    @ApiProperty({
        description: 'Canonical href for this category',
        example: '/api/v1/resourceCategory/7391531910851620861',
    })
    href: string;

    @ApiProperty({
        description: 'Resource category name',
        example: 'Roteador',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Resource category description',
        example: 'Categoria para equipamentos de roteamento',
    })
    description?: string;

    @ApiPropertyOptional({
        description: 'Business lifecycle status',
        enum: LifecycleStatus,
    })
    lifecycleStatus?: LifecycleStatus;

    @ApiPropertyOptional({
        description: 'Version for category payload',
        example: '1.0.0',
    })
    version?: string;

    @ApiPropertyOptional({
        description: 'Business category classifier',
        example: 'CPE',
    })
    category?: string;

    @ApiPropertyOptional({
        description: 'TMF catalogs linked to this category',
        type: ResourceCategoryCatalogRefDto,
        isArray: true,
    })
    resourceCatalog?: ResourceCategoryCatalogRefDto[];

    @ApiPropertyOptional({
        description: 'Validity window for resource category',
        type: ResourceCategoryValidForDto,
    })
    validFor?: ResourceCategoryValidForDto;

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: 'ResourceCategory',
    })
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'CatalogEntity',
    })
    '@baseType'?: string;

    @ApiPropertyOptional({
        description: 'TMF schema location',
        example: 'https://example.org/schema/resource-category.schema.json',
    })
    '@schemaLocation'?: string;

    @ApiPropertyOptional({
        description: 'Entity creation timestamp',
        example: new Date().toISOString(),
    })
    createdAt?: string;

    @ApiPropertyOptional({
        description: 'Entity update timestamp',
        example: new Date().toISOString(),
    })
    updatedAt?: string;
}
