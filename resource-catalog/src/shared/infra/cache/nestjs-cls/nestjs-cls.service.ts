import { ExecutionContext } from '@nestjs/common';
import { ClsService as NestClsService } from 'nestjs-cls';

import { ContextMethod } from '@/shared/application/const/context-method.constant';
import { UNKNOWN_EVENT_PATTERN } from '@/shared/application/const/message-broker-unknown-event-pattern.const';
import { env } from '@/shared/infra/config/env/environment-config.service';

export class ClsService {
    static setupInterceptor(cls: NestClsService, ctx: ExecutionContext): void {
        let service = `${env('LOGSTASH_SERVICE_PREFIX', 'MS')}.`;
        let operation: string;

        if (ctx.getType() === 'rpc') {
            const data = ClsService.getContextRpc(ctx);
            service += data.service;
            operation = data.operation;
        } else {
            const data = ClsService.getContextHttp(ctx);
            service += data.service;
            operation = data.operation;
        }

        cls.set('service', service);
        cls.set('operation', operation);
    }

    private static getContextRpc(ctx: ExecutionContext) {
        const context = ctx.switchToRpc().getContext();
        const queue = context.getMessage().fields.routingKey;
        const pattern = context.getPattern();
        const match =
            pattern === UNKNOWN_EVENT_PATTERN ? `${queue}.${pattern}` : pattern;

        return (
            ContextMethod[match] || {
                service: match,
                operation: pattern.split('.').pop(),
            }
        );
    }

    private static getContextHttp(ctx: ExecutionContext) {
        const className = ctx.getClass().name;
        const method = ctx.getHandler().name;
        const name = `${className}.${method}`;

        return (
            ContextMethod[name] || {
                service: method.includes(className) ? method : name,
                operation: method,
            }
        );
    }
}
