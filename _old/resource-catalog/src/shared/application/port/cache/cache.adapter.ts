export abstract class CacheServiceAdapter {
    abstract status(): 'OK' | 'NOT OK';
    abstract get<T>(key: string): Promise<T | null>;
    abstract set(key: string, value: any): Promise<void>;
    abstract delete(key: string): Promise<any>;
    abstract clearCache(): Promise<void>;
    abstract clearCacheByPattern(pattern: string): Promise<void>;
}
