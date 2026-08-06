import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { EventService } from '../../shared/tmf/index.js';
import type {
  CreatePartyInput,
  CreatePartyRoleInput,
  Party,
  PartyQuery,
  PartyRole,
  PartyRoleQuery,
  UpdatePartyInput,
  UpdatePartyRoleInput,
} from './domain.js';
import type { IPartyRepository } from './party-repository-interface.js';

export class PartyService {
  public constructor(
    private readonly repository: IPartyRepository,
    private readonly eventService: EventService,
  ) {}

  public async createParty(input: CreatePartyInput): Promise<Party> {
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

    const stored = await this.repository.upsertParty(party);

    await this.emit('PartyCreateEvent', stored.id, stored);
    return stored;
  }

  public async updateParty(id: string, input: UpdatePartyInput): Promise<Party> {
    const current = await this.getPartyOrThrow(id);
    if (input.name !== undefined) assertName(input.name);

    const updated = await this.repository.upsertParty({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      partyType: input.partyType ?? current.partyType,
      status: input.status ?? current.status,
      partyCharacteristic: input.partyCharacteristic ?? current.partyCharacteristic,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit('PartyAttributeValueChangeEvent', updated.id, updated);
    return updated;
  }

  public async deleteParty(id: string): Promise<Party> {
    const current = await this.getPartyOrThrow(id);
    const endedAt = new Date().toISOString();
    const terminated = await this.repository.upsertParty({
      ...current,
      status: 'terminated',
      validFor: buildTimePeriod(current.validFor?.startDateTime, endedAt),
    });
    await this.emit('PartyAttributeValueChangeEvent', terminated.id, terminated);
    return terminated;
  }

  public async getParty(id: string): Promise<Party | undefined> {
    return await this.repository.getParty(id);
  }

  public async listParties(query?: PartyQuery): Promise<Party[]> {
    return await this.repository.listParties(query);
  }

  public async createPartyRole(input: CreatePartyRoleInput): Promise<PartyRole> {
    assertName(input.name);
    const party = await this.getPartyOrThrow(input.partyId);
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

    const stored = await this.repository.upsertPartyRole(role);
    await this.emit('PartyRoleCreateEvent', stored.id, stored);
    return stored;
  }

  public async updatePartyRole(id: string, input: UpdatePartyRoleInput): Promise<PartyRole> {
    const current = await this.getPartyRoleOrThrow(id);
    if (input.name !== undefined) assertName(input.name);

    const updated = await this.repository.upsertPartyRole({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      status: input.status ?? current.status,
      partyRoleCharacteristic: input.partyRoleCharacteristic ?? current.partyRoleCharacteristic,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit('PartyRoleAttributeValueChangeEvent', updated.id, updated);
    return updated;
  }

  public async deletePartyRole(id: string): Promise<PartyRole> {
    const current = await this.getPartyRoleOrThrow(id);
    const terminated = await this.repository.upsertPartyRole({
      ...current,
      status: 'terminated',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit('PartyRoleAttributeValueChangeEvent', terminated.id, terminated);
    return terminated;
  }

  public async getPartyRole(id: string): Promise<PartyRole | undefined> {
    return await this.repository.getPartyRole(id);
  }

  public async listPartyRoles(query?: PartyRoleQuery): Promise<PartyRole[]> {
    return await this.repository.listPartyRoles(query);
  }

  private async emit(
    eventType: string,
    entityId: string,
    payload: Party | PartyRole,
  ): Promise<void> {
    await this.eventService.appendEvent({
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

  private async getPartyOrThrow(id: string): Promise<Party> {
    const party = await this.repository.getParty(id);
    if (!party)
      throw new AppError('party not found', { code: 'TMF_PARTY_NOT_FOUND', statusCode: 404 });
    return party;
  }

  private async getPartyRoleOrThrow(id: string): Promise<PartyRole> {
    const role = await this.repository.getPartyRole(id);
    if (!role)
      throw new AppError('party role not found', {
        code: 'TMF_PARTY_ROLE_NOT_FOUND',
        statusCode: 404,
      });
    return role;
  }
}

const assertName = (value: unknown): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('name is required');
  }
};

const buildTimePeriod = (
  startDateTime: string | undefined,
  endDateTime: string,
): { startDateTime?: string; endDateTime: string } => {
  const period: { startDateTime?: string; endDateTime: string } = { endDateTime };
  if (startDateTime) {
    period.startDateTime = startDateTime;
  }
  return period;
};
