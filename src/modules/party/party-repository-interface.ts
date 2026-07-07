import type { Party, PartyQuery, PartyRelationship, PartyRole, PartyRoleQuery } from './domain.js';

export interface IPartyRepository {
  transaction<T>(fn: () => T): T;

  upsertParty(party: Party): Party;
  getParty(id: string): Party | undefined;
  listParties(query?: PartyQuery): Party[];

  upsertPartyRole(role: PartyRole): PartyRole;
  getPartyRole(id: string): PartyRole | undefined;
  listPartyRoles(query?: PartyRoleQuery): PartyRole[];

  upsertPartyRelationship(relationship: PartyRelationship): PartyRelationship;
  deletePartyRelationship(partyFromId: string, partyToId: string, relationshipType: string): boolean;
  listPartyRelationships(partyId: string): PartyRelationship[];
}
