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

class ResourceSpecificationValidForPatchDto {
    @ApiPropertyOptional({
        description: 'Start date-time for resource specification validity',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    startDateTime?: string;

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

class ResourceSpecificationCatalogRefPatchDto {
    @ApiPropertyOptional({
        description: 'Catalog identifier',
        example: 'router',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    id?: string;
}

class ResourceSpecificationCategoryRefPatchDto {
    @ApiPropertyOptional({
        description: 'Category identifier',
        example: 'router',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    id?: string;
}

class ResourceSpecificationCharacteristicPatchDto {
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
        example: 'Huawei',
    })
    @IsOptional()
    value?: unknown;
}

export class PatchResourceSpecificationDto {
    @ApiPropertyOptional({
        description: 'Resource specification name',
        example: 'CPE Huawei HG8145X6',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({
        description: 'Resource specification description',
        example: 'Especificacao tecnica atualizada do equipamento CPE',
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
        description: 'Version for specification payload',
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
        example: ResourceType.RESOURCE_SPECIFICATION,
        enum: [ResourceType.RESOURCE_SPECIFICATION],
    })
    @IsEnum([ResourceType.RESOURCE_SPECIFICATION])
    @IsOptional()
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'Specification',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    '@baseType'?: string;

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
        type: ResourceSpecificationValidForPatchDto,
    })
    @ValidateNested()
    @Type(() => ResourceSpecificationValidForPatchDto)
    @IsOptional()
    validFor?: ResourceSpecificationValidForPatchDto;

    @ApiPropertyOptional({
        description: 'TMF catalogs linked to this specification',
        type: ResourceSpecificationCatalogRefPatchDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceSpecificationCatalogRefPatchDto)
    @IsOptional()
    resourceCatalog?: ResourceSpecificationCatalogRefPatchDto[];

    @ApiPropertyOptional({
        description: 'TMF categories linked to this specification',
        type: ResourceSpecificationCategoryRefPatchDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceSpecificationCategoryRefPatchDto)
    @IsOptional()
    resourceCategory?: ResourceSpecificationCategoryRefPatchDto[];

    @ApiPropertyOptional({
        description: 'TMF characteristics list',
        type: ResourceSpecificationCharacteristicPatchDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResourceSpecificationCharacteristicPatchDto)
    @IsOptional()
    resourceSpecCharacteristic?: ResourceSpecificationCharacteristicPatchDto[];
}
