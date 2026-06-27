import {
    AuditFindAllParams,
    AuditRepository,
} from '@/module/resource-catalog/application/port/audit.repository';
import { AuditModel } from '@/module/resource-catalog/domain/model/audit.model';
import { PagedResultModel } from '@/module/resource-catalog/domain/model/common.model';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

export class AuditInMemoryRepository implements AuditRepository {
    private readonly logMetadata = {
        description: 'INVOKE - REQUEST ENVIADO AO BD',
        context: this.constructor.name,
        integration: true,
    };
    private readonly items = new Map<string, AuditModel>();

    constructor(private readonly logger: LoggerService) {}

    async create(data: AuditModel): Promise<AuditModel> {
        this.logger.info(this.logMetadata, safeStringify(data));
        this.items.set(data.id, data);
        return await Promise.resolve(data);
    }

    async findById(id: string): Promise<AuditModel | null> {
        this.logger.info(this.logMetadata, safeStringify({ id }));
        return await Promise.resolve(this.items.get(id) ?? null);
    }

    async findAll(
        params?: AuditFindAllParams,
    ): Promise<PagedResultModel<AuditModel>> {
        this.logger.info(this.logMetadata, safeStringify({ params }));

        const offset = params?.offset ?? 0;
        const limit = params?.limit ?? 20;

        let all = Array.from(this.items.values()).filter((i) => !i['@type']);

        if (params?.filters?.id) {
            all = all.filter((i) =>
                i.id.includes(params.filters?.id as string),
            );
        }
        if (params?.filters?.userId) {
            const f = params.filters.userId.toLowerCase();
            all = all.filter((i) => i.userId.toLowerCase().includes(f));
        }
        if (params?.filters?.entityId) {
            const f = params.filters.entityId.toLowerCase();
            all = all.filter((i) => i.entityId.toLowerCase().includes(f));
        }
        if (params?.filters?.entityType) {
            all = all.filter(
                (i) => i.entityType === params.filters?.entityType,
            );
        }
        if (params?.filters?.action) {
            all = all.filter((i) => i.action === params.filters?.action);
        }
        if (params?.filters?.timestampStart) {
            const start = new Date(params.filters.timestampStart);
            all = all.filter((i) => i.timestamp >= start);
        }
        if (params?.filters?.timestampEnd) {
            const end = new Date(params.filters.timestampEnd);
            all = all.filter((i) => i.timestamp <= end);
        }

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
