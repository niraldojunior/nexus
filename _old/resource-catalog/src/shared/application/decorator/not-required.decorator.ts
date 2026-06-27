import { ValidateIf, ValidationOptions } from 'class-validator';

export function NotRequired(
    validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
    return function (object: object, propertyName: string) {
        return ValidateIf(
            (obj) => obj[propertyName] !== undefined,
            validationOptions,
        )(object, propertyName);
    };
}
