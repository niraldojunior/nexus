import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { ResourceCategoryInMemoryRepository } from '@/module/resource-catalog/infra/persistence/in-memory/resource-category-in-memory.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeLoggerMock = () =>
    ({ info: jest.fn(), error: jest.fn() }) as unknown as LoggerService;

const makeItem = (
    overrides: Partial<ResourceCategoryModel> = {},
): ResourceCategoryModel => ({
    id: 'cat-1',
    name: 'Router',
    lifecycleStatus: 'Active',
    '@type': 'ResourceCategory',
    resourceCatalog: [],
    ...overrides,
});

describe('ResourceCategoryInMemoryRepository', () => {
    describe('create', () => {
        it('should store and return the item', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            const item = makeItem();
            const result = await repo.create(item);
            expect(result.id).toBe('cat-1');
        });

        it('should accept seed items in constructor', async () => {
            const seed = makeItem({ id: 'seeded' });
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
                [seed],
            );
            const found = await repo.findById('seeded');
            expect(found).not.toBeNull();
        });
    });

    describe('findById', () => {
        it('should return the item when found', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.findById('cat-1');
            expect(result?.id).toBe('cat-1');
        });

        it('should return null when not found', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            const result = await repo.findById('not-found');
            expect(result).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should exclude items with wrong @type', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ '@type': 'WrongType' as any }));
            const result = await repo.findAll();
            expect(result.total).toBe(0);
        });

        it('should return all matching items with no filters', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1' }));
            await repo.create(makeItem({ id: 'c2' }));
            const result = await repo.findAll();
            expect(result.total).toBe(2);
        });

        it('should filter by id string', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1' }));
            await repo.create(makeItem({ id: 'c2' }));
            const result = await repo.findAll({ filters: { id: 'c1' } });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('c1');
        });

        it('should filter by id array', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
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

        it('should filter by name', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', name: 'Alpha' }));
            await repo.create(makeItem({ id: 'c2', name: 'Beta' }));
            const result = await repo.findAll({ filters: { name: 'Alpha' } });
            expect(result.total).toBe(1);
        });

        it('should filter by lifecycleStatus', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
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
        });

        it('should filter by description substring', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
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
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', version: '1.0' }));
            await repo.create(makeItem({ id: 'c2', version: '2.0' }));
            const result = await repo.findAll({ filters: { version: '1.0' } });
            expect(result.total).toBe(1);
        });

        it('should filter by category', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', category: 'CPE' }));
            await repo.create(makeItem({ id: 'c2', category: 'Other' }));
            const result = await repo.findAll({ filters: { category: 'CPE' } });
            expect(result.total).toBe(1);
        });

        it('should filter by resourceCatalogId via resourceCatalog array', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(
                makeItem({ id: 'c1', resourceCatalog: [{ id: 'cat-main' }] }),
            );
            await repo.create(
                makeItem({ id: 'c2', resourceCatalog: [{ id: 'cat-other' }] }),
            );
            const result = await repo.findAll({
                filters: { resourceCatalogId: 'cat-main' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('c1');
        });

        it('should filter by validAt within range', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
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
            const result = await repo.findAll({
                filters: { validAt: '2025-06-01T00:00:00Z' },
            });
            expect(result.total).toBe(1);
            expect(result.items[0].id).toBe('in-range');
        });

        it('should filter by createdAtStart', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
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
            const repo = new ResourceCategoryInMemoryRepository(
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
            const repo = new ResourceCategoryInMemoryRepository(
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
            const excluding = await repo.findAll({
                filters: { updatedAtEnd: '2024-12-31T00:00:00Z' },
            });
            expect(excluding.items.map((i) => i.id)).toContain('u1');
        });

        it('should apply offset and limit', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            for (let i = 0; i < 5; i++)
                await repo.create(makeItem({ id: `c${i}` }));
            const result = await repo.findAll({ offset: 2, limit: 2 });
            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(5);
        });

        it('should sort by name ASC and DESC', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem({ id: 'c1', name: 'Zebra' }));
            await repo.create(makeItem({ id: 'c2', name: 'Apple' }));
            const asc = await repo.findAll({ sort: { name: 'ASC' } });
            expect(asc.items[0].name).toBe('Apple');
            const desc = await repo.findAll({ sort: { name: 'DESC' } });
            expect(desc.items[0].name).toBe('Zebra');
        });
    });

    describe('patchById', () => {
        it('should update existing item', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.patchById('cat-1', { name: 'Updated' });
            expect(result?.name).toBe('Updated');
        });

        it('should return null when item does not exist', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            const result = await repo.patchById('missing', { name: 'X' });
            expect(result).toBeNull();
        });

        it('should preserve original id', async () => {
            const repo = new ResourceCategoryInMemoryRepository(
                makeLoggerMock(),
            );
            await repo.create(makeItem());
            const result = await repo.patchById('cat-1', {
                id: 'other',
            } as any);
            expect(result?.id).toBe('cat-1');
        });
    });
});
