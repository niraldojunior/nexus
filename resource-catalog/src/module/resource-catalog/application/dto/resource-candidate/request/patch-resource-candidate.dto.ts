import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';

export class PatchResourceCandidateDto {
    @ApiPropertyOptional({
        description: 'Resource candidate name',
        example: 'CPE ZTE F670L',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({
        description: 'Resource candidate description',
        example: 'Publication of CPE spec in the network catalog',
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
        description: 'Version for candidate payload',
        example: '1.0.0',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    version?: string;

    @ApiPropertyOptional({
        description: 'TMF payload type',
        example: ResourceType.RESOURCE_CANDIDATE,
        enum: [ResourceType.RESOURCE_CANDIDATE],
    })
    @IsOptional()
    @IsEnum([ResourceType.RESOURCE_CANDIDATE])
    '@type'?: string;

    @ApiPropertyOptional({
        description: 'TMF payload base type',
        example: 'Candidate',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    '@baseType'?: string;

    @ApiPropertyOptional({
        description: 'TMF schema location',
        example: 'https://example.org/schema/resource-candidate.schema.json',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    '@schemaLocation'?: string;
}
