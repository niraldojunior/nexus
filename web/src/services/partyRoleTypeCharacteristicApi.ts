// Catálogo de características por "tipo de party" (Studio -> Partes, issue #220). Não é entidade
// TMF — vive fora de partyApi.ts (que fala com /tmf-api/partyManagement e /partyRoleManagement).
// O CRUD direto (/v1/party-role-types/*) segue existindo para o editor mutar dentro de um draft
// ativo; a publicação/descarte em si passa pelo PartiesStudioAdapter (/v1/studio/*), que diffa este
// catálogo contra o snapshot publicado — ver PartyModelStudio.tsx.

import { getJson, postJson, patchJson, deleteJson } from './geoApi';

export type PartyRoleTypeCharacteristicValueType =
  'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'list' | 'json';

export type PartyRoleTypeCharacteristic = {
  id: string;
  tenantId: string;
  roleName: string;
  roleTypeId?: string | null;
  name: string;
  group: string | null;
  description: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string[] | null;
  /** Chave estável de um conjunto publicado em Studio -> Dados de Referência; alternativa a `allowedValues`. */
  referenceDataSetKey: string | null;
  sortOrder: number;
  mandatory: boolean;
  defaultValue: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyRoleTypeCharacteristicInput = {
  name: string;
  group?: string | null;
  description?: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues?: string[] | null;
  referenceDataSetKey?: string | null;
  sortOrder?: number;
  mandatory?: boolean;
  defaultValue?: string | null;
};

export type UpdatePartyRoleTypeCharacteristicInput = Partial<
  CreatePartyRoleTypeCharacteristicInput & { active: boolean }
>;

const baseUrl = (roleTypeIdOrRoleName: string) =>
  `/v1/party-role-types/${encodeURIComponent(roleTypeIdOrRoleName)}/characteristics`;

export const listPartyRoleTypeCharacteristics = (
  roleTypeIdOrRoleName: string,
): Promise<PartyRoleTypeCharacteristic[]> => getJson(baseUrl(roleTypeIdOrRoleName));

export const createPartyRoleTypeCharacteristic = (
  roleTypeIdOrRoleName: string,
  input: CreatePartyRoleTypeCharacteristicInput,
): Promise<PartyRoleTypeCharacteristic> =>
  postJson<PartyRoleTypeCharacteristic>(baseUrl(roleTypeIdOrRoleName), input);

export const updatePartyRoleTypeCharacteristic = (
  roleTypeIdOrRoleName: string,
  id: string,
  patch: UpdatePartyRoleTypeCharacteristicInput,
): Promise<PartyRoleTypeCharacteristic> =>
  patchJson<PartyRoleTypeCharacteristic>(
    `${baseUrl(roleTypeIdOrRoleName)}/${encodeURIComponent(id)}`,
    patch,
  );

export const deactivatePartyRoleTypeCharacteristic = (
  roleTypeIdOrRoleName: string,
  id: string,
): Promise<PartyRoleTypeCharacteristic> =>
  deleteJson<PartyRoleTypeCharacteristic>(
    `${baseUrl(roleTypeIdOrRoleName)}/${encodeURIComponent(id)}`,
  );
