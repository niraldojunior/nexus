export interface MinimumStructureValidationResult {
    valid: boolean;
    errors: string[];
}

export class ResourceSpecificationMinimumStructureRule {
    static validate(input: {
        resourceCatalog?: { id?: string }[];
        resourceCategory?: { id?: string }[];
        resourceSpecCharacteristic?: { name?: string; value?: unknown }[];
        validFor?: { startDateTime?: string | Date };
    }): MinimumStructureValidationResult {
        const errors: string[] = [];

        if (!input.resourceCatalog?.[0]?.id) {
            errors.push('resourceCatalog[0].id is required');
        }

        if (!input.resourceCategory?.[0]?.id) {
            errors.push('resourceCategory[0].id is required');
        }

        if (!input.validFor?.startDateTime) {
            errors.push('validFor.startDateTime is required');
        }

        const characteristics = input.resourceSpecCharacteristic ?? [];
        const charNames = new Set(
            characteristics
                .map((c) => c.name?.trim().toUpperCase())
                .filter(Boolean),
        );

        if (!charNames.has('BRAND')) {
            errors.push('characteristic Brand is required');
        }
        if (!charNames.has('MODEL')) {
            errors.push('characteristic Model is required');
        }
        if (!charNames.has('CATEGORIA')) {
            errors.push('characteristic categoria is required');
        }

        return { valid: errors.length === 0, errors };
    }
}
