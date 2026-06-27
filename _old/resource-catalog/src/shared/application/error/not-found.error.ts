import { UseCaseError } from './use-case-error';

export class NotFoundError extends Error implements UseCaseError {
    readonly status = 404;

    cause?: any;
    constructor(message?: string, cause?: any) {
        super(message || 'Not Found');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
