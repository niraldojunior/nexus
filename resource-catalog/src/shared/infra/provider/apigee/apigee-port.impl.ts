import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

import { CacheMethod } from '@/shared/application/decorator/cache.decorator';
import {
    ApigeePort,
    ApigeeTokenDto,
} from '@/shared/application/port/http/apigee.repository';
import {
    env,
    EnvironmentConfigService,
} from '@/shared/infra/config/env/environment-config.service';
import { SecretManagerProvider } from '@/shared/infra/provider/secret-manager/secret-manager.provider';

@Injectable()
export class ApigeeGatewayPortImpl implements ApigeePort {
    protected readonly apiHost: string;
    private readonly grantType: string;
    private readonly scope: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: EnvironmentConfigService,
        private readonly secretManagerService: SecretManagerProvider,
        private readonly cacheService: Cache,
    ) {
        this.apiHost = this.configService.get('INTEGRATION_APIGEE_URI');
        this.grantType = this.configService.get(
            'APIGEE_OAUTH_TOKEN_GRANT_TYPE',
        );
        this.scope = this.configService.get('APIGEE_OAUTH_TOKEN_SCOPE');
    }

    @CacheMethod(env<number>('APIGEE_OAUTH_TOKEN_CACHE_TTL'))
    async getToken(): Promise<string> {
        const username = await this.secretManagerService.get('username');
        const password = await this.secretManagerService.get('password');
        const authorization = Buffer.from(`${username}:${password}`).toString(
            'base64',
        );

        const token: ApigeeTokenDto = await this.httpService.axiosRef
            .post(
                `${this.apiHost}/auth/oauth/v2/token?grant_type=${this.grantType}&scope=${this.scope}`,
                null,
                {
                    headers: {
                        Authorization: `Basic ${authorization}`,
                        contextDescription: 'APIGEE - OAUTH TOKEN',
                    },
                },
            )
            .then((response) => response.data);

        return `${token.token_type} ${token.access_token}`;
    }
}
