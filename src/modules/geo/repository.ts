import type {
  GeographicAddress,
  GeoAuditLog,
  GeoBulkJob,
  GeoBulkJobResult,
  GeoEvent,
  GeographicLocation,
  GeographicRelationshipType,
  GeographicSite,
  GeographicSiteReferences,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
  GeographicSiteSpecificationRef,
  GeographicSiteStatusHistoryEntry,
  GeoOutboxMessage,
} from './domain.js';
import type {
  GeographicAddressQuery,
  GeoTenantScope,
  IGeoRepository,
} from './geo-repository-interface.js';
import {
  normalizeAddressText,
  normalizeCountrySearch,
  normalizePostcodeSearch,
  normalizeStreetNumberSearch,
  normalizeStreetSearch,
} from './address-normalization.js';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';

type ContainmentRule = {
  parentSpecId: string;
  childSpecId: string;
  protected: boolean;
};

export class GeoRepository implements IGeoRepository {
  private readonly locations = new Map<string, GeographicLocation>();
  private readonly addresses = new Map<string, GeographicAddress>();
  private readonly sites = new Map<string, GeographicSite>();
  private readonly specs = new Map<string, GeographicSiteSpecification>();
  private readonly siteRelationships = new Map<string, GeographicSiteRelationship[]>();
  private readonly relationshipTypes = new Map<string, GeographicRelationshipType>();
  private readonly containmentRules = new Map<string, ContainmentRule>();
  private readonly statusHistory: GeographicSiteStatusHistoryEntry[] = [];
  private readonly audits: GeoAuditLog[] = [];
  private readonly events: GeoEvent[] = [];
  private readonly outbox: GeoOutboxMessage[] = [];
  private readonly bulkJobs = new Map<string, GeoBulkJob>();
  private readonly bulkResults: GeoBulkJobResult[] = [];

  public transaction<T>(fn: () => T): T {
    return fn();
  }

  public upsertLocation(location: GeographicLocation): GeographicLocation {
    const stored = cloneLocation(location);
    this.locations.set(stored.id, stored);
    return cloneLocation(stored);
  }

  public getLocation(id: string, scope?: GeoTenantScope): GeographicLocation | undefined {
    const location = this.locations.get(id);
    if (location && !matchesTenant(location.tenantId, scope?.tenantId)) return undefined;
    return location ? cloneLocation(location) : undefined;
  }

  public listLocations(
    query?: GeoTenantScope & { limit?: number; offset?: number },
  ): GeographicLocation[] {
    const sorted = [...this.locations.values()]
      .filter((location) => matchesTenant(location.tenantId, query?.tenantId))
      .sort((a, b) => a.id.localeCompare(b.id));
    const offset = query?.offset ?? 0;
    const sliced =
      query?.limit !== undefined
        ? sorted.slice(offset, offset + query.limit)
        : sorted.slice(offset);
    return sliced.map(cloneLocation);
  }

  public upsertAddress(address: GeographicAddress): GeographicAddress {
    const stored = cloneAddress(address);
    this.addresses.set(stored.id, stored);
    return cloneAddress(stored);
  }

  public getAddress(id: string, scope?: GeoTenantScope): GeographicAddress | undefined {
    const address = this.addresses.get(id);
    if (address && !matchesTenant(address.tenantId, scope?.tenantId)) return undefined;
    return address ? cloneAddress(address) : undefined;
  }

  public listAddresses(query?: GeographicAddressQuery): GeographicAddress[] {
    const street = normalizeStreetSearch(query?.street ?? query?.name);
    const streetNr = normalizeStreetNumberSearch(query?.streetNr);
    const city = normalizeAddressText(query?.city);
    const state = normalizeAddressText(query?.stateOrProvince);
    const postcode = normalizePostcodeSearch(query?.postcode);
    const country = normalizeCountrySearch(query?.country);
    const filtered = [...this.addresses.values()].filter(
      (address) =>
        matchesTenant(address.tenantId, query?.tenantId) &&
        (!query?.id || address.id === query.id) &&
        (!street || normalizeStreetSearch(address.street).includes(street)) &&
        (!streetNr || normalizeStreetNumberSearch(address.streetNr) === streetNr) &&
        (!city || normalizeAddressText(address.city) === city) &&
        (!state || normalizeAddressText(address.stateOrProvince) === state) &&
        (!postcode || normalizePostcodeSearch(address.postcode) === postcode) &&
        (!country || normalizeCountrySearch(address.country) === country) &&
        (!query?.geographicLocationId ||
          address.geographicLocationId === query.geographicLocationId),
    );
    const sorted = filtered.sort(
      (a, b) => a.street.localeCompare(b.street) || a.id.localeCompare(b.id),
    );
    const offset = query?.offset ?? 0;
    const sliced =
      query?.limit !== undefined
        ? sorted.slice(offset, offset + query.limit)
        : sorted.slice(offset);
    return sliced.map((address) => {
      const clone = cloneAddress(address);
      if (query?.includeCharacteristics === false) clone.characteristic = [];
      return clone;
    });
  }

  public upsertSpec(spec: GeographicSiteSpecification): GeographicSiteSpecification {
    const stored = cloneSpec(spec);
    this.specs.set(stored.id, stored);
    return this.getSpec(stored.id)!;
  }

  public getSpec(id: string): GeographicSiteSpecification | undefined {
    const spec = this.specs.get(id);
    return spec ? this.hydrateSpec(spec) : undefined;
  }

  public getSpecByCode(code: string): GeographicSiteSpecification | undefined {
    const normalized = code.trim().toLowerCase();
    const spec = [...this.specs.values()].find(
      (item) => item.code.trim().toLowerCase() === normalized,
    );
    return spec ? this.hydrateSpec(spec) : undefined;
  }

  public listSpecs(query?: {
    name?: string;
    code?: string;
    category?: GeographicSiteSpecification['category'];
    lifecycleStatus?: GeographicSiteSpecification['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): GeographicSiteSpecification[] {
    const filtered = [...this.specs.values()].filter((spec) => {
      if (query?.name && !spec.name.toLowerCase().includes(query.name.toLowerCase())) return false;
      if (query?.code && !spec.code.toLowerCase().includes(query.code.toLowerCase())) return false;
      if (query?.category && spec.category !== query.category) return false;
      if (query?.lifecycleStatus && spec.lifecycleStatus !== query.lifecycleStatus) return false;
      return true;
    });
    const sorted = filtered.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    const offset = query?.offset ?? 0;
    const sliced =
      query?.limit !== undefined
        ? sorted.slice(offset, offset + query.limit)
        : sorted.slice(offset);
    return sliced.map((spec) => this.hydrateSpec(spec));
  }

  public syncSpecContainmentRules(
    specId: string,
    input: {
      allowedParentSpecIds: string[];
      allowedChildSpecIds: string[];
      protectedParentSpecIds?: string[];
      protectedChildSpecIds?: string[];
    },
  ): void {
    const nextParentIds = new Set(input.allowedParentSpecIds);
    const nextChildIds = new Set(input.allowedChildSpecIds);
    const protectedParentIds = new Set(input.protectedParentSpecIds ?? []);
    const protectedChildIds = new Set(input.protectedChildSpecIds ?? []);

    for (const [key, rule] of [...this.containmentRules.entries()]) {
      if (rule.childSpecId === specId && !nextParentIds.has(rule.parentSpecId)) {
        this.containmentRules.delete(key);
      }
      if (rule.parentSpecId === specId && !nextChildIds.has(rule.childSpecId)) {
        this.containmentRules.delete(key);
      }
    }

    for (const parentSpecId of nextParentIds) {
      this.containmentRules.set(buildRuleKey(parentSpecId, specId), {
        parentSpecId,
        childSpecId: specId,
        protected: protectedParentIds.has(parentSpecId),
      });
    }

    for (const childSpecId of nextChildIds) {
      this.containmentRules.set(buildRuleKey(specId, childSpecId), {
        parentSpecId: specId,
        childSpecId,
        protected: protectedChildIds.has(childSpecId),
      });
    }
  }

  public upsertSite(site: GeographicSite): GeographicSite {
    const stored = cloneSite({
      ...site,
      relatedSite: site.relatedSite.length ? site.relatedSite : this.listSiteRelationships(site.id),
    });
    this.sites.set(stored.id, stored);
    return cloneSite(stored);
  }

  public getSite(id: string, scope?: GeoTenantScope): GeographicSite | undefined {
    const site = this.sites.get(id);
    if (site && !matchesTenant(site.tenantId, scope?.tenantId)) return undefined;
    return site ? cloneSite(site) : undefined;
  }

  public listSites(
    query?: GeoTenantScope & {
      name?: string;
      status?: GeographicSite['status'];
      siteSpecificationId?: string;
      siteSpecificationIds?: string[];
      parentSiteId?: string | null;
      descendantOfSiteId?: string;
      characteristicName?: string;
      characteristicValue?: string;
      limit?: number;
      offset?: number;
    },
  ): GeographicSite[] {
    const descendantIds = query?.descendantOfSiteId
      ? this.collectDescendantSiteIds(query.descendantOfSiteId, query)
      : undefined;
    const filtered = [...this.sites.values()].filter((site) => {
      if (!matchesTenant(site.tenantId, query?.tenantId)) return false;
      if (query?.name && !site.name.toLowerCase().includes(query.name.toLowerCase())) return false;
      if (query?.status && site.status !== query.status) return false;
      if (query?.siteSpecificationId && site.siteSpecificationId !== query.siteSpecificationId)
        return false;
      if (
        query?.siteSpecificationIds &&
        !query.siteSpecificationIds.includes(site.siteSpecificationId)
      )
        return false;
      if (query?.parentSiteId !== undefined) {
        const currentParentId = site.parentSite?.id ?? null;
        if (currentParentId !== query.parentSiteId) return false;
      }
      if (descendantIds && !descendantIds.has(site.id)) return false;
      if (query?.characteristicName) {
        const characteristic = site.characteristic.find(
          (item) =>
            item.name.trim().toLowerCase() === query.characteristicName?.trim().toLowerCase(),
        );
        if (!characteristic) return false;
        if (
          query.characteristicValue !== undefined &&
          String(characteristic.value) !== query.characteristicValue
        )
          return false;
      }
      return true;
    });
    const sorted = filtered.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    const offset = query?.offset ?? 0;
    const sliced =
      query?.limit !== undefined
        ? sorted.slice(offset, offset + query.limit)
        : sorted.slice(offset);
    return sliced.map(cloneSite);
  }

  public countSites(scope?: GeoTenantScope): number {
    return [...this.sites.values()].filter((site) => matchesTenant(site.tenantId, scope?.tenantId))
      .length;
  }

  public countSitesBySpecificationId(specificationId: string, scope?: GeoTenantScope): number {
    return [...this.sites.values()].filter(
      (site) =>
        site.siteSpecificationId === specificationId &&
        matchesTenant(site.tenantId, scope?.tenantId),
    ).length;
  }

  public upsertSiteRelationship(
    siteId: string,
    relationship: GeographicSiteRelationship,
  ): GeographicSiteRelationship {
    const current = this.siteRelationships.get(siteId) ?? [];
    const next = [
      ...current.filter(
        (item) =>
          !(item.id === relationship.id && item.relationshipType === relationship.relationshipType),
      ),
      cloneRelationship(relationship),
    ];
    this.siteRelationships.set(siteId, next);

    const site = this.sites.get(siteId);
    if (site) {
      site.relatedSite = next.map(cloneRelationship);
      this.sites.set(siteId, cloneSite(site));
    }

    return cloneRelationship(relationship);
  }

  public endSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    endedAt: string,
  ): boolean {
    const current = this.siteRelationships.get(siteId) ?? [];
    let changed = false;
    const next = current.map((item) => {
      if (
        item.id === relatedSiteId &&
        item.relationshipType === relationshipType &&
        !item.validFor?.endDateTime
      ) {
        changed = true;
        return { ...item, validFor: { ...(item.validFor ?? {}), endDateTime: endedAt } };
      }
      return item;
    });
    this.siteRelationships.set(siteId, next);

    const site = this.sites.get(siteId);
    if (site) {
      site.relatedSite = next.map(cloneRelationship);
      this.sites.set(siteId, cloneSite(site));
    }

    return changed;
  }

  public listSiteRelationships(siteId: string): GeographicSiteRelationship[] {
    return (this.siteRelationships.get(siteId) ?? []).map(cloneRelationship);
  }

  public upsertRelationshipType(
    relationshipType: GeographicRelationshipType,
  ): GeographicRelationshipType {
    const stored = cloneRelationshipType(relationshipType);
    this.relationshipTypes.set(stored.code.toLowerCase(), stored);
    return cloneRelationshipType(stored);
  }

  public getRelationshipType(code: string): GeographicRelationshipType | undefined {
    const relationshipType = this.relationshipTypes.get(code.trim().toLowerCase());
    return relationshipType ? cloneRelationshipType(relationshipType) : undefined;
  }

  public listRelationshipTypes(query?: {
    code?: string;
    lifecycleStatus?: GeographicRelationshipType['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): GeographicRelationshipType[] {
    const filtered = [...this.relationshipTypes.values()].filter((item) => {
      if (query?.code && !item.code.toLowerCase().includes(query.code.toLowerCase())) return false;
      if (query?.lifecycleStatus && item.lifecycleStatus !== query.lifecycleStatus) return false;
      return true;
    });
    const sorted = filtered.sort((a, b) => a.code.localeCompare(b.code));
    const offset = query?.offset ?? 0;
    const sliced =
      query?.limit !== undefined
        ? sorted.slice(offset, offset + query.limit)
        : sorted.slice(offset);
    return sliced.map(cloneRelationshipType);
  }

  public appendSiteStatusHistory(
    entry: GeographicSiteStatusHistoryEntry,
  ): GeographicSiteStatusHistoryEntry {
    const stored = cloneStatusHistory(entry);
    this.statusHistory.push(stored);
    return cloneStatusHistory(stored);
  }

  public listSiteStatusHistory(
    siteId: string,
    scope?: GeoTenantScope,
  ): GeographicSiteStatusHistoryEntry[] {
    return this.statusHistory
      .filter((entry) => entry.siteId === siteId && matchesTenant(entry.tenantId, scope?.tenantId))
      .sort((a, b) => b.statusDate.localeCompare(a.statusDate) || b.id.localeCompare(a.id))
      .map(cloneStatusHistory);
  }

  public getSiteReferences(siteId: string, scope?: GeoTenantScope): GeographicSiteReferences {
    const activeChildSiteCount = [...this.sites.values()].filter(
      (site) =>
        site.parentSite?.id === siteId &&
        site.status !== 'Retired' &&
        matchesTenant(site.tenantId, scope?.tenantId),
    ).length;
    const activeRelationshipCount = (this.siteRelationships.get(siteId) ?? []).filter(
      (item) => !item.validFor?.endDateTime,
    ).length;
    const result = {
      siteId,
      activeChildSiteCount,
      activeRelationshipCount,
      activeResourceCount: 0,
      activeServiceCount: 0,
      activeOrderCount: 0,
      blocking: activeChildSiteCount + activeRelationshipCount > 0,
    };
    return result;
  }

  public countSiteDescendants(siteId: string, scope?: GeoTenantScope): number {
    return this.collectDescendantSiteIds(siteId, scope).size;
  }

  // Versão em conjunto de getSiteReferences (issue #58) — mesma régua, sobre uma lista de ids.
  // O repositório em memória não modela Resource/Service/Order (getSiteReferences acima também
  // devolve 0 para eles), então só filho ativo e relacionamento ativo bloqueiam aqui.
  public listBlockedSiteIds(siteIds: string[], scope?: GeoTenantScope): string[] {
    const idSet = new Set(siteIds);
    const blocked = new Set<string>();
    for (const site of this.sites.values()) {
      if (
        site.parentSite &&
        idSet.has(site.parentSite.id) &&
        site.status !== 'Retired' &&
        matchesTenant(site.tenantId, scope?.tenantId)
      ) {
        blocked.add(site.parentSite.id);
      }
    }
    for (const id of siteIds) {
      const hasActiveRelationship = (this.siteRelationships.get(id) ?? []).some(
        (item) => !item.validFor?.endDateTime,
      );
      if (hasActiveRelationship) blocked.add(id);
    }
    return [...blocked];
  }

  // Versão em conjunto de transitionSite (upsertSite + appendSiteStatusHistory), para o mesmo
  // cenário de escala.
  public bulkTransitionSites(
    siteIds: string[],
    input: {
      toStatus: GeographicSite['status'];
      allowedFromStatuses: GeographicSite['status'][];
      statusDate: string;
      statusReason?: string;
      tenantId: string;
      actorSub: string;
      traceId: string;
    },
  ): { updated: number } {
    let updated = 0;
    for (const id of siteIds) {
      const site = this.sites.get(id);
      if (!site) continue;
      if (!matchesTenant(site.tenantId, input.tenantId)) continue;
      if (!input.allowedFromStatuses.includes(site.status)) continue;
      this.statusHistory.push(
        cloneStatusHistory({
          '@type': 'GeographicSiteStatusHistoryEntry',
          id: createCanonicalId(),
          siteId: site.id,
          tenantId: site.tenantId ?? input.tenantId,
          fromStatus: site.status,
          toStatus: input.toStatus,
          statusDate: input.statusDate,
          ...(input.statusReason ? { statusReason: input.statusReason } : {}),
          actorSub: input.actorSub,
          traceId: input.traceId,
        }),
      );
      this.sites.set(
        id,
        cloneSite({
          ...site,
          status: input.toStatus,
          statusDate: input.statusDate,
          ...(input.statusReason ? { statusReason: input.statusReason } : {}),
        }),
      );
      updated += 1;
    }
    return { updated };
  }

  public appendAudit(audit: GeoAuditLog): GeoAuditLog {
    const stored = cloneAudit(audit);
    this.audits.push(stored);
    return cloneAudit(stored);
  }

  public listAuditForEntity(entityId: string, scope?: GeoTenantScope): GeoAuditLog[] {
    return this.audits
      .filter(
        (audit) => audit.entityId === entityId && matchesTenant(audit.tenantId, scope?.tenantId),
      )
      .sort((a, b) => b.eventTime.localeCompare(a.eventTime) || b.id.localeCompare(a.id))
      .map(cloneAudit);
  }

  public appendEvent(event: GeoEvent): GeoEvent {
    const stored = cloneEvent(event);
    this.events.push(stored);
    return cloneEvent(stored);
  }

  public appendOutbox(message: GeoOutboxMessage): GeoOutboxMessage {
    const stored = cloneOutbox(message);
    this.outbox.push(stored);
    return cloneOutbox(stored);
  }

  public listEventsForEntity(entityId: string): GeoEvent[] {
    return this.events.filter((event) => event.eventData.entityId === entityId).map(cloneEvent);
  }

  public upsertBulkJob(job: GeoBulkJob): GeoBulkJob {
    const stored = cloneBulkJob(job);
    this.bulkJobs.set(stored.id, stored);
    return cloneBulkJob(stored);
  }

  public getBulkJob(id: string, scope?: GeoTenantScope): GeoBulkJob | undefined {
    const job = this.bulkJobs.get(id);
    if (job && !matchesTenant(job.tenantId, scope?.tenantId)) return undefined;
    return job ? cloneBulkJob(job) : undefined;
  }

  public getBulkJobByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    target?: GeoBulkJob['target'],
  ): GeoBulkJob | undefined {
    const job = [...this.bulkJobs.values()].find(
      (item) =>
        item.tenantId === tenantId &&
        item.idempotencyKey === idempotencyKey &&
        (!target || item.target === target),
    );
    return job ? cloneBulkJob(job) : undefined;
  }

  public appendBulkJobResult(result: GeoBulkJobResult): GeoBulkJobResult {
    const stored = cloneBulkJobResult(result);
    this.bulkResults.push(stored);
    return cloneBulkJobResult(stored);
  }

  public listBulkJobResults(
    jobId: string,
    scope?: GeoTenantScope & { limit?: number; offset?: number },
  ): GeoBulkJobResult[] {
    const sorted = this.bulkResults
      .filter((result) => result.jobId === jobId && matchesTenant(result.tenantId, scope?.tenantId))
      .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
    const offset = scope?.offset ?? 0;
    const sliced =
      scope?.limit !== undefined
        ? sorted.slice(offset, offset + scope.limit)
        : sorted.slice(offset);
    return sliced.map(cloneBulkJobResult);
  }

  private hydrateSpec(spec: GeographicSiteSpecification): GeographicSiteSpecification {
    const parentRules = [...this.containmentRules.values()].filter(
      (rule) => rule.childSpecId === spec.id,
    );
    const childRules = [...this.containmentRules.values()].filter(
      (rule) => rule.parentSpecId === spec.id,
    );
    const allowedParentSpec = parentRules
      .map((rule) => this.specs.get(rule.parentSpecId))
      .filter((item): item is GeographicSiteSpecification => item !== undefined)
      .map(toSpecRef);
    const allowedChildSpec = childRules
      .map((rule) => this.specs.get(rule.childSpecId))
      .filter((item): item is GeographicSiteSpecification => item !== undefined)
      .map(toSpecRef);

    return {
      ...cloneSpec(spec),
      allowedParentSpec,
      allowedChildSpec,
      allowedParentSpecIds: allowedParentSpec.map((item) => item.id),
      allowedChildSpecIds: allowedChildSpec.map((item) => item.id),
      _protectedAllowedParentSpecIds: parentRules
        .filter((rule) => rule.protected)
        .map((rule) => rule.parentSpecId),
      _protectedAllowedChildSpecIds: childRules
        .filter((rule) => rule.protected)
        .map((rule) => rule.childSpecId),
    };
  }

  private collectDescendantSiteIds(siteId: string, scope?: GeoTenantScope): Set<string> {
    const result = new Set<string>();
    const queue = [siteId];
    while (queue.length > 0) {
      const parentId = queue.shift() as string;
      for (const site of this.sites.values()) {
        if (
          site.parentSite?.id === parentId &&
          matchesTenant(site.tenantId, scope?.tenantId) &&
          !result.has(site.id)
        ) {
          result.add(site.id);
          queue.push(site.id);
        }
      }
    }
    return result;
  }
}

const buildRuleKey = (parentSpecId: string, childSpecId: string): string =>
  `${parentSpecId}::${childSpecId}`;

const toSpecRef = (spec: GeographicSiteSpecification): GeographicSiteSpecificationRef => ({
  id: spec.id,
  href: spec.href,
  name: spec.name,
  code: spec.code,
  category: spec.category,
  '@referredType': 'GeographicSiteSpecification',
});

const cloneLocation = (location: GeographicLocation): GeographicLocation => ({
  ...location,
  geometry: structuredClone(location.geometry),
  ...(location.validFor ? { validFor: { ...location.validFor } } : {}),
  characteristic: location.characteristic.map((item) => ({ ...item })),
});

const cloneAddress = (address: GeographicAddress): GeographicAddress => ({
  ...address,
  ...(address.place ? { place: { ...address.place } } : {}),
  ...(address.validFor ? { validFor: { ...address.validFor } } : {}),
  characteristic: address.characteristic.map((item) => ({ ...item })),
});

const cloneSite = (site: GeographicSite): GeographicSite => ({
  ...site,
  siteSpecification: { ...site.siteSpecification },
  ...(site.place ? { place: { ...site.place } } : {}),
  ...(site.address ? { address: { ...site.address } } : {}),
  ...(site.siteAddress ? { siteAddress: site.siteAddress.map((item) => ({ ...item })) } : {}),
  ...(site.parentSite ? { parentSite: { ...site.parentSite } } : {}),
  relatedSite: site.relatedSite.map((item) => ({ ...item })),
  relatedParty: site.relatedParty.map((item) => ({ ...item })),
  characteristic: site.characteristic.map((item) => ({
    ...item,
    value: cloneCharacteristicValue(item.value),
  })),
});

const cloneRelationship = (
  relationship: GeographicSiteRelationship,
): GeographicSiteRelationship => ({
  ...relationship,
  ...(relationship.validFor ? { validFor: { ...relationship.validFor } } : {}),
});

const cloneRelationshipType = (
  relationshipType: GeographicRelationshipType,
): GeographicRelationshipType => ({
  ...relationshipType,
  allowedSourceCategories: [...relationshipType.allowedSourceCategories],
  allowedTargetCategories: [...relationshipType.allowedTargetCategories],
  ...(relationshipType.cardinality ? { cardinality: { ...relationshipType.cardinality } } : {}),
});

const cloneSpec = (spec: GeographicSiteSpecification): GeographicSiteSpecification => ({
  ...spec,
  ...(spec.validFor ? { validFor: { ...spec.validFor } } : {}),
  allowedParentSpec: spec.allowedParentSpec.map((item) => ({ ...item })),
  allowedChildSpec: spec.allowedChildSpec.map((item) => ({ ...item })),
  allowedParentSpecIds: [...spec.allowedParentSpecIds],
  allowedChildSpecIds: [...spec.allowedChildSpecIds],
  specCharacteristic: spec.specCharacteristic.map((item) => ({
    ...item,
    ...(item.defaultValue !== undefined
      ? { defaultValue: cloneCharacteristicValue(item.defaultValue) }
      : {}),
    ...(item.allowedValues ? { allowedValues: [...item.allowedValues] } : {}),
  })),
  ...cloneOptionalArray('_protectedAllowedParentSpecIds', spec._protectedAllowedParentSpecIds),
  ...cloneOptionalArray('_protectedAllowedChildSpecIds', spec._protectedAllowedChildSpecIds),
});

const cloneEvent = (event: GeoEvent): GeoEvent => ({
  ...event,
  eventData: structuredClone(event.eventData),
});

const cloneAudit = (audit: GeoAuditLog): GeoAuditLog => ({
  ...audit,
  ...(audit.before ? { before: structuredClone(audit.before) } : {}),
  ...(audit.after ? { after: structuredClone(audit.after) } : {}),
});

const cloneOutbox = (message: GeoOutboxMessage): GeoOutboxMessage => ({
  ...message,
  payload: cloneEvent(message.payload),
});

const cloneBulkJob = (job: GeoBulkJob): GeoBulkJob => ({ ...job });

const cloneBulkJobResult = (result: GeoBulkJobResult): GeoBulkJobResult => ({
  ...result,
  warnings: [...result.warnings],
});

const cloneStatusHistory = (
  entry: GeographicSiteStatusHistoryEntry,
): GeographicSiteStatusHistoryEntry => ({
  ...entry,
});

const cloneCharacteristicValue = (
  value: GeographicSite['characteristic'][number]['value'],
): GeographicSite['characteristic'][number]['value'] => {
  if (value && typeof value === 'object') {
    return structuredClone(value);
  }
  return value;
};

const cloneOptionalArray = <K extends string>(
  key: K,
  values: string[] | undefined,
): Record<K, string[]> | Record<string, never> =>
  values ? ({ [key]: [...values] } as Record<K, string[]>) : {};

const matchesTenant = (
  entityTenantId: string | undefined,
  scopeTenantId: string | undefined,
): boolean => !scopeTenantId || (entityTenantId ?? 'default') === scopeTenantId;
