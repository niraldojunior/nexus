import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CreateResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/create-resource-catalog.dto';
import { ListResourceCatalogQueryDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/list-resource-catalog-query.dto';
import { PatchResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/patch-resource-catalog.dto';
import { EventDispatcherPort } from '@/module/resource-catalog/application/port/event-dispatcher.port';
import { ResourceCatalogRepository } from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { CreateResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/create-resource-catalog.usecase';
import { GetResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/get-resource-catalog.usecase';
import { ListResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/list-resource-catalog.usecase';
import { PatchResourceCatalogUseCase } from '@/module/resource-catalog/application/usecase/resource-catalog/patch-resource-catalog.usecase';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeRepositoryMock = (): jest.Mocked<ResourceCatalogRepository> => ({
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

describe('ResourceCatalog UseCases', () => {
    describe('CreateResourceCatalogUseCase', () => {
        it('should create a new resource catalog (happy path)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );
            const dto: CreateResourceCatalogDto = {
                name: 'Corporate Resource Catalog',
                lifecycleStatus: 'Active',
                validFor: { startDateTime: new Date().toISOString() },
                version: '1.0.0',
                '@type': 'ResourceCatalog',
                '@baseType': 'Catalog',
            };

            repository.findAll.mockResolvedValue({ total: 0, items: [] });
            repository.create.mockImplementation(
                async (model) => await Promise.resolve(model),
            );

            const result = await useCase.exec(dto, '/api/v1');

            expect(result.isRight()).toBe(true);
            const model = (result as any).value;
            expect(model.id).toBeDefined();
            expect(model.name).toBe('Corporate Resource Catalog');
            expect(model.href).toMatch(/^\/api\/v1\/resourceCatalog\/.+/);
            expect(repository.create).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceCatalogCreate,
            ).toHaveBeenCalledTimes(1);
        });
    });

    describe('PatchResourceCatalogUseCase', () => {
        it('should fail when patch payload is empty (invalid validation)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );
            const existing: ResourceCatalogModel = {
                id: 'catalog-1',
                name: 'Corporate Resource Catalog',
                lifecycleStatus: 'Active',
            };
            const dto: PatchResourceCatalogDto = {};

            repository.findById.mockResolvedValue(existing);

            const patchResult = await useCase.exec(existing.id, dto);
            expect(patchResult.isLeft()).toBe(true);
            expect(patchResult.value).toBeInstanceOf(BadRequestException);
            expect(repository.patchById).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceCatalogAttributeValueChange,
            ).not.toHaveBeenCalled();
        });
    });

    describe('GetResourceCatalogUseCase', () => {
        it('should return the catalog when it exists', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new GetResourceCatalogUseCase(logger, repository);
            const catalog: ResourceCatalogModel = {
                id: 'catalog-1',
                name: 'Test Catalog',
                lifecycleStatus: 'Active',
            };

            repository.findById.mockResolvedValue(catalog);

            const result = await useCase.exec('catalog-1');

            expect(result.isRight()).toBe(true);
            expect((result as any).value).toEqual(catalog);
        });

        it('should return NotFoundException when catalog does not exist', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new GetResourceCatalogUseCase(logger, repository);

            repository.findById.mockResolvedValue(null);

            const result = await useCase.exec('missing-id');

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new GetResourceCatalogUseCase(logger, repository);

            repository.findById.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec('catalog-1');

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('ListResourceCatalogUseCase', () => {
        it('should return a paged list of catalogs', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListResourceCatalogUseCase(logger, repository);

            repository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Test',
                        lifecycleStatus: 'Active',
                    },
                ],
            });

            const result = await useCase.exec(
                {} as ListResourceCatalogQueryDto,
            );

            expect(result.isRight()).toBe(true);
            expect((result as any).value.total).toBe(1);
        });

        it('should forward filters to the repository', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListResourceCatalogUseCase(logger, repository);

            repository.findAll.mockResolvedValue({ total: 0, items: [] });

            await useCase.exec({
                name: 'Test',
                lifecycleStatus: 'Active',
            } as ListResourceCatalogQueryDto);

            const callArgs = repository.findAll.mock.calls[0][0];
            expect(callArgs?.filters?.name).toBe('Test');
            expect(callArgs?.filters?.lifecycleStatus).toBe('Active');
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListResourceCatalogUseCase(logger, repository);

            repository.findAll.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec(
                {} as ListResourceCatalogQueryDto,
            );

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('PatchResourceCatalogUseCase - additional cases', () => {
        it('should patch and dispatch attributeValueChange when status unchanged', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );
            const existing: ResourceCatalogModel = {
                id: 'catalog-1',
                name: 'Old',
                lifecycleStatus: 'Active',
            };
            const updated: ResourceCatalogModel = {
                id: 'catalog-1',
                name: 'New',
                lifecycleStatus: 'Active',
            };

            repository.findById.mockResolvedValue(existing);
            repository.patchById.mockResolvedValue(updated);
            dispatcher.dispatchResourceCatalogAttributeValueChange.mockResolvedValue(
                undefined,
            );

            const result = await useCase.exec('catalog-1', {
                name: 'New',
            } as PatchResourceCatalogDto);

            expect(result.isRight()).toBe(true);
            expect(
                dispatcher.dispatchResourceCatalogAttributeValueChange,
            ).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceCatalogStatusChange,
            ).not.toHaveBeenCalled();
        });

        it('should dispatch statusChange when lifecycleStatus changes', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );
            const existing: ResourceCatalogModel = {
                id: 'catalog-1',
                name: 'Test',
                lifecycleStatus: 'Active',
            };
            const updated: ResourceCatalogModel = {
                id: 'catalog-1',
                name: 'Test',
                lifecycleStatus: 'Inactive',
            };

            repository.findById.mockResolvedValue(existing);
            repository.patchById.mockResolvedValue(updated);
            dispatcher.dispatchResourceCatalogStatusChange.mockResolvedValue(
                undefined,
            );

            const result = await useCase.exec('catalog-1', {
                lifecycleStatus: 'Inactive',
            } as PatchResourceCatalogDto);

            expect(result.isRight()).toBe(true);
            expect(
                dispatcher.dispatchResourceCatalogStatusChange,
            ).toHaveBeenCalledTimes(1);
        });

        it('should return NotFoundException when catalog not found', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );

            repository.findById.mockResolvedValue(null);

            const result = await useCase.exec('missing', {
                name: 'X',
            } as PatchResourceCatalogDto);

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return NotFoundException when patchById returns null', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );

            repository.findById.mockResolvedValue({
                id: 'catalog-1',
                name: 'Test',
                lifecycleStatus: 'Active',
            });
            repository.patchById.mockResolvedValue(null);

            const result = await useCase.exec('catalog-1', {
                name: 'X',
            } as PatchResourceCatalogDto);

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return BadRequestException when validFor dates are inverted', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );

            repository.findById.mockResolvedValue({
                id: 'catalog-1',
                name: 'Test',
                lifecycleStatus: 'Active',
            });

            const result = await useCase.exec('catalog-1', {
                validFor: {
                    startDateTime: '2026-12-31T00:00:00Z',
                    endDateTime: '2026-01-01T00:00:00Z',
                },
            } as PatchResourceCatalogDto);

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(BadRequestException);
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceCatalogUseCase(
                logger,
                repository,
                dispatcher,
            );

            repository.findById.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec('catalog-1', {
                name: 'X',
            } as PatchResourceCatalogDto);

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });
});
