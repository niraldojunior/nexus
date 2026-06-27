import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';

import { CreateResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/create-resource-specification.dto';
import { ListResourceSpecificationQueryDto } from '@/module/resource-catalog/application/dto/resource-specification/request/list-resource-specification-query.dto';
import { PatchResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/patch-resource-specification.dto';
import { EventDispatcherPort } from '@/module/resource-catalog/application/port/event-dispatcher.port';
import { ResourceCandidateRepository } from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { ResourceCatalogRepository } from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { ResourceCategoryRepository } from '@/module/resource-catalog/application/port/resource-category.repository';
import { ResourceSpecificationRepository } from '@/module/resource-catalog/application/port/resource-specification.repository';
import { CreateResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/create-resource-specification.usecase';
import { GetResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/get-resource-specification.usecase';
import { ListResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/list-resource-specification.usecase';
import { PatchResourceSpecificationUseCase } from '@/module/resource-catalog/application/usecase/resource-specification/patch-resource-specification.usecase';
import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeResourceCatalogRepositoryMock =
    (): jest.Mocked<ResourceCatalogRepository> => ({
        create: jest.fn(),
        findById: jest.fn(),
        findAll: jest.fn(),
        patchById: jest.fn(),
    });

const makeRepositoryMock =
    (): jest.Mocked<ResourceSpecificationRepository> => ({
        create: jest.fn(),
        findById: jest.fn(),
        findAll: jest.fn(),
        patchById: jest.fn(),
        existsByBusinessKey: jest.fn(),
    });

const makeResourceCategoryRepositoryMock =
    (): jest.Mocked<ResourceCategoryRepository> => ({
        create: jest.fn(),
        findById: jest.fn(),
        findAll: jest.fn(),
        patchById: jest.fn(),
    });

const makeResourceCandidateRepositoryMock =
    (): jest.Mocked<ResourceCandidateRepository> => ({
        create: jest.fn(),
        findById: jest.fn(),
        findAll: jest.fn(),
        patchById: jest.fn(),
        findBySpecificationId: jest.fn(),
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

const FULL_DTO: CreateResourceSpecificationDto = {
    name: 'CPE ZTE F670L',
    lifecycleStatus: 'Active',
    resourceCatalog: [{ id: 'catalog-1' }],
    resourceCategory: [{ id: 'cat-router' }],
    validFor: { startDateTime: '2026-01-01T00:00:00Z' },
    resourceSpecCharacteristic: [
        { name: 'Brand', value: 'ZTE' },
        { name: 'Model', value: 'F670L' },
        { name: 'categoria', value: 'P' },
    ],
    version: '1.0.0',
    '@type': 'ResourceSpecification',
    '@baseType': 'Specification',
};

describe('ResourceSpecification UseCases', () => {
    describe('CreateResourceSpecificationUseCase', () => {
        it('should create a new resource specification (happy path)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCatalogRepository =
                makeResourceCatalogRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepository,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            repository.existsByBusinessKey.mockResolvedValue(false);
            resourceCatalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Test',
                        lifecycleStatus: 'Active',
                    },
                ],
            } as any);
            resourceCategoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [{ id: 'cat-router', name: 'Roteador' }],
            } as any);
            repository.create.mockImplementation(
                async (model) => await Promise.resolve(model),
            );
            resourceCandidateRepository.create.mockResolvedValue({} as any);
            resourceCandidateRepository.findBySpecificationId.mockResolvedValue(
                [],
            );

            const result = await useCase.exec(FULL_DTO, '/api/v1');

            expect(result.isRight()).toBe(true);
            const model = (result as any).value;
            expect(model.id).toBeDefined();
            expect(model.name).toBe('CPE ZTE F670L');
            expect(model.href).toMatch(/^\/api\/v1\/resourceSpecification\/.+/);
            expect(model.resourceSpecCharacteristic).toHaveLength(3);
            expect(model.uniqueKey).toBe('CAT-ROUTER|ZTE|F670L|STD');
            expect(repository.create).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceSpecificationCreate,
            ).toHaveBeenCalledTimes(1);
        });

        it('should throw 422 when minimum structure is missing', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCatalogRepository =
                makeResourceCatalogRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepository,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            const dto: CreateResourceSpecificationDto = {
                name: 'CPE Incompleto',
                lifecycleStatus: 'Active',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: new Date().toISOString() },
                version: '1.0.0',
                '@type': 'ResourceSpecification',
                '@baseType': 'Specification',
                // missing Brand, Model, categoria
            };

            const result = await useCase.exec(dto, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(UnprocessableEntityException);
            expect(repository.existsByBusinessKey).not.toHaveBeenCalled();
            expect(repository.create).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceSpecificationCreate,
            ).not.toHaveBeenCalled();
        });

        it('should throw 409 when a STD specification with same key already exists', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCatalogRepository =
                makeResourceCatalogRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepository,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            resourceCatalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Test',
                        lifecycleStatus: 'Active',
                    },
                ],
            } as any);
            resourceCategoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [{ id: 'cat-router', name: 'Roteador' }],
            } as any);
            repository.existsByBusinessKey.mockResolvedValue(true);

            const result = await useCase.exec(FULL_DTO, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(ConflictException);
            expect(repository.create).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceSpecificationCreate,
            ).not.toHaveBeenCalled();
        });

        it('should allow coexistence of STD and CUSTOMIZADO with same brand/model/category', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCatalogRepository =
                makeResourceCatalogRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepository,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            resourceCatalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Test',
                        lifecycleStatus: 'Active',
                    },
                ],
            } as any);
            resourceCategoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [{ id: 'cat-router', name: 'Roteador' }],
            } as any);
            repository.existsByBusinessKey.mockResolvedValue(false);
            repository.create.mockImplementation(
                async (model) => await Promise.resolve(model),
            );
            resourceCandidateRepository.create.mockResolvedValue({} as any);
            resourceCandidateRepository.findBySpecificationId.mockResolvedValue(
                [],
            );

            const customDto: CreateResourceSpecificationDto = {
                ...FULL_DTO,
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'CUSTOMIZADO' },
                ],
            };

            const result = await useCase.exec(customDto, '/api/v1');

            expect(result.isRight()).toBe(true);
            const model = (result as any).value;
            expect(model.uniqueKey).toBe('CAT-ROUTER|ZTE|F670L|CUSTOMIZADO');
            // Different from STD key: CAT-ROUTER|ZTE|F670L|STD
            expect(model.uniqueKey).not.toBe('CAT-ROUTER|ZTE|F670L|STD');
            expect(
                dispatcher.dispatchResourceSpecificationCreate,
            ).toHaveBeenCalledTimes(1);
        });

        it('should throw 422 when referenced resourceCategory does not exist', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCatalogRepository =
                makeResourceCatalogRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new CreateResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepository,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

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
            resourceCategoryRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });

            const result = await useCase.exec(FULL_DTO, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(UnprocessableEntityException);
            expect(repository.create).not.toHaveBeenCalled();
        });
    });

    describe('PatchResourceSpecificationUseCase', () => {
        it('should fail when patch payload is empty (invalid validation)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const resourceCatalogRepositoryMock = {
                findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
                findById: jest.fn(),
            } as any;
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepositoryMock,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );
            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE F670L',
                lifecycleStatus: 'Active',
                resourceCatalog: [],
                resourceCategory: [{ id: 'cat-router' }],
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
            };
            const dto: PatchResourceSpecificationDto = {};

            repository.findById.mockResolvedValue(existing);

            const patchResult = await useCase.exec(existing.id, dto, '/api/v1');
            expect(patchResult.isLeft()).toBe(true);
            expect(patchResult.value).toBeInstanceOf(BadRequestException);
            expect(repository.patchById).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceSpecificationAttributeValueChange,
            ).not.toHaveBeenCalled();
        });

        it('should throw 409 when patch causes a uniqueKey conflict', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const resourceCatalogRepositoryMock = {
                findAll: jest.fn().mockResolvedValue({
                    items: [{ id: 'catalog-1', name: 'Catalog' }],
                    total: 1,
                }),
                findById: jest.fn(),
            } as any;
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepositoryMock,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE F670L',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };

            repository.findById.mockResolvedValue(existing);
            resourceCategoryRepository.findAll.mockResolvedValue({
                items: [
                    { id: 'cat-router', name: 'Roteador', resourceCatalog: [] },
                ],
                total: 1,
            } as any);
            resourceCategoryRepository.findById.mockResolvedValue({
                id: 'cat-router',
                name: 'Roteador',
                resourceCatalog: [],
            } as any);
            // Conflict found for a new brand
            repository.existsByBusinessKey.mockResolvedValue(true);

            const dto: PatchResourceSpecificationDto = {
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'Huawei' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };

            const patchConflictResult = await useCase.exec(
                existing.id,
                dto,
                '/api/v1',
            );
            expect(patchConflictResult.isLeft()).toBe(true);
            expect(patchConflictResult.value).toBeInstanceOf(ConflictException);
            expect(repository.patchById).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceSpecificationAttributeValueChange,
            ).not.toHaveBeenCalled();
        });

        it('should throw 422 when patch breaks minimum structure', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const resourceCatalogRepositoryMock = {
                findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
                findById: jest.fn(),
            } as any;
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepositoryMock,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE F670L',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };

            repository.findById.mockResolvedValue(existing);

            const dto: PatchResourceSpecificationDto = {
                resourceCategory: [{ id: '' }],
            };

            const patchStructResult = await useCase.exec(
                existing.id,
                dto,
                '/api/v1',
            );
            expect(patchStructResult.isLeft()).toBe(true);
            expect(patchStructResult.value).toBeInstanceOf(
                UnprocessableEntityException,
            );
            expect(repository.patchById).not.toHaveBeenCalled();
            expect(
                dispatcher.dispatchResourceSpecificationAttributeValueChange,
            ).not.toHaveBeenCalled();
        });

        it('should throw 422 when patch references an unknown resourceCategory', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const resourceCategoryRepository =
                makeResourceCategoryRepositoryMock();
            const resourceCandidateRepository =
                makeResourceCandidateRepositoryMock();
            const resourceCatalogRepositoryMock = {
                findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
                findById: jest.fn(),
            } as any;
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                resourceCatalogRepositoryMock,
                resourceCategoryRepository,
                resourceCandidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE F670L',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };

            repository.findById.mockResolvedValue(existing);
            resourceCategoryRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });

            const dto: PatchResourceSpecificationDto = {
                resourceCategory: [{ id: 'cat-does-not-exist' }],
            };

            const result = await useCase.exec(existing.id, dto, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(UnprocessableEntityException);
            expect(repository.patchById).not.toHaveBeenCalled();
        });

        it('should return left when patch is empty (no attributes)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const candidateRepository = makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                catalogRepository,
                categoryRepository,
                candidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE F670L',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };
            repository.findById.mockResolvedValue(existing);

            const result = await useCase.exec(
                existing.id,
                {} as PatchResourceSpecificationDto,
                '/api/v1',
            );
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(BadRequestException);
        });

        it('should return left when endDateTime < startDateTime', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const candidateRepository = makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                catalogRepository,
                categoryRepository,
                candidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };
            repository.findById.mockResolvedValue(existing);

            const dto: PatchResourceSpecificationDto = {
                validFor: {
                    startDateTime: '2027-01-01T00:00:00Z',
                    endDateTime: '2026-01-01T00:00:00Z',
                },
            };

            const result = await useCase.exec(existing.id, dto, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(BadRequestException);
        });

        it('should return left when patch would conflict with existing uniqueKey', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const candidateRepository = makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                catalogRepository,
                categoryRepository,
                candidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD-old',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };
            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Main',
                        lifecycleStatus: 'Active' as any,
                    },
                ],
            });
            categoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'cat-router',
                        name: 'Roteador',
                        lifecycleStatus: 'Active' as any,
                        resourceCatalog: [],
                    },
                ],
            });
            repository.existsByBusinessKey.mockResolvedValue(true);

            const dto: PatchResourceSpecificationDto = {
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'Q' },
                ],
            };

            const result = await useCase.exec(existing.id, dto, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(ConflictException);
        });

        it('should dispatch status change event when lifecycleStatus changes', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const candidateRepository = makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                catalogRepository,
                categoryRepository,
                candidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };
            const updated = { ...existing, lifecycleStatus: 'Inactive' as any };

            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Main',
                        lifecycleStatus: 'Active' as any,
                    },
                ],
            });
            categoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'cat-router',
                        name: 'Roteador',
                        lifecycleStatus: 'Active' as any,
                        resourceCatalog: [],
                    },
                ],
            });
            repository.existsByBusinessKey.mockResolvedValue(false);
            repository.patchById.mockResolvedValue(updated);

            const dto: PatchResourceSpecificationDto = {
                lifecycleStatus: 'Inactive' as any,
            };

            const result = await useCase.exec(existing.id, dto, '/api/v1');
            expect(result.isRight()).toBe(true);
            expect(
                dispatcher.dispatchResourceSpecificationStatusChange,
            ).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceSpecificationAttributeValueChange,
            ).not.toHaveBeenCalled();
        });

        it('should return not found when patchById returns null', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const candidateRepository = makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                catalogRepository,
                categoryRepository,
                candidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };

            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Main',
                        lifecycleStatus: 'Active' as any,
                    },
                ],
            });
            categoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'cat-router',
                        name: 'Roteador',
                        lifecycleStatus: 'Active' as any,
                        resourceCatalog: [],
                    },
                ],
            });
            repository.existsByBusinessKey.mockResolvedValue(false);
            repository.patchById.mockResolvedValue(null);

            const dto: PatchResourceSpecificationDto = { name: 'New Name' };

            const result = await useCase.exec(existing.id, dto, '/api/v1');
            expect(result.isLeft()).toBe(true);
            expect(result.value).toBeInstanceOf(NotFoundException);
        });

        it('should reconcile candidates when catalog changes (retire removed, create new)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const candidateRepository = makeResourceCandidateRepositoryMock();
            const dispatcher = makeDispatcherMock();
            const useCase = new PatchResourceSpecificationUseCase(
                logger,
                repository,
                catalogRepository,
                categoryRepository,
                candidateRepository,
                dispatcher,
            );

            const existing: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                resourceCatalog: [{ id: 'catalog-old' }],
                resourceCategory: [{ id: 'cat-router' }],
                validFor: { startDateTime: '2026-01-01T00:00:00Z' },
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE' },
                    { name: 'Model', value: 'F670L' },
                    { name: 'categoria', value: 'P' },
                ],
            };

            const updated = {
                ...existing,
                resourceCatalog: [{ id: 'catalog-new' }],
            };

            const existingCandidate: ResourceCandidateModel = {
                id: 'cand-1',
                name: 'CPE ZTE',
                lifecycleStatus: LifecycleStatus.ACTIVE,
                resourceSpecification: { id: 'spec-1' },
                category: [{ id: 'cat-router' }],
                catalog: { id: 'catalog-old' },
                '@type': 'ResourceCandidate',
                href: '/resourceCandidate/cand-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            repository.findById.mockResolvedValue(existing);
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-new',
                        name: 'New',
                        lifecycleStatus: 'Active' as any,
                    },
                ],
            });
            categoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'cat-router',
                        name: 'Roteador',
                        lifecycleStatus: 'Active' as any,
                        resourceCatalog: [],
                    },
                ],
            });
            repository.existsByBusinessKey.mockResolvedValue(false);
            repository.patchById.mockResolvedValue(updated);
            candidateRepository.findBySpecificationId.mockResolvedValue([
                existingCandidate,
            ]);
            candidateRepository.patchById.mockResolvedValue({
                ...existingCandidate,
                lifecycleStatus: LifecycleStatus.DISABLED,
            });
            candidateRepository.create.mockImplementation(async (m) =>
                Promise.resolve(m),
            );

            const dto: PatchResourceSpecificationDto = {
                resourceCatalog: [{ id: 'catalog-new' }],
            };

            const result = await useCase.exec(existing.id, dto, '/api/v1');
            expect(result.isRight()).toBe(true);
            expect(candidateRepository.patchById).toHaveBeenCalledWith(
                'cand-1',
                expect.objectContaining({ lifecycleStatus: 'Inactive' }),
            );
            expect(candidateRepository.create).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceCandidateStatusChange,
            ).toHaveBeenCalledTimes(1);
            expect(
                dispatcher.dispatchResourceCandidateCreate,
            ).toHaveBeenCalledTimes(1);
        });
    });

    describe('GetResourceSpecificationUseCase', () => {
        it('should return specification with enriched refs', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const useCase = new GetResourceSpecificationUseCase(
                logger,
                repository,
                categoryRepository,
                catalogRepository,
            );
            const spec: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CPE-ZTE',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
            };

            repository.findById.mockResolvedValue(spec);
            catalogRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'catalog-1',
                        name: 'Main Catalog',
                        lifecycleStatus: 'Active',
                    },
                ],
            });
            categoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'cat-router',
                        name: 'Roteador',
                        lifecycleStatus: 'Active',
                        resourceCatalog: [],
                    },
                ],
            });

            const result = await useCase.exec('spec-1');

            expect(result.isRight()).toBe(true);
            expect((result as any).value.resourceCatalog[0].name).toBe(
                'Main Catalog',
            );
            expect((result as any).value.resourceCategory[0].name).toBe(
                'Roteador',
            );
        });

        it('should return NotFoundException when specification not found', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const useCase = new GetResourceSpecificationUseCase(
                logger,
                repository,
                categoryRepository,
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
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const useCase = new GetResourceSpecificationUseCase(
                logger,
                repository,
                categoryRepository,
                catalogRepository,
            );

            repository.findById.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec('spec-1');

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('ListResourceSpecificationUseCase', () => {
        it('should return a paged list with enriched refs', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const useCase = new ListResourceSpecificationUseCase(
                logger,
                repository,
                categoryRepository,
                catalogRepository,
            );
            const spec: ResourceSpecificationModel = {
                id: 'spec-1',
                name: 'CPE ZTE',
                lifecycleStatus: 'Active',
                uniqueKey: 'CPE-ZTE',
                resourceCatalog: [{ id: 'catalog-1' }],
                resourceCategory: [{ id: 'cat-router' }],
            };

            repository.findAll.mockResolvedValue({ total: 1, items: [spec] });
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
            categoryRepository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'cat-router',
                        name: 'Roteador',
                        lifecycleStatus: 'Active',
                        resourceCatalog: [],
                    },
                ],
            });

            const result = await useCase.exec(
                {} as ListResourceSpecificationQueryDto,
            );

            expect(result.isRight()).toBe(true);
            expect((result as any).value.total).toBe(1);
        });

        it('should forward filters to the repository', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const useCase = new ListResourceSpecificationUseCase(
                logger,
                repository,
                categoryRepository,
                catalogRepository,
            );

            repository.findAll.mockResolvedValue({ total: 0, items: [] });
            catalogRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });
            categoryRepository.findAll.mockResolvedValue({
                total: 0,
                items: [],
            });

            await useCase.exec({
                name: 'CPE',
                lifecycleStatus: 'Active',
            } as ListResourceSpecificationQueryDto);

            const callArgs = repository.findAll.mock.calls[0][0];
            expect(callArgs?.filters?.name).toBe('CPE');
            expect(callArgs?.filters?.lifecycleStatus).toBe('Active');
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const catalogRepository = makeResourceCatalogRepositoryMock();
            const categoryRepository = makeResourceCategoryRepositoryMock();
            const useCase = new ListResourceSpecificationUseCase(
                logger,
                repository,
                categoryRepository,
                catalogRepository,
            );

            repository.findAll.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec(
                {} as ListResourceSpecificationQueryDto,
            );

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });
});
