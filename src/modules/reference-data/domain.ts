// Domínio Reference Data (Studio → Dados de Referência, issue #196/#191): conjuntos e valores
// reutilizáveis por characteristics de qualquer módulo (Party, Resource, Geo...), tenant-scoped e
// governados via draft/publish do Studio. Não é entidade TMF — é metadado de plataforma, como
// PartyRoleType (ver party-role-type-repository.ts): identidade estável por `key`, nunca DELETE
// físico (C6), UUID v7 via createCanonicalId() (C5).

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

export type CreateReferenceDataSetInput = {
  key: string;
  name: string;
  description?: string | null;
};

export type UpdateReferenceDataSetInput = Partial<CreateReferenceDataSetInput>;

export type CreateReferenceDataValueInput = {
  key: string;
  label: string;
  sortOrder?: number;
};

export type UpdateReferenceDataValueInput = Partial<CreateReferenceDataValueInput> & {
  active?: boolean;
};
