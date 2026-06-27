import { ValidationError } from 'class-validator';

export class ClassValidatorError extends Error {
    constructor(validationError: ValidationError[]) {
        super();
        this.message = this.getValidationErrorCause(validationError[0])
            .join(', ')
            .toString();
    }

    private getValidationErrorCause(
        validationError: ValidationError,
        path = '',
    ) {
        const updatedPath =
            path.length > 0
                ? `${path}.${validationError.property}`
                : validationError.property;

        if (validationError.children && validationError.children.length > 0) {
            return this.getValidationErrorCause(
                validationError.children[0],
                updatedPath,
            );
        }

        return Object.keys(validationError.constraints || []).map(
            (key) => `${updatedPath}.${validationError.constraints?.[key]}`,
        );
    }
}
