/**
 * Definições canônicas de grupos e características de Party (Organizações/Indivíduos, issue #275).
 *
 * Em conformidade com TM Forum TMF632 e C1 (TMF-first), dados cadastrais de perfil, identificações
 * fiscais/legais, contatos e endereços são modelados como `partyCharacteristic` tipadas,
 * sem adicionar campos ad-hoc ou alterar a tabela `tmf_party`.
 */

export const PARTY_CHARACTERISTIC_GROUPS = {
  PROFILE: '_profile',
  IDENTIFICATION: '_identification',
  CONTACT: '_contact',
  ADDRESS: '_address',
  ORIGIN: '_origin',
} as const;

export type PartyIdentificationValue = {
  type: string; // Ex.: 'CNPJ', 'CPF', 'IE', 'IM', 'DUNS', 'Passaporte'
  value: string;
  origin?: string; // Ex.: 'SAP', 'Receita Federal'
  isPrimary?: boolean;
};

export type PartyContactValue = {
  type: string; // Ex.: 'E-mail Comercial', 'Telefone', 'WhatsApp', 'Plantão NOC'
  value: string;
  contactName?: string;
  roleOrDepartment?: string;
  isPrimary?: boolean;
};

export type PartyAddressValue = {
  purpose: string; // Ex.: 'Sede', 'Filial', 'Faturamento', 'Correspondência', 'NOC'
  geographicAddressId?: string; // Referência UUID a GeographicAddress (Módulo 1)
  summary?: string; // Linha formatada de endereço para exibição rápida
  isPrimary?: boolean;
};
