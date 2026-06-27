import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { ResourceSpecificationInMemoryRepository } from '@/module/resource-catalog/infra/persistence/in-memory/resource-specification-in-memory.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeLoggerMock = () =>
    ({ info: jest.fn(), error: jest.fn() }) as unknown as LoggerService;

const makeItem = (
    overrides: Partial<ResourceSpecificationModel> = {},
): ResourceSpecificationModel => ({
    id: 'spec-1',
    name: 'CPE ZTE',
    lifecycleStatus: 'Active',
    uniqueKey: 'CPE|ZTE|F670L|STD',
    '@type': 'ResourceSpecification',
    resourceCatalog: [],
    resourceCategory: [],
    resourceSpecCharacteristic: [],
    ...overrides,
});

describe('ResourceSpecificationInMemoryRepository', () => {
    describe('create + findById', () => {
        it('should store and return item', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            const item = makeItem();
            const result = await repo.create(item);
            expect(result.id).toBe('spec-1');
        });

        it('should accept seed items via constructor', async () => {
            const seed = makeItem({ id: 'seed-1' });
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
                [seed],
            );
            const found = await repo.findById('seed-1');
            expect(found).not.toBeNull();
        });

        it('should return null from findById when not found', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            expect(await repo.findById('missing')).toBeNull();
        });
    });

    describe('findAll - @type filter', () => {
        it('should exclude items with wrong @type', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ '@type': 'WrongType' as any }));
            const result = await repo.findAll();
            expect(result.total).toBe(0);
        });
    });

    describe('findAll - id filter', () => {
        it('should filter by id string', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1' }));
            await repo.create(makeItem({ id: 's2' }));
            const result = await repo.findAll({ filters: { id: 's1' } });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('s1');
        });
    });

    describe('findAll - other basic filters', () => {
        it('should filter by name', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', name: 'Alpha' }));
            await repo.create(makeItem({ id: 's2', name: 'Beta' }));
            const result = await repo.findAll({ filters: { name: 'Alpha' } });
            expect(result.total).toBe(1);
        });

        it('should filter by lifecycleStatus', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 's1', lifecycleStatus: 'Active' }),
            );
            await repo.create(
                makeItem({ id: 's2', lifecycleStatus: 'Inactive' }),
            );
            expect(
                (await repo.findAll({ filters: { lifecycleStatus: 'Active' } }))
                    .total,
            ).toBe(1);
        });

        it('should filter by description substring (case-insensitive)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 's1', description: 'Hello World' }),
            );
            await repo.create(makeItem({ id: 's2', description: 'Other' }));
            const result = await repo.findAll({
                filters: { description: 'hello' },
            });
            expect(result.total).toBe(1);
        });

        it('should filter by version', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', version: '1.0' }));
            await repo.create(makeItem({ id: 's2', version: '2.0' }));
            expect(
                (await repo.findAll({ filters: { version: '1.0' } })).total,
            ).toBe(1);
        });

        it('should filter by category', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', category: 'CPE' }));
            await repo.create(makeItem({ id: 's2', category: 'Other' }));
            expect(
                (await repo.findAll({ filters: { category: 'CPE' } })).total,
            ).toBe(1);
        });

        it('should filter by resourceCatalogId', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 's1', resourceCatalog: [{ id: 'cat-main' }] }),
            );
            await repo.create(
                makeItem({ id: 's2', resourceCatalog: [{ id: 'cat-other' }] }),
            );
            const result = await repo.findAll({
                filters: { resourceCatalogId: 'cat-main' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('s1');
        });

        it('should filter by resourceCategoryId', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 's1', resourceCategory: [{ id: 'router' }] }),
            );
            await repo.create(
                makeItem({ id: 's2', resourceCategory: [{ id: 'switch' }] }),
            );
            const result = await repo.findAll({
                filters: { resourceCategoryId: 'router' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('s1');
        });
    });

    describe('findAll - characteristic filters', () => {
        it('should filter by characteristicName only (single value)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's2',
                    resourceSpecCharacteristic: [
                        { name: 'Color', value: 'Red' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: { resourceSpecCharacteristicName: ['Brand'] },
            });
            expect(result.total).toBe(1);
        });

        it('should filter by characteristicName with multiple values (OR semantics)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's2',
                    resourceSpecCharacteristic: [
                        { name: 'Model', value: 'X1' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's3',
                    resourceSpecCharacteristic: [
                        { name: 'Color', value: 'Red' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: { resourceSpecCharacteristicName: ['Brand', 'Model'] },
            });
            expect(result.total).toBe(2);
            expect(result.items.map((i) => i.id).sort()).toEqual(['s1', 's2']);
        });

        it('should filter by characteristicValue only (single value)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's2',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'Huawei' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: { resourceSpecCharacteristicValue: ['ZTE'] },
            });
            expect(result.total).toBe(1);
        });

        it('should filter by characteristicValue with multiple values (OR semantics)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's2',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'Huawei' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's3',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'Cisco' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: { resourceSpecCharacteristicValue: ['ZTE', 'Huawei'] },
            });
            expect(result.total).toBe(2);
            expect(result.items.map((i) => i.id).sort()).toEqual(['s1', 's2']);
        });

        it('should filter by both characteristicName AND characteristicValue (combined, single values)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's2',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'Huawei' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: {
                    resourceSpecCharacteristicName: ['Brand'],
                    resourceSpecCharacteristicValue: ['ZTE'],
                },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('s1');
        });

        it('should filter by both with multiple values (combined OR per field)', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's2',
                    resourceSpecCharacteristic: [
                        { name: 'Model', value: 'Huawei' },
                    ],
                }),
            );
            await repo.create(
                makeItem({
                    id: 's3',
                    resourceSpecCharacteristic: [
                        { name: 'Color', value: 'ZTE' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: {
                    resourceSpecCharacteristicName: ['Brand', 'Model'],
                    resourceSpecCharacteristicValue: ['ZTE', 'Huawei'],
                },
            });
            // s1: Brand matches names, ZTE matches values → include
            // s2: Model matches names, Huawei matches values → include
            // s3: Color does NOT match names → exclude
            expect(result.total).toBe(2);
            expect(result.items.map((i) => i.id).sort()).toEqual(['s1', 's2']);
        });

        it('should not match when name matches but value doesnt in combined filter', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 's1',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            const result = await repo.findAll({
                filters: {
                    resourceSpecCharacteristicName: ['Brand'],
                    resourceSpecCharacteristicValue: ['Cisco'],
                },
            });
            expect(result.total).toBe(0);
        });
    });

    describe('findAll - validAt filter', () => {
        it('should filter by validAt window', async () => {
            const repository = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
                [],
            );

            await repository.create({
                id: 'spec-active',
                name: 'Spec Active',
                lifecycleStatus: 'Active',
                uniqueKey: 'key',
                resourceCatalog: [],
                resourceCategory: [{ id: 'spec' }],
                '@type': 'ResourceSpecification',
                validFor: {
                    startDateTime: '2026-01-01T00:00:00.000Z',
                    endDateTime: '2026-12-31T23:59:59.999Z',
                },
            });

            await repository.create({
                id: 'spec-future',
                name: 'Spec Future',
                lifecycleStatus: 'Active',
                uniqueKey: 'key',
                resourceCatalog: [],
                resourceCategory: [{ id: 'spec' }],
                '@type': 'ResourceSpecification',
                validFor: {
                    startDateTime: '2027-01-01T00:00:00.000Z',
                },
            });

            const filtered = await repository.findAll({
                offset: 0,
                limit: 20,
                filters: {
                    validAt: '2026-06-01T00:00:00.000Z',
                },
            });

            expect(filtered.total).toBe(1);
            expect(filtered.items[0].id).toBe('spec-active');
        });

        it('should filter out items with endDateTime before validAt', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 'expired',
                    validFor: { endDateTime: '2020-12-31T23:59:59Z' },
                }),
            );
            const result = await repo.findAll({
                filters: { validAt: '2025-06-01T00:00:00Z' },
            });
            expect(result.total).toBe(0);
        });
    });

    describe('findAll - date range filters', () => {
        it('should filter by createdAtStart', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'old', createdAt: new Date('2024-01-01') }),
            );
            await repo.create(
                makeItem({ id: 'new', createdAt: new Date('2025-06-01') }),
            );
            const result = await repo.findAll({
                filters: { createdAtStart: '2025-01-01T00:00:00Z' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('new');
        });

        it('should filter by createdAtEnd', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'old', createdAt: new Date('2024-01-01') }),
            );
            await repo.create(
                makeItem({ id: 'new', createdAt: new Date('2025-06-01') }),
            );
            const result = await repo.findAll({
                filters: { createdAtEnd: '2024-12-31T23:59:59Z' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('old');
        });

        it('should filter by updatedAtStart', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'u1', updatedAt: new Date('2024-01-01') }),
            );
            await repo.create(
                makeItem({ id: 'u2', updatedAt: new Date('2025-06-01') }),
            );
            const result = await repo.findAll({
                filters: { updatedAtStart: '2025-01-01T00:00:00Z' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('u2');
        });

        it('should filter by updatedAtEnd', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'u1', updatedAt: new Date('2024-01-01') }),
            );
            await repo.create(
                makeItem({ id: 'u2', updatedAt: new Date('2025-06-01') }),
            );
            const result = await repo.findAll({
                filters: { updatedAtEnd: '2024-12-31T23:59:59Z' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('u1');
        });
    });

    describe('findAll - pagination and sorting', () => {
        it('should apply offset and limit', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            for (let i = 0; i < 5; i++)
                await repo.create(makeItem({ id: `s${i}` }));
            const result = await repo.findAll({ offset: 2, limit: 2 });
            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(5);
        });

        it('should sort by name ASC', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', name: 'Zebra' }));
            await repo.create(makeItem({ id: 's2', name: 'Apple' }));
            const result = await repo.findAll({ sort: { name: 'ASC' } });
            expect(result.items[0].name).toBe('Apple');
        });

        it('should sort by name DESC', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', name: 'Zebra' }));
            await repo.create(makeItem({ id: 's2', name: 'Apple' }));
            const result = await repo.findAll({ sort: { name: 'DESC' } });
            expect(result.items[0].name).toBe('Zebra');
        });
    });

    describe('patchById', () => {
        it('should update existing item', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.patchById('spec-1', { name: 'Updated' });
            expect(result?.name).toBe('Updated');
        });

        it('should return null when item does not exist', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            const result = await repo.patchById('missing', { name: 'X' });
            expect(result).toBeNull();
        });
    });

    describe('existsByBusinessKey', () => {
        it('should return true when a matching uniqueKey exists', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', uniqueKey: 'KEY-1' }));
            expect(await repo.existsByBusinessKey('KEY-1')).toBe(true);
        });

        it('should return false when no matching uniqueKey', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            expect(await repo.existsByBusinessKey('NO-MATCH')).toBe(false);
        });

        it('should return false when key matches but excludeId excludes it', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', uniqueKey: 'KEY-1' }));
            expect(await repo.existsByBusinessKey('KEY-1', 's1')).toBe(false);
        });

        it('should return true when key matches a different id than excludeId', async () => {
            const repo = new ResourceSpecificationInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 's1', uniqueKey: 'KEY-1' }));
            expect(await repo.existsByBusinessKey('KEY-1', 's99')).toBe(true);
        });
    });
});
