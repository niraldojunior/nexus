import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { EventService } from '../../shared/tmf/index.js';
import type { CreatePartyInput, CreatePartyRoleInput, Party, PartyQuery, PartyRole, PartyRoleQuery, UpdatePartyInput, UpdatePartyRoleInput } from './domain.js';
import type { IPartyRepository } from './party-repository-interface.js';

export class PartyService {
  public constructor(
    private readonly repository: IPartyRepository,
    private readonly eventService: EventService,
  ) {}

  public createParty(input: CreatePartyInput): Party {
    assertName(input.name);
    const partyType = input.partyType ?? 'Organization';
    const id = createCanonicalId();
    const party: Party = {
      '@type': partyType,
      id,
      href: `/tmf-api/partyManagement/v4/party/${id}`,
      name: input.name.trim(),
      partyType,
      status: input.status ?? 'active',
      partyCharacteristic: input.partyCharacteristic ?? [],
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertParty(party);

    this.emit('PartyCreateEvent', stored.id, stored);
    return stored;
  }

  public updateParty(id: string, input: UpdatePartyInput): Party {
    const current = this.getPartyOrThrow(id);
    if (input.name !== undefined) assertName(input.name);

    const updated = this.repository.upsertParty({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      partyType: input.partyType ?? current.partyType,
      status: input.status ?? current.status,
      partyCharacteristic: input.partyCharacteristic ?? current.partyCharacteristic,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit('PartyAttributeValueChangeEvent', updated.id, updated);
    return updated;
  }

  public deleteParty(id: string): Party {
    const current = this.getPartyOrThrow(id);
    const endedAt = new Date().toISOString();
    const terminated = this.repository.upsertParty({
      ...current,
      status: 'terminated',
      validFor: buildTimePeriod(current.validFor?.startDateTime, endedAt),
    });
    this.emit('PartyAttributeValueChangeEvent', terminated.id, terminated);
    return terminated;
  }

  public getParty(id: string): Party | undefined {
    return this.repository.getParty(id);
  }

  public listParties(query?: PartyQuery): Party[] {
    return this.repository.listParties(query);
  }

  public createPartyRole(input: CreatePartyRoleInput): PartyRole {
    assertName(input.name);
    const party = this.getPartyOrThrow(input.partyId);
    const id = createCanonicalId();
    const role: PartyRole = {
      '@type': 'PartyRole',
      id,
      href: `/tmf-api/partyRoleManagement/v4/partyRole/${id}`,
      name: input.name.trim(),
      status: input.status ?? 'active',
      partyId: party.id,
      party: {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      },
      partyRoleCharacteristic: input.partyRoleCharacteristic ?? [],
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = this.repository.upsertPartyRole(role);
    this.emit('PartyRoleCreateEvent', stored.id, stored);
    return stored;
  }

  public updatePartyRole(id: string, input: UpdatePartyRoleInput): PartyRole {
    const current = this.getPartyRoleOrThrow(id);
    if (input.name !== undefined) assertName(input.name);

    const updated = this.repository.upsertPartyRole({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      status: input.status ?? current.status,
      partyRoleCharacteristic: input.partyRoleCharacteristic ?? current.partyRoleCharacteristic,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    this.emit('PartyRoleAttributeValueChangeEvent', updated.id, updated);
    return updated;
  }

  public deletePartyRole(id: string): PartyRole {
    const current = this.getPartyRoleOrThrow(id);
    const terminated = this.repository.upsertPartyRole({
      ...current,
      status: 'terminated',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    this.emit('PartyRoleAttributeValueChangeEvent', terminated.id, terminated);
    return terminated;
  }

  public getPartyRole(id: string): PartyRole | undefined {
    return this.repository.getPartyRole(id);
  }

  public listPartyRoles(query?: PartyRoleQuery): PartyRole[] {
    return this.repository.listPartyRoles(query);
  }

  private emit(eventType: string, entityId: string, payload: Party | PartyRole): void {
    this.eventService.appendEvent({
      eventType,
      source: `party.${payload['@type']}`,
      correlationId: entityId,
      eventData: {
        entityId,
        entityType: payload['@type'],
        payload,
      },
    });
  }

  private getPartyOrThrow(id: string): Party {
    const party = this.repository.getParty(id);
    if (!party) throw new AppError('party not found', { code: 'TMF_PARTY_NOT_FOUND', statusCode: 404 });
    return party;
  }

  private getPartyRoleOrThrow(id: string): PartyRole {
    const role = this.repository.getPartyRole(id);
    if (!role) throw new AppError('party role not found', { code: 'TMF_PARTY_ROLE_NOT_FOUND', statusCode: 404 });
    return role;
  }
}

const assertName = (value: unknown): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('name is required');
  }
};

const buildTimePeriod = (startDateTime: string | undefined, endDateTime: string): { startDateTime?: string; endDateTime: string } => {
  const period: { startDateTime?: string; endDateTime: string } = { endDateTime };
  if (startDateTime) {
    period.startDateTime = startDateTime;
  }
  return period;
};
