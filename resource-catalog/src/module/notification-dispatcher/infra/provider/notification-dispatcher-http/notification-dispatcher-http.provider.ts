import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

import {
    NotificationDispatcherHttpPort,
    NotificationListenerResourceSpecificationEventDto,
    NotificationListenerResourceSpecificationTargetDto,
} from '@/module/notification-dispatcher/application/port/notification-listener/notification-listener.reposiory';
import { CacheService } from '@/shared/infra/cache/cache-manager/cache.service';
import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { ApigeeGatewayPortImpl } from '@/shared/infra/provider/apigee/apigee-port.impl';
import { SecretManagerProvider } from '@/shared/infra/provider/secret-manager/secret-manager.provider';
import {
    IJwtService,
    JwtService,
} from '@/shared/infra/service/jwt/jwt.service';

@Injectable()
export class NotificationDispatcherHttpPortImpl
    extends ApigeeGatewayPortImpl
    implements NotificationDispatcherHttpPort
{
    constructor(
        @Inject(HttpService)
        private readonly http: HttpService,
        @Inject(EnvironmentConfigService)
        private readonly config: EnvironmentConfigService,
        @Inject(SecretManagerProvider)
        private readonly secretManager: SecretManagerProvider,
        @Inject(CacheService)
        private readonly cache: Cache,
        @Inject(JwtService)
        private readonly jwtService: IJwtService,
    ) {
        super(http, config, secretManager, cache);
    }

    async dispatch(
        data: NotificationListenerResourceSpecificationEventDto,
        target: NotificationListenerResourceSpecificationTargetDto,
    ): Promise<void> {
        const targetId = target.recipient.split('/').pop();
        const result = await this.http.axiosRef
            .post(
                `${this.apiHost}/api/resourceCatalogManagement/v1/listener/${data.eventType}/${targetId}`,
                data,
                {
                    headers: {
                        Authorization: await this.getAuth(),
                        contextDescription: `Listener - ${data.eventType} - ${targetId}`,
                    },
                },
            )
            .then((response) => response.data);

        return result;
    }

    private async getAuth(): Promise<string> {
        if (this.config.get<boolean>('INTEGRATION_APIGEE_OAUTH_ENABLED')) {
            return this.getToken();
        }
        return this.jwtService.getToken();
    }
}
