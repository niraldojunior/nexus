export const trimHbsUtil = (data = ''): string =>
    data
        .replace(/\n+\s*/g, ' ')
        .replace(/":\s/g, '":')
        .replace(/}}}/g, '}} }')
        .trim();
