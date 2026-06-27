import { Module } from '@nestjs/common';
import { LoggerModule as LoggerNest } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

import { EnvironmentConfigModule } from '../config/env/environment-config.module';
import { EnvironmentConfigService } from '../config/env/environment-config.service';
import { getLogLevel, nanoseconds } from './common.logger';
import { LoggerService } from './logger.service';
import { TypeOrmLoggerService } from './logger-typeorm.service';
import { pinoDestinationStream } from './pino-transport.logger';

@Module({
    imports: [
        LoggerNest.forRootAsync({
            imports: [EnvironmentConfigModule],
            inject: [EnvironmentConfigService],
            useFactory: (configService: EnvironmentConfigService) => {
                return {
                    pinoHttp: [
                        {
                            autoLogging: false,
                            level: getLogLevel(
                                configService.get('LOG_LEVEL', 'info'),
                            ),
                            messageKey: 'message',
                            timestamp: configService.get<boolean>(
                                'LOG_CONFIG_NANOSECONDS',
                                true,
                            )
                                ? () => `,"time":${nanoseconds()}`
                                : () => `${stdTimeFunctions.epochTime()}`,
                        },
                        pinoDestinationStream(),
                    ],
                };
            },
        }),
    ],
    providers: [EnvironmentConfigService, LoggerService, TypeOrmLoggerService],
    exports: [LoggerService, TypeOrmLoggerService],
})
export class LoggerModule {}
