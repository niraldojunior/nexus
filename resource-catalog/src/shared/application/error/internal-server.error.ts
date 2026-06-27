import { UseCaseError } from './use-case-error';

export class InternalServerError extends Error implements UseCaseError {
    readonly status = 500;
    cause?: any;

    constructor(message?: string, cause?: any) {
        super(message || 'Internal Server Error');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
