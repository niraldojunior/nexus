import { UseCaseError } from './use-case-error';

export class AppError extends Error implements UseCaseError {
    status: number;
    cause?: any;

    constructor(message = 'Internal Server Error', status = 500, cause?: any) {
        super(message);
        this.status = status;
        this.cause = cause;
    }

    get message(): string {
        return this.message;
    }
}
