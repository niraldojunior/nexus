import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TmfBaseResponseDto } from '@/shared/application/dto/tmf/tmf-base-response.dto';

class ResourceCandidateCategoryRefDto {
    @ApiProperty({
        description: 'Category identifier',
        example: '7391531910851620864',
    })
    id: string;
}

class ResourceCandidateCatalogRefDto {
    @ApiProperty({
        description: 'Catalog identifier',
        example: '7391531910851620864',
    })
    id: string;
}

class ResourceCandidateSpecificationRefDto {
    @ApiProperty({
        description: 'Specification identifier',
        example: '7391531910851620864',
    })
    id: string;
}

export class ResourceCandidateDto extends TmfBaseResponseDto {
    constructor(data: Partial<ResourceCandidateDto>) {
        super(data);
        Object.assign(this, data);
    }

    @ApiProperty({
        description: 'Unique identifier for the candidate',
        example: '7391531910851620864',
    })
    id: string;

    @ApiProperty({
        description: 'Canonical href for this candidate',
        example: '/api/v1/resourceCandidate/7391531910851620864',
    })
    href: string;

    @ApiProperty({
        description: 'Resource candidate name',
        example: 'CPE ZTE F670L',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Resource candidate description',
    })
    description?: string;

    @ApiPropertyOptional({
        description: 'Version',
        example: '1.0.0',
    })
    version?: string;

    @ApiProperty({
        description: 'Business lifecycle status',
        enum: LifecycleStatus,
    })
    lifecycleStatus: LifecycleStatus;

    @ApiProperty({
        description: 'Linked ResourceSpecification',
        type: ResourceCandidateSpecificationRefDto,
    })
    resourceSpecification: ResourceCandidateSpecificationRefDto;

    @ApiProperty({
        description: 'Categories where this candidate is published',
        type: ResourceCandidateCategoryRefDto,
        isArray: true,
    })
    category: ResourceCandidateCategoryRefDto[];

    @ApiProperty({
        description: 'Catalog where this candidate is published',
        type: ResourceCandidateCatalogRefDto,
    })
    catalog: ResourceCandidateCatalogRefDto;

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: 'ResourceCandidate',
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
        description: 'ISO-8601 creation timestamp',
        example: new Date().toISOString(),
    })
    createdAt?: string;

    @ApiPropertyOptional({
        description: 'ISO-8601 last-update timestamp',
        example: new Date().toISOString(),
    })
    lastUpdate?: string;
}
