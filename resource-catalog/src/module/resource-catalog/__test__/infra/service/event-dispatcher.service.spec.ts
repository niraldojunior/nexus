import { createEventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { HubSubscriptionRepository } from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { EventDispatcherService } from '@/module/resource-catalog/infra/service/event-dispatcher.service';
import { NotificationDispatcherPort } from '@/shared/application/port/notification-dispatcher/notification-dispatcher.repository';
import { LoggerService } from '@/shared/infra/logger/logger.service';

const makeRepositoryMock = (): jest.Mocked<HubSubscriptionRepository> => ({
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findAllActiveByEvent: jest.fn(),
    patchById: jest.fn(),
});

const makeLoggerMock = (): jest.Mocked<
    Pick<LoggerService, 'setContext' | 'info' | 'warn' | 'error'>
> => ({
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
});

const makeNotificationAdapterMock =
    (): jest.Mocked<NotificationDispatcherPort> => ({
        event: jest.fn(),
    });

describe('Tmf634EventDispatcherService', () => {
    it('should dispatch event to 1..N active subscribers', async () => {
        const repository = makeRepositoryMock();
        const logger = makeLoggerMock() as unknown as LoggerService;
        const notificationAdapter = makeNotificationAdapterMock();

        repository.findAllActiveByEvent.mockResolvedValue([
            {
                id: 'hub-1',
                event: 'ResourceCategoryCreateEvent',
                callback: 'http://localhost:3001/callback-1',
                active: true,
            },
            {
                id: 'hub-2',
                event: 'ResourceCategoryCreateEvent',
                callback: 'http://localhost:3001/callback-2',
                active: true,
            },
        ]);

        notificationAdapter.event.mockResolvedValue(undefined);

        const service = new EventDispatcherService(
            logger,
            notificationAdapter,
            repository,
        );

        await service.dispatchResourceSpecificationCreate(
            createEventEnvelope('ResourceSpecificationCreateEvent', {
                resourceSpecification: {
                    id: 'spec-1',
                    name: 'CPE ZTE F670L',
                    lifecycleStatus: 'Active',
                    uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                    resourceCatalog: [],
                    resourceCategory: [{ id: 'spec-1' }],
                },
            }),
        );

        expect(notificationAdapter.event).toHaveBeenCalledTimes(2);
        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({ description: expect.any(String) }),
            expect.stringContaining('"status":"start"'),
        );
        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({ description: expect.any(String) }),
            expect.stringContaining('"status":"success"'),
        );
    });

    it('should skip subscribers whose query does not match the event payload', async () => {
        const repository = makeRepositoryMock();
        const logger = makeLoggerMock() as unknown as LoggerService;
        const notificationAdapter = makeNotificationAdapterMock();

        repository.findAllActiveByEvent.mockResolvedValue([
            {
                id: 'hub-match',
                event: 'ResourceSpecificationCreateEvent',
                callback: 'http://localhost:3001/callback-match',
                active: true,
                query: 'event.resourceSpecification.resourceCatalog.id=cat-1,cat-2',
            },
            {
                id: 'hub-no-match',
                event: 'ResourceSpecificationCreateEvent',
                callback: 'http://localhost:3001/callback-no-match',
                active: true,
                query: 'event.resourceSpecification.resourceCatalog.id=cat-999',
            },
            {
                id: 'hub-no-query',
                event: 'ResourceSpecificationCreateEvent',
                callback: 'http://localhost:3001/callback-no-query',
                active: true,
            },
        ]);

        notificationAdapter.event.mockResolvedValue(undefined);

        const service = new EventDispatcherService(
            logger,
            notificationAdapter,
            repository,
        );

        await service.dispatchResourceSpecificationCreate(
            createEventEnvelope('ResourceSpecificationCreateEvent', {
                resourceSpecification: {
                    id: 'spec-1',
                    name: 'CPE ZTE F670L',
                    lifecycleStatus: 'Active',
                    uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                    resourceCatalog: [{ id: 'cat-1' }],
                    resourceCategory: [],
                },
            }),
        );

        // hub-match (query matches cat-1) and hub-no-query (no filter) should be called; hub-no-match skipped
        expect(notificationAdapter.event).toHaveBeenCalledTimes(2);
    });

    it('should pass through (fail-open) when query is malformed', async () => {
        const repository = makeRepositoryMock();
        const logger = makeLoggerMock() as unknown as LoggerService;
        const notificationAdapter = makeNotificationAdapterMock();

        repository.findAllActiveByEvent.mockResolvedValue([
            {
                id: 'hub-bad-query',
                event: 'ResourceSpecificationCreateEvent',
                callback: 'http://localhost:3001/callback',
                active: true,
                query: 'not-a-valid-query-at-all',
            },
        ]);

        notificationAdapter.event.mockResolvedValue(undefined);

        const service = new EventDispatcherService(
            logger,
            notificationAdapter,
            repository,
        );

        await service.dispatchResourceSpecificationCreate(
            createEventEnvelope('ResourceSpecificationCreateEvent', {
                resourceSpecification: {
                    id: 'spec-1',
                    name: 'CPE ZTE F670L',
                    lifecycleStatus: 'Active',
                    uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                    resourceCatalog: [],
                    resourceCategory: [],
                },
            }),
        );

        // malformed query → parseHubQuery returns null → fail-open, dispatch proceeds
        expect(notificationAdapter.event).toHaveBeenCalledTimes(1);
    });

    it('should continue dispatching when one callback fails', async () => {
        const repository = makeRepositoryMock();
        const logger = makeLoggerMock() as unknown as LoggerService;
        const notificationAdapter = makeNotificationAdapterMock();

        repository.findAllActiveByEvent.mockResolvedValue([
            {
                id: 'hub-1',
                event: 'ResourceCategoryCreateEvent',
                callback: 'http://localhost:3001/callback-1',
                active: true,
            },
            {
                id: 'hub-2',
                event: 'ResourceCategoryCreateEvent',
                callback: 'http://localhost:3001/callback-2',
                active: true,
            },
        ]);

        notificationAdapter.event
            .mockRejectedValueOnce(new Error('timeout in callback-1'))
            .mockResolvedValueOnce(undefined);

        const service = new EventDispatcherService(
            logger,
            notificationAdapter,
            repository,
        );

        await expect(
            service.dispatchResourceSpecificationAttributeValueChange(
                createEventEnvelope(
                    'ResourceSpecificationAttributeValueChangeEvent',
                    {
                        resourceSpecification: {
                            id: 'spec-1',
                            name: 'CPE ZTE F670L',
                            lifecycleStatus: 'Active',
                            uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                            resourceCatalog: [],
                            resourceCategory: [{ id: 'spec-1' }],
                        },
                    },
                ),
            ),
        ).resolves.toBeUndefined();

        expect(notificationAdapter.event).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
