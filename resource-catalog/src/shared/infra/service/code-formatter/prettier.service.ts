import { Inject } from '@nestjs/common';
import { format as prettierFormat, Options, RequiredOptions } from 'prettier';

import { CodeFormatterPort } from '@/shared/application/port/code-formatter/code-formatter.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class PrettierService implements CodeFormatterPort {
    private readonly OPTIONS: Partial<RequiredOptions> = {
        arrowParens: 'always',
        bracketSpacing: true,
        endOfLine: 'lf',
        htmlWhitespaceSensitivity: 'css',
        insertPragma: false,
        singleAttributePerLine: true,
        bracketSameLine: false,
        jsxBracketSameLine: false,
        jsxSingleQuote: false,
        printWidth: 80,
        proseWrap: 'preserve',
        quoteProps: 'as-needed',
        requirePragma: false,
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        trailingComma: 'es5',
        useTabs: false,
        embeddedLanguageFormatting: 'auto',
        vueIndentScriptAndStyle: false,
        experimentalTernaries: false,
    };

    constructor(
        @Inject(LoggerService) private readonly logger: LoggerService,
    ) {}

    async formatHbs(input: string, options: Options = {}): Promise<string> {
        return await this.format(input, {
            ...this.OPTIONS,
            parser: 'glimmer',
            ...options,
        }).catch((err) => {
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    message: 'Error formatting HBS code',
                    name: err.name,
                    err: err.message,
                    reason: err.reason,
                    stack: err.stack,
                }),
            );
            throw err;
        });
    }

    async formatJson(input: string, options: Options = {}): Promise<string> {
        return await this.format(input, {
            ...this.OPTIONS,
            parser: 'babel',
            ...options,
        }).catch((err) => {
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    message: 'Error formatting JSON code',
                    name: err.name,
                    err: err.message,
                    reason: err.reason,
                    stack: err.stack,
                }),
            );
            throw err;
        });
    }

    private async format(input: string, options?: Options): Promise<string> {
        return prettierFormat(input, options);
    }
}
