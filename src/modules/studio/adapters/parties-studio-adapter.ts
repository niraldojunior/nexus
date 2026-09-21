// Adapter de Governance para o domínio 'parties' (Studio → Papéis, issue #220/#191/#275). O snapshot
// cobre o catálogo de PartyRoleType (ex.: "Fornecedores"/manufacturer) e suas characteristics
// declaradas — as instâncias de organizações agora são governadas pelo adapter 'organizations'
// (issue #275). As instâncias operacionais de PartyRole seguem fora do fluxo de catálogo.
//
// Como o editor é snapshot-local (em memória), `restoreBaselineOnDiscard = false` evita reverter
// estado canônico no descarte de rascunho.

import { AppError } from '../../../shared/errors/app-error.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import type {
  PartyRoleTypeCharacteristicRepository,
  PartyRoleTypeCharacteristicValueType,
} from '../../party/party-role-type-characteristic-repository.js';
import type { PartyRoleTypeRepository } from '../../party/party-role-type-repository.js';

export type PartyRoleTypeCharacteristicSnapshot = {
  id?: string;
  name: string;
  group?: string | null;
  description?: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues?: string[] | null;
  /** Chave estável de um conjunto publicado em Studio -> Dados de Referência; alternativa a `allowedValues`. */
  referenceDataSetKey?: string | null;
  sortOrder?: number;
  mandatory?: boolean;
  defaultValue?: string | null;
};

export type PartyRoleTypeSnapshot = {
  id?: string;
  key: string;
  roleName: string;
  label: string;
  description?: string | null;
  active?: boolean;
  characteristics?: PartyRoleTypeCharacteristicSnapshot[];
};

export type PartiesStudioSnapshot = {
  partyRoleTypes: PartyRoleTypeSnapshot[];
};

const VALUE_TYPES: PartyRoleTypeCharacteristicValueType[] = [
  'string', 'integer', 'decimal', 'boolean', 'date', 'list', 'json',
];

export class PartiesStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'parties';
  public readonly restoreBaselineOnDiscard = false;

  constructor(
    private readonly partyRoleTypeRepository: PartyRoleTypeRepository,
    private readonly characteristicRepository: PartyRoleTypeCharacteristicRepository,
  ) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typed = snapshot as unknown as Partial<PartiesStudioSnapshot>;
    const types = typed.partyRoleTypes;
    if (!Array.isArray(types)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'PARTIES_TYPES_ARRAY_REQUIRED',
            message: 'A lista de tipos de parte (partyRoleTypes) é obrigatória.',
            path: 'partyRoleTypes',
          },
        ],
        validatedAt: new Date().toISOString(),
      };
    }

    const keys = new Set<string>();
    for (let index = 0; index < types.length; index += 1) {
      const type = types[index];
      const path = `partyRoleTypes[${index}]`;
      const key = type?.key?.trim();
      const roleName = type?.roleName?.trim();
      const label = type?.label?.trim();
      if (!key) {
        issues.push({ severity: 'error', code: 'PARTIES_KEY_REQUIRED', message: 'A chave do tipo de parte é obrigatória.', path: `${path}.key` });
      } else if (keys.has(key.toLowerCase())) {
        issues.push({ severity: 'error', code: 'PARTIES_KEY_DUPLICATE', message: `Chave de tipo de parte duplicada: ${key}.`, path: `${path}.key` });
      } else keys.add(key.toLowerCase());
      if (!roleName) {
        issues.push({ severity: 'error', code: 'PARTIES_ROLE_NAME_REQUIRED', message: 'O papel (roleName) do tipo de parte é obrigatório.', path: `${path}.roleName` });
      }
      if (!label) {
        issues.push({ severity: 'error', code: 'PARTIES_LABEL_REQUIRED', message: 'O título do tipo de parte é obrigatório.', path: `${path}.label` });
      }

      const characteristicNames = new Set<string>();
      for (let characteristicIndex = 0; characteristicIndex < (type?.characteristics?.length ?? 0); characteristicIndex += 1) {
        const characteristic = type!.characteristics![characteristicIndex];
        const characteristicPath = `${path}.characteristics[${characteristicIndex}]`;
        const name = characteristic?.name?.trim();
        if (!name) {
          issues.push({ severity: 'error', code: 'PARTIES_CHARACTERISTIC_NAME_REQUIRED', message: 'O nome da characteristic é obrigatório.', path: `${characteristicPath}.name` });
        } else if (characteristicNames.has(name.toLowerCase())) {
          issues.push({ severity: 'error', code: 'PARTIES_CHARACTERISTIC_NAME_DUPLICATE', message: `Characteristic duplicada: ${name}.`, path: `${characteristicPath}.name` });
        } else characteristicNames.add(name.toLowerCase());
        if (!characteristic?.valueType || !VALUE_TYPES.includes(characteristic.valueType)) {
          issues.push({ severity: 'error', code: 'PARTIES_CHARACTERISTIC_TYPE_INVALID', message: 'O tipo de valor da characteristic é inválido.', path: `${characteristicPath}.valueType` });
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

    const typed = snapshot as unknown as PartiesStudioSnapshot;
    const tenantId = context.tenantId;
    const existing = await this.partyRoleTypeRepository.list(tenantId, true);
    const existingById = new Map(existing.map((type) => [type.id, type]));
    const existingByKey = new Map(existing.map((type) => [type.key, type]));
    const snapshotIds = new Set<string>();

    for (const type of typed.partyRoleTypes) {
      const current = type.id ? existingById.get(type.id) : existingByKey.get(type.key.trim());
      if (type.id && !current) {
        throw new AppError(`O tipo de parte ${type.id} não pertence ao domínio Partes do Studio.`, {
          code: 'STUDIO_MATERIALIZE_INVALID',
          statusCode: 422,
        });
      }

      let materialized = current
        ? (await this.partyRoleTypeRepository.update(tenantId, current.id, {
            key: type.key.trim(),
            roleName: type.roleName.trim(),
            label: type.label.trim(),
            description: type.description ?? null,
          }))!
        : await this.partyRoleTypeRepository.create(tenantId, {
            key: type.key.trim(),
            roleName: type.roleName.trim(),
            label: type.label.trim(),
            description: type.description ?? null,
          });

      // Republicar um tipo antes inativado (fluxo C6: nada é excluído fisicamente) restabelece
      // a baseline ao estado ativo.
      if (current && !current.active && type.active !== false) {
        materialized = (await this.partyRoleTypeRepository.reactivate(tenantId, materialized.id))!;
      }
      // Inativação explícita: o item permanece presente no snapshot (active: false) em vez de ser
      // removido do array — diferente do loop de "desativar por ausência" abaixo, que só cobre o
      // caso de um tipo ter sumido do snapshot inteiro. Sem este bloco, clicar em "Inativar" na UI
      // não tinha nenhum efeito no publish.
      if (current && current.active && type.active === false) {
        materialized = (await this.partyRoleTypeRepository.deactivate(tenantId, materialized.id))!;
      }
      snapshotIds.add(materialized.id);

      const existingCharacteristics = await this.characteristicRepository.list(tenantId, materialized.id);
      const characteristicsByName = new Map(existingCharacteristics.map((c) => [c.name, c]));
      const snapshotCharacteristicNames = new Set<string>();
      for (const characteristic of type.characteristics ?? []) {
        const name = characteristic.name.trim();
        snapshotCharacteristicNames.add(name);
        const currentCharacteristic = characteristicsByName.get(name);
        if (currentCharacteristic) {
          await this.characteristicRepository.update(tenantId, currentCharacteristic.id, {
            name,
            group: characteristic.group ?? null,
            description: characteristic.description ?? null,
            valueType: characteristic.valueType,
            allowedValues: characteristic.allowedValues ?? null,
            referenceDataSetKey: characteristic.referenceDataSetKey ?? null,
            sortOrder: characteristic.sortOrder ?? currentCharacteristic.sortOrder,
            mandatory: characteristic.mandatory ?? currentCharacteristic.mandatory,
            defaultValue: characteristic.defaultValue !== undefined ? characteristic.defaultValue : currentCharacteristic.defaultValue,
            active: true,
          });
        } else {
          await this.characteristicRepository.create(
            tenantId,
            materialized.id,
            {
              name,
              group: characteristic.group ?? null,
              description: characteristic.description ?? null,
              valueType: characteristic.valueType,
              allowedValues: characteristic.allowedValues ?? null,
              referenceDataSetKey: characteristic.referenceDataSetKey ?? null,
              sortOrder: characteristic.sortOrder ?? 100,
              mandatory: characteristic.mandatory ?? false,
              defaultValue: characteristic.defaultValue ?? null,
            },
            materialized.roleName,
          );
        }
      }
      for (const characteristic of existingCharacteristics) {
        if (!snapshotCharacteristicNames.has(characteristic.name) && characteristic.active) {
          await this.characteristicRepository.deactivate(tenantId, characteristic.id);
        }
      }
    }

    for (const type of existing) {
      if (!snapshotIds.has(type.id) && type.active) {
        await this.partyRoleTypeRepository.deactivate(tenantId, type.id);
      }
    }
  }
}
