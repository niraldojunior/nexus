import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsOrder } from 'typeorm';

import {
    ResourceCatalogFindAllParams,
    ResourceCatalogRepository,
} from '@/module/resource-catalog/application/port/resource-catalog.repository';
import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { ResourceCatalogDocument } from '../document/resource-catalog.document';
import { ResourceCatalogTypeOrmMapper } from '../mapper/resource-catalog-typeorm.mapper';

@Injectable()
export class ResourceCatalogTypeOrmRepository implements ResourceCatalogRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };

    constructor(
        private readonly dataSource: DataSource,
        private readonly logger: LoggerService,
    ) {}

    async create(data: ResourceCatalogModel): Promise<ResourceCatalogModel> {
        this.logger.info(this.logMetadata, safeStringify(data));

        const repository = this.dataSource.getMongoRepository(
            ResourceCatalogDocument,
        );

        const document = ResourceCatalogTypeOrmMapper.toDocument({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const created = await repository.save(document);
        return ResourceCatalogTypeOrmMapper.toModel(created);
    }

    async findById(id: string): Promise<ResourceCatalogModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCatalogDocument,
        );
        const found = await repository.findOne({ where: { id } });
        return found ? ResourceCatalogTypeOrmMapper.toModel(found) : null;
    }

    async findAll(
        params?: ResourceCatalogFindAllParams,
    ): Promise<{ items: ResourceCatalogModel[]; total: number }> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCatalogDocument,
        );

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const where: Record<string, unknown> = {
            ...(params?.filters?.id
                ? {
                      id: {
                          $in: Array.isArray(params.filters.id)
                              ? params.filters.id
                              : [params.filters.id],
                      },
                  }
                : {}),
            ...(params?.filters?.name ? { name: params.filters.name } : {}),
            ...(params?.filters?.version
                ? { version: params.filters.version }
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
            const validAt = new Date(params.filters.validAt);
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
            order: params?.sort as FindOptionsOrder<ResourceCatalogDocument>,
        });
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(pagedItems),
        );

        return {
            items: pagedItems.map((item) =>
                ResourceCatalogTypeOrmMapper.toModel(item),
            ),
            total,
        };
    }

    async patchById(
        id: string,
        patch: Partial<ResourceCatalogModel>,
    ): Promise<ResourceCatalogModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCatalogDocument,
        );
        const existing = await repository.findOne({ where: { id } });

        if (!existing) {
            return null;
        }

        const nextModel = {
            ...ResourceCatalogTypeOrmMapper.toModel(existing),
            ...patch,
            id,
            updatedAt: new Date(),
            createdAt: existing.createdAt,
        };
        const nextDocument = {
            ...existing,
            ...ResourceCatalogTypeOrmMapper.toDocument(nextModel),
            _id: existing._id,
        };

        const saved = await repository.save(nextDocument);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(saved),
        );
        return ResourceCatalogTypeOrmMapper.toModel(saved);
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
