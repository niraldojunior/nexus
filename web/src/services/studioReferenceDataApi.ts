// Conjuntos e valores de Reference Data (Studio -> Dados de Referência, issue #196). Não é
// entidade TMF — vive fora de /tmf-api e fora de /v1/studio/*, como partyRoleTypeApi.ts faz para
// o domínio 'parties'. Mutação direta serve o editor dentro de um draft; a publicação passa pelo
// ReferenceDataStudioAdapter via /v1/studio/reference-data.

import { deleteJson, getJson, patchJson, postJson } from './geoApi';

export type ReferenceDataSet = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceDataSetInput = {
  key: string;
  name: string;
  description?: string | null;
};

export type ReferenceDataValue = {
  id: string;
  tenantId: string;
  setId: string;
  key: string;
  label: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceDataValueInput = {
  key: string;
  label: string;
  sortOrder?: number;
};

const setsUrl = '/v1/reference-data/sets';
const valuesUrl = (setId: string) => `${setsUrl}/${encodeURIComponent(setId)}/values`;

export const listReferenceDataSets = (): Promise<ReferenceDataSet[]> => getJson(setsUrl);
export const createReferenceDataSet = (input: ReferenceDataSetInput): Promise<ReferenceDataSet> =>
  postJson(setsUrl, input);
export const updateReferenceDataSet = (id: string, input: ReferenceDataSetInput): Promise<ReferenceDataSet> =>
  patchJson(`${setsUrl}/${encodeURIComponent(id)}`, input);
export const deactivateReferenceDataSet = (id: string): Promise<ReferenceDataSet> =>
  deleteJson(`${setsUrl}/${encodeURIComponent(id)}`);

export const listReferenceDataValues = (setId: string): Promise<ReferenceDataValue[]> =>
  getJson(valuesUrl(setId));
export const createReferenceDataValue = (
  setId: string,
  input: ReferenceDataValueInput,
): Promise<ReferenceDataValue> => postJson(valuesUrl(setId), input);
export const updateReferenceDataValue = (
  setId: string,
  id: string,
  input: ReferenceDataValueInput,
): Promise<ReferenceDataValue> => patchJson(`${valuesUrl(setId)}/${encodeURIComponent(id)}`, input);
export const deactivateReferenceDataValue = (setId: string, id: string): Promise<ReferenceDataValue> =>
  deleteJson(`${valuesUrl(setId)}/${encodeURIComponent(id)}`);
