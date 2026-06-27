export const getCurrentDate = (): string => {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .split('Z')[0];
};

export const formatDate = (
    date: Date,
): { formatYYYYMMDD: string; formatHHMM: string } => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
        formatYYYYMMDD: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
        formatHHMM: `${pad(date.getHours())}${pad(date.getMinutes())}`,
    };
};

export const elapsedTime = (ms: number): string => {
    const seconds = Math.floor(Math.abs(ms / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    const t = [h, m > 9 ? m : h ? '0' + m : m || '0', s > 9 ? s : '0' + s]
        .filter(Boolean)
        .join(':');
    return ms < 0 && seconds ? `-${t}` : t;
};

export const elapsedTimeDetailed = (ms: number): string => {
    const seconds = Math.floor(Math.abs(ms / 1000));
    const min = Math.floor((seconds % 3600) / 60);

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds / 3600) % 24);
    const m = min > 9 ? min : h ? 0 + min : min || 0;
    const s = Math.round(seconds % 60);

    if (d > 0) return `${d}d${h}h${m}m${s}s`;
    else if (h > 0) return `${h}h${m}m${s}s`;
    else if (m > 0) return `${m}m${s}s`;
    else if (s > 9) return `${s}s`;
    else if (s > 0) return `${s}.${Math.floor(ms / 100)}s`;
    else return `${ms}ms`;
};
