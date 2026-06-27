import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';

import { EnvironmentVariables } from './environment-config.validation';

@Injectable()
export class EnvironmentConfigService {
    constructor(private configService: ConfigService) {}

    get<T = string>(
        key: Extract<keyof EnvironmentVariables, string>,
        defaultValue?: T,
    ): T {
        if (defaultValue === undefined) {
            return this.configService.get<T>(key) as T;
        }
        return this.configService.get<T>(key, defaultValue);
    }
}

export const env = <T = string>(
    key: Extract<keyof EnvironmentVariables, string>,
    defaultValue?: T,
): T => {
    const configService = new EnvironmentConfigService(new ConfigService());
    const value = plainToInstance(
        EnvironmentVariables,
        { [key]: configService.get<T>(key, defaultValue) },
        { enableImplicitConversion: true },
    );
    return value[key] as T;
};
