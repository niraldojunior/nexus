import { UseCaseError } from './use-case-error';

export class BadRequestError extends Error implements UseCaseError {
    readonly status = 400;
    cause?: any;

    constructor(message?: string, cause?: any) {
        super(message || 'Bad request');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
