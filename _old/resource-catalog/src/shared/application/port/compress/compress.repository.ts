export const CompressAlgorithm = {
    UTF16: 'UTF16',
    BASE64: 'BASE64',
    ENCODED_URI_COMPONENT: 'ENCODED_URI_COMPONENT',
    UINT8: 'UINT8',
    DEFAULT: 'DEFAULT',
} as const;

export type CompressAlgorithm =
    (typeof CompressAlgorithm)[keyof typeof CompressAlgorithm];

export interface CompressOptions {
    algorithm?: (typeof CompressAlgorithm)[keyof typeof CompressAlgorithm];
}

export interface CompressPort {
    compress(input: string, options?: CompressOptions): string;
    decompress(input: string, options?: CompressOptions): string;
}
