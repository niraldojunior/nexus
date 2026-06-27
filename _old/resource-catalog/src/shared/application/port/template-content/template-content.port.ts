export interface TemplateContentPort {
    getTemplate(key: {
        target: string;
        name: string;
        version: string;
        type: 0 | 1;
    }): Promise<string | null>;
}

export const TemplateContentPort = Symbol('TemplateContentPort');
