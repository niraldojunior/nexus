import { randomUUID } from 'node:crypto';

export const createCanonicalId = (): string => randomUUID();
