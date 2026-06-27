import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

class ResourceCatalogValidForCreateDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource catalog validity',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    startDateTime: string = new Date().toISOString();

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

export class CreateResourceCatalogDto {
    @ApiProperty({
        description: 'Resource catalog name',
        example: 'Corporate Resource Catalog',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({
        description: 'Resource catalog description',
        example: 'Catalogo corporativo de recursos de rede',
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
        description: 'Version for catalog payload',
        example: '1.0.0',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    version = '1.0.0';

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: ResourceType.RESOURCE_CATALOG,
        enum: [ResourceType.RESOURCE_CATALOG],
    })
    @IsEnum([ResourceType.RESOURCE_CATALOG])
    '@type': string = ResourceType.RESOURCE_CATALOG;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'Catalog',
    })
    @IsString()
    @MaxLength(20)
    '@baseType': string = ResourceType.RESOURCE_CATALOG;

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
        type: ResourceCatalogValidForCreateDto,
    })
    @ValidateNested()
    @Type(() => ResourceCatalogValidForCreateDto)
    @IsOptional()
    validFor: ResourceCatalogValidForCreateDto =
        new ResourceCatalogValidForCreateDto();
}
