import { createPatch } from 'diff';

import { DiffService } from '@/shared/infra/service/diff/diff.service';
import {
    DIFF_DELETE,
    DIFF_INSERT,
} from '@/shared/infra/service/diff/diff-match-patch-uncompressed';

jest.mock('diff', () => ({
    createPatch: jest.fn(),
}));

describe('DiffService', () => {
    let service: DiffService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DiffService();
    });

    describe('diff', () => {
        it('should return no changes for identical strings', () => {
            const result = service.diff('abc', 'abc');
            expect(result.every(({ '0': type }) => type === 0)).toBe(true);
        });

        it('should return insert for completely different strings', () => {
            const result = service.diff('abc', 'xyz');
            expect(result.some(({ '0': type }) => type === DIFF_INSERT)).toBe(
                true,
            );
            expect(result.some(({ '0': type }) => type === DIFF_DELETE)).toBe(
                true,
            );
        });

        it('should handle empty strings', () => {
            expect(service.diff('', '')).toEqual([]);
            expect(service.diff('abc', '')).toEqual(expect.any(Array));
            expect(service.diff('', 'abc')).toEqual(expect.any(Array));
        });

        it('should handle whitespace and special characters', () => {
            const result = service.diff('a b', 'a  b!');
            expect(result).toEqual(expect.any(Array));
        });
    });

    describe('rebuild', () => {
        it('should rebuild original and changed text from diffs', () => {
            const diffs: any = [
                [0, 'a'],
                [DIFF_INSERT, 'b'],
                [DIFF_DELETE, 'c'],
            ];
            const [text1, text2] = service.rebuild(diffs);
            expect(text1).toBe('a' + 'c');
            expect(text2).toBe('a' + 'b');
        });

        it('should handle empty diffs', () => {
            expect(service.rebuild([])).toEqual(['', '']);
        });

        it('should handle only inserts', () => {
            const diffs: any = [[DIFF_INSERT, 'abc']];
            expect(service.rebuild(diffs)).toEqual(['', 'abc']);
        });

        it('should handle only deletes', () => {
            const diffs: any = [[DIFF_DELETE, 'abc']];
            expect(service.rebuild(diffs)).toEqual(['abc', '']);
        });
    });

    describe('patch', () => {
        it('should call createPatch and return its result', () => {
            (createPatch as jest.Mock).mockReturnValue('patch-result');
            expect(service.patch('old', 'new')).toBe('patch-result');
            expect(createPatch).toHaveBeenCalledWith('string', 'old', 'new');
        });

        it('should handle empty strings', () => {
            (createPatch as jest.Mock).mockReturnValue('patch-empty');
            expect(service.patch('', '')).toBe('patch-empty');
        });

        it('should handle large strings', () => {
            const oldStr = 'a'.repeat(1000);
            const newStr = 'b'.repeat(1000);
            (createPatch as jest.Mock).mockReturnValue('patch-large');
            expect(service.patch(oldStr, newStr)).toBe('patch-large');
        });
    });
});
