import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';

import { NotificationEvent } from '../../domain/const/notification-event.const';

export const HUB_SUBSCRIPTION_REPOSITORY = 'HUB_SUBSCRIPTION_REPOSITORY';

export interface HubSubscriptionFindAllParams {
    offset?: number;
    limit?: number;
    sort?: Partial<Record<string, 'ASC' | 'DESC'>>;
    filters?: Partial<
        Pick<
            HubSubscriptionModel,
            'id' | 'callback' | 'event' | 'credentials' | 'active'
        > & {
            createdAtStart: string;
            createdAtEnd: string;
            updatedAtStart: string;
            updatedAtEnd: string;
        }
    >;
}

export interface HubSubscriptionRepository {
    create(data: HubSubscriptionModel): Promise<HubSubscriptionModel>;
    findById(id: string): Promise<HubSubscriptionModel | null>;
    findAllActiveByEvent(
        event: NotificationEvent,
    ): Promise<HubSubscriptionModel[]>;
    findAll(
        params?: HubSubscriptionFindAllParams,
    ): Promise<PagedResultModel<HubSubscriptionModel>>;
    patchById(
        id: string,
        patch: Partial<HubSubscriptionModel>,
    ): Promise<HubSubscriptionModel | null>;
}
