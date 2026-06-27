import { Inject, OnModuleInit } from '@nestjs/common';
// import { OnEvent } from '@nestjs/event-emitter';
import * as Handlebars from 'handlebars';

import { UnprocessableEntityError } from '@/shared/application/error/unprocessable-entity.error';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeParse, safeStringify } from '@/shared/util/json.util';

export interface TransformationSource {
    name: string;
    target: string;
    version: string;
    type: number;
}

export interface TransformationContext {
    originalData: any;
    transformedData: any;
    source: string;
    metadata: Record<string, any>;
}

export interface PreProcessor {
    name: string;
    path: string;
    processor: (value: any) => any;
}

export class TemplateTransformationRule {
    source: string;
    template: HandlebarsTemplateDelegate;
    helpers?: Record<string, (...args: any[]) => any>;
    preProcessors?: PreProcessor[];

    constructor(init: Partial<TemplateTransformationRule>) {
        Object.assign(this, init);
    }
}

const TEMPLATE_LIMIT = 100;
const TEMPLATE_DEFAULT =
    '{"config":{},"queryParams":{{json queryParams}},"params":{{json params}},"headers": {{json headers}},"body": {{json body}} }';
// '{"queryParams":{ {{#if queryParams}} {{#each queryParams}} "{{@key}}": "{{this}}" {{/each}} {{/if}} },"headers":{ {{#if headers}} {{#each headers}} "{{@key}}": "{{this}}" {{/each}} {{/if}} },"body":{ {{#if body}} {{#each body}} "{{@key}}": "{{this}}" {{/each}} {{/if}} }';

export class HandlebarsService implements OnModuleInit {
    private templates = new Map<string, HandlebarsTemplateDelegate>();
    private logData = {
        context: this.constructor.name,
        description: 'Handlebars Service',
    };

    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
    ) {
        this.registerBuiltInHelpers();
    }

    onModuleInit(): void {
        this.setFallbackTemplate();
    }

    getTemplates(): Map<string, HandlebarsTemplateDelegate> {
        return this.templates;
    }

    // This only works if there are only one app running, so we'll need to consult
    // Redis/DB to make it work in a distributed environment
    // @OnEvent('template.created')
    // @OnEvent('template.updated')
    loadTemplate(source: TransformationSource, templateString: string): void {
        if (this.templates.size > TEMPLATE_LIMIT) {
            this.clearTemplates();
        }

        const key = this.getTemplateKey(source);

        if (!templateString) {
            this.logger.warn(
                this.logData,
                safeStringify({
                    message: 'Template string is empty, skipping load.',
                    key,
                }),
            );
            return;
        }
        const template = Handlebars.compile(templateString);
        this.templates.set(key, template);

        this.logger.info(
            this.logData,
            safeStringify({
                message: 'Loaded template',
                key,
            }),
        );
    }

    // This only works if there are only one app running, so we'll need to consult
    // Redis/DB to make it work in a distributed environment
    // @OnEvent('template.deleted')
    clearTemplates(key?: string | TransformationSource): void {
        let message = 'Clearing templates';

        if (key && typeof key !== 'string') {
            key = this.getTemplateKey(key);
            message += ` with key: ${key}`;
        }

        this.logger.info(this.logData, safeStringify({ message }));

        if (!key) {
            this.templates.clear();
            return;
        }
        this.templates.delete(key);
    }

    transform(
        input: TransformationSource & {
            helpers?: Record<string, (...args: any[]) => any>;
            preProcessors?: PreProcessor[];
            data: {
                queryParams: Record<string, string>;
                params: Record<string, string>;
                headers: Record<string, string>;
                body: any;
            };
        },
        fallback?: boolean,
    ): any {
        const { name, target, version, type, helpers, preProcessors, data } =
            input;

        data.queryParams ??= {};
        data.params ??= {};
        data.headers ??= {};
        data.body ??= {};

        const key = this.getTemplateKey({
            name,
            target,
            version,
            type,
        });

        let template = this.templates.get(key);

        if (!template && fallback) {
            template = this.getFallbackTemplate();
        }

        if (!template) {
            throw new UnprocessableEntityError(
                `No transformation rule found for source: ${key}`,
            );
        }

        const rule = this.createRule({
            source: key,
            template,
            helpers,
            preProcessors,
        });

        if (!rule) {
            throw new UnprocessableEntityError(
                `No transformation rule found for source: ${origin}`,
            );
        }

        return this.applyTemplateTransformation(data, rule);
    }

    hasKey(source: TransformationSource): boolean {
        return this.templates.has(this.getTemplateKey(source));
    }

    private getTemplateKey(source: TransformationSource): string {
        return `${source.target}_${source.name}_v${source.version}_${source.type}`;
    }

    private createRule(
        init: Partial<TemplateTransformationRule>,
    ): TemplateTransformationRule {
        return new TemplateTransformationRule(init);
    }

    private setFallbackTemplate(): void {
        const template = Handlebars.compile(TEMPLATE_DEFAULT);
        this.templates.set(
            this.getTemplateKey({
                name: 'default',
                target: 'fallback',
                version: '1',
                type: 0,
            }),
            template,
        );
    }

    private getFallbackTemplate(): HandlebarsTemplateDelegate | undefined {
        const key = this.getTemplateKey({
            name: 'default',
            target: 'fallback',
            version: '1',
            type: 0,
        });
        this.logger.warn(
            this.logData,
            `Using fallback template for key: ${key}`,
        );
        return this.templates.get(key);
    }

    private registerBuiltInHelpers(): void {
        // ===== STRING TRANSFORMATION HELPERS =====
        Handlebars.registerHelper('upper', (str: string) => str?.toUpperCase());
        Handlebars.registerHelper('lower', (str: string) => str?.toLowerCase());
        Handlebars.registerHelper('camelCase', (str: string) =>
            str
                ?.toLowerCase()
                .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase()),
        );
        Handlebars.registerHelper('trim', (str: string) => str?.trim());
        Handlebars.registerHelper('reverse', (str: string) =>
            str?.split('').reverse().join(''),
        );

        // ===== REGEX HELPERS =====
        Handlebars.registerHelper(
            'regex',
            (str: string, pattern: string, replacement: string | object) => {
                if (!str) return str;
                const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
                if (!match) return str;
                const [, regexBody, flags] = match;
                replacement =
                    typeof replacement === 'string' ? replacement : '';
                return str.replace(new RegExp(regexBody, flags), replacement);
            },
        );

        Handlebars.registerHelper(
            'regexTest',
            (str: string, pattern: string) => {
                if (!str) return false;
                const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
                if (!match) return str;
                const [, regexBody, flags] = match;
                const regex = new RegExp(regexBody, flags);
                return regex.test(str);
            },
        );

        Handlebars.registerHelper(
            'regexExtract',
            (str: string, pattern: string, group = 0) => {
                if (!str) return null;
                const match = str.match(new RegExp(pattern));
                return match ? match[group] : null;
            },
        );

        // ===== MATHEMATICAL OPERATIONS =====
        Handlebars.registerHelper('add', (a: number, b: number) => a + b);
        Handlebars.registerHelper('subtract', (a: number, b: number) => a - b);
        Handlebars.registerHelper('multiply', (a: number, b: number) => a * b);
        Handlebars.registerHelper('divide', (a: number, b: number) =>
            b !== 0 ? a / b : 0,
        );
        Handlebars.registerHelper(
            'round',
            (num: number, decimals = 0) =>
                Math.round(num * Math.pow(10, decimals)) /
                Math.pow(10, decimals),
        );

        // ===== DATE OPERATIONS =====
        Handlebars.registerHelper(
            'formatDate',
            (date: string, format = 'ISO') => {
                const d = new Date(date);
                switch (format) {
                    case 'ISO':
                        return d.toISOString();
                    case 'YYYY-MM-DD':
                        return d.toISOString().split('T')[0];
                    case 'DD/MM/YYYY':
                        return d.toLocaleDateString('pt-BR');
                    case 'MM/DD/YYYY':
                        return d.toLocaleDateString('en-US');
                    case 'timestamp':
                        return d.getTime();
                    default:
                        return d.toString();
                }
            },
        );

        // ===== ARRAY TO OBJECT CONVERSION (from example 2) =====
        Handlebars.registerHelper(
            'arrayToObject',
            (array: any[], keyField: string, valueField?: string) => {
                if (!Array.isArray(array)) return {};
                return array.reduce((obj, item) => {
                    const key = item[keyField];
                    const value = valueField ? item[valueField] : item;
                    obj[key] = value;
                    return obj;
                }, {});
            },
        );

        // ===== EXTRACT HELPER (from example 2) =====
        Handlebars.registerHelper('extract', (obj: any, path: string) => {
            return path
                .split('.')
                .reduce((current, key) => current?.[key], obj);
        });

        // ===== MAP ARRAY HELPER (from example 2) =====
        Handlebars.registerHelper(
            'mapArray',
            (array: any[], callback: (...args: any[]) => any) => {
                if (!Array.isArray(array)) return [];
                return array.map((item, index) => callback(item, index));
            },
        );

        // ===== ADVANCED ARRAY OPERATIONS =====
        Handlebars.registerHelper(
            'filter',
            (array: any[], property: string, value: any) => {
                if (!Array.isArray(array)) return [];
                return array.filter((item) => item[property] === value);
            },
        );

        Handlebars.registerHelper(
            'groupBy',
            (array: any[], keyField: string) => {
                if (!Array.isArray(array)) return {};
                return array.reduce((groups, item) => {
                    const key = item[keyField];
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(item);
                    return groups;
                }, {});
            },
        );

        Handlebars.registerHelper(
            'unique',
            (array: any[], property?: string) => {
                if (!Array.isArray(array)) return [];
                if (property) {
                    const seen = new Set();
                    const uniqueValues: any[] = [];

                    array.forEach((item) => {
                        // Support nested property paths like "categoria.nome"
                        const value = property
                            .split('.')
                            .reduce((current, key) => current?.[key], item);
                        if (
                            !seen.has(value) &&
                            value !== undefined &&
                            value !== null
                        ) {
                            seen.add(value);
                            uniqueValues.push(value); // Push the VALUE, not the item
                        }
                    });

                    return uniqueValues;
                }
                return [...new Set(array)];
            },
        );

        Handlebars.registerHelper('rest', (context) =>
            typeof context === 'object' ? { ...context } : {},
        );
        Handlebars.registerHelper('json', (context) => safeStringify(context));

        // ===== CUSTOM FUNCTION EXECUTOR =====
        Handlebars.registerHelper(
            'exec',
            (value: any, functionName: string, ...args: any[]) => {
                return this.executeCustomFunction(
                    value,
                    functionName,
                    args.slice(0, -1),
                ); // Remove Handlebars context
            },
        );

        // Evaluate expressions - Dangerous, use with caution
        // Handlebars.registerHelper('eval', (exp: 'string', ...args: any[]) => {
        //     const func = eval(`${exp}`);
        //     return func(...args);
        // });

        // ===== CONDITIONAL TRANSFORMATIONS =====
        Handlebars.registerHelper(
            'transform',
            (
                value: any,
                condition: string,
                trueTransform: string,
                falseTransform?: string,
            ) => {
                const conditionResult = this.evaluateCondition(
                    value,
                    condition,
                );
                const transform = conditionResult
                    ? trueTransform
                    : falseTransform;
                return transform
                    ? this.executeCustomFunction(value, transform, [])
                    : value;
            },
        );

        // ===== BUSINESS LOGIC HELPERS =====
        Handlebars.registerHelper(
            'formatCurrency',
            (value: number, currency = 'BRL', locale = 'pt-BR') => {
                return new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency,
                }).format(value);
            },
        );

        Handlebars.registerHelper(
            'maskDocument',
            (doc: string, type: string) => {
                if (type === 'cpf') {
                    return doc?.replace(
                        /(\d{3})(\d{3})(\d{3})(\d{2})/,
                        '$1.$2.$3-$4',
                    );
                } else if (type === 'cnpj') {
                    return doc?.replace(
                        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
                        '$1.$2.$3/$4-$5',
                    );
                } else if (type === 'phone') {
                    return doc?.replace(
                        /(\d{2})(\d{4,5})(\d{4})/,
                        '($1) $2-$3',
                    );
                }
                return doc;
            },
        );

        // ===== OBJECT MANIPULATION =====
        Handlebars.registerHelper(
            'objectToArray',
            (obj: any, keyField = 'key', valueField = 'value') => {
                if (typeof obj !== 'object' || obj === null) return [];
                return Object.entries(obj).map(([key, value]) => ({
                    [keyField]: key,
                    [valueField]: value,
                }));
            },
        );

        Handlebars.registerHelper('flatten', (obj: any, separator = '.') => {
            const result: any = {};

            function recurse(current: any, property: string) {
                if (Object(current) !== current) {
                    result[property] = current;
                } else if (Array.isArray(current)) {
                    current.forEach((item, index) => {
                        recurse(item, `${property}${separator}${index}`);
                    });
                } else {
                    Object.keys(current).forEach((key) => {
                        recurse(
                            current[key],
                            property ? `${property}${separator}${key}` : key,
                        );
                    });
                }
            }

            recurse(obj, '');
            return result;
        });

        // ===== VALIDATION HELPERS =====
        Handlebars.registerHelper('isEmail', (str: string) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str || '');
        });

        Handlebars.registerHelper('isPhone', (str: string) => {
            return /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(str || '');
        });

        Handlebars.registerHelper('isEmpty', (value: any) => {
            return (
                !value ||
                (typeof value === 'string' && value.trim() === '') ||
                (Array.isArray(value) && value.length === 0) ||
                (typeof value === 'object' && Object.keys(value).length === 0)
            );
        });
    }

    private executeCustomFunction(
        value: any,
        functionName: string,
        args: any[],
    ): any {
        const functions: Record<string, (...args: any[]) => any> = {
            // String functions
            upper: (v: string) => v?.toUpperCase(),
            lower: (v: string) => v?.toLowerCase(),
            trim: (v: string) => v?.trim(),
            reverse: (v: string) => v?.split('').reverse().join(''),

            // Regex functions
            regexReplace: (v: string, pattern: string, replacement: string) =>
                v?.replace(new RegExp(pattern, 'g'), replacement),
            regexExtract: (v: string, pattern: string, group = 0) => {
                const match = v?.match(new RegExp(pattern));
                return match ? match[group] : null;
            },

            // Number functions
            toFixed: (v: number, decimals = 2) => Number(v).toFixed(decimals),
            parseInt: (v: string, radix = 10) => parseInt(v, radix),
            parseFloat: (v: string) => parseFloat(v),

            // Custom business logic
            formatCurrency: (v: number, currency = 'BRL') =>
                new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency,
                }).format(v),

            maskCPF: (v: string) =>
                v?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),

            slugify: (v: string) =>
                v
                    ?.toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/[\s_-]+/g, '-')
                    .replace(/^-+|-+$/g, ''),

            padStart: (v: string, length: number, padString = ' ') =>
                String(v).padStart(length, padString),

            isGreaterThan: (v: number, threshold: number) => v > threshold,
        };

        const func = functions[functionName];
        return func ? func(value, ...args) : value;
    }

    private evaluateCondition(value: any, condition: string): boolean {
        const conditions: Record<string, (...args: any[]) => any> = {
            isString: (v: any) => typeof v === 'string',
            isNumber: (v: any) => typeof v === 'number',
            isEmpty: (v: any) => !v || v.length === 0,
            isEmail: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            isPhone: (v: string) => /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(v),
            isPositive: (v: number) => typeof v === 'number' && v > 0,
            isValidCPF: (v: string) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v),
        };

        return conditions[condition] ? conditions[condition](value) : false;
    }

    private applyTemplateTransformation(
        data: any,
        rule: TemplateTransformationRule,
    ): any {
        // Apply pre-processors
        let processedData = data;
        if (rule.preProcessors) {
            processedData = this.applyPreProcessors(data, rule.preProcessors);
        }

        // Register custom helpers if any
        if (rule.helpers) {
            Object.entries(rule.helpers).forEach(([name, helper]) => {
                Handlebars.registerHelper(name, helper as any);
            });
        }

        // Compile and execute template
        // const template = Handlebars.compile(rule.template);
        const result: string = rule.template(processedData);

        // Parse the result if it's JSON string
        return this.decodeNested(result);
    }

    private encodeHtml(str: string): string {
        if (typeof str !== 'string') {
            return str;
        }

        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '=': '&#x3D;',
        };
        return str.replace(/[&<>"'=]/g, (m) => map[m]);
    }

    private decodeHtml(str: string): string {
        if (typeof str !== 'string') {
            return str;
        }

        const map = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&#x3D;': '=',
        };
        return str.replace(/&(amp|lt|gt|quot|#39|#x3D);/g, (m) => map[m]);
    }

    private applyPreProcessors(data: any, processors: PreProcessor[]): any {
        const result = { ...data };

        processors.forEach((processor) => {
            const value = this.getNestedValue(result, processor.path);
            const processedValue = processor.processor(value);
            this.setNestedValue(result, processor.path, processedValue);
        });

        return result;
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    private setNestedValue(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        const lastKey = keys.pop() as any;
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    private decodeNested(object: Record<string, any> | string): any {
        const result: Record<string, any> = {};

        try {
            if (typeof object === 'string') {
                object = this.decodeHtml(object);
                object = safeParse(object) || object;
            }

            if (
                typeof object !== 'object' ||
                object === null ||
                Array.isArray(object)
            ) {
                return object;
            }

            Object.entries(object).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    value = this.decodeHtml(value);
                    result[key] = safeParse(value) || value;
                } else if (
                    typeof value === 'object' &&
                    value !== null &&
                    !Array.isArray(value)
                ) {
                    result[key] = this.decodeNested(value);
                } else {
                    result[key] = value;
                }
            });
            return result;
        } catch (_) {
            return safeParse(object as string) || object;
        }
    }
}
