/**
43	 * Definições canônicas de grupos e características de Party (Organizações/Indivíduos, issue #275).
44	 */

export const PARTY_CHARACTERISTIC_GROUPS = {
  PROFILE: '_profile',
  IDENTIFICATION: '_identification',
  CONTACT: '_contact',
  ADDRESS: '_address',
  ORIGIN: '_origin',
} as const;

export type PartyIdentificationValue = {
  type: string;
  value: string;
  origin?: string;
  isPrimary?: boolean;
};

export type PartyContactValue = {
  type: string;
  value: string;
  contactName?: string;
  roleOrDepartment?: string;
  isPrimary?: boolean;
};

export type PartyAddressValue = {
  purpose: string;
  geographicAddressId?: string;
  summary?: string;
  isPrimary?: boolean;
};
