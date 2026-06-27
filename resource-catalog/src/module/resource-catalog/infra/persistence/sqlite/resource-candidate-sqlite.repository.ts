import { Cacheable, Keyv } from 'cacheable';

import {
    ResourceCandidateFindAllParams,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { SqliteConfig } from '@/shared/infra/cache/cache-manager/store/sqlite-store.config';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class ResourceCandidateSqliteRepository implements ResourceCandidateRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly db: Keyv<Cacheable>;

    private constructor(private readonly logger: LoggerService) {
        this.db = new SqliteConfig().getStore();
    }

    static async getInstance(
        logger: LoggerService,
        seed: ResourceCandidateModel[] = [],
    ): Promise<ResourceCandidateSqliteRepository> {
        const instance = new ResourceCandidateSqliteRepository(logger);

        for (const item of seed) {
            await instance.db.set(item.id, item);
        }

        return instance;
    }

    async create(
        data: ResourceCandidateModel,
    ): Promise<ResourceCandidateModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        await this.db.set(data.id, data);
        return data;
    }

    async findById(id: string): Promise<ResourceCandidateModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return (await this.db.get(id)) ?? null;
    }

    async findAll(
        params?: ResourceCandidateFindAllParams,
    ): Promise<PagedResultModel<ResourceCandidateModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const iterator = this.db.iterator;
        const items: ResourceCandidateModel[] = [];

        if (!iterator) {
            return { total: 0, items: [] };
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            if (value['@type'] !== ResourceType.RESOURCE_CANDIDATE) {
                continue;
            }
            if (params?.filters?.name && value.name !== params.filters.name) {
                continue;
            }
            if (
                params?.filters?.lifecycleStatus &&
                value.lifecycleStatus !== params.filters.lifecycleStatus
            ) {
                continue;
            }
            if (
                params?.filters?.resourceSpecificationId &&
                value.resourceSpecification?.id !==
                    params.filters.resourceSpecificationId
            ) {
                continue;
            }
            if (
                params?.filters?.description &&
                !value.description
                    ?.toLowerCase()
                    .includes(params.filters.description.toLowerCase())
            ) {
                continue;
            }
            if (
                params?.filters?.version &&
                value.version !== params.filters.version
            ) {
                continue;
            }
            if (
                params?.filters?.resourceCatalogId &&
                value.catalog?.id !== params.filters.resourceCatalogId
            ) {
                continue;
            }
            if (
                params?.filters?.resourceCategoryId &&
                !value.category?.some(
                    (c: { id: string }) =>
                        c.id === params.filters?.resourceCategoryId,
                )
            ) {
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
            items.push(value);
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
        patch: Partial<ResourceCandidateModel>,
    ): Promise<ResourceCandidateModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const current = await this.db.get(id);

        if (!current) {
            return null;
        }

        const next: ResourceCandidateModel = {
            ...(current as unknown as ResourceCandidateModel),
            ...patch,
            id,
            updatedAt: new Date(),
        };

        await this.db.set(id, next);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(next),
        );
        return next;
    }

    async findBySpecificationId(
        specificationId: string,
    ): Promise<ResourceCandidateModel[]> {
        this.logger.info(this.logMetadata, safeStringify({ specificationId }));

        const iterator = this.db.iterator;
        const items: ResourceCandidateModel[] = [];

        if (!iterator) {
            return items;
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            if (value.resourceSpecification?.id === specificationId) {
                items.push(value);
            }
        }

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(items),
        );

        return items;
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
