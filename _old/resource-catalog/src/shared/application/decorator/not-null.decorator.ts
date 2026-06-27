import { registerDecorator, ValidationOptions } from 'class-validator';

export function NotNull(
    validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'notNull',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    return value !== null;
                },
                defaultMessage() {
                    return '$property should not be null';
                },
            },
        });
    };
}
