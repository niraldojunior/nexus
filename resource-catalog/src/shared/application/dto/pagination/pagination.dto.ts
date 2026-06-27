import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class Pagination {
    @ApiProperty({
        example: 100,
        examples: [100, 200, 300],
    })
    @IsNumber()
    total: number;

    @ApiProperty({
        example: 0,
        examples: [0, 1, 2, 3],
    })
    @IsNumber()
    page: number;

    @ApiProperty({
        example: 10,
        examples: [10, 20, 30, 40],
    })
    @IsNumber()
    pageSize: number;

    @ApiProperty({
        example: 10,
        examples: [10, 20, 30, 40],
    })
    @IsNumber()
    totalPages: number;
}

export class PaginationDto<T> {
    constructor(page: number, limit: number, total: number, items: T[]) {
        this.metadata = {
            page,
            pageSize: items.length,
            total,
            totalPages: Math.ceil(total / limit) || 0,
        };
        this.items = items;
    }

    @ApiProperty()
    metadata: Pagination;

    items: T[];
}
