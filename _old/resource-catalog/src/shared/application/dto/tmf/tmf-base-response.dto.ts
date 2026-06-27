import { ApiProperty } from '@nestjs/swagger';

export class TmfBaseResponseDto {
    constructor(data?: any) {
        if (typeof data !== 'object' || data === null) {
            data = { data };
        }
        Object.assign(this, data);
    }

    static of<T>(data: any): T {
        return data as T;
    }
}

export class TmfBaseResponsePaginationHeadersDto<T> {
    constructor(total: number, items: T[]) {
        this.items = items;
        this.headers['X-Result-Count'] = items.length;
        this.headers['X-Total-Count'] = total;
    }

    @ApiProperty({
        description: 'Actual number of items returned in the response body',
        example: 10,
    })
    private 'X-Result-Count': number;
    @ApiProperty({
        description: 'Total number of items matching criteria',
        example: 100,
    })
    private 'X-Total-Count': number;

    headers: Record<string, string | number> = {};

    items: T[] = [];
}
