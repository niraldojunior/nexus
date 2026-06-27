import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { EnvironmentConfigModule } from '../config/env/environment-config.module';
import { LoggerModule } from '../logger/logger.module';
import { HttpExceptionFilter } from './http-exception.filter';
import { RpcExceptionFilter } from './rpc-exception.filter';

@Module({
    imports: [EnvironmentConfigModule, HttpModule, LoggerModule],
    providers: [
        {
            provide: APP_FILTER,
            useClass: RpcExceptionFilter,
        },
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter,
        },
    ],
})
export class FilterModule {}
