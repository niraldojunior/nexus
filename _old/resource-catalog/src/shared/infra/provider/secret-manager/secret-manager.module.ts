import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CacheModule } from '@/shared/infra/cache/cache-manager/cache.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { SecretManagerPortImpl } from '@/shared/infra/provider/secret-manager/secret-manager-port.impl';

import { SecretManagerProvider } from './secret-manager.provider';

@Module({
    imports: [EnvironmentConfigModule, HttpModule, CacheModule],
    providers: [SecretManagerPortImpl, SecretManagerProvider],
    exports: [SecretManagerProvider],
})
export class SecretManagerModule {}
