import { XMLParser } from 'fast-xml-parser';

import { BadRequestError } from '@/shared/application/error/bad-request.error';

export const getTextFromXml = (tag: string, xml: string): string => {
    const regex = new RegExp(`<${tag}>(.*?)<\\/${tag}>`);
    return xml.replace(/\\"/g, '"').match(regex)?.[1]?.trim() || '';
};

export const trimXmlBody = (xml: string): string => {
    return xml.replace(/>\s+</g, '><').replace(/\n\s+/g, ' ').trim();
};

export const xmlToJson = (value: string): any => {
    if (!value) return value;

    let dtoObject: any;

    if (typeof value === 'string') {
        try {
            const parser = new XMLParser({
                ignoreAttributes: false,
                removeNSPrefix: true,
            });
            const parsed = parser.parse(value);

            dtoObject = parsed;
        } catch (_) {
            throw new BadRequestError('XML inválido');
        }
    } else {
        dtoObject = value;
    }

    return dtoObject;
};
