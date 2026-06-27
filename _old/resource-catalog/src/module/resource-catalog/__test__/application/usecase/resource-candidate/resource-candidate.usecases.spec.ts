import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ListResourceCandidateQueryDto } from '@/module/resource-catalog/application/dto/resource-candidate/request/list-resource-candidate-query.dto';
import { PatchResourceCandidateDto } from '@/module/resource-catalog/application/dto/resource-candidate/request/patch-resource-candidate.dto';
import { EventDispatcherPort } from '@/module/resource-catalog/application/port/event-dispatcher.port';
import { ResourceCandidateRepository } from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { GetResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/get-resource-candidate.usecase';
import { ListResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/list-resource-candidate.usecase';
import { PatchResourceCandidateUseCase } from '@/module/resource-catalog/application/usecase/resource-candidate/patch-resource-candidate.usecase';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const makeRepositoryMock = (): jest.Mocked<ResourceCandidateRepository> => ({
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    patchById: jest.fn(),
    findBySpecificationId: jest.fn(),
});

const makeLoggerMock = (): jest.Mocked<
    Pick<LoggerService, 'setContext' | 'info' | 'error'>
> => ({
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
});

const makeEventDispatcherMock = (): jest.Mocked<EventDispatcherPort> => ({
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

const makeCandidate = (
    overrides?: Partial<ResourceCandidateModel>,
): ResourceCandidateModel =>
    ({
        id: 'cand-1',
        name: 'CPE ZTE F670L',
        description: 'CPE Router',
        version: '1.0',
        lifecycleStatus: 'Active',
        resourceSpecification: { id: 'spec-1' },
        category: [{ id: 'cat-router' }],
        catalog: { id: 'catalog-1' },
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        '@type': 'ResourceCandidate',
        '@baseType': 'ResourceCandidate',
        ...overrides,
    }) as ResourceCandidateModel;

// ---------------------------------------------------------------------------
// GetResourceCandidateUseCase
// ---------------------------------------------------------------------------

describe('GetResourceCandidateUseCase', () => {
    it('should return the candidate when it exists', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const useCase = new GetResourceCandidateUseCase(logger, repository);
        const candidate = makeCandidate();

        repository.findById.mockResolvedValue(candidate);

        const result = await useCase.exec('cand-1');

        expect(result.isRight()).toBe(true);
        expect((result as any).value).toEqual(candidate);
        expect(repository.findById).toHaveBeenCalledWith('cand-1');
    });

    it('should return NotFoundException when candidate does not exist', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const useCase = new GetResourceCandidateUseCase(logger, repository);

        repository.findById.mockResolvedValue(null);

        const result = await useCase.exec('missing-id');

        expect(result.isLeft()).toBe(true);
        expect((result as any).value).toBeInstanceOf(NotFoundException);
        expect((result as any).value.message).toContain('missing-id');
    });

    it('should return left with the error and log when repository throws', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const useCase = new GetResourceCandidateUseCase(logger, repository);

        repository.findById.mockRejectedValue(new Error('DB error'));

        const result = await useCase.exec('cand-1');

        expect(result.isLeft()).toBe(true);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// ListResourceCandidateUseCase
// ---------------------------------------------------------------------------

describe('ListResourceCandidateUseCase', () => {
    it('should return a paged list of candidates', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const useCase = new ListResourceCandidateUseCase(logger, repository);
        const candidate = makeCandidate();

        repository.findAll.mockResolvedValue({
            total: 1,
            items: [candidate],
        });

        const result = await useCase.exec({} as ListResourceCandidateQueryDto);

        expect(result.isRight()).toBe(true);
        expect((result as any).value.total).toBe(1);
        expect((result as any).value.items).toHaveLength(1);
        expect(repository.findAll).toHaveBeenCalledTimes(1);
    });

    it('should forward filters to the repository', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const useCase = new ListResourceCandidateUseCase(logger, repository);

        repository.findAll.mockResolvedValue({ total: 0, items: [] });

        const query: ListResourceCandidateQueryDto = {
            name: 'CPE ZTE',
            lifecycleStatus: 'Active',
            resourceSpecification: 'spec-1',
        } as ListResourceCandidateQueryDto;

        await useCase.exec(query);

        const callArgs = repository.findAll.mock.calls[0][0];
        expect(callArgs?.filters?.name).toBe('CPE ZTE');
        expect(callArgs?.filters?.lifecycleStatus).toBe('Active');
        expect(callArgs?.filters?.resourceSpecificationId).toBe('spec-1');
    });

    it('should return left with the error and log when repository throws', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const useCase = new ListResourceCandidateUseCase(logger, repository);

        repository.findAll.mockRejectedValue(new Error('DB error'));

        const result = await useCase.exec({} as ListResourceCandidateQueryDto);

        expect(result.isLeft()).toBe(true);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// PatchResourceCandidateUseCase
// ---------------------------------------------------------------------------

describe('PatchResourceCandidateUseCase', () => {
    it('should patch and return the updated candidate', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const eventDispatcher = makeEventDispatcherMock();
        const useCase = new PatchResourceCandidateUseCase(
            logger,
            repository,
            eventDispatcher,
        );
        const current = makeCandidate({ lifecycleStatus: 'Active' });
        const updated = makeCandidate({
            lifecycleStatus: 'Active',
            name: 'Updated Name',
        });

        repository.findById.mockResolvedValue(current);
        repository.patchById.mockResolvedValue(updated);
        eventDispatcher.dispatchResourceCandidateAttributeValueChange.mockResolvedValue(
            undefined,
        );

        const dto: PatchResourceCandidateDto = { name: 'Updated Name' };
        const result = await useCase.exec('cand-1', dto);

        expect(result.isRight()).toBe(true);
        expect((result as any).value.name).toBe('Updated Name');
        expect(repository.patchById).toHaveBeenCalledTimes(1);
        expect(
            eventDispatcher.dispatchResourceCandidateAttributeValueChange,
        ).toHaveBeenCalledTimes(1);
        expect(
            eventDispatcher.dispatchResourceCandidateStatusChange,
        ).not.toHaveBeenCalled();
    });

    it('should dispatch status-change event when lifecycleStatus changes', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const eventDispatcher = makeEventDispatcherMock();
        const useCase = new PatchResourceCandidateUseCase(
            logger,
            repository,
            eventDispatcher,
        );
        const current = makeCandidate({ lifecycleStatus: 'Active' });
        const updated = makeCandidate({ lifecycleStatus: 'Inactive' });

        repository.findById.mockResolvedValue(current);
        repository.patchById.mockResolvedValue(updated);
        eventDispatcher.dispatchResourceCandidateStatusChange.mockResolvedValue(
            undefined,
        );

        const dto: PatchResourceCandidateDto = { lifecycleStatus: 'Inactive' };
        const result = await useCase.exec('cand-1', dto);

        expect(result.isRight()).toBe(true);
        expect(
            eventDispatcher.dispatchResourceCandidateStatusChange,
        ).toHaveBeenCalledTimes(1);
        expect(
            eventDispatcher.dispatchResourceCandidateAttributeValueChange,
        ).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when candidate does not exist', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const eventDispatcher = makeEventDispatcherMock();
        const useCase = new PatchResourceCandidateUseCase(
            logger,
            repository,
            eventDispatcher,
        );

        repository.findById.mockResolvedValue(null);

        const result = await useCase.exec('missing-id', { name: 'X' });

        expect(result.isLeft()).toBe(true);
        expect((result as any).value).toBeInstanceOf(NotFoundException);
        expect((result as any).value.message).toContain('missing-id');
    });

    it('should return BadRequestException when patch payload is empty', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const eventDispatcher = makeEventDispatcherMock();
        const useCase = new PatchResourceCandidateUseCase(
            logger,
            repository,
            eventDispatcher,
        );

        repository.findById.mockResolvedValue(makeCandidate());

        const result = await useCase.exec('cand-1', {});

        expect(result.isLeft()).toBe(true);
        expect((result as any).value).toBeInstanceOf(BadRequestException);
    });

    it('should return NotFoundException when patchById returns null', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const eventDispatcher = makeEventDispatcherMock();
        const useCase = new PatchResourceCandidateUseCase(
            logger,
            repository,
            eventDispatcher,
        );

        repository.findById.mockResolvedValue(makeCandidate());
        repository.patchById.mockResolvedValue(null);

        const result = await useCase.exec('cand-1', { name: 'X' });

        expect(result.isLeft()).toBe(true);
        expect((result as any).value).toBeInstanceOf(NotFoundException);
    });

    it('should return left with the error and log when repository throws', async () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const repository = makeRepositoryMock();
        const eventDispatcher = makeEventDispatcherMock();
        const useCase = new PatchResourceCandidateUseCase(
            logger,
            repository,
            eventDispatcher,
        );

        repository.findById.mockRejectedValue(new Error('DB error'));

        const result = await useCase.exec('cand-1', { name: 'X' });

        expect(result.isLeft()).toBe(true);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
