import { randomUUID } from 'node:crypto';
import type { EntityRecord } from './entity.js';
import type { EntityRepository, NewEntityInput } from './entity-repository.js';

export class InMemoryEntityRepository implements EntityRepository {
  private readonly items: EntityRecord[] = [];

  public count(): number {
    return this.items.length;
  }

  public create(input: NewEntityInput): EntityRecord {
    const now = new Date().toISOString();
    const entity: EntityRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      label: input.label,
    };
    this.items.push(entity);
    return entity;
  }

  public list(): EntityRecord[] {
    return [...this.items];
  }
}
