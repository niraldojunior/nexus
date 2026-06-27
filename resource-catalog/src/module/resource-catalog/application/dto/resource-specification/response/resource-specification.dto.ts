import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TmfBaseResponseDto } from '@/shared/application/dto/tmf/tmf-base-response.dto';

class ResourceSpecificationValidForDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource specification validity',
        example: new Date().toISOString(),
    })
    startDateTime?: string;

    @ApiPropertyOptional({
        description: 'End date-time for resource specification validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    endDateTime?: string;
}

class ResourceSpecificationCategoryRefDto {
    @ApiProperty({
        description: 'Category identifier',
        example: 'router',
    })
    id: string;

    @ApiPropertyOptional({
        description: 'Category href',
        example: '/api/v1/resourceCategory/router',
    })
    href?: string;

    @ApiPropertyOptional({
        description: 'Category name',
        example: 'Roteador',
    })
    name?: string;
}

class ResourceSpecificationCharacteristicDto {
    @ApiPropertyOptional({
        description: 'Characteristic name',
        example: 'Brand',
    })
    name?: string;

    @ApiPropertyOptional({
        description: 'Characteristic value type',
        example: 'string',
    })
    valueType?: string;

    @ApiPropertyOptional({
        description: 'Characteristic value',
        example: 'ZTE',
    })
    value?: unknown;
}

export class ResourceSpecificationDto extends TmfBaseResponseDto {
    constructor(data: Partial<ResourceSpecificationDto>) {
        super(data);
        Object.assign(this, data);
    }

    @ApiProperty({
        description: 'Unique identifier for the specification',
        example: '7391531910851620864',
    })
    id: string;

    @ApiProperty({
        description: 'Canonical href for this specification',
        example: '/api/v1/resourceSpecification/7391531910851620864',
    })
    href: string;

    @ApiProperty({
        description: 'Resource specification name',
        example: 'CPE ZTE F670L',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Resource specification description',
    })
    description?: string;

    @ApiPropertyOptional({
        description: 'Business lifecycle status',
        enum: LifecycleStatus,
    })
    lifecycleStatus?: LifecycleStatus;

    @ApiPropertyOptional({
        description: 'Version for specification payload',
    })
    version?: string;

    @ApiPropertyOptional({
        description: 'Business category classifier',
    })
    category?: string;

    @ApiPropertyOptional({
        description: 'Validity window for resource specification',
        type: ResourceSpecificationValidForDto,
    })
    validFor?: ResourceSpecificationValidForDto;

    @ApiPropertyOptional({
        description: 'TMF categories linked to this specification',
        type: ResourceSpecificationCategoryRefDto,
        isArray: true,
    })
    resourceCategory?: ResourceSpecificationCategoryRefDto[];

    @ApiPropertyOptional({
        description: 'TMF characteristics list',
        type: ResourceSpecificationCharacteristicDto,
        isArray: true,
    })
    resourceSpecCharacteristic?: ResourceSpecificationCharacteristicDto[];

    @ApiPropertyOptional({
        description: 'TMF payload type',
    })
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
    })
    '@baseType'?: string;

    @ApiPropertyOptional({
        description: 'TMF schema location',
    })
    '@schemaLocation'?: string;

    @ApiPropertyOptional({
        description: 'Entity creation timestamp',
    })
    createdAt?: string;

    @ApiPropertyOptional({
        description: 'Entity update timestamp',
    })
    updatedAt?: string;

    @ApiPropertyOptional({
        description: 'Last update timestamp (TMF style)',
    })
    lastUpdate?: string;
}
