import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsRequired(
    validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'isRequired',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    return value !== undefined;
                },
                defaultMessage() {
                    return '$property is a required field';
                },
            },
        });
    };
}
