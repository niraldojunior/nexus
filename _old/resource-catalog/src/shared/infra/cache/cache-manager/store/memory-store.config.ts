import { Injectable } from '@nestjs/common';
import { Cacheable, CacheableMemory, Keyv } from 'cacheable';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';

@Injectable()
export class MemoryConfig {
    constructor(private readonly configService: EnvironmentConfigService) {}

    getStore(ttl?: number): Keyv<Cacheable> {
        return new Keyv(
            {
                store: new CacheableMemory({
                    ttl: ttl ?? this.configService.get<number>('CACHE_TTL'),
                    lruSize: this.configService.get<number>('CACHE_LIMIT'),
                }),
            },
            {
                namespace: this.configService.get<string>('CACHE_PREFIX'),
                useKeyPrefix: false,
            },
        );
    }
}
