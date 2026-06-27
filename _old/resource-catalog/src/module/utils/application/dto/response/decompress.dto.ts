import { ApiProperty } from '@nestjs/swagger';

import { TmfBaseResponseDto } from '@/shared/application/dto/tmf/tmf-base-response.dto';

export class UtilDecompressResponseDto extends TmfBaseResponseDto {
    constructor(data: {
        data: string;
        originalSize: number;
        size: number;
        ratio: string;
    }) {
        super(data);
        Object.assign(this, data);
    }

    @ApiProperty({
        name: 'data',
        description: 'Dados de retorno da operação',
        example: '0',
        required: true,
    })
    data: string;

    @ApiProperty({
        name: 'originalSize',
        description: 'Tamanho original dos dados',
        example: 1024,
        required: true,
    })
    originalSize: number;

    @ApiProperty({
        name: 'size',
        description: 'Tamanho dos dados após a descompressão',
        example: 2048,
        required: true,
    })
    size: number;

    @ApiProperty({
        name: 'ratio',
        description: 'Taxa de crescimento dos dados após a descompressão',
        example: '100%',
        required: true,
    })
    ratio: string;
}
