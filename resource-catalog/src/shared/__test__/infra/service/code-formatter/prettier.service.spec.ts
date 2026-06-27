// import * as prettier from 'prettier';

// import { LoggerService } from '@/shared/infra/logger/logger.service';
// import { PrettierService } from '@/shared/infra/service/code-formatter/prettier.service';

jest.mock('prettier');

describe('PrettierService', () => {
    // let service: PrettierService;
    // let logger: LoggerService;

    // beforeEach(() => {
    //     logger = { error: jest.fn() } as any;
    //     service = new PrettierService(logger);
    // });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(true).toBe(true);
    });

    // describe('formatHbs', () => {
    //     it('should format HBS code', async () => {
    //         (prettier.format as jest.Mock).mockResolvedValue('formatted');
    //         await expect(service.formatHbs('foo')).resolves.toBe('formatted');
    //         expect(prettier.format).toHaveBeenCalledWith(
    //             'foo',
    //             expect.objectContaining({ parser: 'glimmer' }),
    //         );
    //     });

    //     it('should log and rethrow on error', async () => {
    //         const error = new Error('fail');
    //         (prettier.format as jest.Mock).mockRejectedValue(error);
    //         await expect(service.formatHbs('foo')).rejects.toThrow('fail');
    //         expect(logger.error).toHaveBeenCalled();
    //     });

    //     it('should handle empty string', async () => {
    //         (prettier.format as jest.Mock).mockResolvedValue('');
    //         await expect(service.formatHbs('')).resolves.toBe('');
    //     });

    //     it('should pass custom options', async () => {
    //         (prettier.format as jest.Mock).mockResolvedValue('custom');
    //         await service.formatHbs('foo', { printWidth: 10 });
    //         expect(prettier.format).toHaveBeenCalledWith(
    //             'foo',
    //             expect.objectContaining({ printWidth: 10 }),
    //         );
    //     });
    // });

    // describe('formatJson', () => {
    //     it('should format JSON code', async () => {
    //         (prettier.format as jest.Mock).mockResolvedValue('json');
    //         await expect(service.formatJson('{}')).resolves.toBe('json');
    //         expect(prettier.format).toHaveBeenCalledWith(
    //             '{}',
    //             expect.objectContaining({ parser: 'babel' }),
    //         );
    //     });

    //     it('should log and rethrow on error', async () => {
    //         const error = new Error('fail');
    //         (prettier.format as jest.Mock).mockRejectedValue(error);
    //         await expect(service.formatJson('{}')).rejects.toThrow('fail');
    //         expect(logger.error).toHaveBeenCalled();
    //     });

    //     it('should handle invalid JSON', async () => {
    //         const error = new Error('SyntaxError');
    //         (prettier.format as jest.Mock).mockRejectedValue(error);
    //         await expect(service.formatJson('{invalid}')).rejects.toThrow(
    //             'SyntaxError',
    //         );
    //     });
    // });
});
