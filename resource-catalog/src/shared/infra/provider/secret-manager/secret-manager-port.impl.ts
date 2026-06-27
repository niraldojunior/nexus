import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

import { CacheMethod } from '@/shared/application/decorator/cache.decorator';
import { SecretManagerPort } from '@/shared/application/port/http/secret-manager.repository';
import {
    env,
    EnvironmentConfigService,
} from '@/shared/infra/config/env/environment-config.service';

@Injectable()
export class SecretManagerPortImpl implements SecretManagerPort {
    private readonly apiHost: string;
    private readonly auth: string;
    private readonly account: string;
    private readonly login: string;
    private readonly identifier: string;
    private readonly body: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: EnvironmentConfigService,
        @Inject(CACHE_MANAGER) private readonly cache: Cache,
    ) {
        this.apiHost = this.configService.get('INTEGRATION_SECRET_MANAGER_URI');
        this.auth = this.configService.get('SECRET_MANAGER_AUTHENTICATOR');
        this.account = this.configService.get('SECRET_MANAGER_ACCOUNT');
        this.login = this.configService.get('SECRET_MANAGER_LOGIN');
        this.identifier = this.configService.get('SECRET_MANAGER_IDENTIFIER');
        this.body = this.configService.get('SECRET_MANAGER_BODY');
    }

    @CacheMethod(env<number>('SECRET_MANAGER_VARIABLE_CACHE_TTL'))
    async get(key: string): Promise<string> {
        return await this.httpService.axiosRef
            .get(
                `${this.apiHost}/secrets/${this.account}/variable/vtal/lob-prd/${this.identifier}/${key}`,
                {
                    headers: {
                        Authorization: await this.authenticate(),
                        contextDescription: `Secret Manager - Get Secret: ${key}`,
                    },
                },
            )
            .then((response) => response.data);
    }

    @CacheMethod(env<number>('SECRET_MANAGER_AUTH_CACHE_TTL'))
    async authenticate(): Promise<string> {
        const token = await this.httpService.axiosRef
            .post(
                `${this.apiHost}/${this.auth}/${this.account}/host%2F${this.login}/authenticate`,
                this.body,
                {
                    headers: {
                        contextDescription: 'Secret Manager - Authenticate',
                        'Accept-Encoding': 'base64',
                        'Content-Type': 'text/plain',
                    },
                },
            )
            .then((response) => response.data);

        return `Token token="${token}"`;
    }
}
