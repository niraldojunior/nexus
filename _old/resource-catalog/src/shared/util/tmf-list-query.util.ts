import { BadRequestException } from '@nestjs/common';

export const TMF_LIST_DEFAULT_OFFSET = 0;
export const TMF_LIST_DEFAULT_LIMIT = 20;
export const TMF_LIST_MAX_LIMIT = 200;

export interface PaginationInput {
    offset?: number;
    limit?: number;
}

export function normalizePagination(input?: PaginationInput): {
    offset: number;
    limit: number;
} {
    const offset = Math.max(input?.offset ?? TMF_LIST_DEFAULT_OFFSET, 0);
    const limit = Math.min(
        Math.max(input?.limit ?? TMF_LIST_DEFAULT_LIMIT, 1),
        TMF_LIST_MAX_LIMIT,
    );

    return { offset, limit };
}

export function parseRequestedFields(
    rawFields: string | undefined,
    allowedFields: readonly string[],
): string[] | undefined {
    if (!rawFields || !rawFields.trim()) {
        return undefined;
    }

    const parsed = rawFields
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);

    if (!parsed.length) {
        return undefined;
    }

    const invalid = parsed.filter((field) => !allowedFields.includes(field));

    if (invalid.length) {
        throw new BadRequestException(
            `Invalid fields parameter: ${invalid.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`,
        );
    }

    return Array.from(new Set(parsed));
}

export function filterByRequestedFields<T extends Record<string, unknown>>(
    source: T,
    requestedFields?: string[],
): Partial<T> {
    if (!requestedFields?.length) {
        return source;
    }

    const picked: Partial<T> = {};
    for (const field of requestedFields) {
        if (field in source) {
            picked[field as keyof T] = source[field as keyof T];
        }
    }

    return picked;
}
