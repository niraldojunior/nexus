export interface EncryptPort {
    encrypt(input: any): string | undefined;
    decrypt(input: any): string | undefined;
}
