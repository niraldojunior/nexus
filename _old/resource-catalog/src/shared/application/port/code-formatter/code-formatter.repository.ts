import { Options } from 'prettier';

export const FileType = {
    HBS: 'hbs',
} as const;

export type FileType = (typeof FileType)[keyof typeof FileType];

export interface CodeFormatterPort {
    formatHbs(input: string, options?: Options): Promise<string>;
}
