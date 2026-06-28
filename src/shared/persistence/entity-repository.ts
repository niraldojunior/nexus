import type { EntityRecord } from './entity.js';

export type NewEntityInput = {
  label: string;
};

export interface EntityRepository {
  count(): number;
  create(input: NewEntityInput): EntityRecord;
  list(): EntityRecord[];
}
