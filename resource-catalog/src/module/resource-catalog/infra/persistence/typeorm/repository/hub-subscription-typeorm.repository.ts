import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsOrder } from 'typeorm';

import {
    HubSubscriptionFindAllParams,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';
import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { HubSubscriptionModel } from '@/module/resource-catalog/domain/model/hub-subscription.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

import { HubSubscriptionDocument } from '../document/hub-subscription.document';
import { HubSubscriptionTypeOrmMapper } from '../mapper/hub-subscription-typeorm.mapper';

@Injectable()
export class HubSubscriptionTypeOrmRepository implements HubSubscriptionRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };

    constructor(
        private readonly dataSource: DataSource,
        private readonly logger: LoggerService,
    ) {}

    async create(data: HubSubscriptionModel): Promise<HubSubscriptionModel> {
        this.logger.info(this.logMetadata, safeStringify(data));

        const repository = this.dataSource.getMongoRepository(
            HubSubscriptionDocument,
        );

        const document = HubSubscriptionTypeOrmMapper.toDocument({
            ...data,
            active: data.active ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const created = await repository.save(document);
        return HubSubscriptionTypeOrmMapper.toModel(created);
    }

    async findById(id: string): Promise<HubSubscriptionModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));

        const repository = this.dataSource.getMongoRepository(
            HubSubscriptionDocument,
        );
        const found = await repository.findOne({ where: { id } });
        return found ? HubSubscriptionTypeOrmMapper.toModel(found) : null;
    }

    async findAllActiveByEvent(
        event: NotificationEvent,
    ): Promise<HubSubscriptionModel[]> {
        this.logger.info(this.logMetadata, safeStringify({ event }));

        const repository = this.dataSource.getMongoRepository(
            HubSubscriptionDocument,
        );
        const items = await repository.find({ where: { event, active: true } });

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(items),
        );

        return items.map((item) => HubSubscriptionTypeOrmMapper.toModel(item));
    }

    async findAll(
        params?: HubSubscriptionFindAllParams,
    ): Promise<PagedResultModel<HubSubscriptionModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const repository = this.dataSource.getMongoRepository(
            HubSubscriptionDocument,
        );
        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;
        const where: Record<string, unknown> = {
            ...(params?.filters?.id ? { id: params.filters.id } : {}),
            ...(params?.filters?.callback
                ? {
                      callback: new RegExp(
                          this.escapeRegex(params.filters.callback),
                          'i',
                      ),
                  }
                : {}),
            ...(params?.filters?.event
                ? {
                      event: new RegExp(
                          this.escapeRegex(params.filters.event),
                          'i',
                      ),
                  }
                : {}),
            ...(params?.filters?.credentials
                ? {
                      credentials: new RegExp(
                          this.escapeRegex(params.filters.credentials),
                          'i',
                      ),
                  }
                : {}),
            ...(params?.filters?.active !== undefined
                ? { active: params.filters.active }
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
            order: params?.sort as FindOptionsOrder<HubSubscriptionDocument>,
        });

        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(items),
        );

        return {
            total,
            items: items.map((item) =>
                HubSubscriptionTypeOrmMapper.toModel(item),
            ),
        };
    }

    async patchById(
        id: string,
        patch: Partial<HubSubscriptionModel>,
    ): Promise<HubSubscriptionModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id, patch }));

        const repository = this.dataSource.getMongoRepository(
            HubSubscriptionDocument,
        );
        const existing = await repository.findOne({ where: { id } });

        if (!existing) {
            return null;
        }

        const nextModel = {
            ...HubSubscriptionTypeOrmMapper.toModel(existing),
            ...patch,
            id,
            updatedAt: new Date(),
            createdAt: existing.createdAt,
        };
        const nextDocument = {
            ...existing,
            ...HubSubscriptionTypeOrmMapper.toDocument(nextModel),
            _id: existing._id,
        };

        const saved = await repository.save(nextDocument);
        this.logger.info(
            { ...this.logMetadata, description: 'RESPONSE - RECEBIDO DO BD' },
            safeStringify(saved),
        );
        return HubSubscriptionTypeOrmMapper.toModel(saved);
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
