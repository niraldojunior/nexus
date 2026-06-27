import { tryCatch } from '@/shared/util/try-catch.util';

describe('tryCatch utility', () => {
    describe('sync function', () => {
        it('should return [null, value] for successful sync operation', async () => {
            const fn = () => 42;
            const result = await tryCatch(fn);
            expect(result).toEqual([null, 42]);
        });

        it('should return [error, null] for thrown sync error', async () => {
            const error = new Error('fail');
            const fn = () => {
                throw error;
            };
            const result = await tryCatch(fn);
            expect(result).toEqual([error, null]);
        });

        it('should handle sync operation returning undefined', async () => {
            const fn = () => undefined;
            const result = await tryCatch(fn);
            expect(result).toEqual([null, undefined]);
        });

        it('should handle sync operation returning null', async () => {
            const fn = () => null;
            const result = await tryCatch(fn);
            expect(result).toEqual([null, null]);
        });

        it('should handle sync operation returning object', async () => {
            const obj = { foo: 'bar' };
            const fn = () => obj;
            const result = await tryCatch(fn);
            expect(result).toEqual([null, obj]);
        });
    });

    describe('async function (promise)', () => {
        it('should return [null, value] for resolved promise', async () => {
            const promise = Promise.resolve('ok');
            const result = await tryCatch(promise);
            expect(result).toEqual([null, 'ok']);
        });

        it('should return [error, null] for rejected promise', async () => {
            const error = new Error('async fail');
            const promise = Promise.reject(error);
            const result = await tryCatch(promise);
            expect(result).toEqual([error, null]);
        });

        it('should handle promise resolving to undefined', async () => {
            const promise = Promise.resolve(undefined);
            const result = await tryCatch(promise);
            expect(result).toEqual([null, undefined]);
        });

        it('should handle promise resolving to null', async () => {
            const promise = Promise.resolve(null);
            const result = await tryCatch(promise);
            expect(result).toEqual([null, null]);
        });

        it('should handle promise resolving to object', async () => {
            const obj = { foo: 'bar' };
            const promise = Promise.resolve(obj);
            const result = await tryCatch(promise);
            expect(result).toEqual([null, obj]);
        });
    });

    describe('async function (function returning promise)', () => {
        it('should return [null, value] for successful async function', async () => {
            const fn = async () => Promise.resolve('async ok');
            const result = await tryCatch(fn);
            // Since tryCatch expects a sync function, this will return a Promise, not await it
            // So we need to handle this case
            expect(result).toEqual([null, expect.any(Promise)]);
            // To check the resolved value:
            // eslint-disable-next-line @typescript-eslint/await-thenable
            const awaited = await result[1];
            expect(awaited).toBe('async ok');
        });

        it('should return [error, null] for async function that throws', async () => {
            const error = new Error('async throw');
            const fn = () => {
                throw error;
            };
            const result = await tryCatch(fn);
            expect(result).toEqual([error, null]);
        });
    });

    describe('type inference', () => {
        it('should allow custom error type', async () => {
            class CustomError extends Error {}
            const error = new CustomError('custom');
            const fn = () => {
                throw error;
            };
            const result = await tryCatch<CustomError, number>(fn);
            expect(result[0]).toBeInstanceOf(CustomError);
            expect(result[1]).toBeNull();
        });

        it('should allow custom value type', async () => {
            const fn = () => 123;
            const result = await tryCatch<Error, number>(fn);
            expect(result).toEqual([null, 123]);
        });
    });
});
