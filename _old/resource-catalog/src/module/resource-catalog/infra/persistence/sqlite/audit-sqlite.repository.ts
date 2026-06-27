import { Cacheable, Keyv } from 'cacheable';

import {
    AuditFindAllParams,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { SqliteConfig } from '@/shared/infra/cache/cache-manager/store/sqlite-store.config';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class AuditSqliteRepository implements AuditRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly db: Keyv<Cacheable>;

    private constructor(private readonly logger: LoggerService) {
        this.db = new SqliteConfig().getStore();
    }

    static getInstance(logger: LoggerService): AuditSqliteRepository {
        return new AuditSqliteRepository(logger);
    }

    async create(data: AuditModel): Promise<AuditModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        await this.db.set(data.id, data);
        return data;
    }

    async findById(id: string): Promise<AuditModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return (await this.db.get(id)) ?? null;
    }

    async findAll(
        params?: AuditFindAllParams,
    ): Promise<PagedResultModel<AuditModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const iterator = this.db.iterator;
        const items: AuditModel[] = [];
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;

        if (!iterator) {
            return { total: 0, items: [] };
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            const item = value as AuditModel;

            if ('@type' in item) {
                continue;
            }
            if (params?.filters?.id && !item.id.includes(params.filters.id)) {
                continue;
            }
            if (
                params?.filters?.userId &&
                !item.userId
                    ?.toLowerCase()
                    .includes(params.filters.userId.toLowerCase())
            ) {
                continue;
            }
            if (
                params?.filters?.entityId &&
                !item.entityId
                    ?.toLowerCase()
                    .includes(params.filters.entityId.toLowerCase())
            ) {
                continue;
            }
            if (
                params?.filters?.entityType &&
                item.entityType !== params.filters.entityType
            ) {
                continue;
            }
            if (
                params?.filters?.action &&
                item.action !== params.filters.action
            ) {
                continue;
            }
            if (
                params?.filters?.timestampStart &&
                item.timestamp &&
                new Date(item.timestamp) <
                    new Date(params.filters.timestampStart)
            ) {
                continue;
            }
            if (
                params?.filters?.timestampEnd &&
                item.timestamp &&
                new Date(item.timestamp) > new Date(params.filters.timestampEnd)
            ) {
                continue;
            }

            items.push(item);
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
