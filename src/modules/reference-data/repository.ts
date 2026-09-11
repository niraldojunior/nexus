import type {
  CreateReferenceDataSetInput,
  CreateReferenceDataValueInput,
  ReferenceDataSet,
  ReferenceDataValue,
  UpdateReferenceDataSetInput,
  UpdateReferenceDataValueInput,
} from './domain.js';

/** Persistência de conjuntos e valores de Reference Data — implementação real em oracle-repository.ts. */
export interface IReferenceDataRepository {
  listSets(tenantId: string, includeInactive?: boolean): Promise<ReferenceDataSet[]>;
  getSet(tenantId: string, id: string): Promise<ReferenceDataSet | null>;
  getSetByKey(tenantId: string, key: string): Promise<ReferenceDataSet | null>;
  createSet(tenantId: string, input: CreateReferenceDataSetInput): Promise<ReferenceDataSet>;
  updateSet(tenantId: string, id: string, patch: UpdateReferenceDataSetInput): Promise<ReferenceDataSet | null>;
  deactivateSet(tenantId: string, id: string): Promise<ReferenceDataSet | null>;
  reactivateSet(tenantId: string, id: string): Promise<ReferenceDataSet | null>;

  listValues(tenantId: string, setId: string, includeInactive?: boolean): Promise<ReferenceDataValue[]>;
  getValue(tenantId: string, id: string): Promise<ReferenceDataValue | null>;
  createValue(tenantId: string, setId: string, input: CreateReferenceDataValueInput): Promise<ReferenceDataValue>;
  updateValue(tenantId: string, id: string, patch: UpdateReferenceDataValueInput): Promise<ReferenceDataValue | null>;
  deactivateValue(tenantId: string, id: string): Promise<ReferenceDataValue | null>;
  reactivateValue(tenantId: string, id: string): Promise<ReferenceDataValue | null>;
}
