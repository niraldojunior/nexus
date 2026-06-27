import { Logger, QueryRunner } from 'typeorm';

import { safeStringify } from '@/shared/util/json.util';

import { LoggerService } from './logger.service';

export class TypeOrmLoggerService implements Logger {
    constructor(private readonly logger: LoggerService) {}

    logQuery(
        query: string,
        parameters?: any[],
        _queryRunner?: QueryRunner,
    ): void {
        this.logger.info(
            {
                description: 'INVOKE - REQUEST ENVIADO AO BD',
                integration: true,
            },
            safeStringify({ query: normalizeQuery(query), parameters }),
        );
    }

    logQueryError(
        error: string,
        query: string,
        parameters?: any[],
        _queryRunner?: QueryRunner,
    ): void {
        this.logger.error(
            {
                description: 'ERROR RECEBIDO DO BD',
                integration: true,
            },
            safeStringify({ query: normalizeQuery(query), parameters, error }),
        );
    }

    logQuerySlow(
        time: number,
        query: string,
        parameters?: any[],
        _queryRunner?: QueryRunner,
    ): void {
        this.logger.warn(
            {
                description: 'INVOKE - REQUEST ENVIADO AO BD - SLOW',
                integration: true,
            },
            safeStringify({ query: normalizeQuery(query), parameters, time }),
        );
    }

    logSchemaBuild(message: string, _queryRunner?: QueryRunner): void {
        this.logger.debug({}, message);
    }

    logMigration(message: string, _queryRunner?: QueryRunner): void {
        this.logger.debug({}, message);
    }

    log(
        level: 'log' | 'info' | 'warn',
        message: any,
        _queryRunner?: QueryRunner,
    ): void {
        switch (level) {
            case 'warn':
                this.logger.warn(message);
                break;
            default:
                this.logger.info(message);
                break;
        }
    }
}

function normalizeQuery(query: string) {
    return query.replace(/\s\s+/g, ' ').trim();
}
