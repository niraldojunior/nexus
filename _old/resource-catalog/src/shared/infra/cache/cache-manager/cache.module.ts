import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';

import { EnvironmentConfigModule } from '../../config/env/environment-config.module';
import { EnvironmentConfigService } from '../../config/env/environment-config.service';
import { CacheType } from '../../config/env/environment-config.validation';
import { LoggerModule } from '../../logger/logger.module';
import { LoggerService } from '../../logger/logger.service';
import { CacheService } from './cache.service';
import { MemoryConfig } from './store/memory-store.config';
import { RedisConfig } from './store/redis-store.config';

@Module({
    imports: [
        LoggerModule,
        EnvironmentConfigModule,
        NestCacheModule.registerAsync({
            isGlobal: true,
            extraProviders: [
                EnvironmentConfigService,
                LoggerService,
                MemoryConfig,
                RedisConfig,
            ],
            inject: [EnvironmentConfigService, MemoryConfig, RedisConfig],
            useFactory: (
                config: EnvironmentConfigService,
                memory: MemoryConfig,
                redis: RedisConfig,
            ) => {
                const cacheType = config.get<CacheType>('CACHE_TYPE');
                const ttl = config.get<number>('CACHE_TTL');
                const stores: any[] = [];

                switch (cacheType) {
                    case CacheType.Redis:
                        stores.push(redis.getStore(ttl));
                        break;
                    case CacheType.Memory:
                    default:
                        stores.push(memory.getStore(ttl));
                        break;
                }

                return {
                    stores,
                    namespace: config.get<string>('CACHE_PREFIX'),
                    refreshAllStores: true,
                    noNamespaceAffectsAll: true,
                    ttl,
                };
            },
        }),
    ],
    providers: [CacheService],
    exports: [CacheService],
})
export class CacheModule {}
