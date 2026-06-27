import { CacheMethod } from '@/shared/application/decorator/cache.decorator';

describe('CacheMethod', () => {
    let cache: any;
    let originalMethod: jest.Mock;
    let target: any;

    beforeEach(() => {
        cache = {
            get: jest.fn(),
            set: jest.fn(),
        };
        originalMethod = jest.fn();
        target = {
            cache,
            testMethod: originalMethod,
        };
    });

    it('should return cached value if present', async () => {
        cache.get.mockResolvedValue('cached');
        originalMethod.mockResolvedValue('not-used');
        const descriptor = { value: originalMethod };
        CacheMethod()(target, 'testMethod', descriptor);
        await expect(descriptor.value.call(target, 1, 2)).resolves.toBe(
            'cached',
        );
        expect(cache.get).toHaveBeenCalled();
        expect(originalMethod).not.toHaveBeenCalled();
    });

    it('should call original method and cache result if not cached', async () => {
        cache.get.mockResolvedValue(undefined);
        originalMethod.mockResolvedValue('result');
        const descriptor = { value: originalMethod };
        CacheMethod()(target, 'testMethod', descriptor);
        await expect(descriptor.value.call(target, 1, 2)).resolves.toBe(
            'result',
        );
        expect(originalMethod).toHaveBeenCalledWith(1, 2);
        expect(cache.set).toHaveBeenCalledWith(
            expect.any(String),
            'result',
            undefined,
        );
    });

    it('should use custom TTL if provided', async () => {
        cache.get.mockResolvedValue(undefined);
        originalMethod.mockResolvedValue('result');
        const descriptor = { value: originalMethod };
        CacheMethod(123)(target, 'testMethod', descriptor);
        await descriptor.value.call(target, 'a');
        expect(cache.set).toHaveBeenCalledWith(
            expect.any(String),
            'result',
            123,
        );
    });

    it('should throw error if no cache service', async () => {
        const descriptor = { value: originalMethod };
        const noCacheTarget = {};
        CacheMethod()(noCacheTarget, 'testMethod', descriptor);
        await expect(descriptor.value.call(noCacheTarget)).rejects.toThrow();
    });

    it('should work with cacheService property', async () => {
        const cacheService = {
            get: jest.fn().mockResolvedValue('cached'),
            set: jest.fn(),
        };
        const descriptor = { value: originalMethod };
        const targetWithCacheService = { cacheService };
        CacheMethod()(targetWithCacheService, 'testMethod', descriptor);
        await expect(
            descriptor.value.call(targetWithCacheService),
        ).resolves.toBe('cached');
    });

    it('should generate unique cache key for different args', async () => {
        cache.get.mockResolvedValue(undefined);
        originalMethod.mockResolvedValue('result');
        const descriptor = { value: originalMethod };
        CacheMethod()(target, 'testMethod', descriptor);
        await descriptor.value.call(target, 1, 2);
        await descriptor.value.call(target, 3, 4);
        expect(cache.set.mock.calls[0][0]).not.toBe(cache.set.mock.calls[1][0]);
    });
});
