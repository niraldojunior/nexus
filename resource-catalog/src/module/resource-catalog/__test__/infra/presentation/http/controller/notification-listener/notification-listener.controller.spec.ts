import { NotificationListener } from '@/module/notification-dispatcher/infra/presentation/http/controller/notification-listener/notification-listener.controller';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';

describe('NotificationListenerController', () => {
    const controller = new NotificationListener();

    const buildEvent = (eventType: NotificationEvent) => ({
        eventId: '7391531910851620864',
        eventType,
        eventTime: '2026-03-13T12:00:00.000Z',
        targetUri:
            'http://example.com/api/v1/notification-listener/resourceSpecificationCreateEvent',
        event: {
            resourceSpecification: {
                id: '7391531910851620865',
                name: 'CPE ZTE F670L',
                lifecycleStatus: 'Active',
                validFor: {
                    startDateTime: '2026-01-01T00:00:00.000Z',
                },
                uniqueKey: 'ZTE-F670L',
                resourceCatalog: [{ id: '7391531911851660864' }],
                resourceCategory: [{ id: '7391531910851660864' }],
                resourceSpecCharacteristic: [
                    { name: 'Brand', value: 'ZTE', valueType: 'string' },
                    { name: 'Model', value: 'F670L', valueType: 'string' },
                    { name: 'categoria', value: 'P', valueType: 'string' },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        },
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should accept ResourceSpecificationCreateEvent payloads', () => {
        const event = buildEvent('ResourceSpecificationCreateEvent');

        const result = controller.resourceSpecificationCreate(event);

        expect(result).toEqual({
            received: true,
            event: event.eventId,
        });
    });

    it('should accept ResourceSpecificationAttributeValueChangeEvent payloads', () => {
        const event = buildEvent(
            'ResourceSpecificationAttributeValueChangeEvent',
        );

        const result =
            controller.resourceSpecificationAttributeValueChange(event);

        expect(result).toEqual({
            received: true,
            event: event.eventId,
        });
    });
});
