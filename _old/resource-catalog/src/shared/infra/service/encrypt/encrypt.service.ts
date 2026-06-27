import { Logger } from '@nestjs/common';

import { EncryptPort } from '@/shared/application/port/encrypt/encrypt.repository';
import {
    EncryptionAlgorithm,
    EncryptionHandler,
} from '@/shared/infra/service/encrypt/encrypt.handler';

export class EncryptService implements EncryptPort {
    private readonly secret: string;
    private readonly salt: string;
    private readonly algorithm: EncryptionAlgorithm;

    constructor(
        secret_key: string,
        salt_value: string,
        algorithm: EncryptionAlgorithm | undefined = 'AES_256',
    ) {
        this.secret = secret_key;
        this.salt = salt_value;
        this.algorithm = algorithm;
    }

    encrypt(input: any): string | undefined {
        if (!input) return input;

        try {
            if (typeof input !== 'string') {
                input.toString();
            }
            return EncryptionHandler.encrypt(
                input,
                this.secret,
                this.salt,
                this.algorithm,
            );
        } catch (error) {
            Logger.debug('Error encrypting data', { input, error });
            return input;
        }
    }

    decrypt(input: any): string | undefined {
        if (!input) return input;

        try {
            if (typeof input !== 'string') {
                input.toString();
            }
            return EncryptionHandler.decrypt(
                input,
                this.secret,
                this.salt,
                this.algorithm,
            );
        } catch (error) {
            Logger.debug('Error decrypting data', { input, error });
            return input;
        }
    }
}
