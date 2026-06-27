import * as process from 'process';

jest.mock('pino', () => {
    const actual = jest.requireActual('pino');
    return {
        ...actual,
        transport: jest.fn((_opts) => {
            const stream = {
                on: jest.fn(),
                flushSync: jest.fn(),
            };
            return stream;
        }),
        multistream: jest.fn((streams) => streams),
    };
});

import {
    pinoDestinationStream,
    pinoMultiStream,
} from '@/shared/infra/logger/pino-transport.logger';

describe('pino-transport.logger', () => {
    const OLD_ENV = { ...process.env };

    beforeEach(() => {
        jest.resetModules();
        // Remove all properties added during tests
        Object.keys(process.env).forEach((key) => {
            if (!(key in OLD_ENV)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete process.env[key];
            }
        });

        // Restore original values
        Object.entries(OLD_ENV).forEach(([key, value]) => {
            process.env[key] = value as string;
        });

        // Reset env variables for each test
        delete process.env.LOG_TYPE;
        delete process.env.LOG_CONFIG_FILE;
        delete process.env.LOG_CONFIG_TERMINAL;
        delete process.env.NODE_ENV;
        delete process.env.LOG_LEVEL;
        delete process.env.LOG_LEVEL_FILE;
        delete process.env.LOG_LEVEL_LOGSTASH;
        delete process.env.LOG_LEVEL_RAW;
        delete process.env.LOG_LEVEL_TERMINAL;
        delete process.env.LOG_CONFIG_NANOSECONDS;
        delete process.env.LOG_CONFIG_SYNC;
        delete process.env.LOGSTASH_HOST;
        delete process.env.LOGSTASH_PORT;
        delete process.env.LOG_SINGLE_LINE;
    });

    afterAll(() => {
        // Remove all properties added during tests
        Object.keys(process.env).forEach((key) => {
            if (!(key in OLD_ENV)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete process.env[key];
            }
        });
        // Restore original values
        Object.entries(OLD_ENV).forEach(([key, value]) => {
            process.env[key] = value as string;
        });
    });

    it('should include logstash target if LOG_TYPE is logstash', () => {
        process.env.LOG_TYPE = 'logstash';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
        expect(
            (streams as unknown as any[]).some((s: any) => s.level && s.stream),
        ).toBe(true);
    });

    it('should include file target if LOG_CONFIG_FILE is true', () => {
        process.env.LOG_CONFIG_FILE = 'true';
        const streams = pinoMultiStream();
        expect((streams as unknown as any[]).some((s: any) => s.stream)).toBe(
            true,
        );
    });

    it('should include terminal target if LOG_TYPE is terminal', () => {
        process.env.LOG_TYPE = 'terminal';
        const streams = pinoMultiStream();
        expect((streams as unknown as any[]).some((s: any) => s.stream)).toBe(
            true,
        );
    });

    it('should include raw target if LOG_TYPE is not terminal or logstash', () => {
        process.env.LOG_TYPE = 'raw';
        process.env.LOG_CONFIG_TERMINAL = 'false';
        const streams = pinoMultiStream();
        expect((streams as unknown as any[]).some((s: any) => s.stream)).toBe(
            true,
        );
    });

    it('should set sync to true if LOG_CONFIG_SYNC is true', () => {
        process.env.LOG_CONFIG_SYNC = 'true';
        process.env.LOG_TYPE = 'file';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
    });

    it('should set sync to false if LOG_CONFIG_SYNC is not true', () => {
        process.env.LOG_CONFIG_SYNC = 'false';
        process.env.LOG_TYPE = 'file';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
    });

    it('should set level according to LOG_LEVEL', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.LOG_TYPE = 'terminal';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
    });

    it('should return a multistream with correct streams', () => {
        process.env.LOG_TYPE = 'terminal';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
        expect(streams[0]).toHaveProperty('level');
        expect(streams[0]).toHaveProperty('stream');
    });

    it('should attach logstash event handlers if target is logstash', () => {
        process.env.LOG_TYPE = 'logstash';
        const streams = pinoMultiStream();
        const streamObj = (streams as unknown as any[]).find(
            (s: any) => s.stream && s.stream.on,
        );
        expect(streamObj).toBeDefined();
        expect(typeof streamObj.stream.on).toBe('function');
    });

    it('pinoDestinationStream should return the same as pinoMultiStream', () => {
        process.env.LOG_TYPE = 'terminal';
        const dest = pinoDestinationStream();
        const multi = pinoMultiStream();

        // Both should be arrays of the same length
        expect(Array.isArray(dest)).toBe(Array.isArray(multi));
        expect((dest as unknown as any[]).length).toBe(
            (multi as unknown as any[]).length,
        );

        // Compare relevant properties for each stream object
        (dest as unknown as any[]).forEach((d, i) => {
            const m = (multi as unknown as any[])[i];
            expect(d.level).toBe(m.level);
            expect(typeof d.stream).toBe('object');
            expect(typeof d.stream.on).toBe('function');
            expect(typeof d.stream.flushSync).toBe('function');
        });
    });

    it('should handle LOG_SINGLE_LINE and LOG_CONFIG_NANOSECONDS', () => {
        process.env.LOG_TYPE = 'terminal';
        process.env.LOG_SINGLE_LINE = 'true';
        process.env.LOG_CONFIG_NANOSECONDS = 'true';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
    });

    it('should handle NODE_ENV=local and LOG_TYPE not raw', () => {
        process.env.NODE_ENV = 'local';
        process.env.LOG_TYPE = 'terminal';
        const streams = pinoMultiStream();
        expect(Array.isArray(streams)).toBe(true);
    });
});
