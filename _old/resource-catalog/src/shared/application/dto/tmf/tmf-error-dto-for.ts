import { HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

function formatMessage(status: number): string {
    return (
        HttpStatus[status]
            ?.toLowerCase()
            .split('_')
            .map((w: string) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
            .join(' ') ?? 'Unknown'
    );
}

const cache = new Map<number, new () => object>();

export function TmfErrorDtoFor(status: number): new () => object {
    if (cache.has(status)) return cache.get(status) as new () => object;

    const code = status;
    const message = formatMessage(status);
    const reason = status >= 500 ? 'T' : 'E';

    class StatusTmfErrorDto {
        @ApiProperty({
            description:
                'Application relevant detail, defined in the API or a common list.',
            example: code,
        })
        code: number;

        @ApiProperty({
            description: 'HTTP error code description',
            example: message,
        })
        message: string;

        @ApiProperty({
            description:
                'Explanation of the reason for the error which can be shown to a client user.',
            example: reason,
        })
        reason: string;
    }

    Object.defineProperty(StatusTmfErrorDto, 'name', {
        value: `TmfError${status}Dto`,
    });

    cache.set(status, StatusTmfErrorDto);
    return StatusTmfErrorDto;
}
