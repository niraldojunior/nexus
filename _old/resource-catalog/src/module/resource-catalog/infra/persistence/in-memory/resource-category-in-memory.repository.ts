import {
    ResourceCategoryFindAllParams,
    ResourceCategoryRepository,
} from '@/module/resource-catalog/application/port/resource-category.repository';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class ResourceCategoryInMemoryRepository implements ResourceCategoryRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly items = new Map<string, ResourceCategoryModel>();

    constructor(
        private readonly logger: LoggerService,
        seed: ResourceCategoryModel[] = [],
    ) {
        for (const item of seed) {
            this.items.set(item.id, { ...item });
        }
    }

    async create(data: ResourceCategoryModel): Promise<ResourceCategoryModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        this.items.set(data.id, data);
        return await Promise.resolve(data);
    }

    async findById(id: string): Promise<ResourceCategoryModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return await Promise.resolve(this.items.get(id) ?? null);
    }

    async findAll(
        params?: ResourceCategoryFindAllParams,
    ): Promise<PagedResultModel<ResourceCategoryModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const all = Array.from(this.items.values()).filter((item) => {
            if (item['@type'] !== ResourceType.RESOURCE_CATEGORY) {
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

            if (
                params?.filters?.category &&
                item.category !== params.filters.category
            ) {
                return false;
            }

            if (
                params?.filters?.resourceCatalogId &&
                !item.resourceCatalog?.some(
                    (c) => c.id === params.filters?.resourceCatalogId,
                )
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
            items: sorted.slice(offset, offset + limit),
        });
    }

    async patchById(
        id: string,
        patch: Partial<ResourceCategoryModel>,
    ): Promise<ResourceCategoryModel | null> {
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
