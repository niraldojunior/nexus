import { UseCaseError } from './use-case-error';

export class ForbiddenRequestError extends Error implements UseCaseError {
    readonly status = 403;
    cause?: any;

    constructor(message?: string, cause?: any) {
        super(message || 'Forbidden');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
