import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsSimpleDateString(
    validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'isSimpleDateString',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    const dateRegex =
                        /^\d{4}-(0?[1-9]|1[012])-(0?[1-9]|[12][0-9]|3[01])$/;
                    return typeof value === 'string' && dateRegex.test(value);
                },
                defaultMessage() {
                    return '$property should be a string holding a date in the format YYYY-MM-DD';
                },
            },
        });
    };
}
