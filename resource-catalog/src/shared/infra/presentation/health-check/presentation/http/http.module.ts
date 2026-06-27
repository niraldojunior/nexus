import { Module } from '@nestjs/common/decorators';
import { TerminusModule } from '@nestjs/terminus';

import { HealthHttpModule } from './controller/health/health.module';

@Module({
    imports: [
        TerminusModule.forRoot({
            logger: true,
        }),
        HealthHttpModule,
    ],
})
export class HttpModule {}
