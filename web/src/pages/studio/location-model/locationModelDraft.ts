import type {
  GeoSiteRole,
  GeoSpec,
  GeoSpecCategory,
  GeoSpecCharacteristic,
  VisualIdentity,
} from '../../../services/geoApi';

export type LocationModelDraftSpec = {
  localId: string;
  persistedId?: string;
  code: string;
  name: string;
  category: GeoSpecCategory;
  siteRole: GeoSiteRole;
  lifecycleStatus: 'Active' | 'Retired';
  description?: string;
  specCharacteristic: GeoSpecCharacteristic[];
  /** Baseline canônica usada somente para detectar transições obrigatórias na publicação. */
  baselineSpecCharacteristic: GeoSpecCharacteristic[];
  allowedParentLocalIds: string[];
  allowedChildLocalIds: string[];
  visualIdentity?: VisualIdentity;
  bootstrapProtected?: boolean;
};

type LocationModelSnapshotSpec = {
  code: string;
  name: string;
  category: GeoSpecCategory;
  siteRole?: GeoSiteRole;
  lifecycleStatus?: 'Active' | 'Retired';
  description?: string;
  allowedParentCodes?: string[];
  allowedChildCodes?: string[];
  specCharacteristic?: GeoSpecCharacteristic[];
  visualIdentity?: VisualIdentity | null;
  migrationStrategy?: { type: 'fillMissingWithDefault' };
};

type LocationModelSnapshot = { specifications?: LocationModelSnapshotSpec[] };

const defaultRole: GeoSiteRole = 'network';
const LEGACY_FUNCTIONAL_GROUP_CODE = 'FUNCTIONAL_GROUP';

/** Só o artefato histórico removido pelo bootstrap é omitido; specs aposentadas pelo usuário ficam. */
function isLegacyFunctionalGroup(spec: {
  code?: string;
  category?: string;
  lifecycleStatus?: string;
}): boolean {
  return (
    spec.code?.trim().toUpperCase() === LEGACY_FUNCTIONAL_GROUP_CODE &&
    (spec.lifecycleStatus === 'Retired' || spec.category === 'FunctionalGroup')
  );
}

export function draftSpecsFromGeoSpecs(specs: GeoSpec[]): LocationModelDraftSpec[] {
  const activeSpecs = specs.filter((spec) => !isLegacyFunctionalGroup(spec));
  const localIdByPersistedId = new Map(activeSpecs.map((spec) => [spec.id, spec.id]));
  return activeSpecs.map((spec) => ({
    localId: spec.id,
    persistedId: spec.id,
    code: spec.code,
    name: spec.name,
    category: spec.category,
    siteRole: spec.siteRole,
    lifecycleStatus: spec.lifecycleStatus,
    description: spec.description,
    specCharacteristic: spec.specCharacteristic ?? [],
    baselineSpecCharacteristic: structuredClone(spec.specCharacteristic ?? []),
    allowedParentLocalIds: spec.allowedParentSpecIds
      .map((id) => localIdByPersistedId.get(id))
      .filter((id): id is string => Boolean(id)),
    allowedChildLocalIds: spec.allowedChildSpecIds
      .map((id) => localIdByPersistedId.get(id))
      .filter((id): id is string => Boolean(id)),
    visualIdentity: spec.visualIdentity,
    bootstrapProtected: spec._bootstrapProtected,
  }));
}

/** Reconstitui um draft publicado usando a spec canônica apenas como metadado de UI. */
export function draftSpecsFromSnapshot(
  snapshot: Record<string, unknown>,
  canonicalSpecs: GeoSpec[],
): LocationModelDraftSpec[] | null {
  const snapshotSpecs = (snapshot as LocationModelSnapshot).specifications;
  if (!Array.isArray(snapshotSpecs)) return null;

  const compatibleSpecs = snapshotSpecs.filter((spec) => !isLegacyFunctionalGroup(spec));
  const canonicalByCode = new Map(canonicalSpecs.map((spec) => [spec.code.toUpperCase(), spec]));
  const localIdByCode = new Map(
    compatibleSpecs.map((spec) => [
      spec.code.toUpperCase(),
      canonicalByCode.get(spec.code.toUpperCase())?.id ?? `draft-${spec.code}`,
    ]),
  );

  return compatibleSpecs.map((spec) => {
    const canonical = canonicalByCode.get(spec.code.toUpperCase());
    const resolvedVisualIdentity =
      spec.visualIdentity !== undefined
        ? (spec.visualIdentity ?? undefined)
        : canonical?.visualIdentity;
    return {
      localId: canonical?.id ?? localIdByCode.get(spec.code.toUpperCase()) ?? `draft-${spec.code}`,
      persistedId: canonical?.id,
      code: spec.code,
      name: spec.name,
      category: spec.category,
      siteRole: spec.siteRole ?? canonical?.siteRole ?? defaultRole,
      lifecycleStatus: spec.lifecycleStatus ?? canonical?.lifecycleStatus ?? 'Active',
      description: spec.description,
      specCharacteristic: spec.specCharacteristic ?? [],
      baselineSpecCharacteristic: structuredClone(canonical?.specCharacteristic ?? []),
      allowedParentLocalIds: (spec.allowedParentCodes ?? [])
        .map((code) => localIdByCode.get(code.toUpperCase()))
        .filter((id): id is string => Boolean(id)),
      allowedChildLocalIds: (spec.allowedChildCodes ?? [])
        .map((code) => localIdByCode.get(code.toUpperCase()))
        .filter((id): id is string => Boolean(id)),
      visualIdentity: resolvedVisualIdentity,
      bootstrapProtected: canonical?._bootstrapProtected,
    };
  });
}

export function buildLocationModelSnapshot(
  specs: LocationModelDraftSpec[],
): Record<string, unknown> {
  const compatibleSpecs = specs.filter((spec) => !isLegacyFunctionalGroup(spec));
  const codeByLocalId = new Map(compatibleSpecs.map((spec) => [spec.localId, spec.code]));
  return {
    specifications: compatibleSpecs.map((spec) => {
      const baselineByName = new Map(
        spec.baselineSpecCharacteristic.map((item) => [item.name.trim().toLowerCase(), item]),
      );
      const introducesMandatoryCharacteristic = Boolean(
        spec.persistedId &&
        spec.specCharacteristic.some((item) => {
          const baseline = baselineByName.get(item.name.trim().toLowerCase());
          return item.mandatory && (!baseline || !baseline.mandatory);
        }),
      );
      return {
        code: spec.code,
        name: spec.name,
        category: spec.category,
        siteRole: spec.siteRole,
        ...(spec.description?.trim() ? { description: spec.description.trim() } : {}),
        lifecycleStatus: spec.lifecycleStatus,
        allowedParentCodes: spec.allowedParentLocalIds
          .map((id) => codeByLocalId.get(id))
          .filter((code): code is string => Boolean(code)),
        allowedChildCodes: spec.allowedChildLocalIds
          .map((id) => codeByLocalId.get(id))
          .filter((code): code is string => Boolean(code)),
        specCharacteristic: spec.specCharacteristic,
        ...(introducesMandatoryCharacteristic
          ? { migrationStrategy: { type: 'fillMissingWithDefault' as const } }
          : {}),
        ...(spec.visualIdentity !== undefined ? { visualIdentity: spec.visualIdentity } : {}),
      };
    }),
  };
}

export function createLocationDraftSpec(): LocationModelDraftSpec {
  const token = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return {
    localId: `draft-${token}`,
    code: `STUDIO_LOCATION_${token}`,
    name: 'Novo item',
    category: 'Site',
    siteRole: defaultRole,
    lifecycleStatus: 'Active',
    specCharacteristic: [],
    baselineSpecCharacteristic: [],
    allowedParentLocalIds: [],
    allowedChildLocalIds: [],
  };
}
