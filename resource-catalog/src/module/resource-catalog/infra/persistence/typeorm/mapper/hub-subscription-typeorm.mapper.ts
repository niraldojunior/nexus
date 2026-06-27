import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';

import { HubSubscriptionDocument } from '../document/hub-subscription.document';

export class HubSubscriptionTypeOrmMapper {
    static toDocument(model: HubSubscriptionModel): HubSubscriptionDocument {
        return {
            id: model.id,
            callback: model.callback,
            event: model.event,
            query: model.query,
            active: model.active ?? true,
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: model.createdAt ?? new Date(),
            updatedAt: model.updatedAt ?? new Date(),
        };
    }

    static toModel(document: HubSubscriptionDocument): HubSubscriptionModel {
        return {
            id: document.id,
            callback: document.callback,
            event: document.event,
            query: document.query,
            active: document.active,
            '@type': document['@type'],
            '@baseType': document['@baseType'],
            '@schemaLocation': document['@schemaLocation'],
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
        };
    }
}
