import { Cacheable, Keyv } from 'cacheable';

import {
    HubSubscriptionFindAllParams,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { SqliteConfig } from '@/shared/infra/cache/cache-manager/store/sqlite-store.config';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class HubSubscriptionSqliteRepository implements HubSubscriptionRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly db: Keyv<Cacheable>;

    private constructor(private readonly logger: LoggerService) {
        this.db = new SqliteConfig().getStore();
    }

    static getInstance(logger: LoggerService): HubSubscriptionSqliteRepository {
        const instance = new HubSubscriptionSqliteRepository(logger);
        return instance;
    }

    async create(data: HubSubscriptionModel): Promise<HubSubscriptionModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        await this.db.set(data.id, data);
        return data;
    }

    async findById(id: string): Promise<HubSubscriptionModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return (await this.db.get(id)) ?? null;
    }

    async findAllActiveByEvent(
        event: NotificationEvent,
    ): Promise<HubSubscriptionModel[]> {
        this.logger.info(this.logMetadata, safeStringify({ event }));

        const iterator = this.db.iterator;
        const items: HubSubscriptionModel[] = [];

        if (!iterator) {
            return items;
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            if (value.active !== false && value.event === event) {
                items.push(value);
            }
        }

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(items),
        );

        return items;
    }

    async findAll(
        params?: HubSubscriptionFindAllParams,
    ): Promise<PagedResultModel<HubSubscriptionModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const iterator = this.db.iterator;
        const items: HubSubscriptionModel[] = [];
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const callbackFilter = params?.filters?.callback?.toLowerCase();
        const eventFilter = params?.filters?.event?.toLowerCase();
        const credentialsFilter = params?.filters?.credentials?.toLowerCase();
        const activeFilter = params?.filters?.active;

        if (!iterator) {
            return {
                total: 0,
                items: [],
            };
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            if (value['@type'] !== ResourceType.HUB) {
                continue;
            }

            if (params?.filters?.id && !value.id.includes(params.filters.id)) {
                continue;
            }

            if (
                callbackFilter &&
                !value.callback?.toLowerCase().includes(callbackFilter)
            ) {
                continue;
            }

            if (
                eventFilter &&
                !(value.event ?? '').toLowerCase().includes(eventFilter)
            ) {
                continue;
            }

            if (
                credentialsFilter &&
                !(value.credentials ?? '')
                    .toLowerCase()
                    .includes(credentialsFilter)
            ) {
                continue;
            }

            if (activeFilter !== undefined && value.active !== activeFilter) {
                continue;
            }

            if (
                params?.filters?.createdAtStart &&
                value.createdAt &&
                new Date(value.createdAt) <
                    new Date(params.filters.createdAtStart)
            ) {
                continue;
            }
            if (
                params?.filters?.createdAtEnd &&
                value.createdAt &&
                new Date(value.createdAt) >
                    new Date(params.filters.createdAtEnd)
            ) {
                continue;
            }
            if (
                params?.filters?.updatedAtStart &&
                value.updatedAt &&
                new Date(value.updatedAt) <
                    new Date(params.filters.updatedAtStart)
            ) {
                continue;
            }
            if (
                params?.filters?.updatedAtEnd &&
                value.updatedAt &&
                new Date(value.updatedAt) >
                    new Date(params.filters.updatedAtEnd)
            ) {
                continue;
            }

            items.push(value as HubSubscriptionModel);
        }

        const sorted = this.sortItems(items, params?.sort);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(sorted),
        );
        return {
            total: sorted.length,
            items: sorted.slice(offset, offset + limit),
        };
    }

    async patchById(
        id: string,
        patch: Partial<HubSubscriptionModel>,
    ): Promise<HubSubscriptionModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const current = await this.db.get(id);

        if (!current) {
            return null;
        }

        const next = {
            ...current,
            ...patch,
            id,
            updatedAt: new Date(),
        };

        await this.db.set(id, next);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(next),
        );
        return next as HubSubscriptionModel;
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
