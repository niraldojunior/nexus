import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CreateResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/create-resource-category.dto';
import { ListResourceCategoryQueryDto } from '@/module/resource-catalog/application/dto/resource-category/request/list-resource-category-query.dto';
import { PatchResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/patch-resource-category.dto';
import { EventDispatcherPort } from '@/module/resource-catalog/application/port/event-dispatcher.port';
import { ResourceCatalogRepository } from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { ResourceCategoryRepository } from '@/module/resource-catalog/application/port/resource-category.repository';
import { CreateResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/create-resource-category.usecase';
import { GetResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/get-resource-category.usecase';
import { ListResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/list-resource-category.usecase';
import { PatchResourceCategoryUseCase } from '@/module/resource-catalog/application/usecase/resource-category/patch-resource-category.usecase';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeResourceCatalogRepositoryMock =
    (): jest.Mocked<ResourceCatalogRepository> => ({
        create: jest.fn(),
        findById: jest.fn(),
        findAll: jest.fn(),
        patchById: jest.fn(),
    });

const makeRepositoryMock = (): jest.Mocked<ResourceCategoryRepository> => ({
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    patchById: jest.fn(),
});

const makeDispatcherMock = (): jest.Mocked<EventDispatcherPort> => ({
    dispatchResourceCatalogCreate: jest.fn(),
    dispatchResourceCatalogAttributeValueChange: jest.fn(),
    dispatchResourceCatalogStatusChange: jest.fn(),
    dispatchResourceCategoryCreate: jest.fn(),
    dispatchResourceCategoryAttributeValueChange: jest.fn(),
    dispatchResourceCategoryStatusChange: jest.fn(),
    dispatchResourceSpecificationCreate: jest.fn(),
    dispatchResourceSpecificationAttributeValueChange: jest.fn(),
    dispatchResourceSpecificationStatusChange: jest.fn(),
    dispatchResourceCandidateCreate: jest.fn(),
    dispatchResourceCandidateAttributeValueChange: jest.fn(),
    dispatchResourceCandidateStatusChange: jest.fn(),
});

const makeLoggerMock = (): jest.Mocked<
    Pick<LoggerService, 'setContext' | 'info' | 'error'>
> => ({
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
});

describe('ResourceCategory UseCases', () => {
    describe('CreateResourceCategoryUseCase', () => {
        it('should create a new resource category (happy path)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCatalogRepository =
                makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceCategoryUseCase(
                logger,
                resourceCatalogRepository,
                repository,
                dispatcher,
            );
            const dto: CreateResourceCategoryDto = {
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [{ id: 'catalog-1' }],
                validFor: { startDateTime: new Date().toISOString() },
                version: '1.0.0',
                '@type': 'ResourceCategory',
                '@baseType': 'Category',
            };

            repository.findAll.mockResolvedValue({ total: 0, items: [] });
            resourceCatalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Test',
                        lifecycleStatus: 'Active',
                    },
                ],
            });
            repository.create.mockImplementation(
                async (model) => await Promise.resolve(model),
            );

            const result = await useCase.exec(dto, '/api/v1');

            expect(result.isRight()).toBe(true);
            const model = (result as any).value;
            expect(model.id).toBeDefined();
            expect(model.name).toBe('Roteador');
            expect(model.href).toMatch(/^\/api\/v1\/resourceCategory\/.+/);
            expect(repository.create).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceCategoryCreate,
            ).toHaveBeenCalledTimes(1);
        });
    });

    describe('PatchResourceCategoryUseCase', () => {
        it('should fail when patch payload is empty (invalid validation)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const resourceCatalogRepository = {
                create: jest.fn(),
                findById: jest.fn(),
                findAll: jest.fn(),
                patchById: jest.fn(),
            } as jest.Mocked<ResourceCatalogRepository>;
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                resourceCatalogRepository,
                dispatcher,
            );
            const existing: ResourceCategoryModel = {
                id: 'category-1',
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            };
            const dto: PatchResourceCategoryDto = {};

            repository.findById.mockResolvedValue(existing);

            const patchResult = await useCase.exec(existing.id, dto);
            expect(patchResult.isLeft()).toBe(true);
            expect(patchResult.value).toBeInstanceOf(BadRequestException);
            expect(repository.patchById).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceCategoryAttributeValueChange,
            ).not.toHaveBeenCalled();
        });

        it('should patch and dispatch attributeValueChange when status unchanged', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );
            const existing: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Old',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            };
            const updated: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'New',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            };

            repository.findById.mockResolvedValue(existing);
            repository.patchById.mockResolvedValue(updated);
            catalogRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });
            dispatcher.dispatchResourceCategoryAttributeValueChange.mockResolvedValue(
                undefined,
            );

            const result = await useCase.exec('cat-1', {
                name: 'New',
            } as PatchResourceCategoryDto);

            expect(result.isRight()).toBe(true);
            expect(
                dispatcher.dispatchResourceCategoryAttributeValueChange,
            ).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceCategoryStatusChange,
            ).not.toHaveBeenCalled();
        });

        it('should dispatch statusChange when lifecycleStatus changes', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );
            const existing: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Test',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            };
            const updated: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Test',
                lifecycleStatus: 'Inactive',
                resourceCatalog: [],
            };

            repository.findById.mockResolvedValue(existing);
            repository.patchById.mockResolvedValue(updated);
            catalogRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });
            dispatcher.dispatchResourceCategoryStatusChange.mockResolvedValue(
                undefined,
            );

            const result = await useCase.exec('cat-1', {
                lifecycleStatus: 'Inactive',
            } as PatchResourceCategoryDto);

            expect(result.isRight()).toBe(true);
            expect(
                dispatcher.dispatchResourceCategoryStatusChange,
            ).toHaveBeenCalledTimes(1);
        });

        it('should return NotFoundException when category not found', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );

            repository.findById.mockResolvedValue(null);

            const result = await useCase.exec('missing', {
                name: 'X',
            } as PatchResourceCategoryDto);

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return NotFoundException when patchById returns null', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );

            repository.findById.mockResolvedValue({
                id: 'cat-1',
                name: 'Test',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            });
            repository.patchById.mockResolvedValue(null);

            const result = await useCase.exec('cat-1', {
                name: 'X',
            } as PatchResourceCategoryDto);

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );

            repository.findById.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec('cat-1', {
                name: 'X',
            } as PatchResourceCategoryDto);

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });

        it('should return left when patch is empty (no attributes)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );

            const existing: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            };
            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });

            const result = await useCase.exec(
                'cat-1',
                {} as PatchResourceCategoryDto,
            );

            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(BadRequestException);
        });

        it('should return left when endDateTime is before startDateTime', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );

            const existing: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
            };
            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });

            const dto: PatchResourceCategoryDto = {
                validFor: {
                    startDateTime: '2027-01-01T00:00:00Z',
                    endDateTime: '2026-01-01T00:00:00Z',
                },
            };

            const result = await useCase.exec('cat-1', dto);

            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(BadRequestException);
        });

        it('should return NotFoundException when patchById returns null', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
                dispatcher,
            );

            const existing: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
            };
            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });
            repository.patchById.mockResolvedValue(null);

            const result = await useCase.exec('cat-1', {
                name: 'New Name',
            } as PatchResourceCategoryDto);

            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(NotFoundException);
        });
    });

    describe('GetResourceCategoryUseCase', () => {
        it('should return category with enriched resourceCatalog', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const useCase = new GetResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
            );
            const category: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [{ id: 'catalog-1' }],
            };

            repository.findById.mockResolvedValue(category);
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Main Catalog',
                        lifecycleStatus: 'Active',
                        href: '/catalogs/catalog-1',
                    },
                ],
            });

            const result = await useCase.exec('cat-1');

            expect(result.isRight()).toBe(true);
            expect((result as any).value.resourceCatalog[0].name).toBe(
                'Main Catalog',
            );
        });

        it('should return NotFoundException when category not found', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const useCase = new GetResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
            );

            repository.findById.mockResolvedValue(null);

            const result = await useCase.exec('missing');

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const useCase = new GetResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
            );

            repository.findById.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec('cat-1');

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('ListResourceCategoryUseCase', () => {
        it('should return a paged list with enriched resourceCatalog', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const useCase = new ListResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
            );
            const category: ResourceCategoryModel = {
                id: 'cat-1',
                name: 'Roteador',
                lifecycleStatus: 'Active',
                resourceCatalog: [{ id: 'catalog-1' }],
            };

            repository.findAll.mockResolvedValue({
                total: 1,
                items: [category],
            });
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Main',
                        lifecycleStatus: 'Active',
                    },
                ],
            });

            const result = await useCase.exec(
                {} as ListResourceCategoryQueryDto,
            );

            expect(result.isRight()).toBe(true);
            expect((result as any).value.total).toBe(1);
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const useCase = new ListResourceCategoryUseCase(
                logger,
                repository,
                catalogRepository,
            );

            repository.findAll.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec(
                {} as ListResourceCategoryQueryDto,
            );

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });
});
