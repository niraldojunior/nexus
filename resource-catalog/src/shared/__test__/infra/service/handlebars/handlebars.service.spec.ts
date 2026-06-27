import { HandlebarsService } from '@/shared/infra/service/handlebars/handlebars.service';

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
};

describe('HandlebarsService', () => {
    let service: HandlebarsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new HandlebarsService(mockLogger as any);
        service['templates'].clear();
    });

    it('should load and retrieve a template', () => {
        const source = { name: 'n', target: 't', version: '1', type: 0 };
        service.loadTemplate(source, 'Hello {{name}}');
        expect(service.hasKey(source)).toBe(true);
    });

    it('should not load empty template string', () => {
        const source = { name: 'n', target: 't', version: '1', type: 0 };
        service.loadTemplate(source, '');
        expect(service.hasKey(source)).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should clear templates by key and all', () => {
        const source = { name: 'n', target: 't', version: '1', type: 0 };
        service.loadTemplate(source, 'Hello');
        service.clearTemplates(source);
        expect(service.hasKey(source)).toBe(false);
        service.loadTemplate(source, 'Hello');
        service.clearTemplates();
        expect(service.hasKey(source)).toBe(false);
    });

    it('should use fallback template if not found and fallback is true', () => {
        service['setFallbackTemplate']();
        const source = {
            name: 'notfound',
            target: 'fallback',
            version: '1',
            type: 0,
        };
        const result = service.transform(
            {
                ...source,
                data: { queryParams: {}, params: {}, headers: {}, body: {} },
            },
            true,
        );
        expect(result).toBeDefined();
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw if no template and no fallback', () => {
        const source = { name: 'n', target: 't', version: '1', type: 0 };
        expect(() =>
            service.transform(
                {
                    ...source,
                    data: {
                        queryParams: {},
                        params: {},
                        headers: {},
                        body: {},
                    },
                },
                false,
            ),
        ).toThrow();
    });

    it('should apply pre-processors', () => {
        const source = { name: 'n', target: 't', version: '1', type: 0 };
        service.loadTemplate(source, '{{body.value}}');
        const result = service.transform({
            ...source,
            preProcessors: [
                { name: 'inc', path: 'body.value', processor: (v) => v + 1 },
            ],
            data: {
                queryParams: {},
                params: {},
                headers: {},
                body: { value: 1 },
            },
        });
        expect(result).toBe(2);
    });

    it('should register and use custom helpers', () => {
        const source = { name: 'n', target: 't', version: '1', type: 0 };
        service.loadTemplate(source, '{{customHelper body.value}}');
        const result = service.transform({
            ...source,
            helpers: { customHelper: (v) => v + 10 },
            data: {
                queryParams: {},
                params: {},
                headers: {},
                body: { value: 5 },
            },
        });
        expect(result).toBe(15);
    });

    it('should encode and decode HTML', () => {
        const str = '<a href="test">Test</a>';
        const encoded = service['encodeHtml'](str);
        expect(encoded).toContain('&lt;a');
        const decoded = service['decodeHtml'](encoded);
        expect(decoded).toBe(str);
    });

    it('should get and set nested values', () => {
        const obj = { a: { b: { c: 1 } } };
        expect(service['getNestedValue'](obj, 'a.b.c')).toBe(1);
        service['setNestedValue'](obj, 'a.b.d', 2);
        expect(obj.a.b['d']).toBe(2);
    });

    it('should decode nested JSON', () => {
        const obj = { a: '{"b":2}' };
        const decoded = service['decodeNested'](obj);
        expect(decoded.a.b).toBe(2);
    });

    // You can add more tests for built-in helpers if needed.
});
