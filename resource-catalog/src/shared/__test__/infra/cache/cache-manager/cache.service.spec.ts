import { CacheService } from '@/shared/infra/cache/cache-manager/cache.service';

describe('CacheService', () => {
    let cacheManager: any;
    let logger: any;
    let configService: any;
    let service: CacheService;

    beforeEach(() => {
        cacheManager = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            clear: jest.fn(),
        };
        logger = { info: jest.fn(), error: jest.fn() };
        configService = {
            get: jest.fn((key) => (key === 'CACHE_TYPE' ? 'memory' : 60)),
        };
        service = new CacheService(cacheManager, logger, configService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return value when found and log', async () => {
            cacheManager.get.mockResolvedValue({ foo: 'bar' });
            await expect(service.get('key')).resolves.toEqual({ foo: 'bar' });
            expect(logger.info).toHaveBeenCalled();
        });

        it('should return null if not found', async () => {
            cacheManager.get.mockResolvedValue(null);
            await expect(service.get('key')).resolves.toBeNull();
        });

        it('should return null if object is empty', async () => {
            cacheManager.get.mockResolvedValue({});
            await expect(service.get('key')).resolves.toBeNull();
        });

        it('should not log if log=false', async () => {
            cacheManager.get.mockResolvedValue({ foo: 'bar' });
            await service.get('key', false);
            expect(logger.info).not.toHaveBeenCalled();
        });

        it('should log error and return null on exception', async () => {
            cacheManager.get.mockRejectedValue(new Error('fail'));
            await expect(service.get('key')).resolves.toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('set', () => {
        it('should set value and log', async () => {
            cacheManager.set.mockResolvedValue(undefined);
            await service.set('key', 'value', 10, true);
            expect(cacheManager.set).toHaveBeenCalledWith('key', 'value', 10);
            expect(logger.info).toHaveBeenCalled();
        });

        it('should set value with default ttl and no log', async () => {
            cacheManager.set.mockResolvedValue(undefined);
            await service.set('key', 'value');
            expect(cacheManager.set).toHaveBeenCalledWith('key', 'value', 60);
            expect(logger.info).not.toHaveBeenCalled();
        });

        it('should log error on exception', async () => {
            cacheManager.set.mockRejectedValue(new Error('fail'));
            await service.set('key', 'value', 10, true);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('should delete key and log success', async () => {
            cacheManager.del.mockResolvedValue(true);
            await service.delete('key');
            expect(cacheManager.del).toHaveBeenCalledWith('key');
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('RESPONSE'),
                }),
                expect.stringContaining('sucesso'),
            );
        });

        it('should log failure if key not deleted', async () => {
            cacheManager.del.mockResolvedValue(false);
            await service.delete('key');
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('RESPONSE'),
                }),
                expect.stringContaining('não realizada'),
            );
        });

        it('should log error on exception', async () => {
            cacheManager.del.mockRejectedValue(new Error('fail'));
            await service.delete('key');
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should clear cache and log', async () => {
            cacheManager.clear.mockResolvedValue(undefined);
            await service.clear();
            expect(cacheManager.clear).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalled();
        });

        it('should log error on exception', async () => {
            cacheManager.clear.mockRejectedValue(new Error('fail'));
            await service.clear();
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
