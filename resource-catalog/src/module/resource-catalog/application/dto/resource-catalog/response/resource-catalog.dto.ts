import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TmfBaseResponseDto } from '@/shared/application/dto/tmf/tmf-base-response.dto';

class ResourceCatalogValidForDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource catalog validity',
        example: new Date().toISOString(),
    })
    startDateTime?: string;

    @ApiPropertyOptional({
        description: 'End date-time for resource catalog validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    endDateTime?: string;
}

export class ResourceCatalogDto extends TmfBaseResponseDto {
    constructor(data: Partial<ResourceCatalogDto>) {
        super(data);
        Object.assign(this, data);
    }

    @ApiProperty({
        description: 'Unique identifier for the catalog',
        example: '7391531910851620864',
    })
    id: string;

    @ApiProperty({
        description: 'Canonical href for this catalog',
        example: '/api/v1/resourceCatalog/7391531910851620864',
    })
    href: string;

    @ApiProperty({
        description: 'Resource catalog name',
        example: 'Corporate Resource Catalog',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Resource catalog description',
        example: 'Catalogo corporativo de recursos de rede',
    })
    description?: string;

    @ApiPropertyOptional({
        description: 'Business lifecycle status',
        enum: LifecycleStatus,
    })
    lifecycleStatus?: LifecycleStatus;

    @ApiPropertyOptional({
        description: 'Version for catalog payload',
        example: '1.0.0',
    })
    version?: string;

    @ApiPropertyOptional({
        description: 'Validity window for resource catalog',
        type: ResourceCatalogValidForDto,
    })
    validFor?: ResourceCatalogValidForDto;

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: 'ResourceCatalog',
    })
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'Catalog',
    })
    '@baseType'?: string;

    @ApiPropertyOptional({
        description: 'TMF schema location',
        example: 'https://example.org/schema/resource-catalog.schema.json',
    })
    '@schemaLocation'?: string;

    @ApiPropertyOptional({
        description: 'Entity creation timestamp',
        example: new Date().toISOString(),
    })
    createdAt?: string;

    @ApiPropertyOptional({
        description: 'Entity update timestamp',
        example: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    updatedAt?: string;

    @ApiPropertyOptional({
        description: 'Last update timestamp (TMF style)',
        example: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    lastUpdate?: string;
}
