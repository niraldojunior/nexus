import { Module } from '@nestjs/common';

import { ClsModule } from '@/shared/infra/cache/nestjs-cls/nestjs-cls.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { FilterModule } from '@/shared/infra/filter/filter.module';
import { InterceptorModule } from '@/shared/infra/interceptor/interceptor.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { HealthAppModule } from '@/shared/infra/presentation/health-check/health.module';
import { DatadogTracerProvider } from '@/shared/infra/provider/tracer/datadog-tracer.provider';

import { HttpModule } from './infra/presentation/http/controller/http.module';

const imports = [
    HealthAppModule,
    ClsModule,
    EnvironmentConfigModule,
    LoggerModule,
    FilterModule,
    InterceptorModule,
];

if (env('MODULE_UTILS', false)) {
    imports.push(HttpModule);
}

@Module({
    imports,
    providers: [DatadogTracerProvider],
})
export class UtilsAppModule {}
