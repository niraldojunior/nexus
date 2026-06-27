import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsOrder } from 'typeorm';

import {
    AuditFindAllParams,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { AuditDocument } from '../document/audit.document';
import { AuditTypeOrmMapper } from '../mapper/audit-typeorm.mapper';

@Injectable()
export class AuditTypeOrmRepository implements AuditRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };

    constructor(
        private readonly dataSource: DataSource,
        private readonly logger: LoggerService,
    ) {}

    async create(data: AuditModel): Promise<AuditModel> {
        this.logger.info(this.logMetadata, safeStringify(data));

        const repository = this.dataSource.getMongoRepository(AuditDocument);

        const document = AuditTypeOrmMapper.toDocument(data);
        const created = await repository.save(document);

        return AuditTypeOrmMapper.toModel(created);
    }

    async findById(id: string): Promise<AuditModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));

        const repository = this.dataSource.getMongoRepository(AuditDocument);
        const found = await repository.findOne({ where: { id } });
        return found ? AuditTypeOrmMapper.toModel(found) : null;
    }

    async findAll(
        params?: AuditFindAllParams,
    ): Promise<PagedResultModel<AuditModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const repository = this.dataSource.getMongoRepository(AuditDocument);
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;

        const where: Record<string, unknown> = {
            ...(params?.filters?.id ? { id: params.filters.id } : {}),
            ...(params?.filters?.userId
                ? {
                      userId: new RegExp(
                          this.escapeRegex(params.filters.userId),
                          'i',
                      ),
                  }
                : {}),
            ...(params?.filters?.entityId
                ? {
                      entityId: new RegExp(
                          this.escapeRegex(params.filters.entityId),
                          'i',
                      ),
                  }
                : {}),
            ...(params?.filters?.entityType
                ? { entityType: params.filters.entityType }
                : {}),
            ...(params?.filters?.action
                ? { action: params.filters.action }
                : {}),
        };

        const timestampFilter: Record<string, Date> = {};
        if (params?.filters?.timestampStart)
            timestampFilter['$gte'] = new Date(params.filters.timestampStart);
        if (params?.filters?.timestampEnd)
            timestampFilter['$lte'] = new Date(params.filters.timestampEnd);
        if (Object.keys(timestampFilter).length)
            where['timestamp'] = timestampFilter;

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
            order: params?.sort as FindOptionsOrder<AuditDocument>,
        });

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(items),
        );

        return {
            total,
            items: items.map((item) => AuditTypeOrmMapper.toModel(item)),
        };
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
