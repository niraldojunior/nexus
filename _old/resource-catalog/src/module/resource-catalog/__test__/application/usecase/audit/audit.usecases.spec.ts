import { NotFoundException } from '@nestjs/common';

import { ListAuditQueryDto } from '@/module/resource-catalog/application/dto/audit/request/list-audit-query.dto';
import { AuditRepository } from '@/module/resource-catalog/application/port/audit.repository';
import { CreateAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/create-audit.usecase';
import { GetAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/get-audit.usecase';
import { ListAuditUseCase } from '@/module/resource-catalog/application/usecase/audit/list-audit.usecase';
import { AuditAction } from '@/module/resource-catalog/domain/const/audit-action.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeRepositoryMock = (): jest.Mocked<AuditRepository> => ({
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
});

const makeLoggerMock = (): jest.Mocked<
    Pick<LoggerService, 'setContext' | 'info' | 'error'>
> => ({
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
});

const makeAuditRecord = (overrides?: Partial<AuditModel>): AuditModel => ({
    id: 'audit-1',
    userId: 'user-42',
    action: AuditAction.CREATE,
    entityId: 'spec-1',
    entityType: ResourceType.RESOURCE_SPECIFICATION,
    timestamp: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
});

describe('Audit UseCases', () => {
    describe('CreateAuditUseCase', () => {
        it('should persist an audit record', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateAuditUseCase(logger, repository);

            repository.create.mockImplementation(async (model) =>
                Promise.resolve(model),
            );

            await useCase.exec({
                userId: 'user-42',
                action: AuditAction.CREATE,
                entityId: 'spec-1',
                entityType: ResourceType.RESOURCE_SPECIFICATION,
            });

            expect(repository.create).toHaveBeenCalledTimes(1);
            const saved = repository.create.mock.calls[0][0];
            expect(saved.userId).toBe('user-42');
            expect(saved.action).toBe(AuditAction.CREATE);
            expect(saved.entityId).toBe('spec-1');
            expect(saved.entityType).toBe(ResourceType.RESOURCE_SPECIFICATION);
            expect(saved.id).toBeDefined();
            expect(saved.timestamp).toBeInstanceOf(Date);
        });

        it('should fall back to "unknown" when userId is empty', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateAuditUseCase(logger, repository);

            repository.create.mockImplementation(async (model) =>
                Promise.resolve(model),
            );

            await useCase.exec({
                userId: '',
                action: AuditAction.DELETE,
                entityId: 'cat-1',
                entityType: ResourceType.RESOURCE_CATEGORY,
            });

            const saved = repository.create.mock.calls[0][0];
            expect(saved.userId).toBe('unknown');
        });

        it('should not throw when repository.create fails', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateAuditUseCase(logger, repository);

            repository.create.mockRejectedValue(new Error('DB unavailable'));

            await expect(
                useCase.exec({
                    userId: 'user-1',
                    action: AuditAction.UPDATE,
                    entityId: 'cat-1',
                    entityType: ResourceType.RESOURCE_CATEGORY,
                }),
            ).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('GetAuditUseCase', () => {
        it('should return an audit record when it exists', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new GetAuditUseCase(logger, repository);
            const record = makeAuditRecord();

            repository.findById.mockResolvedValue(record);

            const result = await useCase.exec('audit-1');

            expect(result.isRight()).toBe(true);
            expect((result as any).value).toEqual(record);
            expect(repository.findById).toHaveBeenCalledWith('audit-1');
        });

        it('should return NotFoundException when record does not exist', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new GetAuditUseCase(logger, repository);

            repository.findById.mockResolvedValue(null);

            const result = await useCase.exec('missing-id');

            expect(result.isLeft()).toBe(true);
            expect((result as any).value).toBeInstanceOf(NotFoundException);
        });

        it('should return left with the error when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new GetAuditUseCase(logger, repository);

            repository.findById.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec('audit-1');

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('ListAuditUseCase', () => {
        it('should return a paged list of audit records', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListAuditUseCase(logger, repository);
            const record = makeAuditRecord();

            repository.findAll.mockResolvedValue({ total: 1, items: [record] });

            const query: ListAuditQueryDto = {};
            const result = await useCase.exec(query);

            expect(result.isRight()).toBe(true);
            expect((result as any).value.total).toBe(1);
            expect((result as any).value.items).toHaveLength(1);
            expect(repository.findAll).toHaveBeenCalledTimes(1);
        });

        it('should forward filters to the repository', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListAuditUseCase(logger, repository);

            repository.findAll.mockResolvedValue({ total: 0, items: [] });

            const query: ListAuditQueryDto = {
                userId: 'user-42',
                entityType: ResourceType.RESOURCE_CATALOG,
                action: AuditAction.CREATE,
            };

            await useCase.exec(query);

            const callArgs = repository.findAll.mock.calls[0][0];
            expect(callArgs?.filters?.userId).toBe('user-42');
            expect(callArgs?.filters?.entityType).toBe(
                ResourceType.RESOURCE_CATALOG,
            );
            expect(callArgs?.filters?.action).toBe(AuditAction.CREATE);
        });

        it('should return left with the error when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListAuditUseCase(logger, repository);

            repository.findAll.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec({});

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });
});
