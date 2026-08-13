import { AppError } from '../../shared/errors/app-error.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import { GEO_ADMIN_ROLES } from '../../shared/http/request-context.js';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type {
  Characteristic,
  CharacteristicValueType,
  GeographicAddress,
  GeoAuditLog,
  GeoBulkJob,
  GeoBulkJobResult,
  GeoBulkMode,
  GeoBulkTarget,
  GeoEvent,
  GeographicLocation,
  GeographicRelationshipType,
  GeographicSite,
  GeographicSiteReferences,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
  GeographicSiteSpecificationCategory,
  GeographicSiteSpecificationCharacteristic,
  GeographicSiteSpecificationLifecycleStatus,
  GeographicSiteSpecificationRef,
  GeographicSiteStatusHistoryEntry,
  GeoJSONGeometry,
  GeoSiteStatus,
  GeoSiteStatusAlias,
  GeoOutboxMessage,
  TimePeriod,
} from './domain.js';
import type { GeographicAddressQuery, IGeoRepository } from './geo-repository-interface.js';
import { normalizeCountrySearch } from './address-normalization.js';

type LocationInput = {
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoJSONGeometry;
  spatialRef?: string;
  accuracy?: string;
  referencePoint?: string;
  validFor?: TimePeriod;
  characteristic?: Characteristic[];
};

export type AddressInput = {
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  validFor?: TimePeriod;
  characteristic?: Characteristic[];
};

type SpecRefInput = string | { id: string };

type SpecInput = {
  name: string;
  code?: string;
  description?: string;
  category: GeographicSiteSpecificationCategory;
  lifecycleStatus?: GeographicSiteSpecificationLifecycleStatus;
  validFor?: TimePeriod;
  allowedParentSpec?: SpecRefInput[];
  allowedChildSpec?: SpecRefInput[];
  allowedParentSpecIds?: string[];
  allowedChildSpecIds?: string[];
  specCharacteristic?: GeographicSiteSpecificationCharacteristic[];
};

export type SiteInput = {
  name: string;
  status?: GeoSiteStatus | GeoSiteStatusAlias;
  statusDate?: string;
  statusReason?: string;
  siteSpecificationId: string;
  placeId?: string;
  addressId?: string;
  siteAddress?: Array<{ id: string; role: 'principal' | 'dispatch' | 'billing' }>;
  parentSiteId?: string;
  relatedParty?: Array<{ id: string; role?: string }>;
  characteristic?: Characteristic[];
  relatedSite?: Array<{ id: string; relationshipType: string; validFor?: TimePeriod }>;
};

type SiteTransitionInput = {
  status: GeoSiteStatus | GeoSiteStatusAlias;
  statusReason?: string;
  statusDate?: string;
};

type GeoBulkInput<TItem> = {
  mode?: GeoBulkMode;
  validateOnly?: boolean;
  atomic?: boolean;
  items: TItem[];
};

type GeoBulkSubmission = {
  job: GeoBulkJob;
  results: GeoBulkJobResult[];
};

type BulkOrigin = {
  system: string;
  entity: string;
  id: string;
};

type PreparedBulkItem<TItem> = {
  item: TItem;
  origin: BulkOrigin;
  existingId?: string;
  warnings: string[];
};

type RelationshipTypeInput = {
  code: string;
  name?: string;
  inverseCode?: string;
  symmetric?: boolean;
  allowedSourceCategories?: GeographicSiteSpecificationCategory[];
  allowedTargetCategories?: GeographicSiteSpecificationCategory[];
  cardinality?: GeographicRelationshipType['cardinality'];
  lifecycleStatus?: GeographicRelationshipType['lifecycleStatus'];
};

type LocationSpatialQuery = {
  bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  near?: { lng: number; lat: number; radiusMeters: number };
  limit?: number;
  offset?: number;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: GeoJSONGeometry;
    properties: Record<string, unknown>;
  }>;
};

type SiteAtAddressInput = {
  location: LocationInput;
  address: AddressInput;
  site: Omit<SiteInput, 'placeId' | 'addressId'>;
  fedBySiteId?: string;
  fedByRelationshipType?: string;
};

type ContainmentImpact = {
  specId: string;
  removedAllowedParentSpecIds: string[];
  removedAllowedChildSpecIds: string[];
  impactedParentAssignments: number;
  impactedChildAssignments: number;
  impactedSiteIds: string[];
  blocking: boolean;
};

type SiteTreeNode = {
  site: GeographicSite;
  children: SiteTreeNode[];
};

type BootstrapDefinition = {
  name: string;
  code: string;
  category: GeographicSiteSpecificationCategory;
  description: string;
  allowedParentCodes: string[];
  allowedChildCodes: string[];
};

const BOOTSTRAP_SPECIFICATIONS: BootstrapDefinition[] = [
  {
    name: 'Region',
    code: 'REGION',
    category: 'Region',
    description: 'Agrupador territorial hierárquico para estados, regiões e macroáreas.',
    allowedParentCodes: ['REGION'],
    allowedChildCodes: ['REGION', 'CO', 'POP', 'CABINET', 'INSTALLATION_POINT', 'CONDOMINIUM'],
  },
  {
    name: 'Functional Group',
    code: 'FUNCTIONAL_GROUP',
    category: 'FunctionalGroup',
    description: 'Agrupador lógico sem containment físico direto.',
    allowedParentCodes: [],
    allowedChildCodes: [],
  },
  {
    name: 'Central Office',
    code: 'CO',
    category: 'Site',
    description: 'Estação ou central com salas e pavimentos internos.',
    allowedParentCodes: ['REGION'],
    allowedChildCodes: ['FLOOR', 'ROOM'],
  },
  {
    name: 'POP',
    code: 'POP',
    category: 'Site',
    description: 'Ponto de presença com sublocais internos governados.',
    allowedParentCodes: ['REGION'],
    allowedChildCodes: ['FLOOR', 'ROOM'],
  },
  {
    name: 'Cabinet',
    code: 'CABINET',
    category: 'Site',
    description: 'Gabinete externo ou armário de distribuição.',
    allowedParentCodes: ['REGION'],
    allowedChildCodes: [],
  },
  {
    name: 'Installation Point',
    code: 'INSTALLATION_POINT',
    category: 'Site',
    description: 'Ponto de instalação associado ao atendimento.',
    allowedParentCodes: ['REGION'],
    allowedChildCodes: [],
  },
  {
    name: 'Condominium',
    code: 'CONDOMINIUM',
    category: 'Site',
    description: 'Condominio residencial ou comercial que agrupa blocos fisicos no mesmo endereco.',
    allowedParentCodes: ['REGION'],
    allowedChildCodes: ['BLOCK'],
  },
  {
    name: 'Building Block',
    code: 'BLOCK',
    category: 'SubSite',
    description: 'Bloco fisico subordinado a um condominio.',
    allowedParentCodes: ['CONDOMINIUM'],
    allowedChildCodes: [],
  },
  {
    name: 'Floor',
    code: 'FLOOR',
    category: 'SubSite',
    description: 'Pavimento interno subordinado a CO ou POP.',
    allowedParentCodes: ['CO', 'POP'],
    allowedChildCodes: ['ROOM'],
  },
  {
    name: 'Room',
    code: 'ROOM',
    category: 'SubSite',
    description: 'Sala interna subordinada a CO, POP ou piso.',
    allowedParentCodes: ['CO', 'POP', 'FLOOR'],
    allowedChildCodes: ['CAGE'],
  },
  {
    name: 'Cage',
    code: 'CAGE',
    category: 'SubSite',
    description: 'Área segmentada dentro de sala técnica.',
    allowedParentCodes: ['ROOM'],
    allowedChildCodes: [],
  },
];

const BOOTSTRAP_RELATIONSHIP_TYPES: RelationshipTypeInput[] = [
  {
    code: 'feeds',
    name: 'Feeds',
    inverseCode: 'fedBy',
    allowedSourceCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
    allowedTargetCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
  },
  {
    code: 'fedBy',
    name: 'Fed by',
    inverseCode: 'feeds',
    allowedSourceCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
    allowedTargetCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
  },
  {
    code: 'peersWith',
    name: 'Peers with',
    inverseCode: 'peersWith',
    symmetric: true,
    allowedSourceCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
    allowedTargetCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
  },
  {
    code: 'memberOf',
    name: 'Member of',
    inverseCode: 'contains',
    allowedSourceCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
    allowedTargetCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
  },
  {
    code: 'contains',
    name: 'Contains',
    inverseCode: 'memberOf',
    allowedSourceCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
    allowedTargetCategories: ['Region', 'FunctionalGroup', 'Site', 'SubSite'],
  },
];

const sameStringSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && new Set(left).size === new Set([...left, ...right]).size;

const matchesBootstrapSpecification = (
  existing: GeographicSiteSpecification,
  definition: BootstrapDefinition,
): boolean =>
  existing.name === definition.name &&
  existing.code === definition.code &&
  existing.description === definition.description &&
  existing.category === definition.category &&
  existing.lifecycleStatus === 'Active' &&
  existing._bootstrapProtected === true;

const matchesBootstrapRelationshipType = (
  existing: GeographicRelationshipType,
  definition: RelationshipTypeInput,
): boolean => {
  const inverseCode = definition.inverseCode ?? definition.code;
  const cardinality = definition.cardinality;
  return (
    existing.name === (definition.name ?? definition.code) &&
    existing.inverseCode === inverseCode &&
    existing.symmetric === (definition.symmetric ?? definition.code === inverseCode) &&
    sameStringSet(existing.allowedSourceCategories, definition.allowedSourceCategories ?? []) &&
    sameStringSet(existing.allowedTargetCategories, definition.allowedTargetCategories ?? []) &&
    existing.cardinality?.maxSourcePerTarget === cardinality?.maxSourcePerTarget &&
    existing.cardinality?.maxTargetPerSource === cardinality?.maxTargetPerSource &&
    existing.lifecycleStatus === (definition.lifecycleStatus ?? 'Active') &&
    existing._bootstrapProtected === true
  );
};

const DEFAULT_CONTEXT: RequestContext = {
  actorSub: 'system',
  tenantId: 'default',
  roles: [...GEO_ADMIN_ROLES],
  traceId: 'system',
};

const READ_ROLE = 'inventory.reader';
const WRITE_ROLE = 'inventory.editor';
const CATALOG_ROLE = 'catalog.admin';
const PLATFORM_ROLE = 'platform.admin';
const MIGRATION_ROLE = 'migration.job';

const BULK_MODES: GeoBulkMode[] = ['validateOnly', 'atomic', 'bestEffort'];
const BULK_MAX_ITEMS = 1000;

const SITE_STATUS_TRANSITIONS: Record<GeoSiteStatus, GeoSiteStatus[]> = {
  Planned: ['InConstruction', 'Active', 'Retired'],
  InConstruction: ['Active', 'InDeactivation', 'Retired'],
  Active: ['InDeactivation', 'Retired'],
  InDeactivation: ['Active', 'Retired'],
  Retired: ['Active'],
};

export class GeoService {
  public constructor(private readonly repository: IGeoRepository) {}

  public async ensureBootstrapSpecifications(context?: RequestContext): Promise<{
    created: number;
    updated: number;
    specs: GeographicSiteSpecification[];
  }> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, CATALOG_ROLE);
    return await this.repository.transaction(async () => {
      let created = 0;
      let updated = 0;
      const existingSpecs = await this.repository.listSpecs();
      const codeToSpec = new Map(
        existingSpecs.map((spec) => [spec.code.toUpperCase(), spec] as const),
      );

      for (const definition of BOOTSTRAP_SPECIFICATIONS) {
        const existing = codeToSpec.get(definition.code);
        if (!existing) {
          created += 1;
          const createdSpec = await this.repository.upsertSpec(
            this.buildSpecRecord({
              id: createCanonicalId(),
              name: definition.name,
              code: definition.code,
              description: definition.description,
              category: definition.category,
              lifecycleStatus: 'Active',
              validFor: {},
              specCharacteristic: [],
              allowedParentSpecIds: [],
              allowedChildSpecIds: [],
              bootstrapProtected: true,
            }),
          );
          codeToSpec.set(definition.code, createdSpec);
          continue;
        }

        if (!matchesBootstrapSpecification(existing, definition)) {
          updated += 1;
          const updatedSpec = await this.repository.upsertSpec(
            this.buildSpecRecord({
              id: existing.id,
              name: definition.name,
              code: definition.code,
              description: definition.description,
              category: definition.category,
              lifecycleStatus: 'Active',
              ...(existing.validFor ? { validFor: existing.validFor } : {}),
              specCharacteristic: existing.specCharacteristic,
              allowedParentSpecIds: existing.allowedParentSpecIds,
              allowedChildSpecIds: existing.allowedChildSpecIds,
              bootstrapProtected: true,
            }),
          );
          codeToSpec.set(definition.code, updatedSpec);
        }
      }

      for (const definition of BOOTSTRAP_SPECIFICATIONS) {
        const spec = codeToSpec.get(definition.code);
        if (!spec) continue;
        const resolveSpecIds = (codes: readonly string[]): string[] =>
          codes
            .map((code) => codeToSpec.get(code)?.id)
            .filter((value): value is string => Boolean(value));
        const allowedParentSpecIds = resolveSpecIds(definition.allowedParentCodes);
        const allowedChildSpecIds = resolveSpecIds(definition.allowedChildCodes);
        if (
          sameStringSet(spec.allowedParentSpecIds, allowedParentSpecIds) &&
          sameStringSet(spec.allowedChildSpecIds, allowedChildSpecIds) &&
          sameStringSet(spec._protectedAllowedParentSpecIds ?? [], allowedParentSpecIds) &&
          sameStringSet(spec._protectedAllowedChildSpecIds ?? [], allowedChildSpecIds)
        ) {
          continue;
        }
        await this.repository.syncSpecContainmentRules(spec.id, {
          allowedParentSpecIds,
          allowedChildSpecIds,
          protectedParentSpecIds: allowedParentSpecIds,
          protectedChildSpecIds: allowedChildSpecIds,
        });
        const updatedSpec = await this.repository.upsertSpec({
          ...spec,
          allowedParentSpecIds,
          allowedChildSpecIds,
          _bootstrapProtected: true,
          _protectedAllowedParentSpecIds: allowedParentSpecIds,
          _protectedAllowedChildSpecIds: allowedChildSpecIds,
        });
        codeToSpec.set(definition.code, updatedSpec);
      }

      return {
        created,
        updated,
        specs: await this.listSpecs(),
      };
    });
  }

  public async createLocation(
    input: LocationInput,
    context?: RequestContext,
  ): Promise<GeographicLocation> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    this.assertOriginWriteAllowed(ctx, input.characteristic ?? []);
    validateGeometry(input.geometryType, input.geometry);
    const id = createCanonicalId();
    return await this.repository.transaction(async () => {
      const location = await this.repository.upsertLocation({
        '@type': 'GeographicLocation',
        id,
        href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${id}`,
        tenantId: ctx.tenantId,
        geometryType: input.geometryType,
        geometry: input.geometry,
        spatialRef: input.spatialRef ?? 'EPSG:4326',
        ...(input.accuracy ? { accuracy: input.accuracy } : {}),
        ...(input.referencePoint ? { referencePoint: input.referencePoint } : {}),
        ...(input.validFor ? { validFor: input.validFor } : {}),
        characteristic: input.characteristic ?? [],
      });
      await this.recordMutation(
        ctx,
        'create',
        'GeographicLocation',
        location.id,
        null,
        location,
        'GeographicLocationCreateEvent',
      );
      return location;
    });
  }

  public async updateLocation(
    id: string,
    input: Partial<LocationInput>,
    context?: RequestContext,
  ): Promise<GeographicLocation> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    this.assertOriginWriteAllowed(ctx, input.characteristic);
    const current = await this.getLocationOrThrow(id, ctx);
    const geometryType = input.geometryType ?? current.geometryType;
    const geometry = input.geometry ?? current.geometry;
    validateGeometry(geometryType, geometry);

    return await this.repository.transaction(async () => {
      const updated = await this.repository.upsertLocation({
        ...current,
        tenantId: current.tenantId ?? ctx.tenantId,
        geometryType,
        geometry,
        spatialRef: input.spatialRef ?? current.spatialRef,
        ...(input.accuracy !== undefined
          ? optional('accuracy', input.accuracy)
          : optional('accuracy', current.accuracy)),
        ...(input.referencePoint !== undefined
          ? optional('referencePoint', input.referencePoint)
          : optional('referencePoint', current.referencePoint)),
        ...(input.validFor !== undefined
          ? optional('validFor', input.validFor)
          : optional('validFor', current.validFor)),
        characteristic: input.characteristic ?? current.characteristic,
      });
      await this.recordMutation(
        ctx,
        'update',
        'GeographicLocation',
        updated.id,
        current,
        updated,
        'GeographicLocationAttributeValueChangeEvent',
      );
      return updated;
    });
  }

  public async createAddress(
    input: AddressInput,
    context?: RequestContext,
  ): Promise<GeographicAddress> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    this.assertOriginWriteAllowed(ctx, input.characteristic ?? []);
    assertRequiredString(input.street, 'street');
    const id = createCanonicalId();
    const location = input.geographicLocationId
      ? await this.getLocationOrThrow(input.geographicLocationId, ctx)
      : undefined;
    const normalizedCountry = normalizeCountry(input.country);
    const normalizedPostcode = normalizePostcode(input.postcode, normalizedCountry);
    return await this.repository.transaction(async () => {
      const address = await this.repository.upsertAddress({
        '@type': 'GeographicAddress',
        id,
        href: `/tmf-api/geographicAddressManagement/v4/geographicAddress/${id}`,
        tenantId: ctx.tenantId,
        street: input.street,
        ...(input.streetNr ? { streetNr: input.streetNr } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.stateOrProvince ? { stateOrProvince: input.stateOrProvince } : {}),
        ...(normalizedPostcode ? { postcode: normalizedPostcode } : {}),
        ...(normalizedCountry ? { country: normalizedCountry } : {}),
        ...(location ? { geographicLocationId: location.id } : {}),
        ...(location
          ? { place: { id: location.id, '@referredType': 'GeographicLocation' as const } }
          : {}),
        ...(input.validFor ? { validFor: input.validFor } : {}),
        characteristic: input.characteristic ?? [],
      });
      await this.recordMutation(
        ctx,
        'create',
        'GeographicAddress',
        address.id,
        null,
        address,
        'GeographicAddressCreateEvent',
      );
      return address;
    });
  }

  public async updateAddress(
    id: string,
    input: Partial<AddressInput>,
    context?: RequestContext,
  ): Promise<GeographicAddress> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    this.assertOriginWriteAllowed(ctx, input.characteristic);
    const current = await this.getAddressOrThrow(id, ctx);
    const locationId = input.geographicLocationId ?? current.geographicLocationId;
    const location = locationId ? await this.getLocationOrThrow(locationId, ctx) : undefined;
    if (input.street !== undefined) assertRequiredString(input.street, 'street');
    const normalizedCountry =
      input.country !== undefined ? normalizeCountry(input.country) : current.country;
    const normalizedPostcode =
      input.postcode !== undefined
        ? normalizePostcode(input.postcode, normalizedCountry)
        : current.postcode;

    return await this.repository.transaction(async () => {
      const updated = await this.repository.upsertAddress({
        ...current,
        tenantId: current.tenantId ?? ctx.tenantId,
        street: input.street ?? current.street,
        ...(input.streetNr !== undefined
          ? optional('streetNr', input.streetNr)
          : optional('streetNr', current.streetNr)),
        ...(input.city !== undefined
          ? optional('city', input.city)
          : optional('city', current.city)),
        ...(input.stateOrProvince !== undefined
          ? optional('stateOrProvince', input.stateOrProvince)
          : optional('stateOrProvince', current.stateOrProvince)),
        ...(input.postcode !== undefined
          ? optional('postcode', normalizedPostcode)
          : optional('postcode', current.postcode)),
        ...(input.country !== undefined
          ? optional('country', normalizedCountry)
          : optional('country', current.country)),
        ...(location
          ? {
              geographicLocationId: location.id,
              place: { id: location.id, '@referredType': 'GeographicLocation' as const },
            }
          : {}),
        ...(input.validFor !== undefined
          ? optional('validFor', input.validFor)
          : optional('validFor', current.validFor)),
        characteristic: input.characteristic ?? current.characteristic,
      });
      await this.recordMutation(
        ctx,
        'update',
        'GeographicAddress',
        updated.id,
        current,
        updated,
        'GeographicAddressAttributeValueChangeEvent',
      );
      return updated;
    });
  }

  public async createSpec(
    input: SpecInput,
    context?: RequestContext,
  ): Promise<GeographicSiteSpecification> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, CATALOG_ROLE);
    assertRequiredString(input.name, 'name');
    validateSpecCategory(input.category);

    const code = normalizeSpecificationCode(input.code ?? input.name);
    if (await this.repository.getSpecByCode(code)) {
      throw new AppError('site specification code already exists', {
        code: 'GEO_SPEC_CODE_DUPLICATE',
        statusCode: 409,
      });
    }

    const allowedParentSpecIds = resolveSpecIdList(
      input.allowedParentSpec,
      input.allowedParentSpecIds,
    );
    const allowedChildSpecIds = resolveSpecIdList(
      input.allowedChildSpec,
      input.allowedChildSpecIds,
    );
    await validateReferencedSpecs(allowedParentSpecIds, this.getSpecOrThrow.bind(this));
    await validateReferencedSpecs(allowedChildSpecIds, this.getSpecOrThrow.bind(this));

    const id = createCanonicalId();
    const characteristics = normalizeSpecCharacteristics(input.specCharacteristic ?? []);
    return await this.repository.transaction(async () => {
      const spec = await this.repository.upsertSpec(
        this.buildSpecRecord({
          id,
          name: input.name,
          code,
          ...(input.description !== undefined ? { description: input.description } : {}),
          category: input.category,
          lifecycleStatus: input.lifecycleStatus ?? 'Active',
          ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
          specCharacteristic: characteristics,
          allowedParentSpecIds,
          allowedChildSpecIds,
        }),
      );
      await this.repository.syncSpecContainmentRules(spec.id, {
        allowedParentSpecIds,
        allowedChildSpecIds,
      });
      const stored = await this.getSpecOrThrow(spec.id);
      await this.recordMutation(
        ctx,
        'create',
        'GeographicSiteSpecification',
        stored.id,
        null,
        stored,
        'GeographicSiteSpecificationCreateEvent',
      );
      return stored;
    });
  }

  public async updateSpec(
    id: string,
    input: Partial<SpecInput>,
    context?: RequestContext,
  ): Promise<GeographicSiteSpecification> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, CATALOG_ROLE);
    const current = await this.getSpecOrThrow(id);
    if (input.name !== undefined) assertRequiredString(input.name, 'name');
    if (input.category !== undefined && input.category !== current.category) {
      throw new AppError('site specification category is immutable', {
        code: 'GEO_SPEC_CATEGORY_IMMUTABLE',
        statusCode: 409,
      });
    }
    if (input.code !== undefined && normalizeSpecificationCode(input.code) !== current.code) {
      throw new AppError('site specification code is immutable', {
        code: 'GEO_SPEC_CODE_IMMUTABLE',
        statusCode: 409,
      });
    }

    const nextAllowedParentSpecIds = resolveSpecIdList(
      input.allowedParentSpec,
      input.allowedParentSpecIds,
      current.allowedParentSpecIds,
    );
    const nextAllowedChildSpecIds = resolveSpecIdList(
      input.allowedChildSpec,
      input.allowedChildSpecIds,
      current.allowedChildSpecIds,
    );
    await validateReferencedSpecs(
      nextAllowedParentSpecIds,
      this.getSpecOrThrow.bind(this),
      current.id,
    );
    await validateReferencedSpecs(
      nextAllowedChildSpecIds,
      this.getSpecOrThrow.bind(this),
      current.id,
    );

    const impact = await this.analyzeContainmentImpact(id, {
      allowedParentSpecIds: nextAllowedParentSpecIds,
      allowedChildSpecIds: nextAllowedChildSpecIds,
    });
    if (impact.blocking) {
      throw new AppError('containment rule change has impacted sites', {
        code: 'GEO_SPEC_CONTAINMENT_IMPACT',
        statusCode: 409,
      });
    }

    const protectedParentSpecIds = new Set(current._protectedAllowedParentSpecIds ?? []);
    const protectedChildSpecIds = new Set(current._protectedAllowedChildSpecIds ?? []);
    for (const protectedSpecId of protectedParentSpecIds) {
      if (!nextAllowedParentSpecIds.includes(protectedSpecId)) {
        throw new AppError('protected parent containment rule cannot be removed', {
          code: 'GEO_SPEC_CONTAINMENT_PROTECTED',
          statusCode: 409,
        });
      }
    }
    for (const protectedSpecId of protectedChildSpecIds) {
      if (!nextAllowedChildSpecIds.includes(protectedSpecId)) {
        throw new AppError('protected child containment rule cannot be removed', {
          code: 'GEO_SPEC_CONTAINMENT_PROTECTED',
          statusCode: 409,
        });
      }
    }

    const nextLifecycleStatus = input.lifecycleStatus ?? current.lifecycleStatus;
    if (current._bootstrapProtected && nextLifecycleStatus === 'Retired') {
      throw new AppError('bootstrap specification cannot be retired', {
        code: 'GEO_SPEC_BOOTSTRAP_PROTECTED',
        statusCode: 409,
      });
    }

    const nextCharacteristics = normalizeSpecCharacteristics(
      input.specCharacteristic ?? current.specCharacteristic,
    );
    await this.validateSpecificationChangeAgainstSites(current, nextCharacteristics);

    return await this.repository.transaction(async () => {
      const updated = await this.repository.upsertSpec(
        this.buildSpecRecord({
          id: current.id,
          name: input.name ?? current.name,
          code: current.code,
          ...(input.description !== undefined
            ? { description: input.description }
            : current.description !== undefined
              ? { description: current.description }
              : {}),
          category: current.category,
          lifecycleStatus: nextLifecycleStatus,
          ...(input.validFor !== undefined
            ? { validFor: input.validFor }
            : current.validFor !== undefined
              ? { validFor: current.validFor }
              : {}),
          specCharacteristic: nextCharacteristics,
          allowedParentSpecIds: nextAllowedParentSpecIds,
          allowedChildSpecIds: nextAllowedChildSpecIds,
          ...(current._bootstrapProtected !== undefined
            ? { bootstrapProtected: current._bootstrapProtected }
            : {}),
        }),
      );
      await this.repository.syncSpecContainmentRules(updated.id, {
        allowedParentSpecIds: nextAllowedParentSpecIds,
        allowedChildSpecIds: nextAllowedChildSpecIds,
        ...(current._protectedAllowedParentSpecIds
          ? { protectedParentSpecIds: current._protectedAllowedParentSpecIds }
          : {}),
        ...(current._protectedAllowedChildSpecIds
          ? { protectedChildSpecIds: current._protectedAllowedChildSpecIds }
          : {}),
      });
      const stored = await this.getSpecOrThrow(updated.id);
      await this.recordMutation(
        ctx,
        'update',
        'GeographicSiteSpecification',
        stored.id,
        current,
        stored,
        current.lifecycleStatus !== stored.lifecycleStatus
          ? 'GeographicSiteSpecificationStatusChangeEvent'
          : 'GeographicSiteSpecificationAttributeValueChangeEvent',
      );
      return stored;
    });
  }

  public async retireSpec(
    id: string,
    context?: RequestContext,
  ): Promise<GeographicSiteSpecification> {
    const spec = await this.getSpecOrThrow(id);
    if (spec._bootstrapProtected) {
      throw new AppError('bootstrap specification cannot be retired', {
        code: 'GEO_SPEC_BOOTSTRAP_PROTECTED',
        statusCode: 409,
      });
    }

    const retired = await this.updateSpec(
      id,
      {
        lifecycleStatus: 'Retired',
        validFor: {
          ...(spec.validFor?.startDateTime ? { startDateTime: spec.validFor.startDateTime } : {}),
          endDateTime: spec.validFor?.endDateTime ?? new Date().toISOString(),
        },
      },
      context,
    );
    return retired;
  }

  public async getAllowedChildren(specId: string): Promise<GeographicSiteSpecificationRef[]> {
    const spec = await this.getSpecOrThrow(specId);
    return spec.allowedChildSpec.filter(
      async (child) => (await this.getSpecOrThrow(child.id)).lifecycleStatus === 'Active',
    );
  }

  public async analyzeContainmentImpact(
    specId: string,
    input: {
      allowedParentSpec?: SpecRefInput[];
      allowedChildSpec?: SpecRefInput[];
      allowedParentSpecIds?: string[];
      allowedChildSpecIds?: string[];
    },
  ): Promise<ContainmentImpact> {
    const current = await this.getSpecOrThrow(specId);
    const nextAllowedParentSpecIds = resolveSpecIdList(
      input.allowedParentSpec,
      input.allowedParentSpecIds,
      current.allowedParentSpecIds,
    );
    const nextAllowedChildSpecIds = resolveSpecIdList(
      input.allowedChildSpec,
      input.allowedChildSpecIds,
      current.allowedChildSpecIds,
    );

    const removedAllowedParentSpecIds = current.allowedParentSpecIds.filter(
      (item) => !nextAllowedParentSpecIds.includes(item),
    );
    const removedAllowedChildSpecIds = current.allowedChildSpecIds.filter(
      (item) => !nextAllowedChildSpecIds.includes(item),
    );

    const sitesOfSpec = await this.repository.listSites({ siteSpecificationId: specId });
    const impactedSiteIds = new Set<string>();
    let impactedParentAssignments = 0;
    let impactedChildAssignments = 0;

    for (const site of sitesOfSpec) {
      const parentSpecId = site.parentSite
        ? (await this.getSiteOrThrow(site.parentSite.id)).siteSpecificationId
        : undefined;
      if (parentSpecId && removedAllowedParentSpecIds.includes(parentSpecId)) {
        impactedParentAssignments += 1;
        impactedSiteIds.add(site.id);
      }
    }

    if (removedAllowedChildSpecIds.length > 0) {
      const children = await this.repository.listSites();
      for (const childSite of children) {
        if (
          childSite.parentSite?.id &&
          removedAllowedChildSpecIds.includes(childSite.siteSpecificationId)
        ) {
          const parentSite = await this.getSiteOrThrow(childSite.parentSite.id);
          if (parentSite.siteSpecificationId === specId) {
            impactedChildAssignments += 1;
            impactedSiteIds.add(parentSite.id);
            impactedSiteIds.add(childSite.id);
          }
        }
      }
    }

    return {
      specId,
      removedAllowedParentSpecIds,
      removedAllowedChildSpecIds,
      impactedParentAssignments,
      impactedChildAssignments,
      impactedSiteIds: [...impactedSiteIds].sort(),
      blocking: impactedParentAssignments + impactedChildAssignments > 0,
    };
  }

  public async createSite(input: SiteInput, context?: RequestContext): Promise<GeographicSite> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    this.assertOriginWriteAllowed(ctx, input.characteristic ?? []);
    assertRequiredString(input.name, 'name');
    const status = normalizeSiteStatus(input.status ?? 'Planned');
    validateStatus(status);

    const spec = await this.getSpecOrThrow(input.siteSpecificationId);
    ensureSpecificationActive(spec);

    const parentSite = input.parentSiteId
      ? await this.getSiteOrThrow(input.parentSiteId, ctx)
      : undefined;
    if (spec.category === 'SubSite' && !parentSite) {
      throw new AppError('sub-site requires parent site', {
        code: 'GEO_SUBSITE_PARENT_REQUIRED',
        statusCode: 409,
      });
    }
    if (parentSite) {
      await this.assertNoParentCycle(undefined, parentSite.id);
      await this.validateContainment(spec, parentSite);
      this.validateStatusCompatibleWithAncestors(status, parentSite);
    }
    await this.assertSiteNameAvailable(input.name, spec, parentSite?.id, undefined, ctx);

    const characteristic = this.normalizeSiteCharacteristics(spec, input.characteristic ?? []);
    const place = input.placeId ? await this.getLocationOrThrow(input.placeId, ctx) : undefined;
    const address = input.addressId
      ? await this.getAddressOrThrow(input.addressId, ctx)
      : undefined;
    const siteAddress = this.normalizeSiteAddresses(input.siteAddress, address);
    const id = createCanonicalId();
    return await this.repository.transaction(async () => {
      const site = await this.repository.upsertSite({
        '@type': 'GeographicSite',
        id,
        href: `/tmf-api/geographicSiteManagement/v4/geographicSite/${id}`,
        tenantId: ctx.tenantId,
        name: input.name,
        status,
        statusDate: input.statusDate ?? new Date().toISOString(),
        siteSpecificationId: spec.id,
        siteSpecification: { id: spec.id, '@referredType': 'GeographicSiteSpecification' },
        ...(place
          ? { place: { id: place.id, '@referredType': 'GeographicLocation' as const } }
          : {}),
        ...(address
          ? { address: { id: address.id, '@referredType': 'GeographicAddress' as const } }
          : {}),
        ...(siteAddress.length > 0 ? { siteAddress } : {}),
        ...(parentSite
          ? { parentSite: { id: parentSite.id, '@referredType': 'GeographicSite' as const } }
          : {}),
        relatedSite: [],
        relatedParty: normalizeSiteRelatedParty(input.relatedParty, ctx),
        characteristic,
      });
      await this.repository.appendSiteStatusHistory({
        '@type': 'GeographicSiteStatusHistoryEntry',
        id: createCanonicalId(),
        siteId: site.id,
        tenantId: ctx.tenantId,
        toStatus: status,
        statusDate: site.statusDate as string,
        actorSub: ctx.actorSub,
        traceId: ctx.traceId,
      });
      for (const relationship of input.relatedSite ?? []) {
        await this.addSiteRelationship(
          site.id,
          relationship.id,
          relationship.relationshipType,
          relationship.validFor,
          ctx,
        );
      }

      const stored = await this.getSiteOrThrow(site.id, ctx);
      await this.recordMutation(
        ctx,
        'create',
        'GeographicSite',
        stored.id,
        null,
        stored,
        'GeographicSiteCreateEvent',
      );
      return stored;
    });
  }

  public async updateSite(
    id: string,
    input: Partial<SiteInput>,
    context?: RequestContext,
  ): Promise<GeographicSite> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    this.assertOriginWriteAllowed(ctx, input.characteristic);
    const current = await this.getSiteOrThrow(id, ctx);
    if (input.name !== undefined) assertRequiredString(input.name, 'name');

    const status = input.status !== undefined ? normalizeSiteStatus(input.status) : current.status;
    validateStatus(status);
    const spec = input.siteSpecificationId
      ? await this.getSpecOrThrow(input.siteSpecificationId)
      : await this.getSpecOrThrow(current.siteSpecificationId);
    ensureSpecificationActive(spec);

    const parentSiteId =
      input.parentSiteId !== undefined ? input.parentSiteId : current.parentSite?.id;
    const parentSite = parentSiteId ? await this.getSiteOrThrow(parentSiteId, ctx) : undefined;
    if (parentSite?.id === id) {
      throw new AppError('site cannot be its own parent', {
        code: 'GEO_PARENT_SELF_REFERENCE',
        statusCode: 409,
      });
    }
    if (parentSite) {
      await this.assertNoParentCycle(id, parentSite.id);
      await this.validateContainment(spec, parentSite);
      this.validateStatusCompatibleWithAncestors(status, parentSite);
    }
    if (current.status !== status) {
      this.validateStatusTransition(current.status, status, input.statusReason, ctx);
    }
    if (spec.category === 'SubSite' && !parentSite) {
      throw new AppError('sub-site requires parent site', {
        code: 'GEO_SUBSITE_PARENT_REQUIRED',
        statusCode: 409,
      });
    }
    if (current.parentSite?.id !== parentSite?.id) {
      await this.assertSubSiteMoveAllowed(current, parentSite, ctx);
    }
    await this.assertSiteNameAvailable(
      input.name ?? current.name,
      spec,
      parentSite?.id,
      current.id,
      ctx,
    );

    const placeId = input.placeId !== undefined ? input.placeId : current.place?.id;
    const place = placeId ? await this.getLocationOrThrow(placeId, ctx) : undefined;
    const addressId = input.addressId !== undefined ? input.addressId : current.address?.id;
    const address = addressId ? await this.getAddressOrThrow(addressId, ctx) : undefined;
    const siteAddress = this.normalizeSiteAddresses(
      input.siteAddress,
      address,
      current.siteAddress,
    );
    const characteristic = this.normalizeSiteCharacteristics(
      spec,
      input.characteristic ?? current.characteristic,
    );

    return await this.repository.transaction(async () => {
      const statusDate =
        current.status !== status
          ? (input.statusDate ?? new Date().toISOString())
          : current.statusDate;
      const updated = await this.repository.upsertSite({
        ...current,
        tenantId: current.tenantId ?? ctx.tenantId,
        name: input.name ?? current.name,
        status,
        ...(statusDate ? { statusDate } : {}),
        ...(input.statusReason
          ? { statusReason: input.statusReason }
          : optional('statusReason', current.statusReason)),
        siteSpecificationId: spec.id,
        siteSpecification: { id: spec.id, '@referredType': 'GeographicSiteSpecification' },
        ...(place
          ? { place: { id: place.id, '@referredType': 'GeographicLocation' as const } }
          : {}),
        ...(address
          ? { address: { id: address.id, '@referredType': 'GeographicAddress' as const } }
          : {}),
        ...(siteAddress.length > 0 ? { siteAddress } : {}),
        ...(parentSite
          ? { parentSite: { id: parentSite.id, '@referredType': 'GeographicSite' as const } }
          : {}),
        relatedParty: input.relatedParty
          ? normalizeSiteRelatedParty(input.relatedParty, ctx)
          : current.relatedParty,
        characteristic,
        relatedSite: current.relatedSite,
      });
      if (current.status !== updated.status) {
        await this.repository.appendSiteStatusHistory({
          '@type': 'GeographicSiteStatusHistoryEntry',
          id: createCanonicalId(),
          siteId: updated.id,
          tenantId: ctx.tenantId,
          fromStatus: current.status,
          toStatus: updated.status,
          statusDate: updated.statusDate ?? new Date().toISOString(),
          ...(input.statusReason ? { statusReason: input.statusReason } : {}),
          actorSub: ctx.actorSub,
          traceId: ctx.traceId,
        });
      }

      await this.recordMutation(
        ctx,
        current.status !== updated.status ? 'transition' : 'update',
        'GeographicSite',
        updated.id,
        current,
        updated,
        current.status !== updated.status
          ? 'GeographicSiteStatusChangeEvent'
          : 'GeographicSiteAttributeValueChangeEvent',
      );
      return updated;
    });
  }

  public async transitionSite(
    id: string,
    input: SiteTransitionInput,
    context?: RequestContext,
  ): Promise<GeographicSite> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    const current = await this.getSiteOrThrow(id, ctx);
    const toStatus = normalizeSiteStatus(input.status);
    validateStatus(toStatus);
    this.validateStatusTransition(current.status, toStatus, input.statusReason, ctx);

    const references = await this.repository.getSiteReferences(current.id, {
      tenantId: ctx.tenantId,
    });
    if ((toStatus === 'InDeactivation' || toStatus === 'Retired') && references.blocking) {
      throw new AppError('site has active dependencies', {
        code: 'GEO_SITE_DEACTIVATION_BLOCKED',
        statusCode: 409,
      });
    }

    const parentSite = current.parentSite
      ? await this.getSiteOrThrow(current.parentSite.id, ctx)
      : undefined;
    if (parentSite) this.validateStatusCompatibleWithAncestors(toStatus, parentSite);

    return await this.repository.transaction(async () => {
      const statusDate = input.statusDate ?? new Date().toISOString();
      const updated = await this.repository.upsertSite({
        ...current,
        status: toStatus,
        statusDate,
        ...(input.statusReason
          ? { statusReason: input.statusReason }
          : optional('statusReason', current.statusReason)),
      });
      await this.repository.appendSiteStatusHistory({
        '@type': 'GeographicSiteStatusHistoryEntry',
        id: createCanonicalId(),
        siteId: updated.id,
        tenantId: ctx.tenantId,
        fromStatus: current.status,
        toStatus,
        statusDate,
        ...(input.statusReason ? { statusReason: input.statusReason } : {}),
        actorSub: ctx.actorSub,
        traceId: ctx.traceId,
      });
      await this.recordMutation(
        ctx,
        'transition',
        'GeographicSite',
        updated.id,
        current,
        updated,
        'GeographicSiteStatusChangeEvent',
      );
      return updated;
    });
  }

  public async createSiteAtAddress(
    input: SiteAtAddressInput,
    context?: RequestContext,
  ): Promise<{ location: GeographicLocation; address: GeographicAddress; site: GeographicSite }> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    return await this.repository.transaction(async () => {
      const location = await this.createLocation(input.location, ctx);
      const address = await this.createAddress(
        {
          ...input.address,
          geographicLocationId: location.id,
        },
        ctx,
      );
      const site = await this.createSite(
        {
          ...input.site,
          placeId: location.id,
          addressId: address.id,
        },
        ctx,
      );

      if (input.fedBySiteId) {
        await this.addSiteRelationship(
          site.id,
          input.fedBySiteId,
          input.fedByRelationshipType ?? 'fedBy',
          undefined,
          ctx,
        );
      }

      return {
        location,
        address,
        site: await this.getSiteOrThrow(site.id),
      };
    });
  }

  public async submitAddressBulk(
    input: GeoBulkInput<AddressInput>,
    idempotencyKey: string | undefined,
    context?: RequestContext,
  ): Promise<GeoBulkSubmission> {
    const ctx = this.resolveContext(context);
    return await this.executeBulk(
      'Address',
      input,
      idempotencyKey,
      ctx,
      async (item) => await this.prepareAddressBulkItem(item, ctx),
      async (item) => await this.createAddress(item, ctx),
    );
  }

  public async submitSiteBulk(
    input: GeoBulkInput<SiteInput>,
    idempotencyKey: string | undefined,
    context?: RequestContext,
  ): Promise<GeoBulkSubmission> {
    const ctx = this.resolveContext(context);
    return await this.executeBulk(
      'Site',
      input,
      idempotencyKey,
      ctx,
      async (item) => await this.prepareSiteBulkItem(item, ctx),
      async (item) => await this.createSite(item, ctx),
    );
  }

  public async getBulkJob(
    jobId: string,
    context?: RequestContext,
  ): Promise<GeoBulkJob | undefined> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.getBulkJob(jobId, { tenantId: ctx.tenantId });
  }

  public async listBulkJobResults(
    jobId: string,
    query?: { limit?: number; offset?: number },
    context?: RequestContext,
  ): Promise<GeoBulkJobResult[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    const job = await this.repository.getBulkJob(jobId, { tenantId: ctx.tenantId });
    if (!job) {
      throw new AppError('bulk job not found', {
        code: 'GEO_BULK_JOB_NOT_FOUND',
        statusCode: 404,
      });
    }
    return await this.repository.listBulkJobResults(jobId, { ...query, tenantId: ctx.tenantId });
  }

  public async addSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    validFor?: TimePeriod,
    context?: RequestContext,
  ): Promise<GeographicSiteRelationship> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    const normalizedType = normalizeRelationshipCode(relationshipType);
    assertRequiredString(normalizedType, 'relationshipType');
    if (siteId === relatedSiteId) {
      throw new AppError('site relationship cannot reference itself', {
        code: 'GEO_SITE_RELATIONSHIP_SELF_REFERENCE',
        statusCode: 409,
      });
    }
    const site = await this.getSiteOrThrow(siteId, ctx);
    const relatedSite = await this.getSiteOrThrow(relatedSiteId, ctx);
    const relationshipTypeRecord = await this.getRelationshipTypeOrThrow(normalizedType);
    if (relationshipTypeRecord.lifecycleStatus !== 'Active') {
      throw new AppError('relationship type is retired', {
        code: 'GEO_RELATIONSHIP_TYPE_RETIRED',
        statusCode: 409,
      });
    }
    await this.validateRelationshipCategories(site, relatedSite, relationshipTypeRecord);

    return await this.repository.transaction(async () => {
      const relationship = await this.repository.upsertSiteRelationship(siteId, {
        id: relatedSiteId,
        relationshipType: relationshipTypeRecord.code,
        '@referredType': 'GeographicSite',
        ...(validFor ? { validFor } : {}),
      });
      const inverse = await this.getRelationshipTypeOrThrow(relationshipTypeRecord.inverseCode);
      await this.repository.upsertSiteRelationship(relatedSiteId, {
        id: siteId,
        relationshipType: inverse.code,
        '@referredType': 'GeographicSite',
        ...(validFor ? { validFor } : {}),
      });
      await this.recordMutation(
        ctx,
        'createRelationship',
        'GeographicSite',
        siteId,
        site,
        await this.getSiteOrThrow(siteId, ctx),
        'GeographicSiteRelationshipCreateEvent',
        {
          siteId,
          relationship,
        },
      );
      return relationship;
    });
  }

  public async removeSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    context?: RequestContext,
  ): Promise<boolean> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    const normalizedType = normalizeRelationshipCode(relationshipType);
    const current = await this.getSiteOrThrow(siteId, ctx);
    await this.getSiteOrThrow(relatedSiteId, ctx);
    const type = await this.getRelationshipTypeOrThrow(normalizedType);
    const endedAt = new Date().toISOString();
    return await this.repository.transaction(async () => {
      const removed = await this.repository.endSiteRelationship(
        siteId,
        relatedSiteId,
        type.code,
        endedAt,
      );
      await this.repository.endSiteRelationship(relatedSiteId, siteId, type.inverseCode, endedAt);
      if (removed) {
        await this.recordMutation(
          ctx,
          'endRelationship',
          'GeographicSite',
          siteId,
          current,
          await this.getSiteOrThrow(siteId, ctx),
          'GeographicSiteRelationshipDeleteEvent',
          {
            siteId,
            relatedSiteId,
            relationshipType: type.code,
          },
        );
      }
      return removed;
    });
  }

  public async ensureBootstrapRelationshipTypes(context?: RequestContext): Promise<{
    created: number;
    updated: number;
    relationshipTypes: GeographicRelationshipType[];
  }> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, CATALOG_ROLE);
    return await this.repository.transaction(async () => {
      let created = 0;
      let updated = 0;
      const existingByCode = new Map(
        (await this.repository.listRelationshipTypes()).map(
          (relationshipType) => [relationshipType.code, relationshipType] as const,
        ),
      );
      for (const definition of BOOTSTRAP_RELATIONSHIP_TYPES) {
        const existing = existingByCode.get(definition.code);
        if (existing && matchesBootstrapRelationshipType(existing, definition)) continue;
        if (existing) updated += 1;
        else created += 1;
        const stored = await this.repository.upsertRelationshipType(
          this.buildRelationshipTypeRecord({
            id: existing?.id ?? createCanonicalId(),
            code: definition.code,
            name: definition.name ?? definition.code,
            inverseCode: definition.inverseCode ?? definition.code,
            symmetric: definition.symmetric ?? definition.code === definition.inverseCode,
            allowedSourceCategories: definition.allowedSourceCategories ?? [],
            allowedTargetCategories: definition.allowedTargetCategories ?? [],
            ...(definition.cardinality ? { cardinality: definition.cardinality } : {}),
            lifecycleStatus: definition.lifecycleStatus ?? 'Active',
            bootstrapProtected: true,
          }),
        );
        existingByCode.set(stored.code, stored);
      }
      return {
        created,
        updated,
        relationshipTypes: await this.listRelationshipTypes(undefined, ctx),
      };
    });
  }

  public async createRelationshipType(
    input: RelationshipTypeInput,
    context?: RequestContext,
  ): Promise<GeographicRelationshipType> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, CATALOG_ROLE);
    const code = normalizeRelationshipCode(input.code);
    assertRequiredString(code, 'code');
    if (await this.repository.getRelationshipType(code)) {
      throw new AppError('relationship type code already exists', {
        code: 'GEO_RELATIONSHIP_TYPE_CODE_DUPLICATE',
        statusCode: 409,
      });
    }
    const record = this.buildRelationshipTypeRecord({
      id: createCanonicalId(),
      code,
      name: input.name ?? code,
      inverseCode: normalizeRelationshipCode(input.inverseCode ?? code),
      symmetric: input.symmetric ?? normalizeRelationshipCode(input.inverseCode ?? code) === code,
      allowedSourceCategories: input.allowedSourceCategories ?? [],
      allowedTargetCategories: input.allowedTargetCategories ?? [],
      ...(input.cardinality ? { cardinality: input.cardinality } : {}),
      lifecycleStatus: input.lifecycleStatus ?? 'Active',
    });
    return await this.repository.transaction(async () => {
      const stored = await this.repository.upsertRelationshipType(record);
      await this.recordMutation(
        ctx,
        'create',
        'GeographicRelationshipType',
        stored.id,
        null,
        stored,
        'GeographicRelationshipTypeCreateEvent',
      );
      return stored;
    });
  }

  public async updateRelationshipType(
    code: string,
    input: Partial<RelationshipTypeInput>,
    context?: RequestContext,
  ): Promise<GeographicRelationshipType> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, CATALOG_ROLE);
    const current = await this.getRelationshipTypeOrThrow(code);
    if (input.code && normalizeRelationshipCode(input.code) !== current.code) {
      throw new AppError('relationship type code is immutable', {
        code: 'GEO_RELATIONSHIP_TYPE_CODE_IMMUTABLE',
        statusCode: 409,
      });
    }
    const updated = this.buildRelationshipTypeRecord({
      id: current.id,
      code: current.code,
      name: input.name ?? current.name,
      inverseCode: input.inverseCode
        ? normalizeRelationshipCode(input.inverseCode)
        : current.inverseCode,
      symmetric: input.symmetric ?? current.symmetric,
      allowedSourceCategories: input.allowedSourceCategories ?? current.allowedSourceCategories,
      allowedTargetCategories: input.allowedTargetCategories ?? current.allowedTargetCategories,
      ...((input.cardinality ?? current.cardinality)
        ? { cardinality: input.cardinality ?? current.cardinality }
        : {}),
      lifecycleStatus: input.lifecycleStatus ?? current.lifecycleStatus,
      ...(current._bootstrapProtected !== undefined
        ? { bootstrapProtected: current._bootstrapProtected }
        : {}),
    });
    return await this.repository.transaction(async () => {
      const stored = await this.repository.upsertRelationshipType(updated);
      await this.recordMutation(
        ctx,
        'update',
        'GeographicRelationshipType',
        stored.id,
        current,
        stored,
        'GeographicRelationshipTypeAttributeValueChangeEvent',
      );
      return stored;
    });
  }

  public async retireRelationshipType(
    code: string,
    context?: RequestContext,
  ): Promise<GeographicRelationshipType> {
    const current = await this.getRelationshipTypeOrThrow(code);
    if (current._bootstrapProtected) {
      throw new AppError('bootstrap relationship type cannot be retired', {
        code: 'GEO_RELATIONSHIP_TYPE_BOOTSTRAP_PROTECTED',
        statusCode: 409,
      });
    }
    return await this.updateRelationshipType(code, { lifecycleStatus: 'Retired' }, context);
  }

  public async listRelationshipTypes(
    query?: {
      code?: string;
      lifecycleStatus?: GeographicRelationshipType['lifecycleStatus'];
      limit?: number;
      offset?: number;
    },
    context?: RequestContext,
  ): Promise<GeographicRelationshipType[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.listRelationshipTypes(query);
  }

  public async getRelationshipType(
    code: string,
    context?: RequestContext,
  ): Promise<GeographicRelationshipType | undefined> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.getRelationshipType(normalizeRelationshipCode(code));
  }

  public async getLocation(
    id: string,
    context?: RequestContext,
  ): Promise<GeographicLocation | undefined> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.getLocation(id, { tenantId: ctx.tenantId });
  }
  public async getAddress(
    id: string,
    context?: RequestContext,
  ): Promise<GeographicAddress | undefined> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.getAddress(id, { tenantId: ctx.tenantId });
  }
  public async getSite(id: string, context?: RequestContext): Promise<GeographicSite | undefined> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.getSite(id, { tenantId: ctx.tenantId });
  }
  public async getSpec(
    id: string,
    context?: RequestContext,
  ): Promise<GeographicSiteSpecification | undefined> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.getSpec(id);
  }
  public async listLocations(
    query?: { limit?: number; offset?: number },
    context?: RequestContext,
  ): Promise<GeographicLocation[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.listLocations({ ...query, tenantId: ctx.tenantId });
  }

  public async listLocationsSpatial(
    query: LocationSpatialQuery,
    context?: RequestContext,
  ): Promise<GeographicLocation[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    const candidates = await this.repository.listLocations({ tenantId: ctx.tenantId });
    const filtered = candidates
      .map((location) => ({
        location,
        distance:
          query.near && location.geometry.type === 'Point'
            ? distanceMeters(
                query.near.lng,
                query.near.lat,
                location.geometry.coordinates[0],
                location.geometry.coordinates[1],
              )
            : undefined,
      }))
      .filter(({ location, distance }) => {
        if (query.bbox && !geometryTouchesBbox(location.geometry, query.bbox)) return false;
        if (query.near && (distance === undefined || distance > query.near.radiusMeters))
          return false;
        return true;
      })
      .sort((left, right) => {
        if (left.distance !== undefined || right.distance !== undefined) {
          return (
            (left.distance ?? Number.POSITIVE_INFINITY) -
              (right.distance ?? Number.POSITIVE_INFINITY) ||
            left.location.id.localeCompare(right.location.id)
          );
        }
        return left.location.id.localeCompare(right.location.id);
      })
      .map((item) => item.location);

    const offset = query.offset ?? 0;
    return query.limit !== undefined
      ? filtered.slice(offset, offset + query.limit)
      : filtered.slice(offset);
  }

  public locationsToFeatureCollection(locations: GeographicLocation[]): GeoJsonFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: locations.map((location) => ({
        type: 'Feature',
        id: location.id,
        geometry: location.geometry,
        properties: {
          id: location.id,
          href: location.href,
          tenantId: location.tenantId,
          geometryType: location.geometryType,
          spatialRef: location.spatialRef,
          accuracy: location.accuracy,
          referencePoint: location.referencePoint,
          validFor: location.validFor,
          characteristic: location.characteristic,
        },
      })),
    };
  }

  public async findLocationIntersections(
    polygon: GeoJSONGeometry,
    context?: RequestContext,
  ): Promise<GeographicLocation[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    validateGeometry('Polygon', polygon);
    return (await this.repository.listLocations({ tenantId: ctx.tenantId })).filter((location) =>
      geometryIntersectsPolygon(location.geometry, polygon),
    );
  }

  public async getLocationReferences(
    locationId: string,
    context?: RequestContext,
  ): Promise<{
    locationId: string;
    activeAddressCount: number;
    activeSiteCount: number;
    blocking: boolean;
  }> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getLocationOrThrow(locationId, ctx);
    const activeAddressCount = (
      await this.repository.listAddresses({ tenantId: ctx.tenantId })
    ).filter((address) => address.geographicLocationId === locationId).length;
    const activeSiteCount = (await this.repository.listSites({ tenantId: ctx.tenantId })).filter(
      (site) => site.place?.id === locationId && site.status !== 'Retired',
    ).length;
    return {
      locationId,
      activeAddressCount,
      activeSiteCount,
      blocking: activeAddressCount + activeSiteCount > 0,
    };
  }

  public async terminateLocation(
    locationId: string,
    context?: RequestContext,
  ): Promise<GeographicLocation> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    const current = await this.getLocationOrThrow(locationId, ctx);
    const references = await this.getLocationReferences(locationId, ctx);
    if (references.blocking) {
      throw new AppError('geographic location has active references', {
        code: 'GEO_LOCATION_REFERENCES_ACTIVE',
        statusCode: 409,
      });
    }
    return await this.repository.transaction(async () => {
      const updated = await this.repository.upsertLocation({
        ...current,
        validFor: {
          ...(current.validFor?.startDateTime
            ? { startDateTime: current.validFor.startDateTime }
            : {}),
          endDateTime: current.validFor?.endDateTime ?? new Date().toISOString(),
        },
      });
      await this.recordMutation(
        ctx,
        'terminate',
        'GeographicLocation',
        updated.id,
        current,
        updated,
        'GeographicLocationDeleteEvent',
      );
      return updated;
    });
  }
  public async listAddresses(
    query?: Omit<GeographicAddressQuery, 'tenantId'>,
    context?: RequestContext,
  ): Promise<GeographicAddress[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.listAddresses({ ...query, tenantId: ctx.tenantId });
  }

  public normalizeAddress(
    input: Partial<AddressInput>,
    context?: RequestContext,
  ): GeographicAddress {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    assertRequiredString(input.street, 'street');
    const street = String(input.street);
    const normalizedPostcode = input.postcode
      ? normalizeBrazilianPostcode(input.postcode)
      : undefined;
    return {
      '@type': 'GeographicAddress',
      id: 'normalized',
      href: '',
      tenantId: ctx.tenantId,
      street: street.trim(),
      ...(input.streetNr ? { streetNr: input.streetNr.trim() } : {}),
      ...(input.city ? { city: input.city.trim() } : {}),
      ...(input.stateOrProvince
        ? { stateOrProvince: input.stateOrProvince.trim().toUpperCase() }
        : {}),
      ...(normalizedPostcode ? { postcode: normalizedPostcode } : {}),
      country: (input.country ?? 'BR').trim().toUpperCase(),
      characteristic: input.characteristic ?? [],
    };
  }

  public suggestAddresses(_query: string, context?: RequestContext): never {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    throw new AppError('geocoding provider unavailable', {
      code: 'GEO_GEOCODING_PROVIDER_UNAVAILABLE',
      statusCode: 503,
    });
  }

  public geocodeAddress(_addressId: string, context?: RequestContext): never {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    throw new AppError('geocoding provider unavailable', {
      code: 'GEO_GEOCODING_PROVIDER_UNAVAILABLE',
      statusCode: 503,
    });
  }

  public async listAddressVersions(
    addressId: string,
    context?: RequestContext,
  ): Promise<GeographicAddress[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return [await this.getAddressOrThrow(addressId, ctx)];
  }

  public async getAddressReferences(
    addressId: string,
    context?: RequestContext,
  ): Promise<{ addressId: string; activeSiteCount: number; blocking: boolean }> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getAddressOrThrow(addressId, ctx);
    const activeSiteCount = (await this.repository.listSites({ tenantId: ctx.tenantId })).filter(
      (site) => site.address?.id === addressId && site.status !== 'Retired',
    ).length;
    return { addressId, activeSiteCount, blocking: activeSiteCount > 0 };
  }

  public async terminateAddress(
    addressId: string,
    context?: RequestContext,
  ): Promise<GeographicAddress> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, WRITE_ROLE);
    const current = await this.getAddressOrThrow(addressId, ctx);
    const references = await this.getAddressReferences(addressId, ctx);
    if (references.blocking) {
      throw new AppError('geographic address has active references', {
        code: 'GEO_ADDRESS_REFERENCES_ACTIVE',
        statusCode: 409,
      });
    }
    return await this.repository.transaction(async () => {
      const updated = await this.repository.upsertAddress({
        ...current,
        validFor: {
          ...(current.validFor?.startDateTime
            ? { startDateTime: current.validFor.startDateTime }
            : {}),
          endDateTime: current.validFor?.endDateTime ?? new Date().toISOString(),
        },
      });
      await this.recordMutation(
        ctx,
        'terminate',
        'GeographicAddress',
        updated.id,
        current,
        updated,
        'GeographicAddressDeleteEvent',
      );
      return updated;
    });
  }

  public async listSites(
    query?: {
      name?: string;
      status?: GeoSiteStatus | GeoSiteStatusAlias;
      siteSpecificationId?: string;
      parentSiteId?: string | null;
      descendantOfSiteId?: string;
      characteristicName?: string;
      characteristicValue?: string;
      limit?: number;
      offset?: number;
    },
    context?: RequestContext,
  ): Promise<GeographicSite[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    const { status, ...rest } = query ?? {};
    const normalizedQuery = {
      ...rest,
      ...(status ? { status: normalizeSiteStatus(status) } : {}),
      tenantId: ctx.tenantId,
    };
    return await this.repository.listSites(normalizedQuery);
  }
  public async countSites(context?: RequestContext): Promise<number> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.countSites({ tenantId: ctx.tenantId });
  }
  public async listSpecs(
    query?: {
      name?: string;
      code?: string;
      category?: GeographicSiteSpecification['category'];
      lifecycleStatus?: GeographicSiteSpecification['lifecycleStatus'];
      limit?: number;
      offset?: number;
    },
    context?: RequestContext,
  ): Promise<GeographicSiteSpecification[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    return await this.repository.listSpecs(query);
  }
  public async listSiteEvents(siteId: string, context?: RequestContext): Promise<GeoEvent[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getSiteOrThrow(siteId, ctx);
    return await this.repository.listEventsForEntity(siteId);
  }

  public async listSiteHistory(
    siteId: string,
    context?: RequestContext,
  ): Promise<GeographicSiteStatusHistoryEntry[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getSiteOrThrow(siteId, ctx);
    return await this.repository.listSiteStatusHistory(siteId, { tenantId: ctx.tenantId });
  }

  public async listSiteAudit(siteId: string, context?: RequestContext): Promise<GeoAuditLog[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getSiteOrThrow(siteId, ctx);
    return await this.repository.listAuditForEntity(siteId, { tenantId: ctx.tenantId });
  }

  public async getSiteReferences(
    siteId: string,
    context?: RequestContext,
  ): Promise<GeographicSiteReferences> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getSiteOrThrow(siteId, ctx);
    return await this.repository.getSiteReferences(siteId, { tenantId: ctx.tenantId });
  }

  public async getSiteDeactivationImpact(
    siteId: string,
    context?: RequestContext,
  ): Promise<GeographicSiteReferences> {
    return await this.getSiteReferences(siteId, context);
  }

  public async countSiteDescendants(
    siteId: string,
    context?: RequestContext,
  ): Promise<{ siteId: string; descendantCount: number }> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getSiteOrThrow(siteId, ctx);
    return {
      siteId,
      descendantCount: await this.repository.countSiteDescendants(siteId, {
        tenantId: ctx.tenantId,
      }),
    };
  }

  public async getSiteTree(siteId: string, context?: RequestContext): Promise<SiteTreeNode> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    const site = await this.getSiteOrThrow(siteId, ctx);
    const children = await Promise.all(
      (await this.repository.listSites({ parentSiteId: siteId, tenantId: ctx.tenantId })).map(
        async (child) => await this.getSiteTree(child.id, ctx),
      ),
    );
    return { site, children };
  }

  public async listSiteRelationships(
    siteId: string,
    context?: RequestContext,
  ): Promise<GeographicSiteRelationship[]> {
    const ctx = this.resolveContext(context);
    this.assertRole(ctx, READ_ROLE);
    await this.getSiteOrThrow(siteId, ctx);
    return await this.repository.listSiteRelationships(siteId);
  }

  private async executeBulk<
    TItem extends { characteristic?: Characteristic[] },
    TEntity extends { id: string },
  >(
    target: GeoBulkTarget,
    input: GeoBulkInput<TItem>,
    idempotencyKey: string | undefined,
    context: RequestContext,
    prepareItem: (item: TItem) => Promise<PreparedBulkItem<TItem>>,
    persistItem: (item: TItem) => Promise<TEntity>,
  ): Promise<GeoBulkSubmission> {
    this.assertBulkAllowed(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const existingJob = await this.repository.getBulkJobByIdempotencyKey(
      context.tenantId,
      key,
      target,
    );
    if (existingJob) {
      return {
        job: existingJob,
        results: await this.repository.listBulkJobResults(existingJob.id, {
          tenantId: context.tenantId,
        }),
      };
    }

    const mode = resolveBulkMode(input);
    const items = normalizeBulkItems(input.items);
    const now = new Date().toISOString();
    let job = await this.repository.upsertBulkJob({
      '@type': 'GeoBulkJob',
      id: createCanonicalId(),
      tenantId: context.tenantId,
      target,
      mode,
      idempotencyKey: key,
      status: 'running',
      submittedAt: now,
      startedAt: now,
      total: items.length,
      successCount: 0,
      errorCount: 0,
      warningCount: 0,
      actorSub: context.actorSub,
      traceId: context.traceId,
    });

    const prepared: Array<
      { index: number; prepared: PreparedBulkItem<TItem> } | { index: number; error: unknown }
    > = [];
    for (const [index, item] of items.entries()) {
      try {
        prepared.push({ index, prepared: await prepareItem(item) });
      } catch (error) {
        prepared.push({ index, error });
      }
    }

    const results: GeoBulkJobResult[] = [];
    for (const item of prepared) {
      if ('error' in item) {
        results.push(this.buildBulkErrorResult(job, item.index, item.error));
      }
    }

    if (mode === 'atomic' && results.length > 0) {
      for (const item of prepared) {
        if ('prepared' in item) {
          results.push(
            this.buildBulkErrorResult(
              job,
              item.index,
              new AppError('atomic bulk job was rolled back before persistence', {
                code: 'GEO_BULK_ATOMIC_ROLLBACK',
                statusCode: 409,
              }),
              item.prepared,
            ),
          );
        }
      }
      return await this.completeBulkJob(job, results);
    }

    for (const item of prepared) {
      if ('error' in item) continue;
      const preparedItem = item.prepared;
      if (preparedItem.existingId) {
        results.push(this.buildBulkSuccessResult(job, item.index, preparedItem, 'reused'));
        continue;
      }
      if (mode === 'validateOnly') {
        results.push(this.buildBulkSuccessResult(job, item.index, preparedItem, 'validated'));
        continue;
      }
      try {
        const entity = await persistItem(preparedItem.item);
        results.push(
          this.buildBulkSuccessResult(job, item.index, preparedItem, 'created', entity.id),
        );
      } catch (error) {
        results.push(this.buildBulkErrorResult(job, item.index, error, preparedItem));
        if (mode === 'atomic') {
          break;
        }
      }
    }

    if (mode === 'atomic' && results.some((result) => result.status === 'failed')) {
      const failedIndexes = new Set(results.map((result) => result.index));
      for (const item of prepared) {
        if ('prepared' in item && !failedIndexes.has(item.index)) {
          results.push(
            this.buildBulkErrorResult(
              job,
              item.index,
              new AppError('atomic bulk job stopped after persistence error', {
                code: 'GEO_BULK_ATOMIC_STOPPED',
                statusCode: 409,
              }),
              item.prepared,
            ),
          );
        }
      }
    }

    job = (await this.completeBulkJob(job, results)).job;
    return {
      job,
      results: await this.repository.listBulkJobResults(job.id, { tenantId: context.tenantId }),
    };
  }

  private async prepareAddressBulkItem(
    input: AddressInput,
    context: RequestContext,
  ): Promise<PreparedBulkItem<AddressInput>> {
    this.assertOriginWriteAllowed(context, input.characteristic ?? []);
    assertRequiredString(input.street, 'street');
    if (input.geographicLocationId)
      await this.getLocationOrThrow(input.geographicLocationId, context);
    const warnings: string[] = [];
    const origin = extractBulkOrigin(input.characteristic ?? [], 'Address', warnings);
    const normalizedCountry = normalizeCountry(input.country);
    const normalizedPostcode = normalizePostcode(input.postcode, normalizedCountry);
    const item: AddressInput = {
      ...input,
      country: normalizedCountry,
      ...(normalizedPostcode ? { postcode: normalizedPostcode } : {}),
    };
    const existingId = (await this.findAddressByOrigin(origin, context))?.id;
    return {
      item,
      origin,
      ...(existingId ? { existingId } : {}),
      warnings,
    };
  }

  private async prepareSiteBulkItem(
    input: SiteInput,
    context: RequestContext,
  ): Promise<PreparedBulkItem<SiteInput>> {
    this.assertOriginWriteAllowed(context, input.characteristic ?? []);
    assertRequiredString(input.name, 'name');
    assertRequiredString(input.siteSpecificationId, 'siteSpecificationId');
    const spec = await this.getSpecOrThrow(input.siteSpecificationId);
    ensureSpecificationActive(spec);
    const status = normalizeSiteStatus(input.status ?? 'Planned');
    validateStatus(status);
    if (input.placeId) await this.getLocationOrThrow(input.placeId, context);
    if (input.addressId) await this.getAddressOrThrow(input.addressId, context);
    const parentSite = input.parentSiteId
      ? await this.getSiteOrThrow(input.parentSiteId, context)
      : undefined;
    if (spec.category === 'SubSite' && !parentSite) {
      throw new AppError('sub-site requires parent site', {
        code: 'GEO_SUBSITE_PARENT_REQUIRED',
        statusCode: 409,
      });
    }
    if (parentSite) {
      await this.validateContainment(spec, parentSite);
      this.validateStatusCompatibleWithAncestors(status, parentSite);
    }
    const warnings: string[] = [];
    const origin = extractBulkOrigin(input.characteristic ?? [], 'Site', warnings);
    const existingId = (await this.findSiteByOrigin(origin, context))?.id;
    return {
      item: input,
      origin,
      ...(existingId ? { existingId } : {}),
      warnings,
    };
  }

  private async completeBulkJob(
    job: GeoBulkJob,
    results: GeoBulkJobResult[],
  ): Promise<GeoBulkSubmission> {
    const orderedResults = [...results].sort(
      (a, b) => a.index - b.index || a.id.localeCompare(b.id),
    );
    for (const result of orderedResults) {
      await this.repository.appendBulkJobResult(result);
    }
    const successCount = orderedResults.filter((result) => result.status !== 'failed').length;
    const errorCount = orderedResults.length - successCount;
    const warningCount = orderedResults.reduce(
      (count, result) => count + result.warnings.length,
      0,
    );
    const completed = await this.repository.upsertBulkJob({
      ...job,
      status:
        errorCount === orderedResults.length && orderedResults.length > 0 ? 'failed' : 'completed',
      completedAt: new Date().toISOString(),
      successCount,
      errorCount,
      warningCount,
    });
    return {
      job: completed,
      results: await this.repository.listBulkJobResults(completed.id, {
        tenantId: completed.tenantId,
      }),
    };
  }

  private buildBulkSuccessResult(
    job: GeoBulkJob,
    index: number,
    prepared: PreparedBulkItem<unknown>,
    status: 'validated' | 'created' | 'reused',
    entityId = prepared.existingId,
  ): GeoBulkJobResult {
    return {
      '@type': 'GeoBulkJobResult',
      id: createCanonicalId(),
      jobId: job.id,
      tenantId: job.tenantId,
      index,
      status,
      ...(entityId ? { entityId } : {}),
      legacySystem: prepared.origin.system,
      legacyEntity: prepared.origin.entity,
      legacyId: prepared.origin.id,
      warnings: prepared.warnings,
    };
  }

  private buildBulkErrorResult(
    job: GeoBulkJob,
    index: number,
    error: unknown,
    prepared?: PreparedBulkItem<unknown>,
  ): GeoBulkJobResult {
    const appError = error instanceof AppError ? error : undefined;
    return {
      '@type': 'GeoBulkJobResult',
      id: createCanonicalId(),
      jobId: job.id,
      tenantId: job.tenantId,
      index,
      status: 'failed',
      ...(prepared?.existingId ? { entityId: prepared.existingId } : {}),
      ...(prepared
        ? {
            legacySystem: prepared.origin.system,
            legacyEntity: prepared.origin.entity,
            legacyId: prepared.origin.id,
          }
        : {}),
      errorCode: appError?.code ?? 'GEO_BULK_ITEM_FAILED',
      message: error instanceof Error ? error.message : 'bulk item failed',
      warnings: prepared?.warnings ?? [],
    };
  }

  private async findAddressByOrigin(
    origin: BulkOrigin,
    context: RequestContext,
  ): Promise<GeographicAddress | undefined> {
    return (await this.repository.listAddresses({ tenantId: context.tenantId })).find((address) =>
      originMatches(address.characteristic, origin),
    );
  }

  private async findSiteByOrigin(
    origin: BulkOrigin,
    context: RequestContext,
  ): Promise<GeographicSite | undefined> {
    return (await this.repository.listSites({ tenantId: context.tenantId })).find((site) =>
      originMatches(site.characteristic, origin),
    );
  }

  private assertBulkAllowed(context: RequestContext): void {
    if (context.roles.includes(MIGRATION_ROLE) || context.roles.includes(PLATFORM_ROLE)) return;
    throw new AppError('bulk operations require migration job role', {
      code: 'GEO_BULK_RBAC_FORBIDDEN',
      statusCode: 403,
    });
  }

  private async getLocationOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<GeographicLocation> {
    const location = await this.repository.getLocation(
      id,
      context ? { tenantId: context.tenantId } : undefined,
    );
    if (!location)
      throw new AppError('geographic location not found', {
        code: 'GEO_LOCATION_NOT_FOUND',
        statusCode: 404,
      });
    return location;
  }

  private async getAddressOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<GeographicAddress> {
    const address = await this.repository.getAddress(
      id,
      context ? { tenantId: context.tenantId } : undefined,
    );
    if (!address)
      throw new AppError('geographic address not found', {
        code: 'GEO_ADDRESS_NOT_FOUND',
        statusCode: 404,
      });
    return address;
  }

  private async getSpecOrThrow(id: string): Promise<GeographicSiteSpecification> {
    const spec = await this.repository.getSpec(id);
    if (!spec)
      throw new AppError('site specification not found', {
        code: 'GEO_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    return spec;
  }

  private async getSiteOrThrow(id: string, context?: RequestContext): Promise<GeographicSite> {
    const site = await this.repository.getSite(
      id,
      context ? { tenantId: context.tenantId } : undefined,
    );
    if (!site)
      throw new AppError('geographic site not found', {
        code: 'GEO_SITE_NOT_FOUND',
        statusCode: 404,
      });
    return site;
  }

  private async getRelationshipTypeOrThrow(code: string): Promise<GeographicRelationshipType> {
    const normalizedCode = normalizeRelationshipCode(code);
    const relationshipType = await this.repository.getRelationshipType(normalizedCode);
    if (!relationshipType) {
      throw new AppError('relationship type not found', {
        code: 'GEO_RELATIONSHIP_TYPE_NOT_FOUND',
        statusCode: 404,
      });
    }
    return relationshipType;
  }

  private resolveContext(context?: RequestContext): RequestContext {
    return context ?? DEFAULT_CONTEXT;
  }

  private assertRole(context: RequestContext, role: string): void {
    if (context.roles.includes(PLATFORM_ROLE) || context.roles.includes(role)) return;
    throw new AppError('operation forbidden by RBAC', {
      code: 'GEO_RBAC_FORBIDDEN',
      statusCode: 403,
    });
  }

  private assertOriginWriteAllowed(
    context: RequestContext,
    characteristics?: Characteristic[],
  ): void {
    if (!characteristics || characteristics.length === 0) return;
    const writesOrigin = characteristics.some((item) => item.name.startsWith('_origin.'));
    if (!writesOrigin) return;
    // Deliberately not honouring PLATFORM_ROLE: `_origin` is written only by an authenticated
    // migration job, so a platform admin acting by hand is rejected like any other operator.
    if (context.roles.includes(MIGRATION_ROLE)) return;
    throw new AppError('_origin characteristics are migration-only', {
      code: 'GEO_ORIGIN_WRITE_FORBIDDEN',
      statusCode: 403,
    });
  }

  private async recordMutation(
    context: RequestContext,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    eventType: string,
    eventPayload: unknown = after,
  ): Promise<GeoEvent> {
    const event = await this.emitEvent(eventType, entityId, entityType, eventPayload, context);
    const audit: GeoAuditLog = {
      '@type': 'GeoAuditLog',
      id: createCanonicalId(),
      tenantId: context.tenantId,
      actorSub: context.actorSub,
      action,
      entityType,
      entityId,
      eventTime: event.eventTime,
      before: before ? (structuredClone(before) as Record<string, unknown>) : null,
      after: after ? (structuredClone(after) as Record<string, unknown>) : null,
      traceId: context.traceId,
      ...(context.sourceIp ? { sourceIp: context.sourceIp } : {}),
    };
    await this.repository.appendAudit(audit);

    const outbox: GeoOutboxMessage = {
      '@type': 'OutboxMessage',
      id: createCanonicalId(),
      tenantId: context.tenantId,
      eventId: event.id,
      topic: 'tmf688.geo',
      payload: event,
      status: 'pending',
      createdAt: event.eventTime,
    };
    await this.repository.appendOutbox(outbox);
    return event;
  }

  private buildRelationshipTypeRecord(input: {
    id: string;
    code: string;
    name: string;
    inverseCode: string;
    symmetric: boolean;
    allowedSourceCategories: GeographicSiteSpecificationCategory[];
    allowedTargetCategories: GeographicSiteSpecificationCategory[];
    cardinality?: GeographicRelationshipType['cardinality'];
    lifecycleStatus: GeographicRelationshipType['lifecycleStatus'];
    bootstrapProtected?: boolean;
  }): GeographicRelationshipType {
    return {
      '@type': 'GeographicRelationshipType',
      id: input.id,
      href: `/v1/geo/relationship-types/${input.code}`,
      code: input.code,
      name: input.name,
      inverseCode: input.inverseCode,
      symmetric: input.symmetric,
      allowedSourceCategories: input.allowedSourceCategories,
      allowedTargetCategories: input.allowedTargetCategories,
      ...(input.cardinality ? { cardinality: input.cardinality } : {}),
      lifecycleStatus: input.lifecycleStatus,
      ...(input.bootstrapProtected !== undefined
        ? { _bootstrapProtected: input.bootstrapProtected }
        : {}),
    };
  }

  private async validateRelationshipCategories(
    source: GeographicSite,
    target: GeographicSite,
    relationshipType: GeographicRelationshipType,
  ): Promise<void> {
    const sourceSpec = await this.getSpecOrThrow(source.siteSpecificationId);
    const targetSpec = await this.getSpecOrThrow(target.siteSpecificationId);
    if (
      relationshipType.allowedSourceCategories.length > 0 &&
      !relationshipType.allowedSourceCategories.includes(sourceSpec.category)
    ) {
      throw new AppError('relationship source category not allowed', {
        code: 'GEO_RELATIONSHIP_SOURCE_CATEGORY_NOT_ALLOWED',
        statusCode: 409,
      });
    }
    if (
      relationshipType.allowedTargetCategories.length > 0 &&
      !relationshipType.allowedTargetCategories.includes(targetSpec.category)
    ) {
      throw new AppError('relationship target category not allowed', {
        code: 'GEO_RELATIONSHIP_TARGET_CATEGORY_NOT_ALLOWED',
        statusCode: 409,
      });
    }
  }

  private validateStatusTransition(
    fromStatus: GeoSiteStatus,
    toStatus: GeoSiteStatus,
    statusReason: string | undefined,
    context: RequestContext,
  ): void {
    if (fromStatus === toStatus) return;
    if (!SITE_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
      throw new AppError('site status transition not allowed', {
        code: 'GEO_SITE_STATUS_TRANSITION_NOT_ALLOWED',
        statusCode: 409,
      });
    }
    const reactivation =
      toStatus === 'Active' && (fromStatus === 'Retired' || fromStatus === 'InDeactivation');
    const destructive = toStatus === 'InDeactivation' || toStatus === 'Retired';
    if ((reactivation || destructive) && (!statusReason || statusReason.trim().length === 0)) {
      throw new AppError('statusReason is required for this transition', {
        code: 'GEO_SITE_STATUS_REASON_REQUIRED',
        statusCode: 400,
      });
    }
    if (
      fromStatus === 'Retired' &&
      toStatus === 'Active' &&
      !context.roles.includes(PLATFORM_ROLE)
    ) {
      throw new AppError('reactivating a retired site requires platform admin', {
        code: 'GEO_SITE_REACTIVATION_ADMIN_REQUIRED',
        statusCode: 403,
      });
    }
  }

  private async assertSiteNameAvailable(
    name: string,
    spec: GeographicSiteSpecification,
    parentSiteId: string | undefined,
    currentSiteId: string | undefined,
    context: RequestContext,
  ): Promise<void> {
    const normalized = name.trim().toLowerCase();
    // Filtra por nome antes de trazer para JS — sem isto, cada criação/atualização de
    // Site varre a tabela inteira do tenant (com join de relationships) só pra checar
    // duplicidade, o que vira O(n²) em qualquer carga em lote (ver scripts/estacoes_carregar.mjs).
    const candidates = await this.repository.listSites({ tenantId: context.tenantId, name });
    const duplicate = candidates.find((site) => {
      if (site.id === currentSiteId || site.status === 'Retired') return false;
      if (site.name.trim().toLowerCase() !== normalized) return false;
      if (spec.category === 'SubSite') return site.parentSite?.id === parentSiteId;
      return true;
    });
    if (duplicate) {
      throw new AppError('site name already exists', {
        code: 'GEO_SITE_NAME_DUPLICATE',
        statusCode: 409,
      });
    }
  }

  private validateStatusCompatibleWithAncestors(
    status: GeoSiteStatus,
    parentSite: GeographicSite,
  ): void {
    if (status === 'Active' && parentSite.status !== 'Active') {
      throw new AppError('active child site requires active ancestor', {
        code: 'GEO_SITE_STATUS_ANCESTOR_INCOMPATIBLE',
        statusCode: 409,
      });
    }
    if (parentSite.status === 'Retired' && status !== 'Retired') {
      throw new AppError('child site status is incompatible with retired ancestor', {
        code: 'GEO_SITE_STATUS_ANCESTOR_INCOMPATIBLE',
        statusCode: 409,
      });
    }
  }

  private async assertSubSiteMoveAllowed(
    current: GeographicSite,
    nextParent: GeographicSite | undefined,
    context: RequestContext,
  ): Promise<void> {
    const currentSpec = await this.getSpecOrThrow(current.siteSpecificationId);
    if (currentSpec.category !== 'SubSite' || !current.parentSite?.id || !nextParent?.id) return;
    const currentRoot = await this.getRootSiteId(current.parentSite.id, context);
    const nextRoot = await this.getRootSiteId(nextParent.id, context);
    if (currentRoot !== nextRoot) {
      throw new AppError('moving sub-site between root sites is blocked in MVP', {
        code: 'GEO_SUBSITE_MOVE_BETWEEN_ROOTS_BLOCKED',
        statusCode: 409,
      });
    }
  }

  private async getRootSiteId(siteId: string, context: RequestContext): Promise<string> {
    let cursor = await this.getSiteOrThrow(siteId, context);
    while (cursor.parentSite?.id) {
      cursor = await this.getSiteOrThrow(cursor.parentSite.id, context);
    }
    return cursor.id;
  }

  private normalizeSiteAddresses(
    input: Array<{ id: string; role: 'principal' | 'dispatch' | 'billing' }> | undefined,
    singularAddress: GeographicAddress | undefined,
    fallback: GeographicSite['siteAddress'] = [],
  ): NonNullable<GeographicSite['siteAddress']> {
    const raw = input
      ? input
      : singularAddress
        ? [{ id: singularAddress.id, role: 'principal' as const }]
        : fallback;
    const principalCount = raw.filter((item) => item.role === 'principal').length;
    if (principalCount > 1) {
      throw new AppError('site can have only one principal address', {
        code: 'GEO_SITE_PRINCIPAL_ADDRESS_DUPLICATE',
        statusCode: 409,
      });
    }
    return raw.map((item) => ({
      id: item.id,
      role: item.role,
      '@referredType': 'GeographicAddress' as const,
    }));
  }

  private buildSpecRecord(input: {
    id: string;
    name: string;
    code: string;
    description?: string;
    category: GeographicSiteSpecificationCategory;
    lifecycleStatus: GeographicSiteSpecificationLifecycleStatus;
    validFor?: TimePeriod;
    specCharacteristic: GeographicSiteSpecificationCharacteristic[];
    allowedParentSpecIds: string[];
    allowedChildSpecIds: string[];
    bootstrapProtected?: boolean;
  }): GeographicSiteSpecification {
    return {
      '@type': 'GeographicSiteSpecification',
      id: input.id,
      href: `/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/${input.id}`,
      name: input.name,
      code: input.code,
      ...(input.description !== undefined ? { description: input.description } : {}),
      category: input.category,
      lifecycleStatus: input.lifecycleStatus,
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
      specCharacteristic: input.specCharacteristic,
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: input.allowedParentSpecIds,
      allowedChildSpecIds: input.allowedChildSpecIds,
      ...(input.bootstrapProtected !== undefined
        ? { _bootstrapProtected: input.bootstrapProtected }
        : {}),
    };
  }

  private async validateContainment(
    spec: GeographicSiteSpecification,
    parentSite: GeographicSite,
  ): Promise<void> {
    const parentSpec = await this.getSpecOrThrow(parentSite.siteSpecificationId);
    const specAllowedParent = spec.allowedParentSpecIds.includes(parentSpec.id);
    const parentAllowedChild = parentSpec.allowedChildSpecIds.includes(spec.id);

    if (!specAllowedParent || !parentAllowedChild) {
      throw new AppError('parent-child specification containment not allowed', {
        code: 'GEO_SPEC_CONTAINMENT_NOT_ALLOWED',
        statusCode: 409,
      });
    }
  }

  private async assertNoParentCycle(
    siteId: string | undefined,
    parentSiteId: string,
  ): Promise<void> {
    if (!siteId) return;
    const visited = new Set<string>([siteId]);
    let cursor: string | undefined = parentSiteId;
    while (cursor) {
      if (visited.has(cursor)) {
        throw new AppError('site parent cycle detected', {
          code: 'GEO_PARENT_CYCLE',
          statusCode: 409,
        });
      }
      visited.add(cursor);
      cursor = (await this.getSiteOrThrow(cursor)).parentSite?.id;
    }
  }

  private normalizeSiteCharacteristics(
    spec: GeographicSiteSpecification,
    providedCharacteristic: Characteristic[],
  ): Characteristic[] {
    const definitionByName = new Map<string, GeographicSiteSpecificationCharacteristic>();
    for (const definition of spec.specCharacteristic) {
      definitionByName.set(definition.name.trim().toLowerCase(), definition);
    }

    const byName = new Map<string, Characteristic>();
    for (const characteristic of providedCharacteristic) {
      assertRequiredString(characteristic.name, 'characteristic.name');
      const key = characteristic.name.trim().toLowerCase();
      if (byName.has(key)) {
        throw new AppError('duplicate site characteristic', {
          code: 'GEO_SITE_CHARACTERISTIC_DUPLICATE',
          statusCode: 409,
        });
      }
      if (!characteristic.name.startsWith('_origin.')) {
        const definition = definitionByName.get(key);
        if (!definition) {
          throw new AppError('site characteristic not defined in specification', {
            code: 'GEO_SITE_CHARACTERISTIC_UNDEFINED',
            statusCode: 400,
          });
        }
        validateCharacteristicValue(characteristic, definition);
      }
      byName.set(key, cloneCharacteristic(characteristic));
    }

    for (const definition of spec.specCharacteristic) {
      const key = definition.name.trim().toLowerCase();
      if (!byName.has(key) && definition.defaultValue !== undefined) {
        byName.set(key, {
          ...(definition.group ? { group: definition.group } : {}),
          name: definition.name,
          value: cloneCharacteristicValue(definition.defaultValue),
          valueType: definition.valueType,
        });
      }
      if (definition.mandatory && !byName.has(key)) {
        throw new AppError('mandatory site characteristic missing', {
          code: 'GEO_SITE_CHARACTERISTIC_REQUIRED',
          statusCode: 409,
        });
      }
    }

    return [...byName.values()];
  }

  private async validateSpecificationChangeAgainstSites(
    current: GeographicSiteSpecification,
    nextCharacteristics: GeographicSiteSpecificationCharacteristic[],
  ): Promise<void> {
    const currentByName = new Map(
      current.specCharacteristic.map((item) => [item.name.trim().toLowerCase(), item]),
    );
    const nextByName = new Map(
      nextCharacteristics.map((item) => [item.name.trim().toLowerCase(), item]),
    );
    const sites = await this.repository.listSites({ siteSpecificationId: current.id });

    for (const [key, nextDefinition] of nextByName) {
      const currentDefinition = currentByName.get(key);
      if (!currentDefinition && nextDefinition.mandatory) {
        const impacted = sites.filter(
          (site) => !site.characteristic.some((item) => item.name.trim().toLowerCase() === key),
        );
        if (impacted.length > 0) {
          throw new AppError('mandatory characteristic addition requires external migration', {
            code: 'GEO_SPEC_CHARACTERISTIC_MIGRATION_REQUIRED',
            statusCode: 409,
          });
        }
      }
      if (currentDefinition && !currentDefinition.mandatory && nextDefinition.mandatory) {
        const impacted = sites.filter(
          (site) => !site.characteristic.some((item) => item.name.trim().toLowerCase() === key),
        );
        if (impacted.length > 0) {
          throw new AppError('mandatory characteristic transition requires external migration', {
            code: 'GEO_SPEC_CHARACTERISTIC_MIGRATION_REQUIRED',
            statusCode: 409,
          });
        }
      }
    }

    for (const [key, currentDefinition] of currentByName) {
      const nextDefinition = nextByName.get(key);
      if (!nextDefinition) {
        const impacted = sites.filter((site) =>
          site.characteristic.some((item) => item.name.trim().toLowerCase() === key),
        );
        if (impacted.length > 0) {
          throw new AppError('site characteristic definition cannot be removed while in use', {
            code: 'GEO_SPEC_CHARACTERISTIC_IN_USE',
            statusCode: 409,
          });
        }
        continue;
      }

      for (const site of sites) {
        const characteristic = site.characteristic.find(
          (item) => item.name.trim().toLowerCase() === key,
        );
        if (characteristic) {
          validateCharacteristicValue(characteristic, nextDefinition, currentDefinition);
        }
      }
    }
  }

  private async emitEvent(
    eventType: string,
    entityId: string,
    entityType: string,
    payload: unknown,
    context: RequestContext = DEFAULT_CONTEXT,
  ): Promise<GeoEvent> {
    return await this.repository.appendEvent({
      '@type': 'Event',
      id: createCanonicalId(),
      eventType,
      eventTime: new Date().toISOString(),
      source: `geo.${entityType}`,
      eventData: {
        entityId,
        entityType,
        tenantId: context.tenantId,
        actorSub: context.actorSub,
        traceId: context.traceId,
        payload: payload as Record<string, unknown>,
      },
      correlationId: context.traceId,
    });
  }
}

const optional = <K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

const validateGeometry = (geometryType: string, geometry: GeoJSONGeometry): void => {
  if (geometry.type !== geometryType) {
    throw new AppError('geometry type mismatch', {
      code: 'GEO_GEOMETRY_TYPE_MISMATCH',
      statusCode: 400,
    });
  }
  if (geometry.type === 'Point') validatePoint(geometry.coordinates);
  if (geometry.type === 'LineString') validateLineString(geometry.coordinates);
  if (geometry.type === 'Polygon') validatePolygon(geometry.coordinates);
};

const validatePoint = (coordinates: [number, number]): void => {
  validateCoordinate(coordinates[0], coordinates[1]);
};

const validateLineString = (coordinates: Array<[number, number]>): void => {
  if (coordinates.length < 2) {
    throw new AppError('linestring needs at least 2 points', {
      code: 'GEO_LINESTRING_INVALID',
      statusCode: 400,
    });
  }
  coordinates.forEach(([lng, lat]) => validateCoordinate(lng, lat));
};

const validatePolygon = (coordinates: Array<Array<[number, number]>>): void => {
  const ring = coordinates[0];
  if (!ring || ring.length < 4) {
    throw new AppError('polygon needs a closed ring', {
      code: 'GEO_POLYGON_INVALID',
      statusCode: 400,
    });
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    throw new AppError('polygon ring must be closed', {
      code: 'GEO_POLYGON_NOT_CLOSED',
      statusCode: 400,
    });
  }
  ring.forEach(([lng, lat]) => validateCoordinate(lng, lat));
};

const validateCoordinate = (lng: number, lat: number): void => {
  if (
    typeof lng !== 'number' ||
    typeof lat !== 'number' ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    throw new AppError('coordinate out of range', {
      code: 'GEO_COORDINATE_INVALID',
      statusCode: 400,
    });
  }
};

const geometryTouchesBbox = (
  geometry: GeoJSONGeometry,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): boolean => {
  const points = geometryPoints(geometry);
  return points.some(
    ([lng, lat]) =>
      lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat,
  );
};

const geometryIntersectsPolygon = (
  geometry: GeoJSONGeometry,
  polygon: GeoJSONGeometry,
): boolean => {
  if (polygon.type !== 'Polygon') return false;
  return geometryPoints(geometry).some((point) =>
    pointInPolygon(point, polygon.coordinates[0] ?? []),
  );
};

const geometryPoints = (geometry: GeoJSONGeometry): Array<[number, number]> => {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'LineString') return geometry.coordinates;
  return geometry.coordinates.flat();
};

const pointInPolygon = ([lng, lat]: [number, number], ring: Array<[number, number]>): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;
    const intersects =
      current[1] > lat !== previous[1] > lat &&
      lng <
        ((previous[0] - current[0]) * (lat - current[1])) / (previous[1] - current[1]) + current[0];
    if (intersects) inside = !inside;
  }
  return inside;
};

const distanceMeters = (fromLng: number, fromLat: number, toLng: number, toLat: number): number => {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toRadians = (value: number): number => value * (Math.PI / 180);

const validateStatus: (status: string) => asserts status is GeoSiteStatus = (
  status: string,
): asserts status is GeoSiteStatus => {
  if (!['Planned', 'InConstruction', 'Active', 'InDeactivation', 'Retired'].includes(status)) {
    throw new AppError('invalid site status', { code: 'GEO_SITE_STATUS_INVALID', statusCode: 400 });
  }
};

const normalizeSiteStatus = (status: GeoSiteStatus | GeoSiteStatusAlias): GeoSiteStatus => {
  const aliases: Record<GeoSiteStatusAlias, GeoSiteStatus> = {
    planned: 'Planned',
    active: 'Active',
    suspended: 'InDeactivation',
    terminated: 'Retired',
  };
  return (aliases as Record<string, GeoSiteStatus>)[status] ?? (status as GeoSiteStatus);
};

const normalizeRelationshipCode = (code: string): string => {
  const trimmed = code.trim();
  if (trimmed === 'isFedBy') return 'fedBy';
  return trimmed;
};

const normalizeIdempotencyKey = (key: string | undefined): string => {
  const trimmed = key?.trim();
  if (!trimmed) {
    throw new AppError('bulk operations require an idempotency key', {
      code: 'GEO_BULK_IDEMPOTENCY_KEY_REQUIRED',
      statusCode: 400,
    });
  }
  return trimmed;
};

const resolveBulkMode = (input: GeoBulkInput<unknown>): GeoBulkMode => {
  if (input.mode !== undefined) {
    if (!BULK_MODES.includes(input.mode)) {
      throw new AppError('invalid bulk mode', {
        code: 'GEO_BULK_MODE_INVALID',
        statusCode: 400,
      });
    }
    return input.mode;
  }
  if (input.validateOnly) return 'validateOnly';
  if (input.atomic) return 'atomic';
  return 'bestEffort';
};

const normalizeBulkItems = <TItem>(items: TItem[]): TItem[] => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('bulk job requires at least one item', {
      code: 'GEO_BULK_ITEMS_REQUIRED',
      statusCode: 400,
    });
  }
  if (items.length > BULK_MAX_ITEMS) {
    throw new AppError(`bulk job accepts at most ${BULK_MAX_ITEMS} items`, {
      code: 'GEO_BULK_ITEMS_LIMIT_EXCEEDED',
      statusCode: 400,
    });
  }
  return [...items];
};

const readOriginText = (characteristics: Characteristic[], name: string): string => {
  const found = characteristics.find(
    (characteristic) => characteristic.name.trim().toLowerCase() === name,
  );
  if (found === undefined || found.value === null || typeof found.value === 'object') return '';
  return String(found.value).trim();
};

const extractBulkOrigin = (
  characteristics: Characteristic[],
  defaultEntity: string,
  warnings: string[],
): BulkOrigin => {
  const system = readOriginText(characteristics, '_origin.system');
  const id = readOriginText(characteristics, '_origin.id');
  const entity = readOriginText(characteristics, '_origin.entity') || defaultEntity;
  if (!system || !id) {
    warnings.push('item sem _origin.system/_origin.id: deduplicação por origem indisponível');
  }
  return { system, entity, id };
};

const originMatches = (
  characteristics: Characteristic[] | undefined,
  origin: BulkOrigin,
): boolean => {
  if (!origin.system || !origin.id) return false;
  const candidate = extractBulkOrigin(characteristics ?? [], origin.entity, []);
  return (
    candidate.system === origin.system &&
    candidate.id === origin.id &&
    candidate.entity === origin.entity
  );
};

const normalizeCountry = (value?: string): string => normalizeCountrySearch(value) || 'BR';

const normalizePostcode = (
  value: string | undefined,
  country: string | undefined,
): string | undefined => {
  if (!value) return undefined;
  if ((country ?? 'BR').trim().toUpperCase() === 'BR') return normalizeBrazilianPostcode(value);
  return value.trim();
};

const normalizeBrazilianPostcode = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new AppError('postcode must have 8 digits for BR addresses', {
      code: 'GEO_ADDRESS_POSTCODE_INVALID',
      statusCode: 400,
    });
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const normalizeSiteRelatedParty = (
  relatedParty: Array<{ id: string; role?: string }> | undefined,
  context: RequestContext,
): Array<{ id: string; role?: string; '@referredType': 'Party' }> => {
  const parties = (relatedParty ?? []).map((party) => ({
    ...party,
    '@referredType': 'Party' as const,
  }));
  if (
    !parties.some(
      (party) =>
        party.id === context.tenantId && (party.role === 'tenant' || party.role === 'Tenant'),
    )
  ) {
    parties.push({ id: context.tenantId, role: 'tenant', '@referredType': 'Party' });
  }
  return parties;
};

const validateSpecCategory: (
  category: string,
) => asserts category is GeographicSiteSpecificationCategory = (
  category: string,
): asserts category is GeographicSiteSpecificationCategory => {
  if (!['Region', 'FunctionalGroup', 'Site', 'SubSite'].includes(category)) {
    throw new AppError('invalid site specification category', {
      code: 'GEO_SPEC_CATEGORY_INVALID',
      statusCode: 400,
    });
  }
};

const assertRequiredString = (value: unknown, field: string): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(`${field} is required`, { code: 'GEO_REQUIRED_FIELD', statusCode: 400 });
  }
};

const normalizeSpecificationCode = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const normalizeSpecCharacteristics = (
  value: GeographicSiteSpecificationCharacteristic[],
): GeographicSiteSpecificationCharacteristic[] => {
  const byName = new Set<string>();
  return value.map((characteristic) => {
    assertRequiredString(characteristic.name, 'specCharacteristic.name');
    const key = characteristic.name.trim().toLowerCase();
    if (byName.has(key)) {
      throw new AppError('duplicate specification characteristic', {
        code: 'GEO_SPEC_CHARACTERISTIC_DUPLICATE',
        statusCode: 409,
      });
    }
    byName.add(key);
    assertRequiredString(characteristic.valueType, 'specCharacteristic.valueType');
    validateCharacteristicDefinition(characteristic);
    return {
      ...characteristic,
      name: characteristic.name.trim(),
      ...(characteristic.description ? { description: characteristic.description.trim() } : {}),
      ...(characteristic.allowedValues ? { allowedValues: [...characteristic.allowedValues] } : {}),
      ...(characteristic.defaultValue !== undefined
        ? { defaultValue: cloneCharacteristicValue(characteristic.defaultValue) }
        : {}),
    };
  });
};

const validateCharacteristicDefinition = (
  definition: GeographicSiteSpecificationCharacteristic,
): void => {
  if (definition.regex && definition.valueType !== 'string') {
    throw new AppError('regex validator is only supported for string characteristics', {
      code: 'GEO_SPEC_CHARACTERISTIC_VALIDATOR_INVALID',
      statusCode: 400,
    });
  }
  if (
    (definition.min !== undefined || definition.max !== undefined) &&
    !['integer', 'decimal'].includes(definition.valueType)
  ) {
    throw new AppError('range validator is only supported for numeric characteristics', {
      code: 'GEO_SPEC_CHARACTERISTIC_VALIDATOR_INVALID',
      statusCode: 400,
    });
  }
  if (
    definition.min !== undefined &&
    definition.max !== undefined &&
    definition.min > definition.max
  ) {
    throw new AppError('characteristic min cannot be greater than max', {
      code: 'GEO_SPEC_CHARACTERISTIC_VALIDATOR_INVALID',
      statusCode: 400,
    });
  }
  if (definition.defaultValue !== undefined) {
    validateValueByType(definition.defaultValue, definition.valueType, 'defaultValue');
    validateDefinitionConstraints(definition.defaultValue, definition);
  }
};

const validateCharacteristicValue = (
  characteristic: Characteristic,
  definition: GeographicSiteSpecificationCharacteristic,
  previousDefinition?: GeographicSiteSpecificationCharacteristic,
): void => {
  const valueType = characteristic.valueType ?? definition.valueType;
  if (valueType !== definition.valueType) {
    throw new AppError('site characteristic value type mismatch', {
      code: previousDefinition
        ? 'GEO_SPEC_CHARACTERISTIC_CONSTRAINT_INVALID'
        : 'GEO_SITE_CHARACTERISTIC_TYPE_INVALID',
      statusCode: 409,
    });
  }
  validateValueByType(characteristic.value, definition.valueType, characteristic.name);
  validateDefinitionConstraints(characteristic.value, definition, previousDefinition);
};

const validateValueByType = (
  value: Characteristic['value'],
  valueType: CharacteristicValueType,
  fieldName: string,
): void => {
  if (value === null) return;
  switch (valueType) {
    case 'string':
    case 'date':
      if (typeof value !== 'string') throwInvalidType(fieldName, valueType);
      return;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value))
        throwInvalidType(fieldName, valueType);
      return;
    case 'decimal':
      if (typeof value !== 'number' || Number.isNaN(value)) throwInvalidType(fieldName, valueType);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') throwInvalidType(fieldName, valueType);
      return;
    case 'json':
      if (typeof value !== 'object') throwInvalidType(fieldName, valueType);
      return;
  }
};

const validateDefinitionConstraints = (
  value: Characteristic['value'],
  definition: GeographicSiteSpecificationCharacteristic,
  previousDefinition?: GeographicSiteSpecificationCharacteristic,
): void => {
  if (value === null) return;
  if (definition.regex && typeof value === 'string' && !new RegExp(definition.regex).test(value)) {
    throw new AppError('site characteristic does not satisfy regex validator', {
      code: previousDefinition
        ? 'GEO_SPEC_CHARACTERISTIC_CONSTRAINT_INVALID'
        : 'GEO_SITE_CHARACTERISTIC_VALUE_INVALID',
      statusCode: 409,
    });
  }
  if (
    definition.allowedValues &&
    !definition.allowedValues.some((item) => Object.is(item, value))
  ) {
    throw new AppError('site characteristic is outside allowed values', {
      code: previousDefinition
        ? 'GEO_SPEC_CHARACTERISTIC_CONSTRAINT_INVALID'
        : 'GEO_SITE_CHARACTERISTIC_VALUE_INVALID',
      statusCode: 409,
    });
  }
  if (typeof value === 'number') {
    if (definition.min !== undefined && value < definition.min) {
      throw new AppError('site characteristic is below min constraint', {
        code: previousDefinition
          ? 'GEO_SPEC_CHARACTERISTIC_CONSTRAINT_INVALID'
          : 'GEO_SITE_CHARACTERISTIC_VALUE_INVALID',
        statusCode: 409,
      });
    }
    if (definition.max !== undefined && value > definition.max) {
      throw new AppError('site characteristic is above max constraint', {
        code: previousDefinition
          ? 'GEO_SPEC_CHARACTERISTIC_CONSTRAINT_INVALID'
          : 'GEO_SITE_CHARACTERISTIC_VALUE_INVALID',
        statusCode: 409,
      });
    }
  }
};

const throwInvalidType = (fieldName: string, valueType: CharacteristicValueType): never => {
  throw new AppError(`${fieldName} must be ${valueType}`, {
    code: 'GEO_CHARACTERISTIC_VALUE_TYPE_INVALID',
    statusCode: 400,
  });
};

const resolveSpecIdList = (
  refs?: SpecRefInput[],
  ids?: string[],
  fallback: string[] = [],
): string[] => {
  const raw = refs
    ? refs.map((item) => (typeof item === 'string' ? item : item.id))
    : ids
      ? ids
      : fallback;
  const unique = new Set<string>();
  for (const id of raw) {
    assertRequiredString(id, 'specification reference id');
    unique.add(id.trim());
  }
  return [...unique];
};

const validateReferencedSpecs = async (
  ids: string[],
  lookup: (id: string) => Promise<GeographicSiteSpecification>,
  _currentSpecId?: string,
): Promise<void> => {
  for (const id of ids) {
    await lookup(id);
  }
};

const ensureSpecificationActive = (spec: GeographicSiteSpecification): void => {
  if (spec.lifecycleStatus !== 'Active') {
    throw new AppError('retired site specification cannot create or update sites', {
      code: 'GEO_SPEC_RETIRED',
      statusCode: 409,
    });
  }
};

const cloneCharacteristic = (characteristic: Characteristic): Characteristic => ({
  ...characteristic,
  value: cloneCharacteristicValue(characteristic.value),
});

const cloneCharacteristicValue = (value: Characteristic['value']): Characteristic['value'] => {
  if (value && typeof value === 'object') {
    return structuredClone(value);
  }
  return value;
};
