import type { Party, PartyRole, Characteristic } from '../../../services/partyApi';
import type {
  PartyIdentificationValue,
  PartyContactValue,
  PartyAddressValue,
} from '../../../types/partyCharacteristics';

export type OrganizationDraftItem = {
  localId: string;
  persistedId?: string;
  name: string;
  tradingName?: string;
  legalName?: string;
  description?: string;
  logoUrl?: string;
  status: 'active' | 'inactive' | 'terminated';
  partyType: 'Organization';
  identifications: PartyIdentificationValue[];
  contacts: PartyContactValue[];
  addresses: PartyAddressValue[];
  roles: PartyRole[];
  origin?: {
    system?: string;
    id?: string;
    entity?: string;
    migratedAt?: string;
    migratedBy?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type OrganizationsSnapshot = {
  organizations: Array<{
    id?: string;
    name: string;
    partyType: 'Organization';
    status: 'active' | 'inactive' | 'terminated';
    partyCharacteristic?: Characteristic[];
  }>;
};

export function extractCharacteristics(party: Party) {
  const chars = party.partyCharacteristic ?? [];
  let tradingName: string | undefined;
  let legalName: string | undefined;
  let description: string | undefined;
  let logoUrl: string | undefined;
  const identifications: PartyIdentificationValue[] = [];
  const contacts: PartyContactValue[] = [];
  const addresses: PartyAddressValue[] = [];
  let origin: OrganizationDraftItem['origin'] = undefined;

  for (const c of chars) {
    if (c.name === '_profile.tradingName' && typeof c.value === 'string') {
      tradingName = c.value;
    } else if (c.name === '_profile.legalName' && typeof c.value === 'string') {
      legalName = c.value;
    } else if (c.name === '_profile.description' && typeof c.value === 'string') {
      description = c.value;
    } else if (c.name === '_profile.logo' && typeof c.value === 'string') {
      logoUrl = c.value;
    } else if (c.name.startsWith('_identification.') && typeof c.value === 'object' && c.value) {
      identifications.push(c.value as PartyIdentificationValue);
    } else if (c.name.startsWith('_contact.') && typeof c.value === 'object' && c.value) {
      contacts.push(c.value as PartyContactValue);
    } else if (c.name.startsWith('_address.') && typeof c.value === 'object' && c.value) {
      addresses.push(c.value as PartyAddressValue);
    } else if (c.name === '_origin.system' && typeof c.value === 'string') {
      origin = { ...(origin ?? {}), system: c.value };
    } else if (c.name === '_origin.id' && typeof c.value === 'string') {
      origin = { ...(origin ?? {}), id: c.value };
    }
  }

  return {
    tradingName,
    legalName,
    description,
    logoUrl,
    identifications,
    contacts,
    addresses,
    origin,
  };
}

export function draftFromParty(party: Party, roles: PartyRole[] = []): OrganizationDraftItem {
  const extracted = extractCharacteristics(party);
  return {
    localId: party.id,
    persistedId: party.id,
    name: party.name,
    tradingName: extracted.tradingName,
    legalName: extracted.legalName,
    description: extracted.description,
    logoUrl: extracted.logoUrl,
    status: party.status,
    partyType: 'Organization',
    identifications: extracted.identifications,
    contacts: extracted.contacts,
    addresses: extracted.addresses,
    roles,
    origin: extracted.origin,
  };
}

export function buildPartyCharacteristicsPayload(draft: OrganizationDraftItem): Characteristic[] {
  const list: Characteristic[] = [];

  if (draft.tradingName?.trim()) {
    list.push({
      name: '_profile.tradingName',
      value: draft.tradingName.trim(),
      valueType: 'string',
    });
  }
  if (draft.legalName?.trim()) {
    list.push({ name: '_profile.legalName', value: draft.legalName.trim(), valueType: 'string' });
  }
  if (draft.description?.trim()) {
    list.push({
      name: '_profile.description',
      value: draft.description.trim(),
      valueType: 'string',
    });
  }
  if (draft.logoUrl?.trim()) {
    list.push({ name: '_profile.logo', value: draft.logoUrl.trim(), valueType: 'image' });
  }

  draft.identifications.forEach((ident, idx) => {
    list.push({
      name: `_identification.${idx}_${ident.type.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      value: ident,
      valueType: 'json',
    });
  });

  draft.contacts.forEach((contact, idx) => {
    list.push({
      name: `_contact.${idx}_${contact.type.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      value: contact,
      valueType: 'json',
    });
  });

  draft.addresses.forEach((addr, idx) => {
    list.push({
      name: `_address.${idx}_${addr.purpose.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      value: addr,
      valueType: 'json',
    });
  });

  if (draft.origin?.system) {
    list.push({ name: '_origin.system', value: draft.origin.system, valueType: 'string' });
  }
  if (draft.origin?.id) {
    list.push({ name: '_origin.id', value: draft.origin.id, valueType: 'string' });
  }

  return list;
}

export function buildOrganizationsSnapshot(drafts: OrganizationDraftItem[]): OrganizationsSnapshot {
  return {
    organizations: drafts.map((draft) => ({
      id: draft.persistedId,
      name: draft.name.trim(),
      partyType: 'Organization',
      status: draft.status,
      partyCharacteristic: buildPartyCharacteristicsPayload(draft),
    })),
  };
}

export function createOrganizationDraftItem(): OrganizationDraftItem {
  const tempId = `temp-org-${Date.now()}`;
  return {
    localId: tempId,
    name: '',
    status: 'active',
    partyType: 'Organization',
    identifications: [],
    contacts: [],
    addresses: [],
    roles: [],
  };
}
