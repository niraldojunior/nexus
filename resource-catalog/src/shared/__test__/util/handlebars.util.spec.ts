import { trimHbsUtil } from '@/shared/util/handlebars.util';

describe('trimHbsUtil', () => {
    it('should return empty string when input is undefined', () => {
        expect(trimHbsUtil()).toBe('');
    });

    it('should remove newlines and leading spaces', () => {
        expect(trimHbsUtil('\n   foo\n   bar')).toBe('foo bar');
    });

    it('should remove spaces after colon in quotes', () => {
        expect(trimHbsUtil('": value"')).toBe('":value"');
    });

    it('should replace triple closing braces with space', () => {
        expect(trimHbsUtil('foo}}}bar')).toBe('foo}} }bar');
    });

    it('should trim leading and trailing spaces', () => {
        expect(trimHbsUtil('   foo bar   ')).toBe('foo bar');
    });

    it('should handle empty string', () => {
        expect(trimHbsUtil('')).toBe('');
    });

    it('should not change string with no matches', () => {
        expect(trimHbsUtil('foo:bar')).toBe('foo:bar');
    });

    it('should handle all patterns together', () => {
        const input = '\n  "key": value\n}}}   ';
        expect(trimHbsUtil(input)).toBe('"key":value }} }');
    });
});
