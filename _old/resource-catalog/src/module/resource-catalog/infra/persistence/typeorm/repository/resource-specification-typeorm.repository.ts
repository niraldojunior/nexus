import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsOrder } from 'typeorm';

import {
    ResourceSpecificationFindAllParams,
    ResourceSpecificationRepository,
} from '@/module/resource-catalog/application/port/resource-specification.repository';
import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { ResourceSpecificationDocument } from '../document/resource-specification.document';
import { ResourceSpecificationTypeOrmMapper } from '../mapper/resource-specification-typeorm.mapper';

@Injectable()
export class ResourceSpecificationTypeOrmRepository implements ResourceSpecificationRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };

    constructor(
        private readonly dataSource: DataSource,
        private readonly logger: LoggerService,
    ) {}

    async create(
        data: ResourceSpecificationModel,
    ): Promise<ResourceSpecificationModel> {
        this.logger.info(this.logMetadata, safeStringify(data));

        const repository = this.dataSource.getMongoRepository(
            ResourceSpecificationDocument,
        );

        const document = ResourceSpecificationTypeOrmMapper.toDocument({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const created = await repository.save(document);
        return ResourceSpecificationTypeOrmMapper.toModel(created);
    }

    async findById(id: string): Promise<ResourceSpecificationModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));

        const repository = this.dataSource.getMongoRepository(
            ResourceSpecificationDocument,
        );
        const found = await repository.findOne({ where: { id } });
        return found ? ResourceSpecificationTypeOrmMapper.toModel(found) : null;
    }

    async findAll(
        params?: ResourceSpecificationFindAllParams,
    ): Promise<{ items: ResourceSpecificationModel[]; total: number }> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const repository = this.dataSource.getMongoRepository(
            ResourceSpecificationDocument,
        );

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const where: Record<string, unknown> = {
            ...(params?.filters?.id ? { id: params.filters.id } : {}),
            ...(params?.filters?.name ? { name: params.filters.name } : {}),
            ...(params?.filters?.version
                ? { version: params.filters.version }
                : {}),
            ...(params?.filters?.category
                ? { category: params.filters.category }
                : {}),
            ...(params?.filters?.lifecycleStatus
                ? { lifecycleStatus: params.filters.lifecycleStatus }
                : {}),
            ...(params?.filters?.description
                ? {
                      description: new RegExp(
                          this.escapeRegex(params.filters.description),
                          'i',
                      ),
                  }
                : {}),
        };

        if (params?.filters?.resourceCatalogId) {
            where['resourceCatalog.id'] = params.filters.resourceCatalogId;
        }
        if (params?.filters?.resourceCategoryId) {
            where['resourceCategory.id'] = params.filters.resourceCategoryId;
        }
        if (
            params?.filters?.resourceSpecCharacteristicName &&
            params?.filters?.resourceSpecCharacteristicValue
        ) {
            const names = params.filters.resourceSpecCharacteristicName;
            const values = params.filters.resourceSpecCharacteristicValue;
            where['resourceSpecCharacteristic'] = {
                $elemMatch: {
                    name: {
                        $in: names.map(
                            (n) => new RegExp(this.escapeRegex(n), 'i'),
                        ),
                    },
                    value: {
                        $in: values.map(
                            (v) => new RegExp(this.escapeRegex(v), 'i'),
                        ),
                    },
                },
            };
        } else {
            if (params?.filters?.resourceSpecCharacteristicName) {
                const names = params.filters.resourceSpecCharacteristicName;
                where['resourceSpecCharacteristic.name'] = {
                    $in: names.map((n) => new RegExp(this.escapeRegex(n), 'i')),
                };
            }
            if (params?.filters?.resourceSpecCharacteristicValue) {
                const values = params.filters.resourceSpecCharacteristicValue;
                where['resourceSpecCharacteristic.value'] = {
                    $in: values.map(
                        (v) => new RegExp(this.escapeRegex(v), 'i'),
                    ),
                };
            }
        }

        const createdAtFilter: Record<string, Date> = {};
        if (params?.filters?.createdAtStart)
            createdAtFilter['$gte'] = new Date(params.filters.createdAtStart);
        if (params?.filters?.createdAtEnd)
            createdAtFilter['$lte'] = new Date(params.filters.createdAtEnd);
        if (Object.keys(createdAtFilter).length)
            where['createdAt'] = createdAtFilter;

        const updatedAtFilter: Record<string, Date> = {};
        if (params?.filters?.updatedAtStart)
            updatedAtFilter['$gte'] = new Date(params.filters.updatedAtStart);
        if (params?.filters?.updatedAtEnd)
            updatedAtFilter['$lte'] = new Date(params.filters.updatedAtEnd);
        if (Object.keys(updatedAtFilter).length)
            where['updatedAt'] = updatedAtFilter;

        if (params?.filters?.validAt) {
            const validAt =
                params.filters.validAt instanceof Date
                    ? params.filters.validAt
                    : new Date(params.filters.validAt);
            where['$and'] = [
                {
                    $or: [
                        { validForStartDateTime: null },
                        { validForStartDateTime: { $lte: validAt } },
                    ],
                },
                {
                    $or: [
                        { validForEndDateTime: null },
                        { validForEndDateTime: { $gte: validAt } },
                    ],
                },
            ];
        }

        this.logger.info(
            { ...this.logMetadata, description: 'FILTROS APLICADOS' },
            safeStringify({
                where,
                skip: offset,
                take: limit,
                order: params?.sort,
            }),
        );

        const [pagedItems, total] = await repository.findAndCount({
            where,
            skip: offset,
            take: limit,
            order: params?.sort as FindOptionsOrder<ResourceSpecificationDocument>,
        });

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(pagedItems),
        );

        return {
            items: pagedItems.map((item) =>
                ResourceSpecificationTypeOrmMapper.toModel(item),
            ),
            total,
        };
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async patchById(
        id: string,
        patch: Partial<ResourceSpecificationModel>,
    ): Promise<ResourceSpecificationModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const repository = this.dataSource.getMongoRepository(
            ResourceSpecificationDocument,
        );
        const existing = await repository.findOne({ where: { id } });

        if (!existing) {
            return null;
        }

        const nextModel = {
            ...ResourceSpecificationTypeOrmMapper.toModel(existing),
            ...patch,
            id,
            updatedAt: new Date(),
            createdAt: existing.createdAt,
        };
        const nextDocument = {
            ...existing,
            ...ResourceSpecificationTypeOrmMapper.toDocument(nextModel),
            _id: existing._id,
        };

        const saved = await repository.save(nextDocument);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(saved),
        );
        return ResourceSpecificationTypeOrmMapper.toModel(saved);
    }

    async existsByBusinessKey(
        uniqueKey: string,
        excludeId?: string,
    ): Promise<boolean> {
        this.logger.info(
            this.logMetadata,
            safeStringify({ uniqueKey, excludeId }),
        );
        const repository = this.dataSource.getMongoRepository(
            ResourceSpecificationDocument,
        );

        const found = await repository.findOne({ where: { uniqueKey } });

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify({ found }),
        );

        if (!found) {
            return false;
        }
        if (excludeId && found.id === excludeId) {
            return false;
        }
        return true;
    }
}
