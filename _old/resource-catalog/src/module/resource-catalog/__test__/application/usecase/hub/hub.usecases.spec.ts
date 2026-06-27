import { NotFoundException } from '@nestjs/common';

import { CreateHubDto } from '@/module/resource-catalog/application/dto/hub/request/create-hub.dto';
import { ListHubDto } from '@/module/resource-catalog/application/dto/hub/request/list-hub.dto';
import { HubSubscriptionRepository } from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { CreateHubUseCase } from '@/module/resource-catalog/application/usecase/hub/create-hub.usecase';
import { DeleteHubUseCase } from '@/module/resource-catalog/application/usecase/hub/delete-hub.usecase';
import { ListHubUseCase } from '@/module/resource-catalog/application/usecase/hub/list-hub.usecase';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeRepositoryMock = (): jest.Mocked<HubSubscriptionRepository> => ({
    create: jest.fn(),
    findById: jest.fn(),
    findAllActiveByEvent: jest.fn(),
    findAll: jest.fn(),
    patchById: jest.fn(),
});

const makeLoggerMock = (): jest.Mocked<
    Pick<LoggerService, 'setContext' | 'info' | 'error'>
> => ({
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
});

describe('Hub UseCases', () => {
    describe('CreateHubUseCase', () => {
        it('should create a hub subscription (happy path)', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateHubUseCase(logger, repository);
            const dto: CreateHubDto = {
                callback: 'http://localhost:3001/listener/tmf634',
                event: 'ResourceSpecificationCreateEvent',
                '@type': 'Hub',
                '@baseType': 'Hub',
            };

            repository.findAll.mockImplementation(async () =>
                Promise.resolve({ total: 0, items: [] }),
            );
            repository.create.mockImplementation(
                async (model) => await Promise.resolve(model),
            );

            const result = await useCase.exec(dto);

            expect(result.isRight()).toBe(true);
            expect((result as any).value.id).toBeDefined();
            expect((result as any).value.callback).toBe(dto.callback);
            expect((result as any).value.active).toBe(true);
            expect(repository.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('DeleteHubUseCase', () => {
        it('should disable a hub subscription (happy path)', async () => {
            const repository = makeRepositoryMock();
            const useCase = new DeleteHubUseCase(repository);
            const existing: HubSubscriptionModel = {
                id: 'hub-1',
                callback: 'http://localhost:3001/listener/tmf634',
                event: 'ResourceCatalogCreateEvent',
                active: true,
            };

            repository.findById.mockResolvedValue(existing);
            repository.patchById.mockResolvedValue({
                ...existing,
                active: false,
            });

            await useCase.exec(existing.id);

            expect(repository.patchById).toHaveBeenCalledWith(
                existing.id,
                expect.objectContaining({
                    active: false,
                }),
            );
        });

        it('should throw not found when hub subscription does not exist', async () => {
            const repository = makeRepositoryMock();
            const useCase = new DeleteHubUseCase(repository);

            repository.findById.mockResolvedValue(null);

            await expect(useCase.exec('unknown-hub')).rejects.toBeInstanceOf(
                NotFoundException,
            );
            expect(repository.patchById).not.toHaveBeenCalled();
        });
    });

    describe('CreateHubUseCase - additional', () => {
        it('should return left when event is invalid', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateHubUseCase(logger, repository);

            const result = await useCase.exec({
                callback: 'http://cb',
                event: 'InvalidEvent' as any,
            } as any);

            expect(result.isLeft()).toBe(true);
        });

        it('should return left when query is invalid for event', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateHubUseCase(logger, repository);

            const result = await useCase.exec({
                callback: 'http://cb',
                event: 'ResourceCatalogCreateEvent',
                query: 'bad-query-format',
            } as any);

            expect(result.isLeft()).toBe(true);
        });

        it('should return existing subscription when it matches exactly', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateHubUseCase(logger, repository);
            const existing: HubSubscriptionModel = {
                id: 'hub-1',
                callback: 'http://cb',
                event: 'ResourceCatalogCreateEvent',
                active: true,
                credentials: undefined,
                query: undefined,
            };

            repository.findAll.mockResolvedValue({
                total: 1,
                items: [existing],
            });

            const result = await useCase.exec({
                callback: 'http://cb',
                event: 'ResourceCatalogCreateEvent',
            } as any);

            expect(result.isRight()).toBe(true);
            expect((result as any).value.id).toBe('hub-1');
            expect(repository.create).not.toHaveBeenCalled();
            expect(repository.patchById).not.toHaveBeenCalled();
        });

        it('should patch existing subscription when it differs', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateHubUseCase(logger, repository);
            const existing: HubSubscriptionModel = {
                id: 'hub-1',
                callback: 'http://cb',
                event: 'ResourceCatalogCreateEvent',
                active: false,
                credentials: undefined,
                query: undefined,
            };
            const patched: HubSubscriptionModel = { ...existing, active: true };

            repository.findAll.mockResolvedValue({
                total: 1,
                items: [existing],
            });
            repository.patchById.mockResolvedValue(patched);

            const result = await useCase.exec({
                callback: 'http://cb',
                event: 'ResourceCatalogCreateEvent',
            } as any);

            expect(result.isRight()).toBe(true);
            expect(repository.patchById).toHaveBeenCalledWith(
                'hub-1',
                expect.objectContaining({ active: true }),
            );
        });

        it('should return left and log when repository throws', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new CreateHubUseCase(logger, repository);

            repository.findAll.mockRejectedValue(new Error('DB error'));

            const result = await useCase.exec({
                callback: 'http://cb',
                event: 'ResourceCatalogCreateEvent',
            } as any);

            expect(result.isLeft()).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('ListHubUseCase', () => {
        it('should list hub subscriptions with pagination and filters', async () => {
            const logger = makeLoggerMock() as unknown as LoggerService;
            const repository = makeRepositoryMock();
            const useCase = new ListHubUseCase(logger, repository);
            const query: ListHubDto = {
                offset: 0,
                limit: 20,
                callback: 'localhost:3001/listener',
                event: 'ResourceSpecificationCreateEvent',
            };

            repository.findAll.mockResolvedValue({
                total: 1,
                items: [
                    {
                        id: 'hub-1',
                        callback: 'http://localhost:3001/listener/tmf634',
                        event: 'ResourceSpecificationCreateEvent',
                        active: true,
                    },
                ],
            });

            const result = await useCase.exec(query);

            expect(result.isRight()).toBe(true);
            expect((result as any).value.total).toBe(1);
            expect((result as any).value.items).toHaveLength(1);
            expect(repository.findAll).toHaveBeenCalledWith({
                offset: 0,
                limit: 20,
                filters: {
                    callback: query.callback,
                    event: query.event,
                    active: undefined,
                },
            });
        });
    });
});
