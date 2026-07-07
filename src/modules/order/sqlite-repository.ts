import { SqliteDatabase } from '../../shared/persistence/sqlite-database.js';
import type {
  ResourceOrder,
  ResourceOrderQuery,
  ServiceOrder,
  ServiceOrderQuery,
  ServiceQualification,
  ServiceQualificationQuery,
} from './domain.js';
import type { IOrderRepository } from './order-repository-interface.js';

export class SqliteOrderRepository implements IOrderRepository {
  public constructor(private readonly db: SqliteDatabase) {}

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }

  public upsertServiceQualification(qualification: ServiceQualification): ServiceQualification {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_service_qualification
       (id, href, state, place, related_party, service_characteristic, service_qualification_item, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       state = excluded.state,
       place = excluded.place,
       related_party = excluded.related_party,
       service_characteristic = excluded.service_characteristic,
       service_qualification_item = excluded.service_qualification_item,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       updated_at = excluded.updated_at`,
      [
        qualification.id,
        qualification.href,
        qualification.state,
        JSON.stringify(qualification.place),
        JSON.stringify(qualification.relatedParty),
        JSON.stringify(qualification.serviceCharacteristic),
        JSON.stringify(qualification.serviceQualificationItem),
        qualification.validFor?.startDateTime ?? null,
        qualification.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return this.getServiceQualification(qualification.id) ?? qualification;
  }

  public getServiceQualification(id: string): ServiceQualification | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, state, place, related_party, service_characteristic, service_qualification_item, valid_for_start, valid_for_end
       FROM tmf_service_qualification
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapQualification(row) : undefined;
  }

  public listServiceQualifications(query?: ServiceQualificationQuery): ServiceQualification[] {
    const rows = this.db
      .all<any>(
        'SELECT id, href, state, place, related_party, service_characteristic, service_qualification_item, valid_for_start, valid_for_end FROM tmf_service_qualification ORDER BY id',
      )
      .map((row) => this.mapQualification(row))
      .filter((qualification) => filterQualification(qualification, query));

    return paginate(rows, query?.limit, query?.offset);
  }

  public upsertServiceOrder(order: ServiceOrder): ServiceOrder {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_service_order
       (id, href, state, description, related_party, service_order_item, note, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       state = excluded.state,
       description = excluded.description,
       related_party = excluded.related_party,
       service_order_item = excluded.service_order_item,
       note = excluded.note,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       updated_at = excluded.updated_at`,
      [
        order.id,
        order.href,
        order.state,
        order.description ?? null,
        JSON.stringify(order.relatedParty),
        JSON.stringify(order.serviceOrderItem),
        JSON.stringify(order.note),
        order.validFor?.startDateTime ?? null,
        order.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return this.getServiceOrder(order.id) ?? order;
  }

  public getServiceOrder(id: string): ServiceOrder | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, state, description, related_party, service_order_item, note, valid_for_start, valid_for_end
       FROM tmf_service_order
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapOrder(row) : undefined;
  }

  public listServiceOrders(query?: ServiceOrderQuery): ServiceOrder[] {
    const rows = this.db
      .all<any>(
        'SELECT id, href, state, description, related_party, service_order_item, note, valid_for_start, valid_for_end FROM tmf_service_order ORDER BY id',
      )
      .map((row) => this.mapOrder(row))
      .filter((order) => filterOrder(order, query));

    return paginate(rows, query?.limit, query?.offset);
  }

  public upsertResourceOrder(order: ResourceOrder): ResourceOrder {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_resource_order
       (id, href, state, description, related_party, resource_order_item, note, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       state = excluded.state,
       description = excluded.description,
       related_party = excluded.related_party,
       resource_order_item = excluded.resource_order_item,
       note = excluded.note,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       updated_at = excluded.updated_at`,
      [
        order.id,
        order.href,
        order.state,
        order.description ?? null,
        JSON.stringify(order.relatedParty),
        JSON.stringify(order.resourceOrderItem),
        JSON.stringify(order.note),
        order.validFor?.startDateTime ?? null,
        order.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return this.getResourceOrder(order.id) ?? order;
  }

  public getResourceOrder(id: string): ResourceOrder | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, state, description, related_party, resource_order_item, note, valid_for_start, valid_for_end
       FROM tmf_resource_order
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapResourceOrder(row) : undefined;
  }

  public listResourceOrders(query?: ResourceOrderQuery): ResourceOrder[] {
    const rows = this.db
      .all<any>(
        'SELECT id, href, state, description, related_party, resource_order_item, note, valid_for_start, valid_for_end FROM tmf_resource_order ORDER BY id',
      )
      .map((row) => this.mapResourceOrder(row))
      .filter((order) => filterResourceOrder(order, query));

    return paginate(rows, query?.limit, query?.offset);
  }

  private mapQualification(row: any): ServiceQualification {
    return {
      '@type': 'ServiceQualification',
      id: row.id,
      href: row.href,
      state: row.state,
      place: JSON.parse(row.place || '[]'),
      relatedParty: JSON.parse(row.related_party || '[]'),
      serviceCharacteristic: JSON.parse(row.service_characteristic || '[]'),
      serviceQualificationItem: JSON.parse(row.service_qualification_item || '[]'),
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
        : {}),
    };
  }

  private mapOrder(row: any): ServiceOrder {
    return {
      '@type': 'ServiceOrder',
      id: row.id,
      href: row.href,
      state: row.state,
      ...(row.description ? { description: row.description } : {}),
      relatedParty: JSON.parse(row.related_party || '[]'),
      serviceOrderItem: JSON.parse(row.service_order_item || '[]'),
      note: JSON.parse(row.note || '[]'),
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
      : {}),
    };
  }

  private mapResourceOrder(row: any): ResourceOrder {
    return {
      '@type': 'ResourceOrder',
      id: row.id,
      href: row.href,
      state: row.state,
      ...(row.description ? { description: row.description } : {}),
      relatedParty: JSON.parse(row.related_party || '[]'),
      resourceOrderItem: JSON.parse(row.resource_order_item || '[]'),
      note: JSON.parse(row.note || '[]'),
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
        : {}),
    };
  }
}

const filterQualification = (qualification: ServiceQualification, query?: ServiceQualificationQuery): boolean => {
  if (!query) return true;
  if (query.state && qualification.state !== query.state) return false;
  if (query.placeId && !qualification.place.some((item) => item.id === query.placeId)) return false;
  if (query.serviceSpecificationId) {
    const matches = qualification.serviceQualificationItem.some(
      (item) => item.serviceSpecification?.id === query.serviceSpecificationId,
    );
    if (!matches) return false;
  }
  return true;
};

const filterOrder = (order: ServiceOrder, query?: ServiceOrderQuery): boolean => {
  if (!query) return true;
  if (query.state && order.state !== query.state) return false;
  if (query.relatedPartyId && !order.relatedParty.some((item) => item.id === query.relatedPartyId)) return false;
  return true;
};

const filterResourceOrder = (order: ResourceOrder, query?: ResourceOrderQuery): boolean => {
  if (!query) return true;
  if (query.state && order.state !== query.state) return false;
  if (query.relatedPartyId && !order.relatedParty.some((item) => item.id === query.relatedPartyId)) return false;
  if (query.resourceId) {
    const matches = order.resourceOrderItem.some(
      (item) => item.resourceId === query.resourceId || item.resourceResult?.id === query.resourceId,
    );
    if (!matches) return false;
  }
  return true;
};

const paginate = <T>(items: T[], limit?: number, offset?: number): T[] => {
  const start = offset ?? 0;
  const end = limit !== undefined ? start + limit : undefined;
  return items.slice(start, end);
};
