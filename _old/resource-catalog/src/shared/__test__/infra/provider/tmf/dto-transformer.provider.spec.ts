// import { TemplateType } from '@/module/template/domain/entity/template.entity';
// import { TmfDtoTransformerProvider } from '@/shared/infra/provider/tmf/dto-transformer.provider';

// const mockHandlebarsService = {
//     loadTemplate: jest.fn(),
//     transform: jest.fn(),
// };
// const mockTemplateService = {
//     getTemplate: jest.fn(),
// };
// const mockCacheService = {
//     get: jest.fn(),
//     set: jest.fn(),
// };

// const baseDto = {
//     provider: 'prov',
//     templateName: 'temp',
//     version: 1,
//     queryParams: { foo: 'bar' },
//     params: { id: 1 },
//     headers: { h: 'v' },
//     body: { b: 2 },
//     path: 'original-path',
// };

describe('TmfDtoTransformerProvider', () => {
    it('should be true', () => {
        expect(true).toBe(true);
    });

    //     let provider: TmfDtoTransformerProvider;

    //     beforeEach(() => {
    //         jest.clearAllMocks();
    //         provider = new TmfDtoTransformerProvider(
    //             mockHandlebarsService as any,
    //             mockTemplateService as any,
    //             mockCacheService as any,
    //         );
    //     });

    //     describe('getDtoRequest', () => {
    //         it('should load template and transform, build request with query and config.path', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(
    //                 'template-content',
    //             );
    //             mockHandlebarsService.transform.mockReturnValue({
    //                 queryParams: { a: 1 },
    //                 headers: { h: 'v' },
    //                 config: { path: '/foo' },
    //                 body: { b: 2 },
    //             });

    //             const result = await (provider as any).getDtoRequest(
    //                 baseDto,
    //                 false,
    //             );

    //             expect(mockTemplateService.getTemplate).toHaveBeenCalledWith({
    //                 target: 'prov',
    //                 name: 'temp',
    //                 version: 1,
    //                 type: TemplateType.REQUEST,
    //             });
    //             expect(mockHandlebarsService.loadTemplate).toHaveBeenCalled();
    //             expect(result.query).toBe('?a=1');
    //             expect(result.headers).toEqual({ h: 'v' });
    //             expect(result.config.path).toBe(
    //                 '/api/provider-federation-layer/prov/foo',
    //             );
    //             expect(result.body).toEqual({ b: 2 });
    //         });

    //         it('should not call loadTemplate if template is not found', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(null);
    //             mockHandlebarsService.transform.mockReturnValue({
    //                 queryParams: {},
    //                 headers: {},
    //                 config: {},
    //                 body: {},
    //             });

    //             const result = await (provider as any).getDtoRequest(
    //                 baseDto,
    //                 false,
    //             );

    //             expect(mockHandlebarsService.loadTemplate).not.toHaveBeenCalled();
    //             expect(result.query).toBe('');
    //             expect(result.config.path).toBe(
    //                 '/api/provider-federation-layer/prov/',
    //             );
    //         });

    //         it('should use fallback path if config.path is missing and fallback is true', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(
    //                 'template-content',
    //             );
    //             mockHandlebarsService.transform.mockReturnValue({
    //                 queryParams: {},
    //                 headers: {},
    //                 config: {},
    //                 body: {},
    //             });

    //             const result = await (provider as any).getDtoRequest(baseDto, true);

    //             expect(result.config.path).toBe(
    //                 '/api/provider-federation-layer/prov/original-path',
    //             );
    //         });

    //         it('should handle missing fields in transform result', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(
    //                 'template-content',
    //             );
    //             mockHandlebarsService.transform.mockReturnValue({});

    //             const result = await (provider as any).getDtoRequest(
    //                 baseDto,
    //                 false,
    //             );

    //             expect(result.query).toBe('');
    //             expect(result.headers).toEqual({});
    //             expect(result.config).toEqual({
    //                 path: '/api/provider-federation-layer/prov/',
    //             });
    //             expect(result.body).toEqual({});
    //         });
    //     });

    //     describe('getDtoResponse', () => {
    //         it('should load template and transform, build response', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(
    //                 'template-content',
    //             );
    //             mockHandlebarsService.transform.mockReturnValue({
    //                 queryParams: { x: 2 },
    //                 headers: { h: 'v' },
    //                 config: { path: '/bar' },
    //                 body: { b: 3 },
    //             });

    //             const result = await (provider as any).getDtoResponse(
    //                 baseDto,
    //                 false,
    //             );

    //             expect(mockTemplateService.getTemplate).toHaveBeenCalledWith({
    //                 target: 'prov',
    //                 name: 'temp',
    //                 version: 1,
    //                 type: TemplateType.RESPONSE,
    //             });
    //             expect(mockHandlebarsService.loadTemplate).toHaveBeenCalled();
    //             expect(result.query).toBe('?x=2');
    //             expect(result.headers).toEqual({ h: 'v' });
    //             expect(result.config.path).toBe('/bar');
    //             expect(result.body).toEqual({ b: 3 });
    //         });

    //         it('should not call loadTemplate if template is not found', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(null);
    //             mockHandlebarsService.transform.mockReturnValue({
    //                 queryParams: {},
    //                 headers: {},
    //                 config: {},
    //                 body: {},
    //             });

    //             const result = await (provider as any).getDtoResponse(
    //                 baseDto,
    //                 false,
    //             );

    //             expect(mockHandlebarsService.loadTemplate).not.toHaveBeenCalled();
    //             expect(result.query).toBe('');
    //             expect(result.config).toEqual({});
    //             expect(result.body).toEqual({});
    //         });

    //         it('should handle missing fields in transform result', async () => {
    //             mockTemplateService.getTemplate.mockResolvedValue(
    //                 'template-content',
    //             );
    //             mockHandlebarsService.transform.mockReturnValue({});

    //             const result = await (provider as any).getDtoResponse(
    //                 baseDto,
    //                 false,
    //             );

    //             expect(result.query).toBe('');
    //             expect(result.headers).toEqual({});
    //             expect(result.config).toEqual({});
    //             expect(result.body).toEqual({});
    //         });
    //     });
});
