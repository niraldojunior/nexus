import { safeParse, safeStringify } from '@/shared/util/json.util';

describe('json.util', () => {
    describe('safeStringify', () => {
        it('should stringify a simple object', () => {
            const obj = { a: 1, b: 'test' };
            expect(safeStringify(obj)).toBe(JSON.stringify(obj));
        });

        it('should return the string as is if input is already a string', () => {
            expect(safeStringify('{"a":1}')).toBe('{"a":1}');
        });

        it('should handle circular references gracefully', () => {
            const obj: any = { a: 1 };
            obj.self = obj;
            const result = safeStringify(obj);
            expect(result).toBe('{"a":1}');
        });

        it('should return empty string on error', () => {
            // Simulate an object that throws on JSON.stringify
            const badObj = {};
            (badObj as any).toJSON = () => {
                throw new Error('fail');
            };
            expect(safeStringify(badObj)).toBe('');
        });
    });

    describe('safeParse', () => {
        it('should parse a valid JSON string', () => {
            expect(safeParse('{"a":1,"b":"test"}')).toEqual({
                a: 1,
                b: 'test',
            });
        });

        it('should return null for invalid JSON', () => {
            expect(safeParse('not a json')).toBeNull();
        });

        it('should parse JSON arrays', () => {
            expect(safeParse('[1,2,3]')).toEqual([1, 2, 3]);
        });

        it('should parse JSON null', () => {
            expect(safeParse('null')).toBeNull();
        });
    });
});
