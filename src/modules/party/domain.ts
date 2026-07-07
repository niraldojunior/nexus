import type { Characteristic, EntityRef, TimePeriod } from '../../shared/tmf/index.js';

export type PartyType = 'Organization' | 'Individual';
export type PartyStatus = 'active' | 'inactive' | 'terminated';
export type PartyRoleStatus = 'active' | 'inactive' | 'terminated';

export type PartyQuery = {
  name?: string;
  document?: string;
  partyType?: PartyType;
  status?: PartyStatus;
  limit?: number;
  offset?: number;
};

export type PartyRoleQuery = {
  partyId?: string;
  name?: string;
  status?: PartyRoleStatus;
  limit?: number;
  offset?: number;
};

export type Party = {
  '@type': PartyType;
  id: string;
  href: string;
  name: string;
  status: PartyStatus;
  partyType: PartyType;
  partyCharacteristic: Characteristic[];
  validFor?: TimePeriod;
};

export type PartyRole = {
  '@type': 'PartyRole';
  id: string;
  href: string;
  name: string;
  status: PartyRoleStatus;
  party: EntityRef;
  partyId: string;
  partyRoleCharacteristic: Characteristic[];
  validFor?: TimePeriod;
};

export type PartyRelationship = {
  partyFromId: string;
  partyToId: string;
  relationshipType: string;
  validFor?: TimePeriod;
};

export type CreatePartyInput = {
  name: string;
  partyType?: PartyType;
  status?: PartyStatus;
  partyCharacteristic?: Characteristic[];
  validFor?: TimePeriod;
};

export type UpdatePartyInput = Partial<CreatePartyInput>;

export type CreatePartyRoleInput = {
  partyId: string;
  name: string;
  status?: PartyRoleStatus;
  partyRoleCharacteristic?: Characteristic[];
  validFor?: TimePeriod;
};

export type UpdatePartyRoleInput = Partial<Omit<CreatePartyRoleInput, 'partyId'>>;
