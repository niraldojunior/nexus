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

class ResourceSpecificationValidForCreateDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource specification validity',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    startDateTime: string = new Date().toISOString();

    @ApiPropertyOptional({
        description: 'End date-time for resource specification validity',
        example: new Date(
            new Date().setUTCFullYear(new Date().getUTCFullYear() + 1),
        ).toISOString(),
    })
    @IsDateString()
    @IsOptional()
    endDateTime?: string;
}

class ResourceSpecificationCatalogRefCreateDto {
    @ApiProperty({
        description: 'Catalog identifier',
        example: '7391531910851620864',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    id: string;
}

class ResourceSpecificationCategoryRefCreateDto {
    @ApiProperty({
        description: 'Category identifier',
        example: '7391531910851620861',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    id: string;
}

class ResourceSpecificationCharacteristicCreateDto {
    @ApiPropertyOptional({
        description: 'Characteristic name',
        example: 'Brand',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({
        description: 'Characteristic value type',
        example: 'string',
    })
    @IsString()
    @IsOptional()
    @MaxLength(30)
    valueType?: string;

    @ApiPropertyOptional({
        description: 'Characteristic value',
        example: 'ZTE',
    })
    @IsOptional()
    value?: unknown;
}

export class CreateResourceSpecificationDto {
    @ApiProperty({
        description: 'Resource specification name',
        example: 'CPE ZTE F670L',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({
        description: 'Resource specification description',
        example: 'Especificacao tecnica do equipamento CPE',
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
        description: 'Version for specification payload',
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
        example: ResourceType.RESOURCE_SPECIFICATION,
        enum: [ResourceType.RESOURCE_SPECIFICATION],
    })
    @IsEnum([ResourceType.RESOURCE_SPECIFICATION])
    '@type': string = ResourceType.RESOURCE_SPECIFICATION;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'Specification',
    })
    @IsString()
    @MaxLength(20)
    '@baseType': string = ResourceType.RESOURCE_SPECIFICATION;

    @ApiPropertyOptional({
        description: 'TMF schema location',
        example:
            'https://example.org/schema/resource-specification.schema.json',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    '@schemaLocation'?: string;

    @ApiPropertyOptional({
        description: 'Validity window for resource specification',
        type: ResourceSpecificationValidForCreateDto,
    })
    @ValidateNested()
    @Type(() => ResourceSpecificationValidForCreateDto)
    @IsOptional()
    validFor: ResourceSpecificationValidForCreateDto =
        new ResourceSpecificationValidForCreateDto();

    @ApiPropertyOptional({
        description: 'TMF catalogs linked to this specification',
        type: ResourceSpecificationCatalogRefCreateDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceSpecificationCatalogRefCreateDto)
    resourceCatalog: ResourceSpecificationCatalogRefCreateDto[];

    @ApiPropertyOptional({
        description: 'TMF categories linked to this specification',
        type: ResourceSpecificationCategoryRefCreateDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceSpecificationCategoryRefCreateDto)
    resourceCategory: ResourceSpecificationCategoryRefCreateDto[];

    @ApiPropertyOptional({
        description: 'TMF characteristics list',
        type: ResourceSpecificationCharacteristicCreateDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceSpecificationCharacteristicCreateDto)
    @IsOptional()
    resourceSpecCharacteristic?: ResourceSpecificationCharacteristicCreateDto[];
}
