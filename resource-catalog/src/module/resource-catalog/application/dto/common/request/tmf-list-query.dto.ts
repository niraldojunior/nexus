import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TmfListQueryDto {
    @ApiPropertyOptional({
        description: 'Offset for paged list',
        example: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    offset?: number = 0;

    @ApiPropertyOptional({
        description: 'Limit for paged list',
        example: 10,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    @IsOptional()
    limit?: number = 10;

    @ApiPropertyOptional({
        description: 'Comma-separated set of output fields',
        example: 'id,name,lifecycleStatus',
    })
    @IsString()
    @IsOptional()
    fields?: string;
}
