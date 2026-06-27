import { Injectable } from '@nestjs/common';
import { JwtService as NestJsJwtService, JwtSignOptions } from '@nestjs/jwt';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';

export interface IJwtService {
    getToken(): string;
}

export interface ITokenPayload {
    login: string;
    senha: string;
    soa_id: string;
}

@Injectable()
export class JwtService implements IJwtService {
    private readonly JWT_PAYLOAD: ITokenPayload;
    private readonly JWT_CONFIG: JwtSignOptions;

    constructor(
        private jwtService: NestJsJwtService,
        private configService: EnvironmentConfigService,
    ) {
        this.JWT_PAYLOAD = {
            login: this.configService.get('JWT_LOGIN'),
            senha: this.configService.get('JWT_PASSWORD'),
            soa_id: this.configService.get('JWT_ID'),
        };

        this.JWT_CONFIG = {
            algorithm: 'HS256',
            expiresIn: '1h',
            secret: this.configService.get('JWT_SIGNATURE'),
        };
    }

    getToken(
        payload: ITokenPayload = this.JWT_PAYLOAD,
        config: JwtSignOptions = this.JWT_CONFIG,
    ): string {
        return this.jwtService.sign(payload, config);
    }
}
