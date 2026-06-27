import { BadRequestException } from '@nestjs/common';

import {
    filterByRequestedFields,
    normalizePagination,
    parseRequestedFields,
    TMF_LIST_DEFAULT_LIMIT,
    TMF_LIST_DEFAULT_OFFSET,
    TMF_LIST_MAX_LIMIT,
} from '@/shared/util/tmf-list-query.util';

describe('tmf-list-query.util', () => {
    describe('normalizePagination', () => {
        it('should apply default offset and limit', () => {
            const result = normalizePagination({});

            expect(result).toEqual({
                offset: TMF_LIST_DEFAULT_OFFSET,
                limit: TMF_LIST_DEFAULT_LIMIT,
            });
        });

        it('should clamp negative offset to 0', () => {
            const result = normalizePagination({ offset: -10, limit: 20 });

            expect(result.offset).toBe(0);
            expect(result.limit).toBe(20);
        });

        it('should clamp limit above max to 200', () => {
            const result = normalizePagination({ offset: 5, limit: 999 });

            expect(result.offset).toBe(5);
            expect(result.limit).toBe(TMF_LIST_MAX_LIMIT);
        });
    });

    describe('parseRequestedFields', () => {
        const allowlist = ['id', 'name', 'lifecycleStatus'];

        it('should parse valid comma-separated fields', () => {
            const result = parseRequestedFields('id,name', allowlist);

            expect(result).toEqual(['id', 'name']);
        });

        it('should deduplicate repeated fields', () => {
            const result = parseRequestedFields('id,name,id', allowlist);

            expect(result).toEqual(['id', 'name']);
        });

        it('should throw 400 for invalid fields', () => {
            expect(() => {
                parseRequestedFields('id,unknownField', allowlist);
            }).toThrow(BadRequestException);
        });
    });

    describe('filterByRequestedFields', () => {
        it('should return only requested fields', () => {
            const source = {
                id: 'resource-1',
                name: 'Resource Name',
                lifecycleStatus: 'Active',
            };

            const result = filterByRequestedFields(source, ['id', 'name']);

            expect(result).toEqual({
                id: 'resource-1',
                name: 'Resource Name',
            });
        });

        it('should return full payload when fields are not informed', () => {
            const source = {
                id: 'resource-1',
                name: 'Resource Name',
            };

            const result = filterByRequestedFields(source, undefined);

            expect(result).toEqual(source);
        });
    });
});
