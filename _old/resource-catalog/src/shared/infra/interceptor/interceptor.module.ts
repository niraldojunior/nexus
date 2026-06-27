import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { EnvironmentConfigModule } from '../config/env/environment-config.module';
import { LoggerModule } from '../logger/logger.module';
import { LoggingInterceptor } from './logger-interceptor';

@Module({
    imports: [EnvironmentConfigModule, LoggerModule, HttpModule],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
    ],
})
export class InterceptorModule {}
