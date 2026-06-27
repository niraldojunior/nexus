import { Inject } from '@nestjs/common';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';

import { ContextMethod } from '@/shared/application/const/context-method.constant';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';

import { Snowflake } from '../entity/snowflake-id.entity';

export function LogResetContext() {
    return (target: any, propertyKey: string, propertyDescriptor: any): any => {
        const originalMethod = propertyDescriptor.value;

        Inject(LoggerService)(target, 'logger');
        const cls = ClsServiceManager.getClsService();

        propertyDescriptor.value = async function (...args: any[]) {
            try {
                const logger: LoggerService = this.logger;
                const prefix = env('LOGSTASH_SERVICE_PREFIX', 'MS');
                const name = target.constructor.name;
                const { service, operation } = ContextMethod[propertyKey] ||
                    ContextMethod[name] || {
                        service: `${name}.${propertyKey}`,
                        operation: propertyKey,
                    };

                logger.info(
                    {
                        statusCode: 200,
                        description: 'END - Finalização do serviço',
                    },
                    `Enviado ao serviço ${operation}`,
                );

                cls.set(CLS_ID, Snowflake.nextId().toString());
                cls.set('service', `${prefix}.${service}`);
                cls.set('operation', operation);

                logger.info(
                    { description: 'START - Inicialização do serviço' },
                    `Início do serviço ${operation}`,
                );
            } catch (error: any) {
                // eslint-disable-next-line no-console
                console.error('Error on LogResetContext decorator: ', {
                    class: target?.constructor?.name,
                    method: propertyKey,
                    error,
                });
            }

            return await originalMethod.apply(this, args);
        };
        return propertyDescriptor;
    };
}
