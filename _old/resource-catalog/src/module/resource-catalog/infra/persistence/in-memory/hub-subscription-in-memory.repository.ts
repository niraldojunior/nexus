import {
    HubSubscriptionFindAllParams,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class HubSubscriptionInMemoryRepository implements HubSubscriptionRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly items = new Map<string, HubSubscriptionModel>();

    constructor(private readonly logger: LoggerService) {}

    async create(data: HubSubscriptionModel): Promise<HubSubscriptionModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        this.items.set(data.id, data);
        return await Promise.resolve(data);
    }

    async findById(id: string): Promise<HubSubscriptionModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return await Promise.resolve(this.items.get(id) ?? null);
    }

    async findAllActiveByEvent(
        event: NotificationEvent,
    ): Promise<HubSubscriptionModel[]> {
        this.logger.info(this.logMetadata, safeStringify({ event }));
        const active = Array.from(this.items.values()).filter(
            (item) => item.active !== false && item.event === event,
        );
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify({ active }),
        );
        return await Promise.resolve(active);
    }

    async findAll(
        params?: HubSubscriptionFindAllParams,
    ): Promise<PagedResultModel<HubSubscriptionModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const callbackFilter = params?.filters?.callback?.toLowerCase();
        const eventFilter = params?.filters?.event?.toLowerCase();
        const credentialsFilter = params?.filters?.credentials?.toLowerCase();
        const activeFilter = params?.filters?.active;

        const all = Array.from(this.items.values()).filter((item) => {
            if (item['@type'] !== ResourceType.HUB) {
                return false;
            }

            if (params?.filters?.id && !item.id.includes(params.filters.id)) {
                return false;
            }

            if (
                callbackFilter &&
                !item.callback.toLowerCase().includes(callbackFilter)
            ) {
                return false;
            }

            if (
                eventFilter &&
                !(item.event ?? '').toLowerCase().includes(eventFilter)
            ) {
                return false;
            }

            if (
                credentialsFilter &&
                !(item.credentials ?? '')
                    .toLowerCase()
                    .includes(credentialsFilter)
            ) {
                return false;
            }

            if (activeFilter !== undefined && item.active !== activeFilter) {
                return false;
            }

            if (
                params?.filters?.createdAtStart &&
                item.createdAt &&
                item.createdAt < new Date(params.filters.createdAtStart)
            ) {
                return false;
            }
            if (
                params?.filters?.createdAtEnd &&
                item.createdAt &&
                item.createdAt > new Date(params.filters.createdAtEnd)
            ) {
                return false;
            }
            if (
                params?.filters?.updatedAtStart &&
                item.updatedAt &&
                item.updatedAt < new Date(params.filters.updatedAtStart)
            ) {
                return false;
            }
            if (
                params?.filters?.updatedAtEnd &&
                item.updatedAt &&
                item.updatedAt > new Date(params.filters.updatedAtEnd)
            ) {
                return false;
            }

            return true;
        });

        const sorted = this.sortItems(all, params?.sort);

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(sorted),
        );

        return await Promise.resolve({
            total: sorted.length,
            items: sorted.slice(offset, offset + limit),
        });
    }

    async patchById(
        id: string,
        patch: Partial<HubSubscriptionModel>,
    ): Promise<HubSubscriptionModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const current = this.items.get(id);

        if (!current) {
            return await Promise.resolve(null);
        }

        const next = {
            ...current,
            ...patch,
            id,
            updatedAt: new Date(),
        };

        this.items.set(id, next);

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(next),
        );

        return await Promise.resolve(next);
    }

    private sortItems<T extends object>(
        items: T[],
        sort?: Partial<Record<string, 'ASC' | 'DESC'>>,
    ): T[] {
        if (!sort || !Object.keys(sort).length) return items;
        const entries = Object.entries(sort);
        return [...items].sort((a, b) => {
            for (const [key, dir] of entries) {
                const av = (a as Record<string, unknown>)[key];
                const bv = (b as Record<string, unknown>)[key];
                if (av === bv) continue;
                const cmp =
                    av instanceof Date && bv instanceof Date
                        ? av.getTime() - bv.getTime()
                        : String(av ?? '').localeCompare(String(bv ?? ''));
                return dir === 'DESC' ? -cmp : cmp;
            }
            return 0;
        });
    }
}
