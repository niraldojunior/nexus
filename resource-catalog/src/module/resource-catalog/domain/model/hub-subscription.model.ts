import { TmfExtensibleModel } from './common.model';

export class HubSubscriptionModel extends TmfExtensibleModel {
    public static readonly propertyKeys = [
        'id',
        'callback',
        'event',
        'query',
        'credentials',
        'active',
        'createdAt',
        'updatedAt',
        'lastUpdate',
        '@type',
        '@baseType',
        '@schemaLocation',
    ] as const;

    id: string;
    callback: string;
    event: string;
    query?: string;
    credentials?: string;
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
