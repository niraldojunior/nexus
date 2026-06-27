import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CacheModule } from '@/shared/infra/cache/cache-manager/cache.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { SecretManagerModule } from '@/shared/infra/provider/secret-manager/secret-manager.module';
import { JwtModule } from '@/shared/infra/service/jwt/jwt.module';

import { NotificationDispatcherHttpPortImpl } from './notification-dispatcher-http.provider';

@Module({
    imports: [
        EnvironmentConfigModule,
        LoggerModule,
        HttpModule,
        SecretManagerModule,
        CacheModule,
        JwtModule,
    ],
    providers: [NotificationDispatcherHttpPortImpl],
    exports: [NotificationDispatcherHttpPortImpl],
})
export class NotificationDispatcherHttpProviderModule {}
