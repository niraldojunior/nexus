import { ResourceSpecificationCharacteristicModel } from '@/module/resource-catalog/domain/model/resource-specification.model';

interface ResourceSpecificationCharacteristicInputItem {
    name?: string;
    valueType?: string;
    value?: unknown;
}

interface ResourceSpecificationCharacteristicInput {
    resourceSpecCharacteristic?: ResourceSpecificationCharacteristicInputItem[];
    characteristic?: ResourceSpecificationCharacteristicInputItem[];
}

export class ResourceSpecificationCharacteristicMapper {
    static normalize(
        input: ResourceSpecificationCharacteristicInput,
    ): ResourceSpecificationCharacteristicModel[] | undefined {
        const source =
            input.resourceSpecCharacteristic || input.characteristic || [];

        const normalized = source
            .filter(
                (item) =>
                    item &&
                    typeof item === 'object' &&
                    'name' in item &&
                    'value' in item &&
                    typeof item.name === 'string' &&
                    typeof item.value !== 'object',
            )
            .map((item) => ({
                ...(item as Record<string, unknown>),
                name: item.name ? item.name.trim() : item.name,
                value: String(item.value),
                valueType:
                    typeof item.valueType === 'string' &&
                    /\d{4}-[01]\d-[0-3]\d/.test(item.value as string)
                        ? 'datetime'
                        : typeof item.valueType === 'string'
                          ? item.valueType
                          : typeof item.value === 'number'
                            ? 'string'
                            : item.valueType,
            })) as ResourceSpecificationCharacteristicModel[];

        return normalized.length ? normalized : undefined;
    }
}
