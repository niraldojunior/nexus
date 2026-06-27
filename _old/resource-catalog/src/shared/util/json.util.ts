// import { inspect } from 'util';

// Removes circular references from the object
export const safeStringify = (data: any, spaces?: number): string => {
    if (typeof data === 'string') return data;
    try {
        const seen = new WeakSet();
        return JSON.stringify(
            data,
            (_, v) => {
                if (v !== null && typeof v === 'object') {
                    if (seen.has(v)) return;
                    seen.add(v);
                }
                return v;
            },
            spaces,
        );

        // Another solution, but it seems to cause data loss
        // return JSON.stringify(inspect(obj));
    } catch (_) {
        return '';
    }
};

export const safeParse = (str: string): any | null => {
    if (typeof str !== 'string') return null;
    try {
        return JSON.parse(str);
    } catch (_) {
        return null;
    }
};
