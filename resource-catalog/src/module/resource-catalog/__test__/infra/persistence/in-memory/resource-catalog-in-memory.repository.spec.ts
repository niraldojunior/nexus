import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { ResourceCatalogInMemoryRepository } from '@/module/resource-catalog/infra/persistence/in-memory/resource-catalog-in-memory.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeLoggerMock = () =>
    ({ info: jest.fn(), error: jest.fn() }) as unknown as LoggerService;

const makeItem = (
    overrides: Partial<ResourceCatalogModel> = {},
): ResourceCatalogModel => ({
    id: 'catalog-1',
    name: 'Main Catalog',
    lifecycleStatus: 'Active',
    '@type': 'ResourceCatalog',
    ...overrides,
});

describe('ResourceCatalogInMemoryRepository', () => {
    describe('create', () => {
        it('should store and return a clone of the item', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            const item = makeItem({
                validFor: { startDateTime: '2025-01-01T00:00:00Z' },
                createdAt: new Date('2025-01-01'),
            });
            const result = await repo.create(item);
            expect(result.id).toBe('catalog-1');
            expect(result).not.toBe(item); // cloned
        });

        it('should accept seed items in constructor', async () => {
            const seed = makeItem({ id: 'seeded' });
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
                [seed],
            );
            const found = await repo.findById('seeded');
            expect(found).not.toBeNull();
        });
    });

    describe('findById', () => {
        it('should return the item when found', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.findById('catalog-1');
            expect(result?.id).toBe('catalog-1');
        });

        it('should return null when not found', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            const result = await repo.findById('not-found');
            expect(result).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return empty when no items with matching @type', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ '@type': 'WrongType' as any }));
            const result = await repo.findAll();
            expect(result.total).toBe(0);
        });

        it('should return all matching items with no filters', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1' }));
            await repo.create(makeItem({ id: 'c2' }));
            const result = await repo.findAll();
            expect(result.total).toBe(2);
        });

        it('should filter by id string', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1' }));
            await repo.create(makeItem({ id: 'c2' }));
            const result = await repo.findAll({ filters: { id: 'c1' } });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('c1');
        });

        it('should filter by id array', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1' }));
            await repo.create(makeItem({ id: 'c2' }));
            await repo.create(makeItem({ id: 'c3' }));
            const result = await repo.findAll({
                filters: { id: ['c1', 'c3'] },
            });
            expect(result.total).toBe(2);
        });

        it('should filter by name exact match', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', name: 'Alpha' }));
            await repo.create(makeItem({ id: 'c2', name: 'Beta' }));
            const result = await repo.findAll({ filters: { name: 'Alpha' } });
            expect(result.total).toBe(1);
        });

        it('should filter by lifecycleStatus', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'c1', lifecycleStatus: 'Active' }),
            );
            await repo.create(
                makeItem({ id: 'c2', lifecycleStatus: 'Inactive' }),
            );
            const result = await repo.findAll({
                filters: { lifecycleStatus: 'Active' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].lifecycleStatus).toBe('Active');
        });

        it('should filter by description substring (case-insensitive)', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'c1', description: 'Hello World' }),
            );
            await repo.create(makeItem({ id: 'c2', description: 'Other' }));
            const result = await repo.findAll({
                filters: { description: 'hello' },
            });
            expect(result.total).toBe(1);
        });

        it('should filter by version', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', version: '1.0' }));
            await repo.create(makeItem({ id: 'c2', version: '2.0' }));
            const result = await repo.findAll({ filters: { version: '1.0' } });
            expect(result.total).toBe(1);
        });

        it('should filter by validAt within range', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({
                    id: 'in-range',
                    validFor: {
                        startDateTime: '2025-01-01T00:00:00Z',
                        endDateTime: '2025-12-31T23:59:59Z',
                    },
                }),
            );
            await repo.create(
                makeItem({
                    id: 'before-range',
                    validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                }),
            );
            await repo.create(
                makeItem({
                    id: 'after-range',
                    validFor: { endDateTime: '2024-12-31T23:59:59Z' },
                }),
            );
            const result = await repo.findAll({
                filters: { validAt: '2025-06-01T00:00:00Z' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('in-range');
        });

        it('should filter by createdAtStart', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
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
            const repo = new ResourceCatalogInMemoryRepository(
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

        it('should filter by updatedAtStart and updatedAtEnd', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'u1', updatedAt: new Date('2024-03-01') }),
            );
            await repo.create(
                makeItem({ id: 'u2', updatedAt: new Date('2025-03-01') }),
            );
            const including = await repo.findAll({
                filters: { updatedAtStart: '2025-01-01T00:00:00Z' },
            });
            expect(including.items.map((i) => i.id)).toContain('u2');
            expect(including.items.map((i) => i.id)).not.toContain('u1');

            const excluding = await repo.findAll({
                filters: { updatedAtEnd: '2024-12-31T00:00:00Z' },
            });
            expect(excluding.items.map((i) => i.id)).toContain('u1');
            expect(excluding.items.map((i) => i.id)).not.toContain('u2');
        });

        it('should apply offset and limit', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            for (let i = 0; i < 5; i++)
                await repo.create(makeItem({ id: `c${i}` }));
            const result = await repo.findAll({ offset: 2, limit: 2 });
            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(5);
        });

        it('should sort by name ASC', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', name: 'Zebra' }));
            await repo.create(makeItem({ id: 'c2', name: 'Apple' }));
            const result = await repo.findAll({ sort: { name: 'ASC' } });
            expect(result.items[0].name).toBe('Apple');
        });

        it('should sort by name DESC', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', name: 'Zebra' }));
            await repo.create(makeItem({ id: 'c2', name: 'Apple' }));
            const result = await repo.findAll({ sort: { name: 'DESC' } });
            expect(result.items[0].name).toBe('Zebra');
        });

        it('should sort by createdAt Date objects', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'newer', createdAt: new Date('2025-06-01') }),
            );
            await repo.create(
                makeItem({ id: 'older', createdAt: new Date('2024-01-01') }),
            );
            const result = await repo.findAll({ sort: { createdAt: 'ASC' } });
            expect(result.items[0].id).toBe('older');
        });
    });

    describe('patchById', () => {
        it('should update existing item and return updated copy', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.patchById('catalog-1', {
                name: 'Updated Name',
            });
            expect(result?.name).toBe('Updated Name');
        });

        it('should return null when item does not exist', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            const result = await repo.patchById('missing', { name: 'X' });
            expect(result).toBeNull();
        });

        it('should preserve id even if patch tries to change it', async () => {
            const repo = new ResourceCatalogInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.patchById('catalog-1', {
                id: 'other-id',
            } as any);
            expect(result?.id).toBe('catalog-1');
        });
    });
});
