import { UseCaseError } from './use-case-error';

export class ConflictError extends Error implements UseCaseError {
    readonly status = 409;
    cause?: any;

    constructor(message?: string, cause?: any) {
        super(message || 'Conflict');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
