type Awaitable<T> = T | Promise<T>;

import type { Party, PartyQuery, PartyRelationship, PartyRole, PartyRoleQuery } from './domain.js';

export interface IPartyRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  upsertParty(party: Party): Awaitable<Party>;
  getParty(id: string): Awaitable<Party | undefined>;
  listParties(query?: PartyQuery): Awaitable<Party[]>;

  upsertPartyRole(role: PartyRole): Awaitable<PartyRole>;
  getPartyRole(id: string): Awaitable<PartyRole | undefined>;
  listPartyRoles(query?: PartyRoleQuery): Awaitable<PartyRole[]>;

  upsertPartyRelationship(relationship: PartyRelationship): Awaitable<PartyRelationship>;
  deletePartyRelationship(
    partyFromId: string,
    partyToId: string,
    relationshipType: string,
  ): Awaitable<boolean>;
  listPartyRelationships(partyId: string): Awaitable<PartyRelationship[]>;
}
