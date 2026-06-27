import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import tracer from 'dd-trace';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { safeStringify } from '@/shared/util/json.util';

@Injectable()
export class DatadogTracerProvider implements OnModuleInit {
    constructor(private readonly envConfig: EnvironmentConfigService) {}

    onModuleInit(): void {
        if (!this.envConfig.get<boolean>('DD_ENABLED', true)) {
            Logger.debug('Datadog Tracer desativado.');
            return;
        }

        try {
            Logger.debug('Iniciando Datadog Tracer...');

            tracer.init({
                service: this.envConfig.get('DD_SERVICE'),
                env: this.envConfig.get('DD_ENV'),
                version: this.envConfig.get('DD_VERSION'),
                logInjection: true,
            });

            Logger.debug(
                `Datadog Tracer inicializado com sucesso em ${this.envConfig.get('DD_ENV')}.`,
            );
        } catch (error: any) {
            Logger.error(
                {
                    type: 'message',
                    integration: true,
                    description: 'Erro ao inicializar o DataDog tracer',
                },
                safeStringify(error),
            );
        }
    }
}
