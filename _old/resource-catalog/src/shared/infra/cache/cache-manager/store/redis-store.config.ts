import { createKeyvNonBlocking } from '@keyv/redis';
import { Injectable } from '@nestjs/common';
import { Cacheable, Keyv } from 'cacheable';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

@Injectable()
export class RedisConfig {
    constructor(
        private readonly configService: EnvironmentConfigService,
        private readonly logger: LoggerService,
    ) {
        this.logger.setContext(RedisConfig.name);
    }

    getStore(ttl?: number): Keyv<Cacheable> {
        const redis = createKeyvNonBlocking(
            {
                url: `redis://${this.configService.get<string>('REDIS_HOST')}:${this.configService.get<number>('REDIS_PORT')}`,
                username:
                    this.configService.get<string>('REDIS_USERNAME') ||
                    undefined,
                password:
                    this.configService.get<string>('REDIS_PASSWORD') ||
                    undefined,
            },
            {
                namespace: this.configService.get<string>('CACHE_PREFIX'),
            },
        );

        redis.on('connect', () => {
            this.logger.info(
                { description: 'Redis client connected' },
                'Redis client connected',
            );
        });

        redis.on('reconnecting', () => {
            this.logger.info(
                { description: 'Redis client reconnecting' },
                'Redis client reconnecting',
            );
        });

        redis.on('end', () => {
            this.logger.info(
                { description: 'Redis client disconnected' },
                'Redis client disconnected',
            );
        });

        redis.on('error', (err) => {
            this.logger.error(
                { description: 'Redis client error' },
                safeStringify({
                    name: err.name,
                    message: err.message,
                    description: err.description,
                    cause: err.cause,
                    reason: err.reason,
                    stack: err.stack,
                }),
            );
        });

        if (!this.configService.get<boolean>('REDIS_SECONDARY_STORE')) {
            return redis;
        }

        return new Keyv(
            {
                store: new Cacheable({
                    secondary: redis,
                    nonBlocking: true,
                    ttl: ttl ?? this.configService.get<number>('CACHE_TTL'),
                }),
            },
            {
                namespace: this.configService.get<string>('CACHE_PREFIX'),
                useKeyPrefix: false,
            },
        );
    }
}
