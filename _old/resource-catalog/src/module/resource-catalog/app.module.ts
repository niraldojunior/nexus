import { Module } from '@nestjs/common';

import { ClsModule } from '@/shared/infra/cache/nestjs-cls/nestjs-cls.module';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { FilterModule } from '@/shared/infra/filter/filter.module';
import { InterceptorModule } from '@/shared/infra/interceptor/interceptor.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { HealthAppModule } from '@/shared/infra/presentation/health-check/health.module';
import { DatadogTracerProvider } from '@/shared/infra/provider/tracer/datadog-tracer.provider';

import { Tmf634TypeOrmModule } from './infra/persistence/typeorm/tmf634-typeorm.module';
import { HttpModule } from './infra/presentation/http/controller/http.module';

const imports = [
    HealthAppModule,
    ClsModule,
    EnvironmentConfigModule,
    LoggerModule,
    FilterModule,
    InterceptorModule,
];

if (env('MODULE_TMF634_RESOURCE_CATALOG', false)) {
    if (env('DATABASE_TYPE') === DatabaseType.MongoDB) {
        imports.push(Tmf634TypeOrmModule);
    }
    imports.push(HttpModule);
}

@Module({
    imports,
    providers: [DatadogTracerProvider],
})
export class Tmf634ResourceCatalogAppModule {}
