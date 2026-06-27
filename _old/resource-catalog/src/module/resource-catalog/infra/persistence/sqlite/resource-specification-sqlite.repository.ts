import { Cacheable, Keyv } from 'cacheable';

import {
    ResourceSpecificationFindAllParams,
    ResourceSpecificationRepository,
} from '@/module/resource-catalog/application/port/resource-specification.repository';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { SqliteConfig } from '@/shared/infra/cache/cache-manager/store/sqlite-store.config';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class ResourceSpecificationSqliteRepository implements ResourceSpecificationRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly db: Keyv<Cacheable>;

    private constructor(private readonly logger: LoggerService) {
        this.db = new SqliteConfig().getStore();
    }

    private cloneItem(
        item: ResourceSpecificationModel,
    ): ResourceSpecificationModel {
        return {
            ...item,
            validFor: item.validFor
                ? {
                      ...item.validFor,
                  }
                : undefined,
            resourceCategory: item.resourceCategory?.map((category) => ({
                ...category,
            })),
            resourceSpecCharacteristic: item.resourceSpecCharacteristic?.map(
                (characteristic) => ({
                    ...characteristic,
                }),
            ),
            createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
        };
    }

    static async getInstance(
        logger: LoggerService,
        seed: ResourceSpecificationModel[] = [],
    ): Promise<ResourceSpecificationSqliteRepository> {
        const instance = new ResourceSpecificationSqliteRepository(logger);

        if (seed.length) {
            for (const item of seed) {
                await instance.db.set(item.id, instance.cloneItem(item));
            }
        }

        return instance;
    }

    async create(
        data: ResourceSpecificationModel,
    ): Promise<ResourceSpecificationModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        await this.db.set(data.id, data);
        return data;
    }

    async findById(id: string): Promise<ResourceSpecificationModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return (await this.db.get(id)) ?? null;
    }

    async findAll(
        params?: ResourceSpecificationFindAllParams,
    ): Promise<PagedResultModel<ResourceSpecificationModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const iterator = this.db.iterator;
        const items: ResourceSpecificationModel[] = [];

        if (!iterator) {
            return {
                total: items.length,
                items,
            };
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            if (value['@type'] !== ResourceType.RESOURCE_SPECIFICATION) {
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

            if (params?.filters?.id && value.id !== params.filters.id) {
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
                params?.filters?.category &&
                value.category !== params.filters.category
            ) {
                continue;
            }

            if (
                params?.filters?.resourceCatalogId &&
                !value.resourceCatalog?.some(
                    (c: { id: string }) =>
                        c.id === params.filters?.resourceCatalogId,
                )
            ) {
                continue;
            }

            if (
                params?.filters?.resourceCategoryId &&
                !value.resourceCategory?.some(
                    (c: { id: string }) =>
                        c.id === params.filters?.resourceCategoryId,
                )
            ) {
                continue;
            }

            if (
                params?.filters?.resourceSpecCharacteristicName &&
                params?.filters?.resourceSpecCharacteristicValue
            ) {
                const names = params.filters.resourceSpecCharacteristicName;
                const values = params.filters.resourceSpecCharacteristicValue;
                if (
                    !value.resourceSpecCharacteristic?.some(
                        (c: { name?: unknown; value?: unknown }) =>
                            names.some((n) =>
                                String(c.name ?? '').includes(n),
                            ) &&
                            values.some((v) =>
                                String(c.value ?? '').includes(v),
                            ),
                    )
                ) {
                    continue;
                }
            } else {
                if (params?.filters?.resourceSpecCharacteristicName) {
                    const names = params.filters.resourceSpecCharacteristicName;
                    if (
                        !value.resourceSpecCharacteristic?.some(
                            (c: { name?: unknown }) =>
                                names.some((n) =>
                                    String(c.name ?? '').includes(n),
                                ),
                        )
                    ) {
                        continue;
                    }
                }

                if (params?.filters?.resourceSpecCharacteristicValue) {
                    const values =
                        params.filters.resourceSpecCharacteristicValue;
                    if (
                        !value.resourceSpecCharacteristic?.some(
                            (c: { value?: unknown }) =>
                                values.some((v) =>
                                    String(c.value ?? '').includes(v),
                                ),
                        )
                    ) {
                        continue;
                    }
                }
            }

            if (params?.filters?.validAt) {
                const validAt = new Date(params.filters.validAt);
                const start = value.validFor?.startDateTime
                    ? new Date(value.validFor.startDateTime)
                    : undefined;
                const end = value.validFor?.endDateTime
                    ? new Date(value.validFor.endDateTime)
                    : undefined;

                if (start && validAt < start) {
                    continue;
                }
                if (end && validAt > end) {
                    continue;
                }
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
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO DB' },
            safeStringify(sorted),
        );
        return {
            total: sorted.length,
            items: sorted.slice(offset, offset + limit),
        };
    }

    async patchById(
        id: string,
        patch: Partial<ResourceSpecificationModel>,
    ): Promise<ResourceSpecificationModel | null> {
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
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO DB' },
            safeStringify(next),
        );
        return next as ResourceSpecificationModel;
    }

    async existsByBusinessKey(
        uniqueKey: string,
        excludeId?: string,
    ): Promise<boolean> {
        this.logger.info(
            this.logMetadata,
            safeStringify({ uniqueKey, excludeId }),
        );

        const iterator = this.db.iterator;
        let foundId = '';

        if (!iterator) {
            return false;
        }

        for await (const [_, value] of iterator(env<string>('CACHE_PREFIX'))) {
            if (value.uniqueKey === uniqueKey) {
                foundId = value.id;
                break;
            }
        }

        if (!foundId) {
            return false;
        }
        if (excludeId && foundId === excludeId) {
            return false;
        }

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO DB' },
            safeStringify({ foundId }),
        );
        return true;
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
