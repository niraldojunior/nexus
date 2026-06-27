export class RmqBaseRequestDto<T, P = string> {
    data: T;
    pattern: P;
    retries: number;

    constructor(data: T, pattern: P, retries = 0) {
        if (!(data && typeof data === 'object')) {
            throw new Error('Data must be a valid object');
        }

        if (!(pattern && typeof pattern === 'string')) {
            throw new Error('Pattern must be a valid string');
        }

        if (
            typeof retries !== 'number' ||
            retries < 0 ||
            !Number.isInteger(retries) ||
            isNaN(retries)
        ) {
            throw new Error('Retries must be a non-negative integer');
        }

        this.data = data;
        this.pattern = pattern;
        this.retries = retries;
    }
}
