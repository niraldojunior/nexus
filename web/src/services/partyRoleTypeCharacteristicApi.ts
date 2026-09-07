// Catálogo de características por "tipo de party" (Studio -> Partes, issue #220). Não é entidade
// TMF — vive fora de partyApi.ts (que fala com /tmf-api/partyManagement e /partyRoleManagement) e
// não passa pelo fluxo de draft/publish do Studio (/v1/studio/*): o domínio 'parties' só tem o
// adapter no-op, então persiste direto contra /v1/party-role-types/*, como
// geoProjectApi.ts faz com /v1/geo/project-statuses.

import { getJson, postJson, patchJson, deleteJson } from './geoApi';

export type PartyRoleTypeCharacteristicValueType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'list'
  | 'json';

export type PartyRoleTypeCharacteristic = {
  id: string;
  tenantId: string;
  roleName: string;
  name: string;
  group: string | null;
  description: string | null;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string[] | null;
  sortOrder: number;
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
  sortOrder?: number;
};

export type UpdatePartyRoleTypeCharacteristicInput = Partial<
  CreatePartyRoleTypeCharacteristicInput & { active: boolean }
>;

const baseUrl = (roleName: string) =>
  `/v1/party-role-types/${encodeURIComponent(roleName)}/characteristics`;

export const listPartyRoleTypeCharacteristics = (
  roleName: string,
): Promise<PartyRoleTypeCharacteristic[]> => getJson(baseUrl(roleName));

export const createPartyRoleTypeCharacteristic = (
  roleName: string,
  input: CreatePartyRoleTypeCharacteristicInput,
): Promise<PartyRoleTypeCharacteristic> =>
  postJson<PartyRoleTypeCharacteristic>(baseUrl(roleName), input);

export const updatePartyRoleTypeCharacteristic = (
  roleName: string,
  id: string,
  patch: UpdatePartyRoleTypeCharacteristicInput,
): Promise<PartyRoleTypeCharacteristic> =>
  patchJson<PartyRoleTypeCharacteristic>(`${baseUrl(roleName)}/${encodeURIComponent(id)}`, patch);

export const deactivatePartyRoleTypeCharacteristic = (
  roleName: string,
  id: string,
): Promise<PartyRoleTypeCharacteristic> =>
  deleteJson<PartyRoleTypeCharacteristic>(`${baseUrl(roleName)}/${encodeURIComponent(id)}`);
