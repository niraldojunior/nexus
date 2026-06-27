import os from 'os';

export const getLogLevel = (level: string | undefined): string => {
    switch (level?.toLowerCase()) {
        case 'trace':
            return 'trace';
        case 'debug':
            return 'debug';
        case 'warn':
            return 'warn';
        case 'error':
            return 'error';
        default:
            return 'info';
    }
};

const loadNs = process.hrtime();
const loadMs = new Date().getTime();

export const nanoseconds = (): bigint => {
    const diffNs = process.hrtime(loadNs);
    return BigInt(loadMs) * BigInt(1e6) + BigInt(diffNs[0] * 1e9 + diffNs[1]);
};

const cpus = os.cpus();

const getCpuLoadAvg = (avg: number[]) => {
    return {
        ['1m']: `${Math.round(avg[0] * 100)}%`,
        ['5m']: `${Math.round(avg[1] * 100)}%`,
        ['15m']: `${Math.round(avg[2] * 100)}%`,
    };
};

export const sysinfo = (): object => {
    return {
        system: os.type(),
        platform: os.platform(),
        server: os.hostname(),
        arch: os.arch(),
        machine: os.machine(),
        endianness: os.endianness(),
        cpu_model: cpus[0]?.model,
        cpus: cpus.length,
        cpu_speed: cpus[0]?.speed,
        cpu_load_avg: getCpuLoadAvg(os.loadavg()),
        mem_free: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
        mem_total: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
        uptime: os.uptime(),
    };
};
