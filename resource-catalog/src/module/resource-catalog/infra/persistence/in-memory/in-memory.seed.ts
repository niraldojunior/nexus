import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { Snowflake } from '@/shared/application/entity/snowflake-id.entity';
import { env } from '@/shared/infra/config/env/environment-config.service';

export interface InMemorySeedData {
    resourceCatalogs: ResourceCatalogModel[];
    resourceCategories: ResourceCategoryModel[];
    resourceSpecifications: ResourceSpecificationModel[];
    resourceCandidates: ResourceCandidateModel[];
}

interface FakerLike {
    seed(value: number): void;
    company: {
        name(): string;
    };
    commerce: {
        department(): string;
        productName(): string;
    };
    helpers: {
        arrayElement<T>(array: T[]): T;
    };
    lorem: {
        sentence(wordCount?: number): string;
    };
    number: {
        int(options: { min: number; max: number }): number;
    };
    string: {
        alphanumeric(options: { length: number }): string;
    };
}

const SEED_RANDOM_BASE = 6342026;
const DEFAULT_CATALOG_COUNT = 10;
const DEFAULT_CATEGORY_COUNT = 10;
const DEFAULT_SPECIFICATION_COUNT = 16;

const lifecycleStatuses: LifecycleStatus[] = Object.values(LifecycleStatus);
const baseCategories = [
    { code: 'router', label: 'Router' },
    { code: 'ont', label: 'ONT' },
    { code: 'gateway', label: 'Gateway' },
    { code: 'switch', label: 'Switch' },
    { code: 'modem', label: 'Modem' },
];
const baseBrands = ['ZTE', 'Huawei', 'Nokia', 'FiberHome', 'Intelbras'];
const basePortes = ['P', 'M', 'G', 'CUSTOMIZADO'];
let cachedSeedData: InMemorySeedData | undefined;

const addDays = (value: Date, days: number): Date => {
    const next = new Date(value.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const getLifecycleStatus = (
    index: number,
    faker?: FakerLike,
): LifecycleStatus =>
    faker?.helpers.arrayElement(lifecycleStatuses) ??
    lifecycleStatuses[index % lifecycleStatuses.length];

const getBaseCategory = (
    index: number,
    faker?: FakerLike,
): { code: string; label: string } =>
    faker?.helpers.arrayElement(baseCategories) ??
    baseCategories[index % baseCategories.length];

const getBrand = (index: number, faker?: FakerLike): string =>
    faker?.helpers.arrayElement(baseBrands) ??
    baseBrands[index % baseBrands.length];

const getPorte = (index: number, faker?: FakerLike): string =>
    faker?.helpers.arrayElement(basePortes) ??
    basePortes[index % basePortes.length];

const parseSeedCount = (
    value: string | undefined,
    fallback: number,
): number => {
    const parsed = Number.parseInt(value ?? `${fallback}`, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getSeedId = (): string => Snowflake.nextId().toString();

const cloneDate = (value?: Date): Date | undefined =>
    value ? new Date(value) : undefined;

const cloneCatalog = (item: ResourceCatalogModel): ResourceCatalogModel => ({
    ...item,
    validFor: item.validFor
        ? {
              ...item.validFor,
          }
        : undefined,
    createdAt: cloneDate(item.createdAt),
    updatedAt: cloneDate(item.updatedAt),
});

const cloneCategory = (item: ResourceCategoryModel): ResourceCategoryModel => ({
    ...item,
    validFor: item.validFor
        ? {
              ...item.validFor,
          }
        : undefined,
    createdAt: cloneDate(item.createdAt),
    updatedAt: cloneDate(item.updatedAt),
});

const cloneSpecification = (
    item: ResourceSpecificationModel,
): ResourceSpecificationModel => ({
    ...item,
    resourceCategory: item.resourceCategory?.map((category) => ({
        ...category,
    })),
    resourceSpecCharacteristic: item.resourceSpecCharacteristic?.map(
        (characteristic) => ({
            ...characteristic,
        }),
    ),
    validFor: item.validFor
        ? {
              ...item.validFor,
          }
        : undefined,
    createdAt: cloneDate(item.createdAt),
    updatedAt: cloneDate(item.updatedAt),
});

const cloneCandidate = (
    item: ResourceCandidateModel,
): ResourceCandidateModel => ({
    ...item,
    category: item.category?.map((c) => ({ ...c })) ?? [],
    catalog: { ...item.catalog },
    resourceSpecification: { ...item.resourceSpecification },
    validFor: item.validFor ? { ...item.validFor } : undefined,
    createdAt: cloneDate(item.createdAt),
    updatedAt: cloneDate(item.updatedAt),
});

const cloneSeedData = (seed: InMemorySeedData): InMemorySeedData => ({
    resourceCatalogs: seed.resourceCatalogs.map((item) => cloneCatalog(item)),
    resourceCategories: seed.resourceCategories.map((item) =>
        cloneCategory(item),
    ),
    resourceSpecifications: seed.resourceSpecifications.map((item) =>
        cloneSpecification(item),
    ),
    resourceCandidates: seed.resourceCandidates.map((item) =>
        cloneCandidate(item),
    ),
});

const buildTimeContext = (
    index: number,
    faker?: FakerLike,
): {
    createdAt: Date;
    updatedAt: Date;
    startDateTime: string;
    endDateTime?: string;
} => {
    const createdAt = addDays(new Date(), index * 2);
    const updatedAt = addDays(createdAt, 1);
    const startDateTime = addDays(
        createdAt,
        faker?.number.int({ min: 1, max: 30 }) ?? (index % 5) + 1,
    ).toISOString();
    const shouldHaveEndDate = index % 3 === 0;
    const endDateTime = shouldHaveEndDate
        ? addDays(new Date(startDateTime), 365).toISOString()
        : undefined;

    return {
        createdAt,
        updatedAt,
        startDateTime,
        endDateTime,
    };
};

const buildCatalogs = (faker?: FakerLike): ResourceCatalogModel[] => {
    const count = parseSeedCount(
        process.env.TMF634_IN_MEMORY_SEED_CATALOG_COUNT,
        DEFAULT_CATALOG_COUNT,
    );

    return Array.from({ length: count }, (_, index) => {
        const baseCategory = getBaseCategory(index, faker);
        const timeline = buildTimeContext(index, faker);
        const id = getSeedId();

        return {
            id,
            href: `/api/v1/resourceCatalog/${id}`,
            '@type': 'ResourceCatalog',
            name:
                faker?.commerce.department() ??
                `Catalog ${baseCategory.label} ${index + 1}`,
            description:
                faker?.lorem.sentence(8) ??
                `Catalogo ${baseCategory.label} para fallback in-memory (${index + 1}).`,
            lifecycleStatus: getLifecycleStatus(index, faker),
            version: `1.0.${index}`,
            validFor: {
                startDateTime: timeline.startDateTime,
                endDateTime: timeline.endDateTime,
            },
            createdAt: timeline.createdAt,
            updatedAt: timeline.updatedAt,
        };
    });
};

const buildCategories = (
    catalog: any,
    faker?: FakerLike,
): ResourceCategoryModel[] => {
    const count = parseSeedCount(
        process.env.TMF634_IN_MEMORY_SEED_CATEGORY_COUNT,
        DEFAULT_CATEGORY_COUNT,
    );

    return Array.from({ length: count }, (_, index) => {
        const baseCategory = getBaseCategory(index, faker);
        const timeline = buildTimeContext(index + 7, faker);
        const id = getSeedId();

        const linkedCategory = catalog[index % catalog.length];
        if (!linkedCategory) {
            throw new Error(
                `Failed to build catalog with linked category (index: ${index})`,
            );
        }

        return {
            id,
            href: `/api/v1/resourceCategory/${id}`,
            '@type': 'ResourceCategory',
            name: `${baseCategory.label} Category ${index + 1}`,
            description:
                faker?.lorem.sentence(10) ??
                `Categoria ${baseCategory.label} para fallback in-memory (${index + 1}).`,
            lifecycleStatus: getLifecycleStatus(index + 1, faker),
            version: `1.1.${index}`,
            category: baseCategory.label,
            resourceCatalog: [{ id: linkedCategory.id }],
            validFor: {
                startDateTime: timeline.startDateTime,
                endDateTime: timeline.endDateTime,
            },
            createdAt: timeline.createdAt,
            updatedAt: timeline.updatedAt,
        };
    });
};

const buildSpecifications = (
    catalogs: ResourceCatalogModel[],
    categories: ResourceCategoryModel[],
    count: number,
    faker?: FakerLike,
): ResourceSpecificationModel[] => {
    return Array.from({ length: count }, (_, index) => {
        const category = categories[index % categories.length];
        const catalog = catalogs[index % catalogs.length];
        const brand = getBrand(index, faker);
        const modelToken =
            faker?.string.alphanumeric({ length: 5 }).toUpperCase() ??
            `${(10000 + index).toString()}`;
        const model = `${brand.slice(0, 3).toUpperCase()}-${modelToken}`;
        const porte = getPorte(index, faker);
        const porteGroup =
            porte.trim().toUpperCase() === 'CUSTOMIZADO'
                ? 'CUSTOMIZADO'
                : 'STD';
        const timeline = buildTimeContext(index + 13, faker);
        const id = getSeedId();

        return {
            id,
            href: `/api/v1/resourceSpecification/${id}`,
            '@type': 'ResourceSpecification',
            name: faker?.commerce.productName() ?? `Spec ${brand} ${model}`,
            description:
                faker?.lorem.sentence(12) ??
                `Specification de exemplo para ${brand} ${model}.`,
            lifecycleStatus: getLifecycleStatus(index + 2, faker),
            version: `2.0.${index}`,
            category: category.category,
            uniqueKey: [category.id, brand, model, porteGroup]
                .map((item) => item.trim().toUpperCase())
                .join('|'),
            resourceCatalog: [{ id: catalog.id }],
            resourceCategory: [{ id: category.id }],
            resourceSpecCharacteristic: [
                {
                    name: 'Brand',
                    valueType: 'string',
                    value: brand,
                },
                {
                    name: 'Model',
                    valueType: 'string',
                    value: model,
                },
                {
                    name: 'categoria',
                    valueType: 'string',
                    value: porte,
                },
                {
                    name: 'idSku',
                    valueType: 'string',
                    value: 'SKU-' + modelToken,
                },
                {
                    name: 'endOfLifeDate',
                    valueType: 'datetime',
                    value: addDays(new Date(), 365 * 3)
                        .toISOString()
                        .split('T')[0],
                },
                {
                    name: 'endOfSupportDate',
                    valueType: 'datetime',
                    value: addDays(new Date(), 365 * 5)
                        .toISOString()
                        .split('T')[0],
                },
                {
                    name: 'suportaSdwan',
                    valueType: 'boolean',
                    value: 'true',
                },
                {
                    name: 'suporteVoz',
                    valueType: 'boolean',
                    value: 'false',
                },
            ],
            validFor: {
                startDateTime: timeline.startDateTime,
                endDateTime: timeline.endDateTime,
            },
            createdAt: timeline.createdAt,
            updatedAt: timeline.updatedAt,
        };
    });
};

const buildCandidates = (
    catalogs: ResourceCatalogModel[],
    specifications: ResourceSpecificationModel[],
): ResourceCandidateModel[] => {
    return specifications.flatMap((spec) => {
        const specCatalogs = spec.resourceCatalog ?? [];

        return specCatalogs
            .filter((catRef) => catalogs.find((c) => c.id === catRef.id))
            .map((catalogRef) => {
                const id = getSeedId();
                const categoryRefs = (spec.resourceCategory ?? []).map(
                    (cr) => ({
                        id: cr.id,
                    }),
                );

                const now = new Date();
                const candidate: ResourceCandidateModel = {
                    id,
                    href: `/api/v1/resourceCandidate/${id}`,
                    '@type': 'ResourceCandidate',
                    name: spec.name,
                    lifecycleStatus: spec.lifecycleStatus,
                    resourceSpecification: {
                        id: spec.id,
                    },
                    category: categoryRefs,
                    catalog: {
                        id: catalogRef.id,
                    },
                    createdAt: now,
                    updatedAt: now,
                };

                return candidate;
            });
    });
};

const loadFaker = (): FakerLike | undefined => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fakerPackage = require('@faker-js/faker') as
            | { faker: FakerLike }
            | FakerLike;
        const fakerInstance =
            'faker' in fakerPackage ? fakerPackage.faker : fakerPackage;
        fakerInstance.seed(SEED_RANDOM_BASE);
        return fakerInstance;
    } catch {
        return undefined;
    }
};

const emptySeed = (): InMemorySeedData => ({
    resourceCatalogs: [],
    resourceCategories: [],
    resourceSpecifications: [],
    resourceCandidates: [],
});

const defaultSeed = (): InMemorySeedData => {
    const faker = loadFaker();
    const specificationCount = parseSeedCount(
        process.env.TMF634_IN_MEMORY_SEED_SPECIFICATION_COUNT,
        DEFAULT_SPECIFICATION_COUNT,
    );
    const resourceCatalogs = buildCatalogs(faker);
    const resourceCategories = buildCategories(resourceCatalogs, faker);
    const resourceSpecifications = buildSpecifications(
        resourceCatalogs,
        resourceCategories,
        specificationCount,
        faker,
    );
    const resourceCandidates = buildCandidates(
        resourceCatalogs,
        resourceSpecifications,
    );

    return {
        resourceCatalogs,
        resourceCategories,
        resourceSpecifications,
        resourceCandidates,
    };
};

export const getTmf634InMemorySeedData = (): InMemorySeedData => {
    const seedEnabled = env<boolean>('TMF634_IN_MEMORY_SEED_ENABLED', false);

    if (!seedEnabled) {
        return emptySeed();
    }

    if (!cachedSeedData) {
        cachedSeedData = defaultSeed();
    }

    return cloneSeedData(cachedSeedData);
};
