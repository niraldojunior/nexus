import { ResourceSpecificationMinimumStructureRule } from '@/module/resource-catalog/domain/rule/resource-specification-minimum-structure.rule';
import { ResourceSpecificationUniqueKeyRule } from '@/module/resource-catalog/domain/rule/resource-specification-unique-key.rule';

const VALID_CHARACTERISTICS = [
    { name: 'Brand', value: 'ZTE' },
    { name: 'Model', value: 'F670L' },
    { name: 'categoria', value: 'P' },
];

const VALID_INPUT = {
    resourceCatalog: [{ id: 'catalog-1' }],
    resourceCategory: [{ id: 'cat-router' }],
    resourceSpecCharacteristic: VALID_CHARACTERISTICS,
    validFor: { startDateTime: '2026-01-01T00:00:00Z' },
};

describe('ResourceSpecificationMinimumStructureRule', () => {
    it('should be valid when all required fields are present', () => {
        const result =
            ResourceSpecificationMinimumStructureRule.validate(VALID_INPUT);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail when resourceCategory[0].id is missing', () => {
        const input = { ...VALID_INPUT, resourceCategory: [] };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('resourceCategory[0].id is required');
    });

    it('should fail when validFor.startDateTime is missing', () => {
        const input = { ...VALID_INPUT, validFor: {} };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('validFor.startDateTime is required');
    });

    it('should fail when characteristic Brand is missing', () => {
        const input = {
            ...VALID_INPUT,
            resourceSpecCharacteristic: [
                { name: 'Model', value: 'F670L' },
                { name: 'categoria', value: 'M' },
            ],
        };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('characteristic Brand is required');
    });

    it('should fail when characteristic Model is missing', () => {
        const input = {
            ...VALID_INPUT,
            resourceSpecCharacteristic: [
                { name: 'Brand', value: 'ZTE' },
                { name: 'categoria', value: 'G' },
            ],
        };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('characteristic Model is required');
    });

    it('should fail when characteristic Porte is missing', () => {
        const input = {
            ...VALID_INPUT,
            resourceSpecCharacteristic: [
                { name: 'Brand', value: 'Huawei' },
                { name: 'Model', value: 'EG8145V5' },
            ],
        };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('characteristic categoria is required');
    });

    it('should fail when resourceCatalog[0].id is missing', () => {
        const input = { ...VALID_INPUT, resourceCatalog: [] };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('resourceCatalog[0].id is required');
    });

    it('should accept characteristic names case-insensitively', () => {
        const input = {
            ...VALID_INPUT,
            resourceSpecCharacteristic: [
                { name: 'BRAND', value: 'ZTE' },
                { name: 'model', value: 'F670L' },
                { name: 'CATEGORIA', value: 'P' },
            ],
        };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should trim whitespace from characteristic names before matching', () => {
        const input = {
            ...VALID_INPUT,
            resourceSpecCharacteristic: [
                { name: '  Brand  ', value: 'ZTE' },
                { name: ' Model ', value: 'F670L' },
                { name: ' categoria ', value: 'P' },
            ],
        };

        const result =
            ResourceSpecificationMinimumStructureRule.validate(input);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should report all missing fields at once', () => {
        const result = ResourceSpecificationMinimumStructureRule.validate({});

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(6);
    });
});

describe('ResourceSpecificationUniqueKeyRule', () => {
    describe('getPorteGroup', () => {
        it('should map P to STD', () => {
            expect(ResourceSpecificationUniqueKeyRule.getPorteGroup('P')).toBe(
                'STD',
            );
        });

        it('should map M to STD', () => {
            expect(ResourceSpecificationUniqueKeyRule.getPorteGroup('M')).toBe(
                'STD',
            );
        });

        it('should map G to STD', () => {
            expect(ResourceSpecificationUniqueKeyRule.getPorteGroup('G')).toBe(
                'STD',
            );
        });

        it('should map CUSTOMIZADO to CUSTOMIZADO', () => {
            expect(
                ResourceSpecificationUniqueKeyRule.getPorteGroup('CUSTOMIZADO'),
            ).toBe('CUSTOMIZADO');
        });

        it('should be case-insensitive', () => {
            expect(
                ResourceSpecificationUniqueKeyRule.getPorteGroup('customizado'),
            ).toBe('CUSTOMIZADO');
            expect(ResourceSpecificationUniqueKeyRule.getPorteGroup('p')).toBe(
                'STD',
            );
        });
    });

    describe('computeFromSpec', () => {
        it('should compute uniqueKey as categoryId|brand|model|porteGroup', () => {
            const key = ResourceSpecificationUniqueKeyRule.computeFromSpec({
                resourceCategory: [{ id: 'cat-router' }],
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'zte' },
                    { name: 'Model', value: 'f670l' },
                    { name: 'categoria', value: 'P' },
                ],
            });

            expect(key).toBe('CAT-ROUTER|ZTE|F670L|STD');
        });

        it('should use CUSTOMIZADO group for Porte=CUSTOMIZADO', () => {
            const key = ResourceSpecificationUniqueKeyRule.computeFromSpec({
                resourceCategory: [{ id: 'cat-router' }],
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'CUSTOMIZADO' },
                ],
            });

            expect(key).toBe('CAT-ROUTER|ZTE|F670L|CUSTOMIZADO');
        });

        it('should produce different keys for STD and CUSTOMIZADO with same brand+model+category', () => {
            const stdKey = ResourceSpecificationUniqueKeyRule.computeFromSpec({
                resourceCategory: [{ id: 'router' }],
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'Huawei' },
                    { name: 'Model', value: 'EG8145V5' },
                    { name: 'categoria', value: 'M' },
                ],
            });

            const customKey =
                ResourceSpecificationUniqueKeyRule.computeFromSpec({
                    resourceCategory: [{ id: 'router' }],
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'Huawei' },
                        { name: 'Model', value: 'EG8145V5' },
                        { name: 'categoria', value: 'CUSTOMIZADO' },
                    ],
                });

            expect(stdKey).not.toBe(customKey);
        });

        it('should not throw when resourceCategory is missing', () => {
            expect(() => {
                ResourceSpecificationUniqueKeyRule.computeFromSpec({
                    resourceCategory: [],
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                        { name: 'Model', value: 'F670L' },
                        { name: 'categoria', value: 'P' },
                    ],
                });
            }).not.toThrow();
        });

        it('should return undefined when resourceCategory is missing', () => {
            const key = ResourceSpecificationUniqueKeyRule.computeFromSpec({
                resourceCategory: [],
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            });
            expect(key).toBe(undefined);
        });

        it('should not throw when required characteristics are missing', () => {
            expect(() => {
                ResourceSpecificationUniqueKeyRule.computeFromSpec({
                    resourceCategory: [{ id: 'router' }],
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                });
            }).not.toThrow();
        });

        it('should return undefined when required characteristics are missing', () => {
            const key = ResourceSpecificationUniqueKeyRule.computeFromSpec({
                resourceCategory: [{ id: 'router' }],
                resourceSpecCharacteristic: [{ name: 'Brand', value: 'ZTE' }],
            });
            expect(key).toBe(undefined);
        });
    });
});
