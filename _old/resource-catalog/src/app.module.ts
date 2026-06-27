import { Module } from '@nestjs/common';

import { HealthAppModule } from '@/shared/infra/presentation/health-check/health.module';

import { NotificationDispatcherAppModule } from './module/notification-dispatcher/app.module';
import { Tmf634ResourceCatalogAppModule } from './module/resource-catalog/app.module';
import { UtilsAppModule } from './module/utils/app.module';
import { EnvironmentConfigModule } from './shared/infra/config/env/environment-config.module';
import { DatadogTracerProvider } from './shared/infra/provider/tracer/datadog-tracer.provider';

@Module({
    imports: [
        EnvironmentConfigModule,
        HealthAppModule,
        Tmf634ResourceCatalogAppModule,
        NotificationDispatcherAppModule,
        UtilsAppModule,
    ],
    providers: [DatadogTracerProvider],
})
export class AppModule {}
