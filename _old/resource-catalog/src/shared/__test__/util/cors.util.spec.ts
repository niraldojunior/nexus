import * as envModule from '@/shared/infra/config/env/environment-config.service';
import { getCorsOrigins } from '@/shared/util/cors.util';

describe('getCorsOrigins', () => {
    const OLD_ENV = process.env;
    let envSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...OLD_ENV };
        envSpy = jest.spyOn(envModule, 'env');
    });

    afterEach(() => {
        envSpy.mockRestore();
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('should return true if NODE_ENV is development', () => {
        envSpy.mockImplementation((key, fallback) =>
            key === 'NODE_ENV' ? 'development' : fallback,
        );
        expect(getCorsOrigins()).toBe(true);
    });

    it('should return true if NODE_ENV is local', () => {
        envSpy.mockImplementation((key, fallback) =>
            key === 'NODE_ENV' ? 'local' : fallback,
        );
        expect(getCorsOrigins()).toBe(true);
    });

    it('should return true if NODE_ENV is test', () => {
        envSpy.mockImplementation((key, fallback) =>
            key === 'NODE_ENV' ? 'test' : fallback,
        );
        expect(getCorsOrigins()).toBe(true);
    });

    it('should return true if CORS_ALLOWED_ORIGINS is not set', () => {
        envSpy.mockImplementation((key, fallback) => {
            if (key === 'NODE_ENV') return 'production';
            if (key === 'CORS_ALLOWED_ORIGINS') return undefined;
            return fallback;
        });
        expect(getCorsOrigins()).toBe(true);
    });

    it('should return a string if CORS_ALLOWED_ORIGINS has one origin', () => {
        envSpy.mockImplementation((key, fallback) => {
            if (key === 'NODE_ENV') return 'production';
            if (key === 'CORS_ALLOWED_ORIGINS') return 'https://example.com';
            return fallback;
        });
        expect(getCorsOrigins()).toBe('https://example.com');
    });

    it('should return an array if CORS_ALLOWED_ORIGINS has multiple origins', () => {
        envSpy.mockImplementation((key, fallback) => {
            if (key === 'NODE_ENV') return 'production';
            if (key === 'CORS_ALLOWED_ORIGINS')
                return 'https://a.com,https://b.com';
            return fallback;
        });
        expect(getCorsOrigins()).toEqual(['https://a.com', 'https://b.com']);
    });

    it('should trim whitespace around origins', () => {
        envSpy.mockImplementation((key, fallback) => {
            if (key === 'NODE_ENV') return 'production';
            if (key === 'CORS_ALLOWED_ORIGINS')
                return ' https://a.com , https://b.com ';
            return fallback;
        });
        expect(getCorsOrigins()).toEqual([
            ' https://a.com ',
            ' https://b.com ',
        ]);
    });
});
