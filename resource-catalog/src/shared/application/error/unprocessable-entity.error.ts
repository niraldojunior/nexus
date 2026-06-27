import { UseCaseError } from './use-case-error';

export class UnprocessableEntityError extends Error implements UseCaseError {
    readonly status = 422;
    cause?: any;

    constructor(message?: string, cause?: any) {
        super(message || 'Unprocessable Entity');
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
