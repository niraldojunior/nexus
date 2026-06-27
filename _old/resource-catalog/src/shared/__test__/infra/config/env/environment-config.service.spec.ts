import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';

import {
    env,
    EnvironmentConfigService,
} from '@/shared/infra/config/env/environment-config.service';
import { EnvironmentVariables } from '@/shared/infra/config/env/environment-config.validation';

jest.mock('@nestjs/config');
jest.mock('class-transformer', () => ({
    ...jest.requireActual('class-transformer'),
    plainToInstance: jest.fn(),
}));

describe('EnvironmentConfigService', () => {
    let configServiceMock: jest.Mocked<ConfigService>;
    let service: EnvironmentConfigService;

    beforeEach(() => {
        configServiceMock = new ConfigService() as jest.Mocked<ConfigService>;
        service = new EnvironmentConfigService(configServiceMock);
    });

    it('should get value without default', () => {
        configServiceMock.get = jest.fn().mockReturnValue('foo');
        const result = service.get('NODE_ENV');
        expect(configServiceMock.get).toHaveBeenCalledWith('NODE_ENV');
        expect(result).toBe('foo');
    });

    it('should get value with default', () => {
        configServiceMock.get = jest.fn().mockReturnValue('foo');
        const result = service.get('NODE_ENV', 'bar');
        expect(configServiceMock.get).toHaveBeenCalledWith('NODE_ENV', 'bar');
        expect(result).toBe('foo');
    });
});

describe('env', () => {
    let configServiceGetSpy: jest.SpyInstance;
    let plainToInstanceMock: jest.Mock;

    beforeEach(() => {
        configServiceGetSpy = jest.spyOn(ConfigService.prototype, 'get');
        plainToInstanceMock = plainToInstance as jest.Mock;
    });

    afterEach(() => {
        configServiceGetSpy.mockRestore();
        plainToInstanceMock.mockReset();
    });

    it('should return value from EnvironmentVariables', () => {
        configServiceGetSpy.mockReturnValue('baz');
        plainToInstanceMock.mockReturnValue({ NODE_ENV: 'baz' });

        const result = env('NODE_ENV');
        expect(configServiceGetSpy).toHaveBeenCalledWith('NODE_ENV');
        expect(plainToInstanceMock).toHaveBeenCalledWith(
            EnvironmentVariables,
            { NODE_ENV: 'baz' },
            { enableImplicitConversion: true },
        );
        expect(result).toBe('baz');
    });

    it('should return value with default', () => {
        configServiceGetSpy.mockReturnValue('qux');
        plainToInstanceMock.mockReturnValue({ NODE_ENV: 'qux' });

        const result = env('NODE_ENV', 'qux');
        expect(configServiceGetSpy).toHaveBeenCalledWith('NODE_ENV', 'qux');
        expect(result).toBe('qux');
    });
});
