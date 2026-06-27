import { Module } from '@nestjs/common';

import { ClsModule } from '@/shared/infra/cache/nestjs-cls/nestjs-cls.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';

import { HttpModule } from './presentation/http/http.module';

@Module({
    imports: [ClsModule, LoggerModule, HttpModule],
})
export class HealthAppModule {}
