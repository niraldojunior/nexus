type AttemptSuccess<T> = readonly [null, T];
type AttemptFailure<E> = readonly [E, null];
type AttemptResult<E, T> = AttemptSuccess<T> | AttemptFailure<E>;
type AttemptResultAsync<E, T> = Promise<AttemptResult<E, T>>;

export function tryCatch<E = Error, T = Promise<any>>(
    operation: T,
): AttemptResultAsync<E, T>;
export async function tryCatch<E = Error, T = any>(
    operation: () => T,
): Promise<AttemptResult<E, T>>;
export async function tryCatch<E = Error, T = any>(
    operation: Promise<T> | (() => T),
): Promise<AttemptResult<E, T> | AttemptResultAsync<E, T>> {
    if (operation instanceof Promise) {
        return operation
            .then((value: T) => [null, value] as const)
            .catch((error: E) => [error, null] as const);
    }

    try {
        const data = operation();
        return [null, data];
    } catch (error) {
        return [error as E, null];
    }
}
