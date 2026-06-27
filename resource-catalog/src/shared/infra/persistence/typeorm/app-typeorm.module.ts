import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { TypeOrmLoggerService } from '@/shared/infra/logger/logger-typeorm.service';

import { DatabaseType } from '../../config/env/environment-config.validation';

export class AppTypeOrmModule {
    static forRootAsync(
        options: TypeOrmModuleOptions,
        dbType?: DatabaseType,
    ): DynamicModule {
        return TypeOrmModule.forRootAsync({
            inject: [EnvironmentConfigService, LoggerService],
            imports: [EnvironmentConfigModule, LoggerModule],
            useFactory: (
                configService: EnvironmentConfigService,
                loggerService: LoggerService,
            ): TypeOrmModuleOptions => {
                const type =
                    dbType ?? configService.get<DatabaseType>('DATABASE_TYPE');

                switch (type) {
                    case DatabaseType.Oracle:
                        return {
                            type: 'oracle',
                            username: configService.get('DB_USER'),
                            password: configService.get('DB_PASS'),
                            database: configService.get('DB_NAME'),
                            host: configService.get('DB_HOST'),
                            port: configService.get<number>('DB_PORT'),
                            synchronize: false,
                            logging: true,
                            logger: new TypeOrmLoggerService(loggerService),
                            serviceName: configService.get('DB_NAME'),
                            verboseRetryLog: true,
                            retryAttempts: 1,
                            migrations: [join(__dirname, 'migrations', '*.js')],
                            migrationsTableName: configService.get(
                                'DB_MIGRATIONS_TABLE_NAME',
                            ),
                            migrationsRun:
                                configService.get<boolean>('DB_MIGRATIONS_RUN'),
                            thickMode:
                                configService.get<boolean>('DB_THICK_MODE') &&
                                configService.get<string>('DB_LIB_PATH')
                                    ? {
                                          libDir: configService.get<string>(
                                              'DB_LIB_PATH',
                                          ),
                                      }
                                    : configService.get<boolean>(
                                          'DB_THICK_MODE',
                                      ),
                            ...options,
                        } as TypeOrmModuleOptions;
                    case DatabaseType.MongoDB:
                        return {
                            type: 'mongodb',
                            username: configService.get('MONGODB_USER'),
                            password: configService.get('MONGODB_PASS'),
                            database: configService.get('MONGODB_NAME'),
                            host: configService.get('MONGODB_HOST'),
                            port: configService.get<number>('MONGODB_PORT'),
                            authSource: configService.get(
                                'MONGODB_AUTH_SOURCE',
                            ),
                            appName: configService.get('MONGODB_APP_NAME'),
                            // For MongoDB, the synchronize option in TypeORM does not create a schema because MongoDB
                            // is schemaless. Instead, when synchronize: true is set, TypeORM only syncs by creating
                            // indices. This behavior is different from relational databases where synchronize would
                            // create or update tables and columns. It is important to note that using synchronize: true
                            // is not recommended for production environments as it can lead to data loss, even though
                            // it is useful during development and debugging. For MongoDB, the focus is on index
                            // synchronization rather than schema creation.
                            synchronize: true,
                            logging: true,
                            logger: new TypeOrmLoggerService(loggerService),
                            verboseRetryLog: true,
                            retryAttempts: 1,
                            ignoreUndefined: true,
                            invalidWhereValuesBehavior: {
                                null: 'ignore',
                                undefined: 'ignore',
                            },
                            monitorCommands: true,
                            ...options,
                        } as TypeOrmModuleOptions;
                    case DatabaseType.Sqlite:
                    case DatabaseType.Memory:
                        return {
                            type: 'sqlite',
                            database: '/data/database.sqlite',
                            synchronize: true,
                            logging: true,
                            logger: new TypeOrmLoggerService(loggerService),
                            verboseRetryLog: true,
                            retryAttempts: 1,
                            ...options,
                        } as TypeOrmModuleOptions;
                    default:
                        throw new Error(
                            `Unsupported database type: ${type as string}`,
                        );
                }
            },
        });
    }
}
