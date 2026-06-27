import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import {
    CompressAlgorithm,
    CompressOptions,
} from '@/shared/application/port/compress/compress.repository';

class UtilsDecompressOptionsRequestDto implements CompressOptions {
    @ApiProperty({
        name: 'algorithm',
        description: 'Compression algorithm to use',
        example: CompressAlgorithm.ENCODED_URI_COMPONENT,
        examples: Object.values(CompressAlgorithm),
        required: false,
    })
    @IsString()
    @IsOptional()
    algorithm?: CompressAlgorithm;
}

export class UtilDecompressRequestDto {
    @ApiProperty({
        name: 'data',
        description: 'String to be decompressed',
        example: 'MIewtgDgTgpgznGATABHALlAlgOwOYpICG6RAdBUA',
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
    @Type(() => UtilsDecompressOptionsRequestDto)
    options: UtilsDecompressOptionsRequestDto;
}
