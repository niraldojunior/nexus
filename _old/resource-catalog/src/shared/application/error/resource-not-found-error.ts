import { UseCaseError } from './use-case-error';

export class ResourceNotFoundError extends Error implements UseCaseError {
    readonly status = 404;

    constructor() {
        super('Resource not found');
    }

    get message(): string {
        return this.message;
    }
}
