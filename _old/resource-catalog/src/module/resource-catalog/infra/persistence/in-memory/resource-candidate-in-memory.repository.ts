import {
    ResourceCandidateFindAllParams,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class ResourceCandidateInMemoryRepository implements ResourceCandidateRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly items = new Map<string, ResourceCandidateModel>();

    constructor(
        private readonly logger: LoggerService,
        seed: ResourceCandidateModel[] = [],
    ) {
        for (const item of seed) {
            this.items.set(item.id, this.cloneItem(item));
        }
    }

    private cloneItem(item: ResourceCandidateModel): ResourceCandidateModel {
        return {
            ...item,
            category: item.category?.map((c) => ({ ...c })) ?? [],
            catalog: { ...item.catalog },
            resourceSpecification: { ...item.resourceSpecification },
            validFor: item.validFor ? { ...item.validFor } : undefined,
            createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
        };
    }

    async create(
        data: ResourceCandidateModel,
    ): Promise<ResourceCandidateModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        this.items.set(data.id, this.cloneItem(data));
        return await Promise.resolve(data);
    }

    async findById(id: string): Promise<ResourceCandidateModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return await Promise.resolve(this.items.get(id) ?? null);
    }

    async findAll(
        params?: ResourceCandidateFindAllParams,
    ): Promise<PagedResultModel<ResourceCandidateModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;

        const all = Array.from(this.items.values()).filter((item) => {
            if (item['@type'] !== ResourceType.RESOURCE_CANDIDATE) {
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
                params?.filters?.resourceSpecificationId &&
                item.resourceSpecification.id !==
                    params.filters.resourceSpecificationId
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
                params?.filters?.resourceCatalogId &&
                item.catalog?.id !== params.filters.resourceCatalogId
            ) {
                return false;
            }
            if (
                params?.filters?.resourceCategoryId &&
                !item.category?.some(
                    (c) => c.id === params.filters?.resourceCategoryId,
                )
            ) {
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
        patch: Partial<ResourceCandidateModel>,
    ): Promise<ResourceCandidateModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));
        const current = this.items.get(id);

        if (!current) {
            return await Promise.resolve(null);
        }

        const next: ResourceCandidateModel = {
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

    async findBySpecificationId(
        specificationId: string,
    ): Promise<ResourceCandidateModel[]> {
        this.logger.info(this.logMetadata, safeStringify({ specificationId }));
        const result = Array.from(this.items.values()).filter(
            (item) => item.resourceSpecification.id === specificationId,
        );
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(result),
        );
        return await Promise.resolve(result);
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
