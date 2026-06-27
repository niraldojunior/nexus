import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { TmfListQueryDto } from '@/module/resource-catalog/application/dto/common/request/tmf-list-query.dto';
import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';

export class ListResourceCandidateQueryDto extends TmfListQueryDto {
    @Transform(({ value }) => {
        const order: Partial<
            Record<
                Extract<keyof ResourceCandidateModel, string>,
                'ASC' | 'DESC'
            >
        > = {};
        value = Array.isArray(value) ? value : [value];
        for (const val of value) {
            const [key, direction] = val.split('=');
            if (
                ResourceCandidateModel.propertyKeys.includes(key) &&
                ['ASC', 'DESC'].includes(
                    typeof direction === 'string'
                        ? direction.toUpperCase()
                        : '',
                )
            ) {
                order[key] = direction;
            }
        }
        return order;
    })
    @ApiPropertyOptional({
        description: 'Order by fields',
        example: ['createdAt=DESC', 'id=ASC'],
        type: String,
        isArray: true,
    })
    @IsOptional()
    sort?: Partial<
        Record<Extract<keyof ResourceCandidateModel, string>, 'ASC' | 'DESC'>
    >;

    @ApiPropertyOptional({
        description: 'Exact name filter',
        example: 'CPE ZTE F670L',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Description filter (contains, case-insensitive)',
        example: 'This is a sample resource candidate description',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Exact version filter',
        example: '1.0.0',
    })
    @IsString()
    @IsOptional()
    version?: string;

    @ApiPropertyOptional({
        description: 'Exact lifecycleStatus filter',
        enum: LifecycleStatus,
    })
    @IsEnum(LifecycleStatus)
    @IsOptional()
    lifecycleStatus?: LifecycleStatus;

    @ApiPropertyOptional({
        description: 'Filter by linked ResourceSpecification id',
        example: '7391531910851620867',
    })
    @IsString()
    @IsOptional()
    resourceSpecification?: string;

    @ApiPropertyOptional({
        description: 'Filter by linked ResourceCatalog Id',
        example: '7391531910851620864',
    })
    @IsString()
    @IsOptional()
    resourceCatalog?: string;

    @ApiPropertyOptional({
        description: 'Filter by linked ResourceCategory Id',
        example: '7391531910851620861',
    })
    @IsString()
    @IsOptional()
    resourceCategory?: string;

    @ApiPropertyOptional({
        description: 'Candidate creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtStart?: string;

    @ApiPropertyOptional({
        description: 'Candidate creation timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    createdAtEnd?: string;

    @ApiPropertyOptional({
        description: 'Candidate update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtStart?: string;

    @ApiPropertyOptional({
        description: 'Candidate update timestamp filter',
        example: new Date().toISOString(),
    })
    @IsDateString()
    @IsOptional()
    updatedAtEnd?: string;
}
