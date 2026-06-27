import { UseCaseError } from './use-case-error';

export class UnauthorizedError extends Error implements UseCaseError {
    readonly status = 401;
    cause?: any;

    constructor(message?: string, cause?: any) {
        super(message || 'Unauthorized');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
