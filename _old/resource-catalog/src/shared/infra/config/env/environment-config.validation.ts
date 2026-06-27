import { plainToInstance, Transform, Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateIf,
    validateSync,
} from 'class-validator';

export enum Environment {
    Development = 'development',
    Production = 'production',
    Local = 'local',
    Test = 'test',
    Ti = 'ti',
    Ti3 = 'ti3',
    Trg = 'trg',
    Trg2 = 'trg2',
}

export enum LogType {
    // Elasticsearch = 'elk',
    Logstash = 'logstash',
    File = 'file',
    Terminal = 'terminal',
    Raw = 'raw',
}

export enum LogLevel {
    Fatal = 'fatal',
    Error = 'error',
    Warn = 'warn',
    Info = 'info',
    Debug = 'debug',
    Trace = 'trace',
}

export enum DatabaseType {
    Oracle = 'oracle',
    MongoDB = 'mongodb',
    Sqlite = 'sqlite',
    Memory = 'memory',
}

export enum CacheType {
    Memory = 'memory',
    Redis = 'redis',
}

export enum MessageBrokerType {
    RabbitMQ = 'rabbitmq',
    Kafka = 'kafka',
}

export class EnvironmentVariables {
    // Application
    @IsString()
    APP_NAME: string;

    @IsString()
    APP_HOST: string;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] !== 'false')
    DEBUG: boolean;

    @IsEnum(Environment)
    NODE_ENV: Environment;

    @IsOptional()
    @IsNumber()
    PORT: number;

    @IsOptional()
    @IsString()
    CORS_ALLOWED_ORIGINS: string;

    @IsOptional()
    @IsString()
    API_ROUTE_PREFIX: string;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    SWAGGER_ENABLED: boolean;

    @IsOptional()
    @Transform(({ value }) => value?.toLowerCase().split(','))
    @IsArray()
    @Type(() => String)
    SWAGGER_ALLOWED_METHODS: string[] | undefined;

    @IsOptional()
    @Transform(({ value }) => value?.split(','))
    @IsArray()
    @Type(() => String)
    SWAGGER_API_SERVER: string[] | undefined;

    @IsOptional()
    @IsString()
    SWAGGER_DESCRIPTION: string | undefined;

    @IsOptional()
    @IsNumber()
    SNOWFLAKE_WORKER_ID: number;

    @IsOptional()
    @IsNumber()
    SNOWFLAKE_DATACENTER_ID: number;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    TLS_REJECT_UNAUTHORIZED: boolean;

    // DataDog
    @IsOptional()
    @Transform(({ obj, key }) => obj[key] !== 'false')
    DD_ENABLED: boolean;

    @IsString()
    @ValidateIf((env) => env.DD_ENABLED !== false)
    DD_ENV: string;

    @IsString()
    @ValidateIf((env) => env.DD_ENABLED !== false)
    DD_SERVICE: string;

    @IsString()
    @ValidateIf((env) => env.DD_ENABLED !== false)
    DD_VERSION: string;

    // Logger
    @IsOptional()
    @IsEnum(LogType)
    @Transform(({ obj, key }) => (!obj[key] ? LogType.Raw : obj[key]))
    LOG_TYPE: LogType;

    @IsOptional()
    @IsEnum(LogLevel)
    LOG_LEVEL: LogLevel;

    @IsOptional()
    @IsEnum(LogLevel)
    LOG_LEVEL_FILE: LogLevel;

    @IsOptional()
    @IsEnum(LogLevel)
    LOG_LEVEL_LOGSTASH: LogLevel;

    @IsOptional()
    @IsEnum(LogLevel)
    LOG_LEVEL_TERMINAL: LogLevel;

    @IsOptional()
    @IsEnum(LogLevel)
    LOG_LEVEL_RAW: LogLevel;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    LOG_CONFIG_FILE: boolean;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    LOG_CONFIG_TERMINAL: boolean;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] !== 'false')
    LOG_CONFIG_NANOSECONDS: boolean;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    LOG_CONFIG_SINGLE_LINE: boolean;

    // Logstash
    @IsString()
    LOGSTASH_HOST: string;

    @IsNumber()
    LOGSTASH_PORT: number;

    @IsString()
    LOGSTASH_INDEX: string;

    @IsString()
    LOGSTASH_SERVICE_PREFIX: string;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] !== 'false')
    LOGSTASH_RECOVERY: boolean;

    @IsOptional()
    @IsNumber()
    LOGSTASH_RECOVERY_QUEUE_MAX_SIZE: number;

    // Database
    @IsEnum(DatabaseType)
    @IsOptional()
    DATABASE_TYPE: DatabaseType;

    // Oracle
    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsString()
    DB_HOST: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsNumber()
    DB_PORT: number;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsString()
    DB_NAME: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsString()
    DB_USER: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsString()
    DB_PASS: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsBoolean()
    @Transform(({ obj, key }) => obj[key] !== 'false')
    DB_MIGRATIONS_RUN: boolean;

    @ValidateIf(
        (env) =>
            env.DATABASE_TYPE === DatabaseType.Oracle && env.DB_MIGRATIONS_RUN,
    )
    @IsString()
    DB_MIGRATIONS_TABLE_NAME: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.Oracle)
    @IsBoolean()
    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    DB_THICK_MODE: boolean;

    @ValidateIf(
        (env) => env.DATABASE_TYPE === DatabaseType.Oracle && env.DB_THICK_MODE,
    )
    @IsString()
    @IsOptional()
    DB_LIB_PATH: string;

    // MongoDB
    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    MONGODB_HOST: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsNumber()
    MONGODB_PORT: number;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    MONGODB_NAME: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    MONGODB_USER: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    MONGODB_PASS: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    @IsOptional()
    MONGODB_AUTH_SOURCE: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    @IsOptional()
    MONGODB_APP_NAME: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    @IsOptional()
    MONGODB_LOG_ALL: string;

    @ValidateIf((env) => env.DATABASE_TYPE === DatabaseType.MongoDB)
    @IsString()
    @IsOptional()
    MONGODB_LOG_COMMAND: string;

    // Cache
    @IsEnum(CacheType)
    @IsOptional()
    CACHE_TYPE: CacheType;

    @ValidateIf((env) => env.CACHE_TYPE)
    @IsNumber()
    @Type(() => Number)
    CACHE_TTL: number;

    @ValidateIf((env) => env.CACHE_TYPE)
    @IsNumber()
    @Type(() => Number)
    CACHE_LIMIT: number;

    @ValidateIf((env) => env.CACHE_TYPE)
    @IsString()
    CACHE_PREFIX: string;

    @IsString()
    @ValidateIf((env) => env.CACHE_TYPE === CacheType.Redis)
    REDIS_HOST: string;

    @ValidateIf((env) => env.CACHE_TYPE === CacheType.Redis)
    @IsNumber()
    @Type(() => Number)
    REDIS_PORT: number;

    @ValidateIf((env) => env.CACHE_TYPE === CacheType.Redis)
    @IsString()
    REDIS_PASSWORD: string;

    @ValidateIf((env) => env.CACHE_TYPE === CacheType.Redis)
    @IsString()
    @IsOptional()
    REDIS_USERNAME: string;

    @ValidateIf((env) => env.CACHE_TYPE === CacheType.Redis)
    @IsBoolean()
    @Transform(({ obj, key }) => obj[key] === 'true')
    REDIS_SECONDARY_STORE: boolean;

    // Message Broker
    @IsEnum(MessageBrokerType)
    @IsOptional()
    MESSAGE_BROKER_TYPE: MessageBrokerType;

    @IsString()
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_HOST: string;

    @IsString()
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_EXCHANGE: string;

    @IsBoolean()
    @Transform(({ obj, key }) => obj[key] === 'true')
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_DELAYED_EXCHANGE: boolean;

    @IsNumber()
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_RETRY_DELAY: number;

    @IsNumber()
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_RETRY_COUNT: number;

    @IsNumber()
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_PREFETCH_COUNT: number;

    @IsString()
    @ValidateIf((env) => env.MESSAGE_BROKER_TYPE === MessageBrokerType.RabbitMQ)
    RMQ_DEAD_LETTER_EXCHANGE: string;

    // JWT
    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    INTEGRATION_JWT_ENABLED: boolean;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_JWT_ENABLED)
    JWT_ID: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_JWT_ENABLED)
    JWT_LOGIN: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_JWT_ENABLED)
    JWT_PASSWORD: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_JWT_ENABLED)
    JWT_SIGNATURE: string;

    // Portal Backend Guard
    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    PORTAL_BACKEND_GUARD_ENABLED: boolean;

    @IsString()
    @ValidateIf((env) => env.PORTAL_BACKEND_GUARD_ENABLED)
    PORTAL_BACKEND_GUARD_JWT: string;

    // Apigee
    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    INTEGRATION_APIGEE_ENABLED: boolean;

    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    INTEGRATION_APIGEE_OAUTH_ENABLED: boolean;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_APIGEE_ENABLED)
    INTEGRATION_APIGEE_URI: string;

    @IsString()
    @ValidateIf(
        (env) =>
            env.INTEGRATION_APIGEE_OAUTH_ENABLED &&
            !env.INTEGRATION_SECRET_MANAGER_ENABLED,
    )
    APIGEE_OAUTH_TOKEN_USERNAME: string;

    @IsString()
    @ValidateIf(
        (env) =>
            env.INTEGRATION_APIGEE_OAUTH_ENABLED &&
            !env.INTEGRATION_SECRET_MANAGER_ENABLED,
    )
    APIGEE_OAUTH_TOKEN_PASSWORD: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_APIGEE_OAUTH_ENABLED)
    APIGEE_OAUTH_TOKEN_GRANT_TYPE: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_APIGEE_OAUTH_ENABLED)
    APIGEE_OAUTH_TOKEN_SCOPE: string;

    @IsNumber()
    @ValidateIf((env) => env.INTEGRATION_APIGEE_OAUTH_ENABLED)
    APIGEE_OAUTH_TOKEN_CACHE_TTL: number;

    // Secret Manager
    @IsOptional()
    @Transform(({ obj, key }) => obj[key] === 'true')
    INTEGRATION_SECRET_MANAGER_ENABLED: boolean;

    @IsString()
    @IsNotEmpty()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    INTEGRATION_SECRET_MANAGER_URI: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_AUTHENTICATOR: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_ACCOUNT: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_LOGIN: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_BODY: string;

    @IsString()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_IDENTIFIER: string;

    @IsNumber()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_AUTH_CACHE_TTL: number;

    @IsNumber()
    @ValidateIf((env) => env.INTEGRATION_SECRET_MANAGER_ENABLED)
    SECRET_MANAGER_VARIABLE_CACHE_TTL: number;

    // TMF634 Resource Catalog Module
    @Transform(({ obj, key }) => obj[key] !== 'false')
    @IsBoolean()
    @IsOptional()
    MODULE_TMF634_RESOURCE_CATALOG = true;

    @Transform(({ obj, key }) => obj[key] === 'true')
    @IsBoolean()
    @IsOptional()
    TMF634_IN_MEMORY_SEED_ENABLED = false;

    // Utils Module
    @Transform(({ obj, key }) => obj[key] !== 'false')
    @IsBoolean()
    @IsOptional()
    MODULE_UTILS = true;

    // Notification Dispatcher Module
    @Transform(({ obj, key }) => obj[key] !== 'false')
    @IsBoolean()
    @IsOptional()
    MODULE_NOTIFICATION_DISPATCHER = true;

    @ValidateIf((env) => env.MODULE_NOTIFICATION_DISPATCHER)
    @IsString()
    RMQ_QUEUE_NOTIFICATION_DISPATCHER_EVENT: string;

    @ValidateIf((env) => env.MODULE_NOTIFICATION_DISPATCHER)
    @IsNumber()
    RMQ_DLQ_MSG_TTL_NOTIFICATION_DISPATCHER_EVENT: number;

    @ValidateIf((env) => env.MODULE_NOTIFICATION_DISPATCHER)
    @IsNumber()
    RMQ_DLQ_MAX_LENGTH_NOTIFICATION_DISPATCHER_EVENT: number;
}

export function validate(
    config: Record<string, unknown>,
): EnvironmentVariables {
    const validatedConfig = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });
    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length) {
        // eslint-disable-next-line no-console
        console.error(errors.toString());
        throw new Error(errors.toString());
    }
    return validatedConfig;
}
