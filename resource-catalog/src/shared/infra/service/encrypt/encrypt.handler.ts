import crypto from 'crypto';

export class EncryptionHandler {
    static encrypt(
        strToEncrypt: string,
        secret_key: string,
        salt_value: string,
        algorithm?: EncryptionAlgorithm,
    ): string {
        this.validateEncryptParams(strToEncrypt, secret_key, salt_value);
        return this.doEncrypt(strToEncrypt, secret_key, salt_value, algorithm);
    }

    static encryptSpecificAlgorithm(
        strToEncrypt: string,
        secret_key: string,
        salt_value: string,
        algorithm: EncryptionAlgorithm,
    ): string {
        this.validateEncryptParams(strToEncrypt, secret_key, salt_value);
        return this.doEncrypt(strToEncrypt, secret_key, salt_value, algorithm);
    }

    static decrypt(
        strToDecrypt: string,
        secret_key: string,
        salt_value: string,
        algorithm?: EncryptionAlgorithm,
    ): string {
        this.validateDecryptParams(strToDecrypt, secret_key, salt_value);
        return this.doDecrypt(strToDecrypt, secret_key, salt_value, algorithm);
    }

    static decryptSpecificAlgorithm(
        strToDecrypt: string,
        secret_key: string,
        salt_value: string,
        algorithm: EncryptionAlgorithm,
    ): string {
        this.validateDecryptParams(strToDecrypt, secret_key, salt_value);
        return this.doDecrypt(strToDecrypt, secret_key, salt_value, algorithm);
    }

    private static doEncrypt(
        strToEncrypt: string,
        secret_key: string,
        salt_value: string,
        algorithm?: EncryptionAlgorithm,
    ) {
        const encryptAlgorithm = this.getEncryptionAlgorithm(algorithm);
        const key = crypto.pbkdf2Sync(
            secret_key,
            salt_value,
            65536,
            encryptAlgorithm.keySize,
            encryptAlgorithm.digest,
        );
        const iv = Buffer.from([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ]);

        const cipher = crypto.createCipheriv(
            encryptAlgorithm.algorithm,
            key,
            iv,
        );
        let encrypted = cipher.update(strToEncrypt, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return encrypted;
    }

    private static doDecrypt(
        strToDecrypt: string,
        secret_key: string,
        salt_value: string,
        algorithm?: EncryptionAlgorithm,
    ) {
        const decryptAlgorithm = this.getEncryptionAlgorithm(algorithm);
        const key = crypto.pbkdf2Sync(
            secret_key,
            salt_value,
            65536,
            decryptAlgorithm.keySize,
            decryptAlgorithm.digest,
        );
        const iv = Buffer.from([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ]);

        const decipher = crypto.createDecipheriv(
            decryptAlgorithm.algorithm,
            key,
            iv,
        );
        const decrypted = decipher.update(strToDecrypt, 'base64');

        return Buffer.concat([decrypted, decipher.final()]).toString();
    }

    private static validateEncryptParams(
        strToEncrypt: string,
        secret_key: string,
        salt_value: string,
    ) {
        if (!(strToEncrypt && secret_key && salt_value)) {
            throw new InvalidEncryptParamException();
        }
    }

    private static validateDecryptParams(
        strToDecrypt: string,
        secret_key: string,
        salt_value: string,
    ) {
        if (!(strToDecrypt && secret_key && salt_value)) {
            throw new InvalidDecryptParamException();
        }
    }

    private static getEncryptionAlgorithm(algorithm?: EncryptionAlgorithm) {
        if (algorithm === 'AES_256') {
            return AES_256;
        }

        return AES_128;
    }
}

export type EncryptionAlgorithm = 'AES_128' | 'AES_256';

const AES_128 = {
    algorithm: 'aes-128-cbc',
    digest: 'sha256',
    keySize: 16,
};

const AES_256 = {
    algorithm: 'aes-256-cbc',
    digest: 'sha256',
    keySize: 32,
};

export class InvalidEncryptParamException extends Error {
    public status: number;

    constructor() {
        super('Os atributos para criptografia não podem ser nulos!');
        this.name = 'InvalidEncryptParamException';
        this.status = 400;
    }
}

export class InvalidDecryptParamException extends Error {
    public status: number;

    constructor() {
        super('Os atributos para descriptografia não podem ser nulos!');
        this.name = 'InvalidDecryptParamException';
        this.status = 400;
    }
}
