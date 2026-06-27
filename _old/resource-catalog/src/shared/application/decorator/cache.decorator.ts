import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

import { fnv1a } from '@/shared/util/hash.util';
import { safeStringify } from '@/shared/util/json.util';

export function CacheMethod(ttl?: number): MethodDecorator {
    return function (
        target: any,
        propertyKey: string | symbol,
        descriptor: any,
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const className = target.constructor.name;
            const methodName = propertyKey;
            const alias = `${className}.${methodName as string}`;
            const preHash = `${alias}-${safeStringify({ ...args })}`;
            const key = fnv1a(preHash);

            const cacheService: Cache = this.cache || this.cacheService;
            if (!cacheService) {
                Logger.error(`No cache service for: ${alias}`);
                throw new Error(alias);
            }

            const cached = await cacheService.get(key);

            if (cached) {
                return cached;
            }

            const response = await originalMethod.apply(this, args);
            await cacheService.set(key, response, ttl ?? undefined);
            return response;
        };

        return descriptor;
    };
}
