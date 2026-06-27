import { NotificationEventDto } from '@/module/notification-dispatcher/application/dto/notification-dispatcher/event/listener-resource-catalog-event.dto';
import { NotificationDispatcherPortImpl } from '@/module/notification-dispatcher/infra/provider/notification-dispatcher-event/notification-dispatcher.provider';
import { EventEnvelope } from '@/module/resource-catalog/application/dto/event/tmf634-event.dto';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { BadRequestError } from '@/shared/application/error/bad-request.error';

const makeServiceMock = () => ({
    sendMessage: jest.fn().mockResolvedValue(undefined),
});

const makeValidEnvelope = (
    eventType: string = NotificationEvent.RESOURCE_CATALOG_CREATE_EVENT,
): EventEnvelope<NotificationEventDto> =>
    ({
        eventType,
        event: {} as NotificationEventDto,
        targetUri: 'http://example.com/callback',
        credentials: undefined,
    }) as any;

describe('NotificationDispatcherPortImpl', () => {
    describe('event()', () => {
        it('should call sendMessage with valid event type', async () => {
            const service = makeServiceMock();
            const provider = new NotificationDispatcherPortImpl(service as any);
            const envelope = makeValidEnvelope(
                NotificationEvent.RESOURCE_CATALOG_CREATE_EVENT,
            );

            await provider.event(envelope);

            expect(service.sendMessage).toHaveBeenCalledTimes(1);
            expect(service.sendMessage).toHaveBeenCalledWith(
                NotificationEvent.RESOURCE_CATALOG_CREATE_EVENT,
                expect.objectContaining({
                    eventType: NotificationEvent.RESOURCE_CATALOG_CREATE_EVENT,
                    retries: 0,
                }),
                undefined,
            );
        });

        it('should forward opts.retryCount as retries', async () => {
            const service = makeServiceMock();
            const provider = new NotificationDispatcherPortImpl(service as any);
            const envelope = makeValidEnvelope(
                NotificationEvent.RESOURCE_SPECIFICATION_STATUS_CHANGE_EVENT,
            );

            await provider.event(envelope, { retryCount: 3 });

            expect(service.sendMessage).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ retries: 3 }),
                { retryCount: 3 },
            );
        });

        it('should throw BadRequestError for unsupported event type', async () => {
            const service = makeServiceMock();
            const provider = new NotificationDispatcherPortImpl(service as any);
            const envelope = makeValidEnvelope('UnsupportedEventType');

            await expect(provider.event(envelope)).rejects.toBeInstanceOf(
                BadRequestError,
            );
            expect(service.sendMessage).not.toHaveBeenCalled();
        });

        it('should support all known event types without throwing', async () => {
            const service = makeServiceMock();
            const provider = new NotificationDispatcherPortImpl(service as any);

            const allEvents = Object.values(NotificationEvent);
            for (const eventType of allEvents) {
                service.sendMessage.mockClear();
                const envelope = makeValidEnvelope(eventType);
                await expect(provider.event(envelope)).resolves.not.toThrow();
                expect(service.sendMessage).toHaveBeenCalledTimes(1);
            }
        });
    });
});
