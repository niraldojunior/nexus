import { Module } from '@nestjs/common';
import {
    JwtModule as JwtLibModule,
    JwtService as JwtLibService,
} from '@nestjs/jwt';

import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';

import { JwtService } from './jwt.service';

@Module({
    imports: [EnvironmentConfigModule, JwtLibModule.register({})],
    providers: [EnvironmentConfigService, JwtLibService, JwtService],
    exports: [JwtService, JwtLibService],
})
export class JwtModule {}
