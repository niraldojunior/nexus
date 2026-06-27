import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClsInterceptor, ClsModule as NestClsModule } from 'nestjs-cls';

import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';

import { ClsService } from './nestjs-cls.service';

@Module({
    imports: [
        NestClsModule.forRoot({
            global: true,
            middleware: {
                mount: true,
                generateId: true,
                idGenerator: () => Snowflake.nextId().toString(),
            },
            interceptor: {
                mount: false, // Mount manually to ensure the correct order
                generateId: true,
                idGenerator: () => Snowflake.nextId().toString(),
                setup: ClsService.setupInterceptor,
            },
        }),
    ],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: ClsInterceptor,
        },
    ],
})
export class ClsModule {}
