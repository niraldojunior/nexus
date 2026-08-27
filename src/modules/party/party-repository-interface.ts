type Awaitable<T> = T | Promise<T>;

import type { Party, PartyQuery, PartyRelationship, PartyRole, PartyRoleQuery } from './domain.js';

// Party é o diretório de "quem" — inclui os próprios Tenants e registros globais como os
// fabricantes semeados no bootstrap, referenciados via relatedParty por specs/recursos de
// QUALQUER tenant. `listParties`/`listPartyRoles` filtram por tenant (a listagem não vaza a
// carteira de clientes de um tenant para outro); `getParty`/`getPartyRole` por id continuam
// cross-tenant de propósito, para resolver essas referências sem depender de quem pergunta.
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
