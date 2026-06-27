import { Injectable, Logger } from '@nestjs/common';
import { CLS_ID, ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';

import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';

import { EnvironmentConfigService } from '../config/env/environment-config.service';

interface ILogger {
    debug(obj: Record<string, any>, message: string): void;
    log(obj: Record<string, any>, message: string): void;
    error(obj: Record<string, any>, message: string, trace?: string): void;
    warn(obj: Record<string, any>, message: string): void;
    verbose(obj: Record<string, any>, message: string): void;
}

@Injectable()
export class LoggerService extends Logger implements ILogger {
    private _app_name: string;

    constructor(
        private readonly logger: PinoLogger,
        private readonly configService: EnvironmentConfigService,
        private readonly cls: ClsService,
    ) {
        super();
        this._app_name = this.configService.get('LOGSTASH_INDEX');
    }

    clearContext(): void {
        this.cls.set(CLS_ID, Snowflake.nextId().toString());
        this.cls.set('service', null);
        this.cls.set('operation', null);
    }

    assign(obj: {
        requestId?: string;
        service?: string;
        operation?: string;
    }): void {
        if (obj.requestId) this.cls.set(CLS_ID, obj.requestId);
        if (obj.service) this.cls.set('service', obj.service);
        if (obj.operation) this.cls.set('operation', obj.operation);
    }

    setContext(context: string): void {
        this.logger.setContext(context);
    }

    verbose(obj: Record<string, any>, message?: string): void {
        obj = typeof obj === 'string' ? { info: obj } : obj;
        this.logger.trace(
            {
                ...this.getInfoDefault(),
                ...obj,
            },
            message,
        );
    }

    debug(obj: Record<string, any>, message?: string): void {
        obj = typeof obj === 'string' ? { info: obj } : obj;
        this.logger.debug(
            {
                ...this.getInfoDefault(),
                ...obj,
            },
            message,
        );
    }

    info(obj: Record<string, any>, message?: string): void {
        obj = typeof obj === 'string' ? { info: obj } : obj;
        this.logger.info(
            {
                ...this.getInfoDefault(),
                ...obj,
            },
            message,
        );
    }

    warn(obj: Record<string, any>, message?: string): void {
        obj = typeof obj === 'string' ? { info: obj } : obj;
        this.logger.warn(
            {
                ...this.getInfoDefault(),
                ...obj,
            },
            message,
        );
    }

    error(obj: Record<string, any>, message: string, trace?: string): void {
        obj = typeof obj === 'string' ? { info: obj, trace } : obj;

        this.logger.error(
            {
                ...this.getInfoDefault(),
                ...obj,
            },
            message,
        );
    }

    private getInfoDefault() {
        return {
            requestId: this.cls.getId(),
            service: this.cls.get('service'),
            operation: this.cls.get('operation'),
            app_name: this._app_name,
            x_now: Date.now(),
        };
    }
}
