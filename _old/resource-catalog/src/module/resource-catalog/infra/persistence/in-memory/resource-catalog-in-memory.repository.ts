import {
    ResourceCatalogFindAllParams,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class ResourceCatalogInMemoryRepository implements ResourceCatalogRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly items = new Map<string, ResourceCatalogModel>();

    constructor(
        private readonly logger: LoggerService,
        seed: ResourceCatalogModel[] = [],
    ) {
        for (const item of seed) {
            this.items.set(item.id, this.cloneItem(item));
        }
    }

    private cloneItem(item: ResourceCatalogModel): ResourceCatalogModel {
        return {
            ...item,
            validFor: item.validFor
                ? {
                      ...item.validFor,
                  }
                : undefined,
            createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
        };
    }

    async create(data: ResourceCatalogModel): Promise<ResourceCatalogModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        const item = this.cloneItem(data);
        this.items.set(data.id, item);
        return await Promise.resolve(item);
    }

    async findById(id: string): Promise<ResourceCatalogModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        const found = this.items.get(id);
        return await Promise.resolve(found ? this.cloneItem(found) : null);
    }

    async findAll(
        params?: ResourceCatalogFindAllParams,
    ): Promise<PagedResultModel<ResourceCatalogModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const all = Array.from(this.items.values()).filter((item) => {
            if (item['@type'] !== ResourceType.RESOURCE_CATALOG) {
                return false;
            }

            if (
                params?.filters?.id &&
                ((typeof params?.filters?.id === 'string' &&
                    item.id !== params.filters.id) ||
                    (Array.isArray(params.filters.id) &&
                        !params.filters.id.includes(item.id)))
            ) {
                return false;
            }

            if (params?.filters?.name && item.name !== params.filters.name) {
                return false;
            }

            if (
                params?.filters?.lifecycleStatus &&
                item.lifecycleStatus !== params.filters.lifecycleStatus
            ) {
                return false;
            }

            if (
                params?.filters?.description &&
                !item.description
                    ?.toLowerCase()
                    .includes(params.filters.description.toLowerCase())
            ) {
                return false;
            }

            if (
                params?.filters?.version &&
                item.version !== params.filters.version
            ) {
                return false;
            }

            if (params?.filters?.validAt) {
                const validAt = new Date(params.filters.validAt);
                const start = item.validFor?.startDateTime
                    ? new Date(item.validFor.startDateTime)
                    : undefined;
                const end = item.validFor?.endDateTime
                    ? new Date(item.validFor.endDateTime)
                    : undefined;
                if (start && validAt < start) return false;
                if (end && validAt > end) return false;
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
            items: sorted
                .slice(offset, offset + limit)
                .map((item) => this.cloneItem(item)),
        });
    }

    async patchById(
        id: string,
        patch: Partial<ResourceCatalogModel>,
    ): Promise<ResourceCatalogModel | null> {
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

        const cloned = this.cloneItem(next);
        this.items.set(id, cloned);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(cloned),
        );
        return await Promise.resolve(cloned);
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
