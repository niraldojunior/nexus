import { getTmf634InMemorySeedData } from '@/module/resource-catalog/infra/persistence/in-memory/in-memory.seed';
import { ResourceCatalogInMemoryRepository } from '@/module/resource-catalog/infra/persistence/in-memory/resource-catalog-in-memory.repository';
import { ResourceCategoryInMemoryRepository } from '@/module/resource-catalog/infra/persistence/in-memory/resource-category-in-memory.repository';
import { ResourceSpecificationInMemoryRepository } from '@/module/resource-catalog/infra/persistence/in-memory/resource-specification-in-memory.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeLoggerMock = () =>
    ({ info: jest.fn(), error: jest.fn() }) as unknown as LoggerService;

describe('TMF634 in-memory seed', () => {
    const originalSeedFlag = process.env.TMF634_IN_MEMORY_SEED_ENABLED;

    afterEach(() => {
        process.env.TMF634_IN_MEMORY_SEED_ENABLED = originalSeedFlag;
    });

    it('should keep seed empty when flag is disabled', () => {
        process.env.TMF634_IN_MEMORY_SEED_ENABLED = 'false';

        const seed = getTmf634InMemorySeedData();

        expect(seed.resourceCatalogs).toHaveLength(0);
        expect(seed.resourceCategories).toHaveLength(0);
        expect(seed.resourceSpecifications).toHaveLength(0);
    });

    it('should provide default seed when flag is enabled', () => {
        process.env.TMF634_IN_MEMORY_SEED_ENABLED = 'true';

        const seed = getTmf634InMemorySeedData();

        expect(seed.resourceCatalogs.length).toBeGreaterThan(5);
        expect(seed.resourceCategories.length).toBeGreaterThan(5);
        expect(seed.resourceSpecifications.length).toBeGreaterThan(10);

        const sampleCatalog = seed.resourceCatalogs[0];
        const sampleCategory = seed.resourceCategories[0];
        const sampleSpecification = seed.resourceSpecifications[0];

        expect(sampleCatalog.validFor?.startDateTime).toBeDefined();
        expect(sampleCatalog.createdAt).toBeInstanceOf(Date);
        expect(sampleCatalog.updatedAt).toBeInstanceOf(Date);
        expect(sampleCatalog.href).toContain('/resourceCatalog/');

        expect(sampleCategory.validFor?.startDateTime).toBeDefined();
        expect(sampleCategory.createdAt).toBeInstanceOf(Date);
        expect(sampleCategory.updatedAt).toBeInstanceOf(Date);
        expect(sampleCategory.href).toContain('/resourceCategory/');

        expect(sampleSpecification.validFor?.startDateTime).toBeDefined();
        expect(sampleSpecification.createdAt).toBeInstanceOf(Date);
        expect(sampleSpecification.updatedAt).toBeInstanceOf(Date);
        expect(sampleSpecification.href).toContain('/resourceSpecification/');
        expect(sampleSpecification.uniqueKey).toMatch(/\|/);
        expect(sampleCatalog.id).toMatch(/^\d+$/);
        expect(sampleCategory.id).toMatch(/^\d+$/);
        expect(sampleSpecification.id).toMatch(/^\d+$/);
        expect(sampleSpecification.resourceSpecCharacteristic).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Brand' }),
                expect.objectContaining({ name: 'Model' }),
                expect.objectContaining({ name: 'categoria' }),
            ]),
        );

        const categoryIds = new Set(
            seed.resourceCategories.map((item) => item.id),
        );
        for (const catalog of seed.resourceCatalogs) {
            expect(catalog.id).toMatch(/^\d+$/);
        }

        for (const specification of seed.resourceSpecifications) {
            const linkedId = specification.resourceCategory?.[0]?.id;
            expect(linkedId).toBeDefined();
            expect(categoryIds.has(linkedId as string)).toBe(true);
        }
    });

    it('should keep relationship IDs consistent across independent seed calls', () => {
        process.env.TMF634_IN_MEMORY_SEED_ENABLED = 'true';

        const firstSeed = getTmf634InMemorySeedData();
        const secondSeed = getTmf634InMemorySeedData();

        expect(firstSeed.resourceCategories[0]?.id).toBe(
            secondSeed.resourceCategories[0]?.id,
        );
        expect(firstSeed.resourceCatalogs[0]?.id).toBeDefined();
        expect(firstSeed.resourceCatalogs[0]?.id).toBe(
            secondSeed.resourceCatalogs[0]?.id,
        );
        expect(
            firstSeed.resourceSpecifications[0]?.resourceCategory?.[0]?.id,
        ).toBe(secondSeed.resourceSpecifications[0]?.resourceCategory?.[0]?.id);
    });

    it('should initialize repositories with provided seed data', async () => {
        const logger = makeLoggerMock();
        const catalogRepository = new ResourceCatalogInMemoryRepository(
            logger,
            [
                {
                    id: 'catalog-001',
                    name: 'Catalog Seed',
                    lifecycleStatus: 'Active',
                },
            ],
        );
        const categoryRepository = new ResourceCategoryInMemoryRepository(
            logger,
            [
                {
                    id: 'category-001',
                    name: 'Category Seed',
                    lifecycleStatus: 'Active',
                    resourceCatalog: [{ id: 'catalog-001' }],
                },
            ],
        );
        const specificationRepository =
            new ResourceSpecificationInMemoryRepository(logger, [
                {
                    id: 'spec-001',
                    name: 'Specification Seed',
                    lifecycleStatus: 'Active',
                    resourceCatalog: [{ id: 'catalog-001' }],
                    resourceCategory: [{ id: 'category-001' }],
                    uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                },
            ]);

        const catalog = await catalogRepository.findById('catalog-001');
        const category = await categoryRepository.findById('category-001');
        const specification =
            await specificationRepository.findById('spec-001');

        expect(catalog?.name).toBe('Catalog Seed');
        expect(category?.name).toBe('Category Seed');
        expect(specification?.name).toBe('Specification Seed');
    });
});
