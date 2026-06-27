import { JwtService as NestJsJwtService } from '@nestjs/jwt';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { JwtService } from '@/shared/infra/service/jwt/jwt.service';

describe('JwtService', () => {
    let jwtService: JwtService;
    let nestJwtService: jest.Mocked<NestJsJwtService>;
    let configService: jest.Mocked<EnvironmentConfigService>;

    beforeEach(() => {
        nestJwtService = {
            sign: jest.fn(),
        } as any;

        configService = {
            get: jest.fn((key: string) => {
                switch (key) {
                    case 'JWT_SIGNATURE':
                        return 'test-signature';
                    case 'JWT_LOGIN':
                        return 'test-login';
                    case 'JWT_PASSWORD':
                        return 'test-password';
                    case 'JWT_ID':
                        return 'test-id';
                    default:
                        return undefined;
                }
            }),
        } as any;

        jwtService = new JwtService(nestJwtService, configService);
    });

    it('should call sign with correct payload and secret', () => {
        nestJwtService.sign.mockReturnValue('signed-token');

        const token = jwtService.getToken();

        expect(configService.get).toHaveBeenCalled();

        expect(nestJwtService.sign).toHaveBeenCalledWith(
            {
                login: 'test-login',
                senha: 'test-password',
                soa_id: 'test-id',
            },
            { secret: 'test-signature', algorithm: 'HS256', expiresIn: '1h' },
        );
        expect(token).toBe('signed-token');
    });
});
