export interface NotificationListenerResourceSpecificationEventDto {
    eventId: string;
    eventType: string;
    eventTime: string;
    event: {
        resourceSpecification: {
            id: string;
            href?: string;
            name: string;
            description?: string;
            lifecycleStatus: string;
            version?: string;
            category?: string;
            uniqueKey: string;
            validFor: {
                startDateTime: string;
                endDateTime?: string;
            };
            resourceCategory: {
                id: string;
                href?: string;
                name?: string;
            }[];
            resourceSpecCharacteristic: {
                name: string;
                valueType: string;
                value: unknown;
            }[];
            createdAt: string;
            updatedAt: string;
        };
    };
}

export interface NotificationListenerResourceSpecificationTargetDto {
    recipient: string;
    credentials?: string;
}

export interface NotificationDispatcherHttpPort {
    dispatch(
        data: NotificationListenerResourceSpecificationEventDto,
        target: NotificationListenerResourceSpecificationTargetDto,
    ): Promise<void>;
}
