import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import {
    CompressAlgorithm,
    CompressOptions,
} from '@/shared/application/port/compress/compress.repository';

class UtilsCompressOptionsRequestDto implements CompressOptions {
    @ApiProperty({
        name: 'algorithm',
        description: 'Compression algorithm to use',
        example: CompressAlgorithm.UTF16,
        examples: Object.values(CompressAlgorithm),
        required: false,
    })
    @IsEnum(CompressAlgorithm)
    @IsOptional()
    algorithm?: CompressAlgorithm;
}

export class UtilCompressRequestDto {
    @ApiProperty({
        name: 'data',
        description: 'String to be compressed',
        example: 'Very long string data...',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    data: string;

    @ApiProperty({
        name: 'options',
        description: 'Options for compression',
        required: false,
    })
    @IsOptional()
    @Type(() => UtilsCompressOptionsRequestDto)
    options: UtilsCompressOptionsRequestDto;
}
