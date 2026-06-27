import { ApiProperty } from '@nestjs/swagger';

import { TmfBaseResponseDto } from '@/shared/application/dto/tmf/tmf-base-response.dto';

export class UtilCodeFormatResponseDto extends TmfBaseResponseDto {
    constructor(data: string) {
        super({ data });
        this.data = data;
    }

    @ApiProperty({
        name: 'data',
        description: 'Dados de retorno da operação',
        example: '0',
        required: true,
    })
    data: string;
}
