export type PorteGroup = 'STD' | 'CUSTOMIZADO';

export class ResourceSpecificationUniqueKeyRule {
    static getPorteGroup(porte: string): PorteGroup {
        return porte.trim().toUpperCase() === 'CUSTOMIZADO'
            ? 'CUSTOMIZADO'
            : 'STD';
    }

    static extractFromCharacteristics(
        characteristics: { name?: string; value?: unknown }[],
    ): { brand?: string; model?: string; categoria?: string } {
        const result: { brand?: string; model?: string; categoria?: string } =
            {};

        for (const char of characteristics) {
            const name = char.name?.trim().toUpperCase();
            if (name === 'BRAND') result.brand = String(char.value ?? '');
            else if (name === 'MODEL') result.model = String(char.value ?? '');
            else if (name === 'CATEGORIA')
                result.categoria = String(char.value ?? '');
        }

        return result;
    }

    static computeFromSpec(spec: {
        resourceCategory: { id: string }[];
        resourceSpecCharacteristic?: { name?: string; value?: unknown }[];
    }): string | undefined {
        if (
            !(
                spec.resourceCategory &&
                spec.resourceCategory.length &&
                spec.resourceCategory[0].id
            )
        ) {
            return;
        }

        const categoryId = spec.resourceCategory.map((cat) => cat.id).join('-');
        const chars = spec.resourceSpecCharacteristic ?? [];
        const { brand, model, categoria } =
            this.extractFromCharacteristics(chars);

        if (!brand || !model || !categoria) {
            return;
        }

        const porteGroup = this.getPorteGroup(categoria);

        return [categoryId, brand, model, porteGroup]
            .map((s) => s.trim().toUpperCase())
            .join('|');
    }
}
