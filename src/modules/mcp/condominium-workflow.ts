import { AppError } from '../../shared/errors/app-error.js';
import type { NexusRuntime } from '../../shared/runtime/nexus-runtime.js';
import type { RelatedParty } from '../../shared/tmf/index.js';
import type { GeographicAddress, GeographicSite } from '../geo/domain.js';
import { normalizeAddressText } from '../geo/address-normalization.js';
import type { PhysicalResource } from '../resource/domain.js';

export type CondominiumWorkflowInput = {
  condominiumName?: string;
  address: {
    street: string;
    streetNr: string;
    city?: string;
    stateOrProvince?: string;
    postcode?: string;
    country?: string;
  };
  status?: 'planned' | 'active';
  relatedParty?: RelatedParty[];
  blocks: Array<{
    name: string;
    cdoiName: string;
  }>;
};

export type PreparedCondominiumWorkflow = {
  condominiumName: string;
  status: 'planned' | 'active';
  condominiumSpecificationId: string;
  blockSpecificationId: string;
  addressId: string;
  relatedParty: RelatedParty[];
  blocks: Array<{
    name: string;
    cdoiName: string;
    addressId: string;
    locationId: string;
    resourceId: string;
  }>;
};

export type CondominiumWorkflowResult = {
  condominium: GeographicSite;
  blocks: Array<{
    site: GeographicSite;
    cdoi: PhysicalResource;
  }>;
};

export const prepareCondominiumWorkflow = async (
  runtime: NexusRuntime,
  input: CondominiumWorkflowInput,
): Promise<PreparedCondominiumWorkflow> => {
  if (input.blocks.length === 0) {
    throw new AppError('at least one condominium block is required', {
      code: 'GEO_CONDOMINIUM_BLOCK_REQUIRED',
      statusCode: 422,
    });
  }

  const addresses = await runtime.geoService.listAddresses({
    ...input.address,
    includeCharacteristics: false,
    limit: 50,
  });
  if (addresses.length === 0) {
    throw new AppError('geographic address not found', {
      code: 'GEO_ADDRESS_NOT_FOUND',
      statusCode: 404,
    });
  }

  const [condominiumSpecification, blockSpecification] = await Promise.all([
    resolveSiteSpecification(runtime, 'CONDOMINIUM'),
    resolveSiteSpecification(runtime, 'BLOCK'),
  ]);
  const resolvedBlocks = await Promise.all(
    input.blocks.map(async (block) => {
      if (!block.name.trim() || !block.cdoiName.trim()) {
        throw new AppError('block name and CDOI name are required', {
          code: 'GEO_CONDOMINIUM_BLOCK_INVALID',
          statusCode: 422,
        });
      }
      const resource = await resolveCdoi(runtime, block.cdoiName);
      const address = resolveAddressForResource(addresses, resource);
      return {
        name: block.name.trim(),
        cdoiName: resource.name,
        addressId: address.id,
        locationId: address.geographicLocationId as string,
        resourceId: resource.id,
      };
    }),
  );

  const resourceIds = resolvedBlocks.map((block) => block.resourceId);
  if (new Set(resourceIds).size !== resourceIds.length) {
    throw new AppError('the same CDOI cannot be assigned to more than one block', {
      code: 'GEO_CONDOMINIUM_CDOI_DUPLICATE',
      statusCode: 409,
    });
  }

  return {
    condominiumName:
      input.condominiumName?.trim() ||
      `Condominio ${input.address.street.trim()}, ${input.address.streetNr.trim()}`,
    status: input.status ?? 'planned',
    condominiumSpecificationId: condominiumSpecification.id,
    blockSpecificationId: blockSpecification.id,
    addressId: addresses[0]!.id,
    relatedParty: input.relatedParty ?? [],
    blocks: resolvedBlocks,
  };
};

export const commitCondominiumWorkflow = async (
  runtime: NexusRuntime,
  prepared: PreparedCondominiumWorkflow,
): Promise<CondominiumWorkflowResult> =>
  await runtime.db.transaction(async () => {
    const condominium = await runtime.geoService.createSite({
      name: prepared.condominiumName,
      status: prepared.status,
      siteSpecificationId: prepared.condominiumSpecificationId,
      addressId: prepared.addressId,
      relatedParty: prepared.relatedParty.map((party) => ({
        id: party.id,
        ...(party.role ? { role: party.role } : {}),
      })),
    });

    const blocks: CondominiumWorkflowResult['blocks'] = [];
    for (const block of prepared.blocks) {
      const site = await runtime.geoService.createSite({
        name: block.name,
        status: prepared.status,
        siteSpecificationId: prepared.blockSpecificationId,
        parentSiteId: condominium.id,
        addressId: block.addressId,
        placeId: block.locationId,
        relatedParty: prepared.relatedParty.map((party) => ({
          id: party.id,
          ...(party.role ? { role: party.role } : {}),
        })),
      });
      const cdoi = await runtime.resourceService.updatePhysicalResource(block.resourceId, {
        placeId: site.id,
        placeType: 'GeographicSite',
      });
      blocks.push({ site, cdoi });
    }

    return { condominium, blocks };
  });

const resolveSiteSpecification = async (runtime: NexusRuntime, code: string) => {
  const matches = await runtime.geoService.listSpecs({ code, lifecycleStatus: 'Active', limit: 2 });
  const specification = matches.find((item) => item.code === code);
  if (!specification) {
    throw new AppError(`site specification ${code} not found`, {
      code: 'GEO_SPEC_NOT_FOUND',
      statusCode: 404,
    });
  }
  return specification;
};

const resolveCdoi = async (runtime: NexusRuntime, cdoiName: string): Promise<PhysicalResource> => {
  const expected = normalizeAddressText(cdoiName);
  const candidates = (
    await runtime.resourceService.listResources({
      name: cdoiName,
      kind: 'PhysicalResource',
      status: 'active',
      limit: 25,
    })
  ).filter(
    (resource): resource is PhysicalResource =>
      resource['@type'] === 'PhysicalResource' && resource.resourceType === 'CTO',
  );
  const exact = candidates.filter((resource) => normalizeAddressText(resource.name) === expected);
  const compatible =
    exact.length > 0
      ? exact
      : candidates.filter((resource) => normalizeAddressText(resource.name).startsWith(expected));
  if (compatible.length === 0) {
    throw new AppError(`CDOI ${cdoiName} not found`, {
      code: 'RESOURCE_CDOI_NOT_FOUND',
      statusCode: 404,
    });
  }
  if (compatible.length > 1) {
    throw new AppError(`CDOI ${cdoiName} is ambiguous`, {
      code: 'RESOURCE_CDOI_AMBIGUOUS',
      statusCode: 409,
    });
  }
  return compatible[0]!;
};

const resolveAddressForResource = (
  addresses: GeographicAddress[],
  resource: PhysicalResource,
): GeographicAddress => {
  const locationId =
    resource.place?.['@referredType'] === 'GeographicLocation' ? resource.place.id : undefined;
  const matches = locationId
    ? addresses.filter((address) => address.geographicLocationId === locationId)
    : [];
  if (matches.length === 1 && matches[0]?.geographicLocationId) return matches[0];
  if (addresses.length === 1 && addresses[0]?.geographicLocationId) return addresses[0];
  throw new AppError(`address location for CDOI ${resource.name} is ambiguous`, {
    code: 'GEO_CONDOMINIUM_ADDRESS_LOCATION_AMBIGUOUS',
    statusCode: 409,
  });
};
