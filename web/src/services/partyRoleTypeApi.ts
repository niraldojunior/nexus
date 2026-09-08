import { deleteJson, getJson, patchJson, postJson } from './geoApi';

export type PartyRoleType = {
  id: string;
  tenantId: string;
  key: string;
  roleName: string;
  label: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PartyRoleTypeInput = {
  key: string;
  roleName: string;
  label: string;
  description?: string | null;
};

const baseUrl = '/v1/party-role-types';

export const listPartyRoleTypes = (): Promise<PartyRoleType[]> => getJson(baseUrl);
export const createPartyRoleType = (input: PartyRoleTypeInput): Promise<PartyRoleType> =>
  postJson(baseUrl, input);
export const updatePartyRoleType = (id: string, input: PartyRoleTypeInput): Promise<PartyRoleType> =>
  patchJson(`${baseUrl}/${encodeURIComponent(id)}`, input);
export const deactivatePartyRoleType = (id: string): Promise<PartyRoleType> =>
  deleteJson(`${baseUrl}/${encodeURIComponent(id)}`);
