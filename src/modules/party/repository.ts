import type { Party, PartyQuery, PartyRelationship, PartyRole, PartyRoleQuery } from './domain.js';
import type { IPartyRepository } from './party-repository-interface.js';

export class PartyRepository implements IPartyRepository {
  private readonly parties = new Map<string, Party>();
  private readonly roles = new Map<string, PartyRole>();
  private readonly relationships = new Map<string, PartyRelationship[]>();

  public transaction<T>(fn: () => T): T {
    return fn();
  }

  public upsertParty(party: Party): Party {
    const stored = cloneParty(party);
    this.parties.set(stored.id, stored);
    return cloneParty(stored);
  }

  public getParty(id: string): Party | undefined {
    const party = this.parties.get(id);
    return party ? cloneParty(party) : undefined;
  }

  public listParties(query?: PartyQuery): Party[] {
    return [...this.parties.values()]
      .filter((party) => filterParty(party, query))
      .map(cloneParty);
  }

  public upsertPartyRole(role: PartyRole): PartyRole {
    const stored = clonePartyRole(role);
    this.roles.set(stored.id, stored);
    return clonePartyRole(stored);
  }

  public getPartyRole(id: string): PartyRole | undefined {
    const role = this.roles.get(id);
    return role ? clonePartyRole(role) : undefined;
  }

  public listPartyRoles(query?: PartyRoleQuery): PartyRole[] {
    return [...this.roles.values()]
      .filter((role) => filterRole(role, query))
      .map(clonePartyRole);
  }

  public upsertPartyRelationship(relationship: PartyRelationship): PartyRelationship {
    const current = this.relationships.get(relationship.partyFromId) ?? [];
    const next = [
      ...current.filter(
        (item) =>
          !(item.partyToId === relationship.partyToId && item.relationshipType === relationship.relationshipType),
      ),
      cloneRelationship(relationship),
    ];
    this.relationships.set(relationship.partyFromId, next);
    return cloneRelationship(relationship);
  }

  public deletePartyRelationship(partyFromId: string, partyToId: string, relationshipType: string): boolean {
    const current = this.relationships.get(partyFromId) ?? [];
    const next = current.filter(
      (item) => !(item.partyToId === partyToId && item.relationshipType === relationshipType),
    );
    this.relationships.set(partyFromId, next);
    return next.length !== current.length;
  }

  public listPartyRelationships(partyId: string): PartyRelationship[] {
    return (this.relationships.get(partyId) ?? []).map(cloneRelationship);
  }
}

const cloneParty = (party: Party): Party => ({
  ...party,
  partyCharacteristic: party.partyCharacteristic.map((item) => ({ ...item })),
  ...(party.validFor ? { validFor: { ...party.validFor } } : {}),
});

const clonePartyRole = (role: PartyRole): PartyRole => ({
  ...role,
  party: { ...role.party },
  partyRoleCharacteristic: role.partyRoleCharacteristic.map((item) => ({ ...item })),
  ...(role.validFor ? { validFor: { ...role.validFor } } : {}),
});

const cloneRelationship = (relationship: PartyRelationship): PartyRelationship => ({
  ...relationship,
  ...(relationship.validFor ? { validFor: { ...relationship.validFor } } : {}),
});

const filterParty = (party: Party, query?: PartyQuery): boolean => {
  if (!query) return true;

  if (query.name && !party.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  if (query.partyType && party.partyType !== query.partyType) return false;
  if (query.status && party.status !== query.status) return false;
  if (query.document && !hasDocument(party, query.document)) return false;

  return true;
};

const filterRole = (role: PartyRole, query?: PartyRoleQuery): boolean => {
  if (!query) return true;
  if (query.partyId && role.partyId !== query.partyId) return false;
  if (query.name && !role.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  if (query.status && role.status !== query.status) return false;
  return true;
};

const hasDocument = (party: Party, needle: string): boolean =>
  party.partyCharacteristic.some((item) => {
    const name = item.name.toLowerCase();
    if (!['document', 'documentnumber', 'cpf', 'cnpj', 'taxid', 'taxidentifier'].includes(name)) {
      return false;
    }
    return String(item.value).toLowerCase().includes(needle.toLowerCase());
  });
