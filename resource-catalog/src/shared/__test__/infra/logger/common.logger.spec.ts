import * as os from 'os';

import {
    getLogLevel,
    nanoseconds,
    sysinfo,
} from '@/shared/infra/logger/common.logger';

describe('common.logger', () => {
    describe('getLogLevel', () => {
        it('should return correct log level for known levels', () => {
            expect(getLogLevel('trace')).toBe('trace');
            expect(getLogLevel('debug')).toBe('debug');
            expect(getLogLevel('warn')).toBe('warn');
            expect(getLogLevel('error')).toBe('error');
        });

        it('should return info for unknown or undefined levels', () => {
            expect(getLogLevel('unknown')).toBe('info');
            expect(getLogLevel(undefined)).toBe('info');
            expect(getLogLevel('INFO')).toBe('info');
        });

        it('should be case-insensitive', () => {
            expect(getLogLevel('DEBUG')).toBe('debug');
            expect(getLogLevel('Warn')).toBe('warn');
        });
    });

    describe('nanoseconds', () => {
        it('should return a bigint', () => {
            const ns = nanoseconds();
            expect(typeof ns).toBe('bigint');
        });

        it('should increase over time', () => {
            const ns1 = nanoseconds();
            setTimeout(() => {
                const ns2 = nanoseconds();
                expect(ns2 > ns1).toBe(true);
            }, 1);
        });
    });

    describe('sysinfo', () => {
        it('should return system info object with expected keys', () => {
            const info = sysinfo();
            expect(info).toHaveProperty('system', os.type());
            expect(info).toHaveProperty('platform', os.platform());
            expect(info).toHaveProperty('server', os.hostname());
            expect(info).toHaveProperty('arch', os.arch());
            expect(info).toHaveProperty('machine', os.machine());
            expect(info).toHaveProperty('endianness', os.endianness());
            expect(info).toHaveProperty('cpu_model');
            expect(info).toHaveProperty('cpus', os.cpus().length);
            expect(info).toHaveProperty('cpu_speed');
            expect(info).toHaveProperty('cpu_load_avg');
            expect(info).toHaveProperty('mem_free');
            expect(info).toHaveProperty('mem_total');
            expect(info).toHaveProperty('uptime');
        });

        it('should format cpu_load_avg as percentages', () => {
            const info = sysinfo() as any;
            expect(info.cpu_load_avg['1m']).toMatch(/^\d+%$/);
            expect(info.cpu_load_avg['5m']).toMatch(/^\d+%$/);
            expect(info.cpu_load_avg['15m']).toMatch(/^\d+%$/);
        });

        it('should format mem_free and mem_total as MB strings', () => {
            const info = sysinfo() as any;
            expect(info.mem_free).toMatch(/MB$/);
            expect(info.mem_total).toMatch(/MB$/);
        });
    });
});
