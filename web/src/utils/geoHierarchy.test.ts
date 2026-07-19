import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildGeoDirectory, type GeoDirectory } from './placeLabel';
import {
  buildLocationHierarchy,
  childrenAt,
  isCableResource,
  nodeAt,
  type HierResource,
} from './geoHierarchy';
import type { GeoAddress, GeoLocation, GeoSite, GeoSpec } from '../services/geoApi';

// ---- Fixtures mínimas -------------------------------------------------------

const specRegion: GeoSpec = {
  '@type': 'GeographicSiteSpecification',
  id: 'spec-region',
  href: '',
  name: 'Região',
  category: 'Region',
  allowedParentSpecIds: [],
  allowedChildSpecIds: [],
};

const specCO: GeoSpec = {
  '@type': 'GeographicSiteSpecification',
  id: 'spec-co',
  href: '',
  name: 'Central Office',
  category: 'Site',
  allowedParentSpecIds: [],
  allowedChildSpecIds: [],
};

const addressNiteroi: GeoAddress = {
  '@type': 'GeographicAddress',
  id: 'addr-1',
  href: '',
  street: 'Rua X',
  city: 'Niterói',
  stateOrProvince: 'RJ',
  geographicLocationId: 'loc-1',
};

const locationCO: GeoLocation = {
  '@type': 'GeographicLocation',
  id: 'loc-co',
  href: '',
  geometryType: 'Point',
  geometry: { type: 'Point', coordinates: [-43.1, -22.9] },
  spatialRef: 'EPSG:4326',
};

const locationEquip: GeoLocation = {
  '@type': 'GeographicLocation',
  id: 'loc-equip',
  href: '',
  geometryType: 'Point',
  geometry: { type: 'Point', coordinates: [-43.2, -22.8] },
  spatialRef: 'EPSG:4326',
};

// Região "Centro" (Localidade) sob a qual pende a Central Office.
const regionCentro: GeoSite = {
  '@type': 'GeographicSite',
  id: 'site-centro',
  href: '',
  name: 'Centro',
  status: 'active',
  siteSpecificationId: 'spec-region',
  siteSpecification: { id: 'spec-region', '@referredType': 'GeographicSiteSpecification' },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
};

const siteCO: GeoSite = {
  '@type': 'GeographicSite',
  id: 'site-co',
  href: '',
  name: 'CO Niterói',
  status: 'active',
  siteSpecificationId: 'spec-co',
  siteSpecification: { id: 'spec-co', '@referredType': 'GeographicSiteSpecification' },
  place: { id: 'loc-co', '@referredType': 'GeographicLocation' },
  address: { id: 'addr-1', '@referredType': 'GeographicAddress' },
  parentSite: { id: 'site-centro', '@referredType': 'GeographicSite' },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
};

function makeDirectory(): GeoDirectory {
  // siteByLocationId precisa mapear a location do equipamento ao Site dono.
  const dir = buildGeoDirectory(
    [regionCentro, siteCO],
    [addressNiteroi],
    [locationCO, locationEquip],
    [specRegion, specCO],
  );
  // Equipamento posicionado na mesma Central (loc-equip pertence ao site-co).
  dir.siteByLocationId.set('loc-equip', siteCO);
  return dir;
}

const equipOLT: HierResource = {
  id: 'res-olt',
  name: 'OLT-01',
  '@type': 'PhysicalResource',
  resourceType: 'OLT',
  place: { id: 'loc-equip', '@referredType': 'GeographicLocation' },
};

const cableFiber: HierResource = {
  id: 'res-fiber',
  name: 'Fibra Feeder 01',
  '@type': 'PhysicalResource',
  resourceType: 'BackboneCable',
  place: { id: 'loc-equip', '@referredType': 'GeographicLocation' },
};

// ---- Testes -----------------------------------------------------------------

test('isCableResource distingue cabo de equipamento', () => {
  assert.equal(isCableResource({ resourceType: 'BackboneCable' }), true);
  assert.equal(isCableResource({ resourceType: 'DropCable' }), true);
  assert.equal(isCableResource({ resourceType: 'Fiber' }), true);
  assert.equal(isCableResource({ resourceType: 'OLT' }), false);
  assert.equal(isCableResource({ resourceType: 'Splitter' }), false);
});

test('buildLocationHierarchy monta UF → Município → Localidade → Entidade → Tipo → instância', () => {
  const dir = makeDirectory();
  const roots = buildLocationHierarchy(dir, [regionCentro, siteCO], [equipOLT, cableFiber]);

  // UF derivada do endereço.
  assert.equal(roots.length, 1);
  const uf = roots[0];
  assert.equal(uf.label, 'RJ');
  assert.equal(uf.count, 3); // 1 local + 1 equip + 1 cabo

  const municipio = childrenAt(roots, [uf.key])[0];
  assert.equal(municipio.label, 'Niterói');

  const localidade = childrenAt(roots, [uf.key, municipio.key])[0];
  // Localidade vem da Região ancestral "Centro".
  assert.equal(localidade.label, 'Centro');

  const entidades = childrenAt(roots, [uf.key, municipio.key, localidade.key]);
  const entidadeLabels = entidades.map((node) => node.label);
  assert.deepEqual(entidadeLabels, ['Local', 'Equipamento', 'Cabo']);
});

test('folha de instância carrega dados para seleção no mapa', () => {
  const dir = makeDirectory();
  const roots = buildLocationHierarchy(dir, [regionCentro, siteCO], [equipOLT]);
  const path = [
    'uf:RJ',
    'municipio:Niterói',
    'localidade:Centro',
    'entidade:Local',
    'tipo:Central Office',
  ];
  const tipoNode = nodeAt(roots, path);
  assert.ok(tipoNode);
  assert.equal(tipoNode!.children.length, 1);
  const leaf = tipoNode!.children[0];
  assert.equal(leaf.level, 'instancia');
  assert.equal(leaf.instance?.referredType, 'GeographicSite');
  assert.equal(leaf.instance?.id, 'site-co');
});

test('sites terminados são ocultados da árvore', () => {
  const dir = makeDirectory();
  const siteTerminado: GeoSite = { ...siteCO, id: 'site-co-old', name: 'CO Niterói (antigo)', status: 'terminated' };
  const roots = buildLocationHierarchy(dir, [regionCentro, siteCO, siteTerminado], []);
  const path = ['uf:RJ', 'municipio:Niterói', 'localidade:Centro', 'entidade:Local', 'tipo:Central Office'];
  const tipoNode = nodeAt(roots, path);
  assert.ok(tipoNode);
  // Só o site ativo aparece; o terminado é omitido.
  assert.equal(tipoNode!.children.length, 1);
  assert.equal(tipoNode!.children[0].instance?.id, 'site-co');
});

test('itens sem geografia caem em buckets "Sem ..."', () => {
  const dir = buildGeoDirectory([], [], [], []);
  const orphan: HierResource = { id: 'r1', name: 'X', resourceType: 'OLT' };
  const roots = buildLocationHierarchy(dir, [], [orphan]);
  assert.equal(roots[0].label, 'Sem UF');
});
