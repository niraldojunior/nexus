import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsOrder } from 'typeorm';

import {
    ResourceCandidateFindAllParams,
    ResourceCandidateRepository,
} from '@/module/resource-catalog/application/port/resource-candidate.repository';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { ResourceCandidateDocument } from '../document/resource-candidate.document';
import { ResourceCandidateTypeOrmMapper } from '../mapper/resource-candidate-typeorm.mapper';

@Injectable()
export class ResourceCandidateTypeOrmRepository implements ResourceCandidateRepository {
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
        data: ResourceCandidateModel,
    ): Promise<ResourceCandidateModel> {
        this.logger.info(this.logMetadata, safeStringify(data));

        const repository = this.dataSource.getMongoRepository(
            ResourceCandidateDocument,
        );
        const document = ResourceCandidateTypeOrmMapper.toDocument({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const created = await repository.save(document);
        return ResourceCandidateTypeOrmMapper.toModel(created);
    }

    async findById(id: string): Promise<ResourceCandidateModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCandidateDocument,
        );
        const found = await repository.findOne({ where: { id } });
        return found ? ResourceCandidateTypeOrmMapper.toModel(found) : null;
    }

    async findAll(
        params?: ResourceCandidateFindAllParams,
    ): Promise<PagedResultModel<ResourceCandidateModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCandidateDocument,
        );
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;

        const where: Record<string, unknown> = {
            ...(params?.filters?.name ? { name: params.filters.name } : {}),
            ...(params?.filters?.version
                ? { version: params.filters.version }
                : {}),
            ...(params?.filters?.lifecycleStatus
                ? { lifecycleStatus: params.filters.lifecycleStatus }
                : {}),
            ...(params?.filters?.resourceSpecificationId
                ? {
                      resourceSpecificationId:
                          params.filters.resourceSpecificationId,
                  }
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
            where['catalog.id'] = params.filters.resourceCatalogId;
        }
        if (params?.filters?.resourceCategoryId) {
            where['category.id'] = params.filters.resourceCategoryId;
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

        this.logger.info(
            { ...this.logMetadata, description: 'FILTROS APLICADOS' },
            safeStringify({
                where,
                skip: offset,
                take: limit,
                order: params?.sort,
            }),
        );

        const [items, total] = await repository.findAndCount({
            where,
            skip: offset,
            take: limit,
            order: params?.sort as FindOptionsOrder<ResourceCandidateDocument>,
        });

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(items),
        );

        return {
            total,
            items: items.map((doc) =>
                ResourceCandidateTypeOrmMapper.toModel(doc),
            ),
        };
    }

    async patchById(
        id: string,
        patch: Partial<ResourceCandidateModel>,
    ): Promise<ResourceCandidateModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCandidateDocument,
        );
        const existing = await repository.findOne({ where: { id } });

        if (!existing) {
            return null;
        }

        const nextModel: ResourceCandidateModel = {
            ...ResourceCandidateTypeOrmMapper.toModel(existing),
            ...patch,
            id,
            updatedAt: new Date(),
            createdAt: existing.createdAt,
        };

        const nextDocument = {
            ...existing,
            ...ResourceCandidateTypeOrmMapper.toDocument(nextModel),
            _id: existing._id,
        };

        const saved = await repository.save(nextDocument);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(saved),
        );
        return ResourceCandidateTypeOrmMapper.toModel(saved);
    }

    async findBySpecificationId(
        specificationId: string,
    ): Promise<ResourceCandidateModel[]> {
        this.logger.info(this.logMetadata, safeStringify({ specificationId }));

        const repository = this.dataSource.getMongoRepository(
            ResourceCandidateDocument,
        );
        const found = await repository.find({
            where: { resourceSpecificationId: specificationId },
        });
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(found),
        );
        return found.map((doc) => ResourceCandidateTypeOrmMapper.toModel(doc));
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
