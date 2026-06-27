import { ValidateIf, ValidationOptions } from 'class-validator';

export function IsNullable(
    validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
    return function (object: object, propertyName: string) {
        return ValidateIf(
            (obj) => obj[propertyName] !== null,
            validationOptions,
        )(object, propertyName);
    };
}
