import { UseCaseError } from './use-case-error';

export class NotAcceptableError extends Error implements UseCaseError {
    readonly status = 406;
    cause?: any;
    constructor(message?: string, cause?: any) {
        super(message || 'Not Acceptable');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
