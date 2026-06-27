import { HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export class TmfErrorDto {
    constructor(
        data: { code?: number; message?: string; reason?: string[] } = {},
    ) {
        data.code ??= HttpStatus.INTERNAL_SERVER_ERROR;
        data.message ??= HttpStatus[data.code]
            ?.toLowerCase()
            .split('_')
            .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(' ');
        data.reason = data.reason?.length ? data.reason.filter((e) => e) : [];

        Object.assign(this, {
            ...data,
            reason: data.reason.length
                ? data.reason
                      .map((e) => (Array.isArray(e) ? e.join('. ') : e))
                      .join('. ')
                : data.code > 499
                  ? 'T'
                  : data.code > 299
                    ? 'E'
                    : 'S',
        });
    }

    @ApiProperty({
        description:
            'Application relevant detail, defined in the API or a common list.',
        example: 500,
        examples: [500, 404, 403, 400],
    })
    code: number;
    @ApiProperty({
        description: 'HTTP error code description',
        example: 'Internal Server Error',
        examples: [
            'Internal Server Error',
            'Not Found',
            'Forbidden',
            'Bad Request',
        ],
    })
    message: string;
    @ApiProperty({
        description:
            'Explanation of the reason for the error which can be shown to a client user.',
        example: 'An unexpected error occurred',
    })
    reason: string;
}
