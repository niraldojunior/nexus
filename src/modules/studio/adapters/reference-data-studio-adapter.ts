// Adapter de Governance para o domínio 'reference-data' (Studio → Dados de Referência,
// issue #196/#191). O snapshot cobre conjuntos e valores reutilizáveis por characteristics de
// qualquer módulo (Party, Resource, Geo...) — metadado de plataforma, não entidade TMF. Mesmo
// padrão de PartiesStudioAdapter: casamento ID-first depois chave estável, nunca DELETE físico
// (C6), reativação restabelece a baseline ao republicar.

import { AppError } from '../../../shared/errors/app-error.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import type { IReferenceDataRepository } from '../../reference-data/repository.js';

export type ReferenceDataValueSnapshot = {
  id?: string;
  key: string;
  label: string;
  sortOrder?: number;
  active?: boolean;
};

export type ReferenceDataSetSnapshot = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  active?: boolean;
  values?: ReferenceDataValueSnapshot[];
};

export type ReferenceDataStudioSnapshot = {
  sets: ReferenceDataSetSnapshot[];
};

export class ReferenceDataStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'reference-data';

  constructor(private readonly repository: IReferenceDataRepository) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typed = snapshot as unknown as Partial<ReferenceDataStudioSnapshot>;
    const sets = typed.sets;
    if (!Array.isArray(sets)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'REFERENCE_DATA_SETS_ARRAY_REQUIRED',
            message: 'A lista de conjuntos (sets) é obrigatória.',
            path: 'sets',
          },
        ],
        validatedAt: new Date().toISOString(),
      };
    }

    const setKeys = new Set<string>();
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const set = sets[setIndex];
      const path = `sets[${setIndex}]`;
      const key = set?.key?.trim();
      const name = set?.name?.trim();
      if (!key) {
        issues.push({
          severity: 'error',
          code: 'REFERENCE_DATA_SET_KEY_REQUIRED',
          message: 'A chave do conjunto é obrigatória.',
          path: `${path}.key`,
        });
      } else if (setKeys.has(key.toLowerCase())) {
        issues.push({
          severity: 'error',
          code: 'REFERENCE_DATA_SET_KEY_DUPLICATE',
          message: `Chave de conjunto duplicada: ${key}.`,
          path: `${path}.key`,
        });
      } else setKeys.add(key.toLowerCase());
      if (!name) {
        issues.push({
          severity: 'error',
          code: 'REFERENCE_DATA_SET_NAME_REQUIRED',
          message: 'O nome do conjunto é obrigatório.',
          path: `${path}.name`,
        });
      }

      const valueKeys = new Set<string>();
      for (let valueIndex = 0; valueIndex < (set?.values?.length ?? 0); valueIndex += 1) {
        const value = set!.values![valueIndex];
        const valuePath = `${path}.values[${valueIndex}]`;
        const valueKey = value?.key?.trim();
        const label = value?.label?.trim();
        if (!valueKey) {
          issues.push({
            severity: 'error',
            code: 'REFERENCE_DATA_VALUE_KEY_REQUIRED',
            message: 'A chave do valor é obrigatória.',
            path: `${valuePath}.key`,
          });
        } else if (valueKeys.has(valueKey.toLowerCase())) {
          issues.push({
            severity: 'error',
            code: 'REFERENCE_DATA_VALUE_KEY_DUPLICATE',
            message: `Chave de valor duplicada: ${valueKey}.`,
            path: `${valuePath}.key`,
          });
        } else valueKeys.add(valueKey.toLowerCase());
        if (!label) {
          issues.push({
            severity: 'error',
            code: 'REFERENCE_DATA_VALUE_LABEL_REQUIRED',
            message: 'O rótulo do valor é obrigatório.',
            path: `${valuePath}.label`,
          });
        }
      }
    }
    return { valid: issues.length === 0, issues, validatedAt: new Date().toISOString() };
  }

  public async materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) {
      throw new AppError(validation.issues.map((issue) => issue.message).join('; '), {
        code: 'STUDIO_MATERIALIZE_INVALID',
        statusCode: 422,
      });
    }

    const typed = snapshot as unknown as ReferenceDataStudioSnapshot;
    const tenantId = context.tenantId;
    const existingSets = await this.repository.listSets(tenantId, true);
    const existingSetsById = new Map(existingSets.map((set) => [set.id, set]));
    const existingSetsByKey = new Map(existingSets.map((set) => [set.key, set]));
    const snapshotSetIds = new Set<string>();

    for (const set of typed.sets) {
      const current = set.id ? existingSetsById.get(set.id) : existingSetsByKey.get(set.key.trim());
      if (set.id && !current) {
        throw new AppError(`O conjunto ${set.id} não pertence ao domínio Dados de Referência do Studio.`, {
          code: 'STUDIO_MATERIALIZE_INVALID',
          statusCode: 422,
        });
      }

      let materialized = current
        ? (await this.repository.updateSet(tenantId, current.id, {
            key: set.key.trim(),
            name: set.name.trim(),
            description: set.description ?? null,
          }))!
        : await this.repository.createSet(tenantId, {
            key: set.key.trim(),
            name: set.name.trim(),
            description: set.description ?? null,
          });

      // Republicar um conjunto antes inativado (C6: nada é excluído fisicamente) restabelece
      // a baseline ao estado ativo.
      if (current && !current.active && set.active !== false) {
        materialized = (await this.repository.reactivateSet(tenantId, materialized.id))!;
      }
      snapshotSetIds.add(materialized.id);

      const existingValues = await this.repository.listValues(tenantId, materialized.id, true);
      const valuesByKey = new Map(existingValues.map((value) => [value.key, value]));
      const snapshotValueKeys = new Set<string>();
      for (const value of set.values ?? []) {
        const key = value.key.trim();
        snapshotValueKeys.add(key);
        const currentValue = valuesByKey.get(key);
        if (currentValue) {
          await this.repository.updateValue(tenantId, currentValue.id, {
            key,
            label: value.label.trim(),
            sortOrder: value.sortOrder ?? currentValue.sortOrder,
            active: value.active !== false,
          });
        } else {
          await this.repository.createValue(tenantId, materialized.id, {
            key,
            label: value.label.trim(),
            sortOrder: value.sortOrder ?? 100,
          });
        }
      }
      for (const value of existingValues) {
        if (!snapshotValueKeys.has(value.key) && value.active) {
          await this.repository.deactivateValue(tenantId, value.id);
        }
      }
    }

    for (const set of existingSets) {
      if (!snapshotSetIds.has(set.id) && set.active) {
        await this.repository.deactivateSet(tenantId, set.id);
      }
    }
  }
}
