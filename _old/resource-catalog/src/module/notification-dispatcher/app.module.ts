import { Module } from '@nestjs/common';

import { ClsModule } from '@/shared/infra/cache/nestjs-cls/nestjs-cls.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { FilterModule } from '@/shared/infra/filter/filter.module';
import { InterceptorModule } from '@/shared/infra/interceptor/interceptor.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { HealthAppModule } from '@/shared/infra/presentation/health-check/health.module';
import { UnknownEventModule } from '@/shared/infra/presentation/unknown-event/presentation/queue/controller/unknown-event/unknown-event.module';
import { DatadogTracerProvider } from '@/shared/infra/provider/tracer/datadog-tracer.provider';

import { HttpModule } from './infra/presentation/http/http.module';
import { QueueModule } from './infra/presentation/queue/queue.module';

@Module({
    imports: [
        HealthAppModule,
        UnknownEventModule,
        ClsModule,
        EnvironmentConfigModule,
        LoggerModule,
        FilterModule,
        InterceptorModule,
        QueueModule,
        HttpModule,
    ],
    providers: [DatadogTracerProvider],
})
export class NotificationDispatcherAppModule {}
