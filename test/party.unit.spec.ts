import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { PartyRepository } from '../src/modules/party/repository.js';
import { PartyService } from '../src/modules/party/service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('PartyRepository clones stored entities and filters by canonical queries', () => {
  const repository = new PartyRepository();

  const party = repository.upsertParty({
    '@type': 'Organization',
    id: 'party-1',
    href: '/party/party-1',
    name: 'ISP Alfa',
    status: 'active',
    partyType: 'Organization',
    partyCharacteristic: [{ name: 'documentNumber', value: '12.345.678/0001-90', valueType: 'string' }],
  });
  const role = repository.upsertPartyRole({
    '@type': 'PartyRole',
    id: 'role-1',
    href: '/party-role/role-1',
    name: 'subscriber',
    status: 'active',
    partyId: party.id,
    party: { id: party.id, '@referredType': 'Organization', href: party.href, name: party.name },
    partyRoleCharacteristic: [{ name: 'roleCode', value: 'sub', valueType: 'string' }],
  });

  party.name = 'mutated';
  role.name = 'mutated';

  assert.equal(repository.getParty('party-1')?.name, 'ISP Alfa');
  assert.equal(repository.getPartyRole('role-1')?.name, 'subscriber');
  assert.equal(repository.listParties({ name: 'isp', document: '12.345.678/0001-90' }).length, 1);
  assert.equal(repository.listParties({ partyType: 'Organization', status: 'active' }).length, 1);
  assert.equal(repository.listPartyRoles({ partyId: 'party-1', name: 'sub' }).length, 1);
  assert.equal(repository.listPartyRoles({ status: 'active' }).length, 1);

  const relationship = repository.upsertPartyRelationship({
    partyFromId: 'party-1',
    partyToId: 'party-2',
    relationshipType: 'subsidiary',
    validFor: { startDateTime: '2026-07-07T10:00:00.000Z' },
  });

  assert.equal(repository.listPartyRelationships('party-1').length, 1);
  assert.equal(relationship.relationshipType, 'subsidiary');
  assert.equal(repository.deletePartyRelationship('party-1', 'party-2', 'subsidiary'), true);
  assert.equal(repository.deletePartyRelationship('party-1', 'party-2', 'subsidiary'), false);
});

test('PartyService creates, updates and terminates parties and roles', () => {
  const repository = new PartyRepository();
  const eventService = { appendEvent: vi.fn(() => undefined) };
  const service = new PartyService(repository, eventService as never);

  assert.throws(() => service.createParty({ name: '   ' }), /name is required/);

  const createdParty = service.createParty({
    name: ' ISP Alfa ',
    partyType: 'Organization',
    status: 'active',
    partyCharacteristic: [{ name: 'documentNumber', value: '12.345.678/0001-90', valueType: 'string' }],
    validFor: { startDateTime: '2026-07-07T10:00:00.000Z' },
  });
  assert.equal(createdParty.name, 'ISP Alfa');
  assert.equal(createdParty.partyType, 'Organization');
  assert.equal(createdParty.validFor?.startDateTime, '2026-07-07T10:00:00.000Z');
  assert.equal((eventService.appendEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.eventType, 'PartyCreateEvent');

  const updatedParty = service.updateParty(createdParty.id, {
    name: ' ISP Beta ',
    partyCharacteristic: [{ name: 'documentNumber', value: '98.765.432/0001-11', valueType: 'string' }],
  });
  assert.equal(updatedParty.name, 'ISP Beta');
  assert.equal((eventService.appendEvent as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.eventType, 'PartyAttributeValueChangeEvent');

  const terminatedParty = service.deleteParty(createdParty.id);
  assert.equal(terminatedParty.status, 'terminated');
  assert.equal(terminatedParty.validFor?.startDateTime, '2026-07-07T10:00:00.000Z');
  assert.ok(terminatedParty.validFor?.endDateTime);

  assert.throws(() => service.updateParty('missing', { name: 'x' }), /party not found/);

  const role = service.createPartyRole({
    partyId: createdParty.id,
    name: ' subscriber ',
    partyRoleCharacteristic: [{ name: 'level', value: 'gold', valueType: 'string' }],
  });
  assert.equal(role.name, 'subscriber');
  assert.equal(role.party.id, createdParty.id);
  assert.equal((eventService.appendEvent as ReturnType<typeof vi.fn>).mock.calls[3]?.[0]?.eventType, 'PartyRoleCreateEvent');

  assert.throws(() => service.createPartyRole({ partyId: 'missing', name: 'subscriber' }), /party not found/);
  assert.throws(() => service.updatePartyRole(role.id, { name: ' ' }), /name is required/);

  const updatedRole = service.updatePartyRole(role.id, { name: 'reseller' });
  assert.equal(updatedRole.name, 'reseller');

  const terminatedRole = service.deletePartyRole(role.id);
  assert.equal(terminatedRole.status, 'terminated');
  assert.ok(terminatedRole.validFor?.endDateTime);

  assert.throws(() => service.deletePartyRole('missing'), /party role not found/);
});
