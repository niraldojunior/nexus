import {
    EncryptionAlgorithm,
    EncryptionHandler,
} from '@/shared/infra/service/encrypt/encrypt.handler';
import { EncryptService } from '@/shared/infra/service/encrypt/encrypt.service';

jest.mock('@/shared/infra/service/encrypt/encrypt.handler');

describe('EncryptService', () => {
    const secret = 'testSecret';
    const salt = 'testSalt';
    const algorithm: EncryptionAlgorithm = 'AES_256';
    let service: EncryptService;

    beforeEach(() => {
        service = new EncryptService(secret, salt, algorithm);
        jest.clearAllMocks();
    });

    describe('encrypt', () => {
        it('should return undefined if input is undefined', () => {
            expect(service.encrypt(undefined)).toBeUndefined();
        });

        it('should encrypt string input', () => {
            (EncryptionHandler.encrypt as jest.Mock).mockReturnValue(
                'encrypted',
            );
            expect(service.encrypt('data')).toBe('encrypted');
            expect(EncryptionHandler.encrypt).toHaveBeenCalledWith(
                'data',
                secret,
                salt,
                algorithm,
            );
        });

        it('should encrypt non-string input by calling toString', () => {
            (EncryptionHandler.encrypt as jest.Mock).mockReturnValue(
                'encrypted',
            );
            const input = 12345;
            expect(service.encrypt(input)).toBe('encrypted');
        });

        it('should return input if EncryptionHandler.encrypt throws', () => {
            (EncryptionHandler.encrypt as jest.Mock).mockImplementation(() => {
                throw new Error('fail');
            });
            expect(service.encrypt('data')).toBe('data');
        });
    });

    describe('decrypt', () => {
        it('should return undefined if input is undefined', () => {
            expect(service.decrypt(undefined)).toBeUndefined();
        });

        it('should decrypt string input', () => {
            (EncryptionHandler.decrypt as jest.Mock).mockReturnValue(
                'decrypted',
            );
            expect(service.decrypt('encrypted')).toBe('decrypted');
            expect(EncryptionHandler.decrypt).toHaveBeenCalledWith(
                'encrypted',
                secret,
                salt,
                algorithm,
            );
        });

        it('should decrypt non-string input by calling toString', () => {
            (EncryptionHandler.decrypt as jest.Mock).mockReturnValue(
                'decrypted',
            );
            const input = 67890;
            expect(service.decrypt(input)).toBe('decrypted');
        });

        it('should return input if EncryptionHandler.decrypt throws', () => {
            (EncryptionHandler.decrypt as jest.Mock).mockImplementation(() => {
                throw new Error('fail');
            });
            expect(service.decrypt('encrypted')).toBe('encrypted');
        });
    });
});
