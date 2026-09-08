// "Tipos de party" do Studio -> Partes (issue #220). Lista fixa em código, não um catálogo
// governado via Studio draft/publish — o domínio 'parties' só tem o adapter no-op
// (createNoopStudioDomainAdapter), então publish nunca completaria de verdade aqui. Hoje só
// Fornecedores; um novo tipo entra como uma nova entrada neste array (decisão 1 do plano).

export type PartyTypeDef = {
  key: string;
  roleName: string;
  label: string;
  description: string;
};

export const PARTY_TYPES: PartyTypeDef[] = [
  {
    key: 'supplier',
    roleName: 'manufacturer',
    label: 'Fornecedores',
    description: 'Organizações fornecedoras de equipamentos e materiais.',
  },
];
