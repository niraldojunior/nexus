import { HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString, IsString } from 'class-validator';

export class Control {
    @ApiProperty({
        example: 'E',
        examples: ['S', 'T', 'E'],
    })
    @IsString()
    type: string;

    @ApiProperty({
        example: 500,
        examples: [500, 404, 403, 200],
    })
    @IsNumberString()
    code: number;

    @ApiProperty({
        example: 'Internal Server Error',
        examples: ['Internal Server Error', 'Not Found', 'Forbidden', 'Ok'],
    })
    @IsString()
    message: string;
}

export class ControlDto {
    constructor(data: any = null, control: Partial<Control> = {}) {
        control.code ??= HttpStatus.OK;
        control.type ??=
            control.code > 499 ? 'T' : control.code > 299 ? 'E' : 'S';
        control.message ??= HttpStatus[control.code]
            ?.toLowerCase()
            .split('_')
            .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(' ');

        this.control = {
            type: control.type,
            code: control.code,
            message: control.message,
        };
        this.data = data;
    }

    @ApiProperty()
    control: Control;

    @ApiPropertyOptional({ example: null })
    data: any;
}
