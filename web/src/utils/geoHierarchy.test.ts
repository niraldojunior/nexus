import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  collapseBranch,
  defaultExpandedRows,
  flattenTreeRows,
  isCableResource,
  type GeoTreeState,
} from './geoHierarchy';
import { treeNodePoint, treeNodeRoute, type GeoTreeNode } from '../services/geoTreeApi';

// ---- Fixtures ---------------------------------------------------------------

const node = (id: string, overrides: Partial<GeoTreeNode> = {}): GeoTreeNode => ({
  id,
  kind: 'resource',
  label: id,
  hasChildren: false,
  ...overrides,
});

// UF → Município → Estações → Estação → CDOE → splitter, como o servidor entrega.
function buildState(): GeoTreeState {
  const nodes: GeoTreeNode[] = [
    node('uf:RJ', { kind: 'uf', label: 'RJ', hasChildren: true, childCount: 1 }),
    node('city:RJ|Niterói', { kind: 'city', label: 'Niterói', hasChildren: true, childCount: 1 }),
    node('group:RJ|Niterói|stations', { kind: 'group', label: 'Estações', hasChildren: true, childCount: 1 }),
    node('site:est-1', {
      kind: 'site',
      label: 'Icaraí (ICI)',
      refId: 'est-1',
      referredType: 'GeographicSite',
      hasChildren: true,
      geometry: { type: 'Point', coordinates: [-43.1, -22.9] },
    }),
    node('resource:cdoe-1', {
      label: 'CDOE-1108 (ICI)',
      refId: 'cdoe-1',
      resourceType: 'CTO',
      hasChildren: true,
      geometry: { type: 'Point', coordinates: [-43.11, -22.91] },
    }),
    node('resource:spl-1', { label: 'CDOE-1108 · S32_1', refId: 'spl-1', resourceType: 'Splitter' }),
  ];

  return {
    nodesById: Object.fromEntries(nodes.map((item) => [item.id, item])),
    childIds: {
      'uf:RJ': ['city:RJ|Niterói'],
      'city:RJ|Niterói': ['group:RJ|Niterói|stations'],
      'group:RJ|Niterói|stations': ['site:est-1'],
      'site:est-1': ['resource:cdoe-1'],
      'resource:cdoe-1': ['resource:spl-1'],
    },
    totals: {
      'uf:RJ': 1,
      'city:RJ|Niterói': 1,
      'group:RJ|Niterói|stations': 1,
      // A estação tem 3.823 filhos diretos; só 1 veio na primeira página.
      'site:est-1': 3823,
      'resource:cdoe-1': 1,
    },
    rootIds: ['uf:RJ'],
  };
}

const rowKeys = (rows: ReturnType<typeof flattenTreeRows>) => rows.map((row) => row.rowKey);

// Monta o Set de rowKeys de uma cadeia de ancestrais, no mesmo formato que
// `flattenTreeRows`/`defaultExpandedRows` usam (`/uf:RJ/city:.../...`).
const expandChain = (...ids: string[]): Set<string> => {
  const keys = new Set<string>();
  let rowKey = '';
  for (const id of ids) {
    rowKey = `${rowKey}/${id}`;
    keys.add(rowKey);
  }
  return keys;
};

const ufKey = '/uf:RJ';
const cityKey = `${ufKey}/city:RJ|Niterói`;
const groupKey = `${cityKey}/group:RJ|Niterói|stations`;
const stationKey = `${groupKey}/site:est-1`;

// ---- Abertura ---------------------------------------------------------------

test('nada abre por padrão — só a UF aparece, fechada', () => {
  const state = buildState();
  const expanded = defaultExpandedRows(state);

  assert.deepEqual([...expanded], []);

  const rows = flattenTreeRows(state, expanded, new Set());
  assert.deepEqual(rowKeys(rows), [ufKey]);
  assert.equal(rows[0]?.expanded, false);
});

test('nó fechado não revela filhos já carregados', () => {
  const state = buildState();
  const rows = flattenTreeRows(state, new Set(['/uf:RJ']), new Set());
  assert.deepEqual(rowKeys(rows), ['/uf:RJ', '/uf:RJ/city:RJ|Niterói']);
});

// ---- Paginação --------------------------------------------------------------

test('remaining conta o que falta buscar, e só em nó aberto', () => {
  const state = buildState();
  const rows = flattenTreeRows(state, expandChain('uf:RJ', 'city:RJ|Niterói', 'group:RJ|Niterói|stations', 'site:est-1'), new Set());
  const station = rows.find((row) => row.rowKey === stationKey);
  assert.equal(station?.remaining, 3822);
  assert.equal(station?.total, 3823);

  const closed = flattenTreeRows(state, expandChain('uf:RJ', 'city:RJ|Niterói', 'group:RJ|Niterói|stations'), new Set());
  const closedStation = closed.find((row) => row.rowKey === stationKey);
  assert.equal(closedStation?.remaining, 0);
  // Fechado ou aberto, o total conhecido do servidor é o mesmo — só `remaining`
  // some quando fechado (nada para "carregar mais" enquanto não está visível).
  assert.equal(closedStation?.total, 3823);
});

test('nó nunca aberto não tem total (badge só aparece após expandir)', () => {
  const state = buildState();
  const cdoeKey = `${stationKey}/resource:cdoe-1`;
  const expanded = new Set([
    ...expandChain('uf:RJ', 'city:RJ|Niterói', 'group:RJ|Niterói|stations', 'site:est-1'),
    cdoeKey,
  ]);
  const rows = flattenTreeRows(state, expanded, new Set());
  // resource:spl-1 nunca foi expandido (o servidor nunca respondeu por ele) —
  // sem `state.totals['resource:spl-1']`, a linha não tem total conhecido.
  const splitter = rows.find((row) => row.node.id === 'resource:spl-1');
  assert.equal(splitter?.total, undefined);
});

test('nó em carga marca loading na própria linha', () => {
  const state = buildState();
  const expanded = expandChain('uf:RJ', 'city:RJ|Niterói', 'group:RJ|Niterói|stations');
  const rows = flattenTreeRows(state, expanded, new Set(['site:est-1']));
  assert.equal(rows.find((row) => row.node.id === 'site:est-1')?.loading, true);
});

// ---- Guarda de ciclo --------------------------------------------------------

test('aresta que volta para um ancestral não repete o item', () => {
  const state = buildState();
  // connectedTo é aresta de rede, não de contenção: o splitter aponta de volta
  // para o CDOE que o contém. Sem a guarda, isto recursaria para sempre.
  state.childIds['resource:spl-1'] = ['resource:cdoe-1'];
  state.nodesById['resource:spl-1']!.hasChildren = true;

  const expanded = expandChain(
    'uf:RJ',
    'city:RJ|Niterói',
    'group:RJ|Niterói|stations',
    'site:est-1',
    'resource:cdoe-1',
    'resource:spl-1',
  );

  const rows = flattenTreeRows(state, expanded, new Set());
  assert.equal(rows.filter((row) => row.node.id === 'resource:cdoe-1').length, 1);
});

// ---- Recolher ---------------------------------------------------------------

test('recolher um ramo fecha também o que estava aberto abaixo dele', () => {
  const expanded = new Set(['/uf:RJ', '/uf:RJ/city:A', '/uf:RJ/city:A/site:1', '/uf:SP']);
  assert.deepEqual([...collapseBranch(expanded, '/uf:RJ')], ['/uf:SP']);
});

// ---- Geometria dos nós ------------------------------------------------------

test('cabo desenha a rota e centraliza pelo vértice do meio dela', () => {
  const cabo = node('resource:cabo', {
    resourceType: 'DistributionCable',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-43.1, -22.9],
        [-43.11, -22.91],
        [-43.12, -22.92],
      ],
    },
  });

  assert.deepEqual(treeNodeRoute(cabo)?.length, 3);
  assert.deepEqual(treeNodePoint(cabo), [-43.11, -22.91]);
});

test('rota degenerada (menos de 2 vértices) não vira polyline', () => {
  const cabo = node('resource:cabo', {
    geometry: { type: 'LineString', coordinates: [[-43.1, -22.9]] },
  });
  assert.equal(treeNodeRoute(cabo), null);
});

test('nó sem geometria não vai ao mapa', () => {
  assert.equal(treeNodePoint(node('uf:RJ', { kind: 'uf' })), null);
});

// ---- Classificação de cabo --------------------------------------------------

test('classifica cabo por resourceType, spec ou nome', () => {
  assert.equal(isCableResource({ resourceType: 'DropCable' }), true);
  assert.equal(isCableResource({ resourceSpecification: { name: 'Cabo óptico 24FO' } }), true);
  assert.equal(isCableResource({ name: 'FIBRA-TRONCO-01' }), true);
  assert.equal(isCableResource({ resourceType: 'CTO', name: 'CDOE-1108' }), false);
});
