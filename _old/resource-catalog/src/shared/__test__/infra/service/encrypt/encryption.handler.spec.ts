import {
    EncryptionHandler,
    InvalidDecryptParamException,
    InvalidEncryptParamException,
} from '@/shared/infra/service/encrypt/encrypt.handler';

describe('EncryptionHandler', () => {
    const secret = 'mySecretKey';
    const salt = 'mySaltValue';
    const text = 'Hello, World!';

    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt using default algorithm (AES_128)', () => {
            const encrypted = EncryptionHandler.encrypt(text, secret, salt);
            expect(typeof encrypted).toBe('string');
            const decrypted = EncryptionHandler.decrypt(
                encrypted,
                secret,
                salt,
            );
            expect(decrypted).toBe(text);
        });

        it('should encrypt and decrypt using AES_256', () => {
            const encrypted = EncryptionHandler.encryptSpecificAlgorithm(
                text,
                secret,
                salt,
                'AES_256',
            );
            expect(typeof encrypted).toBe('string');
            const decrypted = EncryptionHandler.decryptSpecificAlgorithm(
                encrypted,
                secret,
                salt,
                'AES_256',
            );
            expect(decrypted).toBe(text);
        });

        it('should encrypt and decrypt using AES_128 explicitly', () => {
            const encrypted = EncryptionHandler.encryptSpecificAlgorithm(
                text,
                secret,
                salt,
                'AES_128',
            );
            expect(typeof encrypted).toBe('string');
            const decrypted = EncryptionHandler.decryptSpecificAlgorithm(
                encrypted,
                secret,
                salt,
                'AES_128',
            );
            expect(decrypted).toBe(text);
        });
    });

    describe('parameter validation', () => {
        it('should throw InvalidEncryptParamException if encrypt params are missing', () => {
            expect(() => EncryptionHandler.encrypt('', secret, salt)).toThrow(
                InvalidEncryptParamException,
            );
            expect(() => EncryptionHandler.encrypt(text, '', salt)).toThrow(
                InvalidEncryptParamException,
            );
            expect(() => EncryptionHandler.encrypt(text, secret, '')).toThrow(
                InvalidEncryptParamException,
            );
        });

        it('should throw InvalidDecryptParamException if decrypt params are missing', () => {
            expect(() => EncryptionHandler.decrypt('', secret, salt)).toThrow(
                InvalidDecryptParamException,
            );
            expect(() =>
                EncryptionHandler.decrypt('encrypted', '', salt),
            ).toThrow(InvalidDecryptParamException);
            expect(() =>
                EncryptionHandler.decrypt('encrypted', secret, ''),
            ).toThrow(InvalidDecryptParamException);
        });
    });

    describe('exceptions', () => {
        it('InvalidEncryptParamException should have correct message and status', () => {
            const err = new InvalidEncryptParamException();
            expect(err.message).toBe(
                'Os atributos para criptografia não podem ser nulos!',
            );
            expect(err.status).toBe(400);
        });

        it('InvalidDecryptParamException should have correct message and status', () => {
            const err = new InvalidDecryptParamException();
            expect(err.message).toBe(
                'Os atributos para descriptografia não podem ser nulos!',
            );
            expect(err.status).toBe(400);
        });
    });
});
