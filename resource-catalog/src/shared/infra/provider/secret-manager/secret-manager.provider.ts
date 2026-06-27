import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { SecretManagerPort } from '@/shared/application/port/http/secret-manager.repository';
import { SecretManagerPortImpl } from '@/shared/infra/provider/secret-manager/secret-manager-port.impl';
import { safeStringify } from '@/shared/util/json.util';

import { EnvironmentConfigService } from '../../config/env/environment-config.service';
import { EnvironmentVariables } from '../../config/env/environment-config.validation';

const SECRET_KEYS: Partial<
    Record<Extract<keyof EnvironmentVariables, string>, string>
> = {
    MONGODB_PASS: 'secret-db',
    JWT_SIGNATURE: 'apigee-jwt',
    PORTAL_BACKEND_GUARD_JWT: 'signature-portal-backend',
} as const;

type SECRET_KEYS = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

@Injectable()
export class SecretManagerProvider implements OnModuleInit {
    private readonly isEnabled: boolean = false;

    constructor(
        @Inject(SecretManagerPortImpl)
        private readonly secretManager: SecretManagerPort,
        private readonly configService: EnvironmentConfigService,
    ) {
        this.isEnabled = this.configService.get<boolean>(
            'INTEGRATION_SECRET_MANAGER_ENABLED',
            false,
        );
    }

    async onModuleInit(): Promise<void> {
        return await this.loadSecretsIntoEnvironment();
    }

    async get(key: string): Promise<string> {
        if (!this.isEnabled) {
            const k = Object.entries(SECRET_KEYS).find(
                ([, value]) => value === key,
            )?.[0] as keyof typeof SECRET_KEYS;

            if (!k) {
                Logger.warn(`Chave secreta não encontrada: ${key}`);
                return '';
            }

            return this.configService.get(k);
        }

        return await this.secretManager.get(key);
    }

    private async loadSecretsIntoEnvironment(): Promise<void> {
        if (!this.isEnabled) {
            return Logger.debug('Secret Manager desativado.');
        }

        try {
            Logger.debug('Iniciando Secret Manager...', { SECRET_KEYS });

            await this.secretManager.authenticate();

            await Promise.all(
                Object.entries(SECRET_KEYS).map(async ([key, value]) => {
                    const secret = await this.secretManager.get(value);
                    process.env[key] = secret;
                }),
            );

            Logger.debug('Secret Manager inicializado com sucesso.');
        } catch (error) {
            Logger.error({
                description: 'Erro ao inicializar o Secret Manager',
                message: safeStringify(SECRET_KEYS),
            });
            throw error;
        }
    }
}
