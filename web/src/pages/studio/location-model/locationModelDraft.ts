import type {
  GeoSiteRole,
  GeoSpec,
  GeoSpecCategory,
  GeoSpecCharacteristic,
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
  allowedParentLocalIds: string[];
  allowedChildLocalIds: string[];
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
};

type LocationModelSnapshot = { specifications?: LocationModelSnapshotSpec[] };

const defaultRole: GeoSiteRole = 'network';

export function draftSpecsFromGeoSpecs(specs: GeoSpec[]): LocationModelDraftSpec[] {
  const localIdByPersistedId = new Map(specs.map((spec) => [spec.id, spec.id]));
  return specs.map((spec) => ({
    localId: spec.id,
    persistedId: spec.id,
    code: spec.code,
    name: spec.name,
    category: spec.category,
    siteRole: spec.siteRole,
    lifecycleStatus: spec.lifecycleStatus,
    description: spec.description,
    specCharacteristic: spec.specCharacteristic ?? [],
    allowedParentLocalIds: spec.allowedParentSpecIds.map((id) => localIdByPersistedId.get(id) ?? id),
    allowedChildLocalIds: spec.allowedChildSpecIds.map((id) => localIdByPersistedId.get(id) ?? id),
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

  const canonicalByCode = new Map(canonicalSpecs.map((spec) => [spec.code.toUpperCase(), spec]));
  const localIdByCode = new Map(
    snapshotSpecs.map((spec) => [
      spec.code.toUpperCase(),
      canonicalByCode.get(spec.code.toUpperCase())?.id ?? `draft-${spec.code}`,
    ]),
  );

  return snapshotSpecs.map((spec) => {
    const canonical = canonicalByCode.get(spec.code.toUpperCase());
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
      allowedParentLocalIds: (spec.allowedParentCodes ?? [])
        .map((code) => localIdByCode.get(code.toUpperCase()))
        .filter((id): id is string => Boolean(id)),
      allowedChildLocalIds: (spec.allowedChildCodes ?? [])
        .map((code) => localIdByCode.get(code.toUpperCase()))
        .filter((id): id is string => Boolean(id)),
      bootstrapProtected: canonical?._bootstrapProtected,
    };
  });
}

export function buildLocationModelSnapshot(specs: LocationModelDraftSpec[]): Record<string, unknown> {
  const codeByLocalId = new Map(specs.map((spec) => [spec.localId, spec.code]));
  return {
    specifications: specs.map((spec) => ({
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
    })),
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
    allowedParentLocalIds: [],
    allowedChildLocalIds: [],
  };
}
