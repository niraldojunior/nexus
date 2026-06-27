import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';

class ResourceCatalogValidForPatchDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource catalog validity',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    startDateTime?: string;

    @ApiPropertyOptional({
        description: 'End date-time for resource catalog validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    @IsDateString()
    @IsOptional()
    endDateTime?: string;
}

export class PatchResourceCatalogDto {
    @ApiPropertyOptional({
        description: 'Resource catalog name',
        example: 'Corporate Resource Catalog v2',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({
        description: 'Resource catalog description',
        example: 'Catalogo de recursos corporativos e residenciais',
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
        description: 'Version for catalog payload',
        example: '1.0.1',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    version?: string;

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: ResourceType.RESOURCE_CATALOG,
        enum: [ResourceType.RESOURCE_CATALOG],
    })
    @IsOptional()
    @IsEnum([ResourceType.RESOURCE_CATALOG])
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'Catalog',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    '@baseType'?: string;

    @ApiPropertyOptional({
        description: 'TMF schema location',
        example: 'https://example.org/schema/resource-catalog.schema.json',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    '@schemaLocation'?: string;

    @ApiPropertyOptional({
        description: 'Validity window for resource catalog',
        type: ResourceCatalogValidForPatchDto,
    })
    @ValidateNested()
    @Type(() => ResourceCatalogValidForPatchDto)
    @IsOptional()
    validFor?: ResourceCatalogValidForPatchDto;
}
