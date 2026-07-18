// Resolução de rótulo amigável para referências de local ({ id, '@referredType' }).
// Nunca expõe o hash/UUID: entrega Nome do local + Tipo + Endereço a partir do
// diretório Geo já disponível nos endpoints /v1/geo/*.

import type { GeoAddress, GeoLocation, GeoSite, GeoSpec } from '../services/geoApi';

// Tipo semântico de local, derivado da categoria TMF + nome do tipo.
// Substitui o antigo "layerForSpec" baseado só em string do nome.
export type SiteKind = 'CO' | 'POP' | 'CTO' | 'PI' | 'REGION' | 'SUBSITE' | 'SITE';

export const siteKindLabel: Record<SiteKind, string> = {
  CO: 'Estação (CO)',
  POP: 'POP',
  CTO: 'CTO / Armário',
  PI: 'Ponto de instalação',
  REGION: 'Região',
  SUBSITE: 'Sub-local',
  SITE: 'Local',
};

export const siteKindDescription: Record<SiteKind, string> = {
  CO: 'Central telefônica / estação com equipamentos ativos.',
  POP: 'Ponto de presença que agrega e distribui a rede.',
  CTO: 'Caixa/armário de terminação óptica na rua.',
  PI: 'Endereço final onde o cliente é atendido.',
  REGION: 'Agrupamento geográfico (cidade, bairro, área).',
  SUBSITE: 'Espaço interno de um local (sala, andar, gaveta).',
  SITE: 'Local genérico da planta externa.',
};

// Deriva o tipo semântico priorizando a categoria TMF e, dentro de 'Site',
// refinando pelo nome do tipo. Assim novos tipos cadastrados caem num bucket
// coerente sem precisar editar código.
export function siteKindFromSpec(spec?: GeoSpec): SiteKind {
  if (!spec) return 'SITE';
  if (spec.category === 'Region') return 'REGION';
  if (spec.category === 'FunctionalGroup') return 'REGION';
  if (spec.category === 'SubSite') return 'SUBSITE';
  const name = spec.name.toLowerCase();
  if (name.includes('central') || name === 'co' || name.includes('estac') || name.includes('estaç')) return 'CO';
  if (name.includes('pop') || name.includes('presenc') || name.includes('presenç')) return 'POP';
  if (name.includes('cto') || name.includes('armario') || name.includes('armário') || name.includes('caixa')) return 'CTO';
  if (name.includes('instalac') || name.includes('instalaç') || name === 'pi' || name.includes('cliente')) return 'PI';
  return 'SITE';
}

export function formatAddress(address: GeoAddress): string {
  return [address.street, address.streetNr, address.city, address.stateOrProvince, address.postcode]
    .filter(Boolean)
    .join(', ');
}

export function formatCoordinates(coordinates: [number, number]): string {
  return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

// Diretório indexado para resolução O(1) de qualquer referência de local.
export type GeoDirectory = {
  siteById: Map<string, GeoSite>;
  addressById: Map<string, GeoAddress>;
  locationById: Map<string, GeoLocation>;
  specById: Map<string, GeoSpec>;
  siteByLocationId: Map<string, GeoSite>;
  addressByLocationId: Map<string, GeoAddress>;
};

export function buildGeoDirectory(
  sites: GeoSite[],
  addresses: GeoAddress[],
  locations: GeoLocation[],
  specs: GeoSpec[],
): GeoDirectory {
  const siteByLocationId = new Map<string, GeoSite>();
  for (const site of sites) {
    if (site.place?.id) siteByLocationId.set(site.place.id, site);
  }
  const addressByLocationId = new Map<string, GeoAddress>();
  for (const address of addresses) {
    if (address.geographicLocationId) addressByLocationId.set(address.geographicLocationId, address);
  }
  return {
    siteById: new Map(sites.map((s) => [s.id, s])),
    addressById: new Map(addresses.map((a) => [a.id, a])),
    locationById: new Map(locations.map((l) => [l.id, l])),
    specById: new Map(specs.map((s) => [s.id, s])),
    siteByLocationId,
    addressByLocationId,
  };
}

// Opção de seleção de local para os pickers de Recurso/Serviço.
// Nunca usa o hash como rótulo: `label` é o nome amigável, `sublabel` traz
// tipo + endereço, e `search` concatena tudo para busca textual.
export type PlaceOption = {
  id: string;
  referredType: 'GeographicSite' | 'GeographicAddress';
  kind: SiteKind | null;
  label: string;
  sublabel: string;
  search: string;
};

// Reúne sites (Nome + tipo + endereço) e endereços avulsos como opções
// selecionáveis, ordenadas por rótulo. Endereços já cobertos por um site são
// omitidos para evitar duplicidade.
export function listPlaceOptions(directory: GeoDirectory): PlaceOption[] {
  const options: PlaceOption[] = [];
  const addressIdsUsedBySite = new Set<string>();

  for (const site of directory.siteById.values()) {
    if (site.address?.id) addressIdsUsedBySite.add(site.address.id);
    const spec = directory.specById.get(site.siteSpecificationId);
    const kind = siteKindFromSpec(spec);
    const address = site.address ? directory.addressById.get(site.address.id) : undefined;
    const typeLabel = spec?.name ?? siteKindLabel[kind];
    const addressText = address ? formatAddress(address) : '';
    options.push({
      id: site.id,
      referredType: 'GeographicSite',
      kind,
      label: site.name,
      sublabel: [typeLabel, addressText].filter(Boolean).join(' · '),
      search: [site.name, typeLabel, addressText].filter(Boolean).join(' ').toLowerCase(),
    });
  }

  for (const address of directory.addressById.values()) {
    if (addressIdsUsedBySite.has(address.id)) continue;
    const text = formatAddress(address);
    options.push({
      id: address.id,
      referredType: 'GeographicAddress',
      kind: null,
      label: text || 'Endereço',
      sublabel: 'Endereço',
      search: `${text} endereço`.toLowerCase(),
    });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
}

export type PlaceReference = { id: string; '@referredType'?: string } | undefined | null;

export type ResolvedPlaceLabel = {
  name: string;
  kind: SiteKind | null;
  typeLabel: string | null;
  address: string | null;
  // ID técnico preservado apenas para tooltip/detalhe — nunca é o texto principal.
  id: string;
  resolved: boolean;
};

function labelForSite(site: GeoSite, directory: GeoDirectory): ResolvedPlaceLabel {
  const spec = directory.specById.get(site.siteSpecificationId);
  const kind = siteKindFromSpec(spec);
  const address = site.address ? directory.addressById.get(site.address.id) : undefined;
  return {
    name: site.name,
    kind,
    typeLabel: spec?.name ?? siteKindLabel[kind],
    address: address ? formatAddress(address) : null,
    id: site.id,
    resolved: true,
  };
}

// Resolve { id, '@referredType' } para Nome + Tipo + Endereço, sem expor hash.
export function resolvePlaceLabel(place: PlaceReference, directory: GeoDirectory): ResolvedPlaceLabel | null {
  if (!place?.id) return null;
  const type = place['@referredType'];

  // Site direto.
  const directSite = directory.siteById.get(place.id);
  if (directSite && type !== 'GeographicAddress' && type !== 'GeographicLocation') {
    return labelForSite(directSite, directory);
  }

  // Location (ex.: ponto de um poste): tenta o site dono; senão endereço/coordenada.
  if (type === 'GeographicLocation' || directory.locationById.has(place.id)) {
    const owningSite = directory.siteByLocationId.get(place.id);
    if (owningSite) return labelForSite(owningSite, directory);
    const address = directory.addressByLocationId.get(place.id);
    const location = directory.locationById.get(place.id);
    const point = location?.geometry.type === 'Point' ? (location.geometry.coordinates as [number, number]) : null;
    return {
      name: location?.referencePoint ?? 'Ponto no mapa',
      kind: null,
      typeLabel: 'Ponto no mapa',
      address: address ? formatAddress(address) : point ? formatCoordinates(point) : null,
      id: place.id,
      resolved: Boolean(location),
    };
  }

  // Endereço direto.
  if (type === 'GeographicAddress' || directory.addressById.has(place.id)) {
    const address = directory.addressById.get(place.id);
    if (address) {
      return {
        name: formatAddress(address),
        kind: null,
        typeLabel: 'Endereço',
        address: null,
        id: place.id,
        resolved: true,
      };
    }
  }

  // Site como fallback final (caso o type não bata mas o id exista).
  if (directSite) return labelForSite(directSite, directory);

  return {
    name: 'Local não identificado',
    kind: null,
    typeLabel: null,
    address: null,
    id: place.id,
    resolved: false,
  };
}
