import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import type { Keyv } from 'keyv';

import { safeStringify } from '@/shared/util/json.util';

import { EnvironmentConfigService } from '../../config/env/environment-config.service';
import { LoggerService } from '../../logger/logger.service';

@Injectable()
export class CacheService {
    private readonly type: string;
    private readonly ttl: number;

    constructor(
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache,
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(EnvironmentConfigService)
        private readonly configService: EnvironmentConfigService,
    ) {
        this.type = this.configService.get<string>('CACHE_TYPE');
        this.ttl = this.configService.get<number>('CACHE_TTL');
    }

    async get<T>(key: string, log = true): Promise<T | null> {
        try {
            if (!log) {
                const result = await this.cacheManager.get<any>(key);
                if (!result || !Object.keys(result).length) {
                    return null;
                }
                return result as T;
            }

            this.logger.info(
                {
                    type: 'request',
                    integration: true,
                    description: `INVOKE - GET CACHE: ${key}`,
                    technology: this.type,
                },
                key,
            );

            const result = await this.cacheManager.get<any>(key);

            this.logger.info(
                {
                    type: 'response',
                    integration: true,
                    description: `RESPONSE - GET CACHE: ${key}`,
                    technology: this.type,
                    status: 200,
                },
                safeStringify(result) || 'null',
            );

            if (
                !result ||
                !(typeof result !== 'object' || Object.keys(result).length)
            ) {
                return null;
            }

            return result as T;
        } catch (error) {
            this.logger.error(
                {
                    type: 'response',
                    integration: true,
                    description: 'ERROR AO BUSCAR OS DADOS DO CACHE',
                    technology: this.type,
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                },
                safeStringify(error),
            );
            return null;
        }
    }

    async set<T>(
        key: string,
        value: T | string,
        ttl?: number,
        log = false,
    ): Promise<void> {
        try {
            if (!log) {
                await this.cacheManager.set(key, value, ttl ?? this.ttl);
                return;
            }

            this.logger.info(
                {
                    type: 'request',
                    integration: true,
                    description: `INVOKE - SET CACHE: ${key}`,
                    technology: this.type,
                },
                key,
            );

            await this.cacheManager.set(key, value, ttl ?? this.ttl);

            this.logger.info(
                {
                    type: 'response',
                    integration: true,
                    description: `RESPONSE - SET CACHE: ${key}`,
                    technology: this.type,
                    status: 200,
                },
                safeStringify(value),
            );
        } catch (error: any) {
            this.logger.error(
                {
                    type: 'response',
                    integration: true,
                    description: `RESPONSE - RECEBIDO DO CACHE: ${key}`,
                    technology: this.type,
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                },
                safeStringify(error),
            );
        }
    }

    async delete(key: string, log = true): Promise<void> {
        try {
            if (!log) {
                await this.cacheManager.del(key);
                return;
            }

            this.logger.info(
                {
                    type: 'request',
                    integration: true,
                    description: `INVOKE - REQUEST ENVIADO AO CACHE: ${key}`,
                    technology: this.type,
                },
                `Limpeza do Cache: ${key}`,
            );
            const result = await this.cacheManager.del(key);
            this.logger.info(
                {
                    type: 'response',
                    integration: true,
                    description: `RESPONSE - RECEBIDO DO CACHE: ${key}`,
                    technology: this.type,
                    status: 200,
                },
                result
                    ? `Limpeza realizada com sucesso! Conteúdo da chave '${key}' apagado.`
                    : `Limpeza da chave '${key}' não realizada!`,
            );
        } catch (error) {
            this.logger.error(
                {
                    type: 'response',
                    integration: true,
                    description: `ERROR AO DELETAR OS DADOS DO CACHE: ${key}`,
                    technology: this.type,
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                },
                safeStringify(error),
            );
        }
    }

    async clear(): Promise<void> {
        try {
            this.logger.info(
                {
                    type: 'request',
                    integration: true,
                    description: 'INVOKE - CLEAR ALL CACHE',
                    technology: this.type,
                },
                `Clearing all cache data: ${this.type}`,
            );

            const result = await this.cacheManager.clear();

            this.logger.info(
                {
                    type: 'response',
                    integration: true,
                    description: 'RESPONSE - CLEAR ALL CACHE',
                    technology: this.type,
                },
                safeStringify({ result }),
            );
        } catch (error) {
            this.logger.error(
                {
                    type: 'response',
                    integration: true,
                    description: 'ERROR AO DELETAR OS DADOS DO CACHE',
                    technology: this.type,
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                },
                safeStringify(error),
            );
        }
    }

    async *entries(
        pattern?: RegExp,
        store?: Keyv,
    ): AsyncGenerator<{ key: string; value: any }, void, unknown> {
        store ??= this.cacheManager.stores?.find((s) => s?.iterator);

        if (!(store && store.iterator)) {
            return;
        }

        for await (const [key, value] of store.iterator(
            this.configService.get<string>('CACHE_PREFIX'),
        )) {
            if (pattern && !pattern.test(key)) {
                continue;
            }
            yield { key, value };
        }
    }
}
