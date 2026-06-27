import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { env, EnvironmentConfigService } from './environment-config.service';
import { Environment, validate } from './environment-config.validation';

const NODE_ENV = env<Environment>('NODE_ENV', Environment.Local);

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            ...(NODE_ENV !== Environment.Production
                ? {
                      envFilePath: `./env/env.${NODE_ENV}`,
                      ignoreEnvFile: false,
                  }
                : {}),
            validate,
        }),
    ],
    providers: [EnvironmentConfigService],
    exports: [EnvironmentConfigService],
})
export class EnvironmentConfigModule {}
