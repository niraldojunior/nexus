export interface SecretManagerPort {
    authenticate(): Promise<string>;
    get(key: string): Promise<string>;
}
