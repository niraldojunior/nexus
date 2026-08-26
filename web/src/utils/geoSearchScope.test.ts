import { beforeEach, describe, expect, it } from 'vitest';
import type { GeoTreeNode } from '../services/geoTreeApi';
import {
  GEO_SEARCH_SCOPES,
  nodeMatchesScope,
  readStoredSearchScope,
  resourceTypesForScope,
  scopeKinds,
  scopeSearchesAddresses,
  scopeSearchesInventory,
  writeStoredSearchScope,
} from './geoSearchScope';

const siteNode: GeoTreeNode = {
  id: 'site:1',
  kind: 'site',
  label: 'Estação Icaraí',
  hasChildren: false,
};

const ctoNode: GeoTreeNode = {
  id: 'resource:cto-1',
  kind: 'resource',
  label: 'CDOE 01',
  resourceType: 'CTO',
  hasChildren: false,
};

const poleNode: GeoTreeNode = {
  id: 'resource:pole-1',
  kind: 'resource',
  label: 'Poste 01',
  resourceType: 'Pole',
  hasChildren: false,
};

const cableNode: GeoTreeNode = {
  id: 'resource:cable-1',
  kind: 'resource',
  label: 'Cabo Backbone 1',
  resourceType: 'BackboneCable',
  hasChildren: false,
};

describe('resourceTypesForScope / scopeKinds', () => {
  it('não restringe tipo em "all" e "sites"', () => {
    expect(resourceTypesForScope('all')).toBeUndefined();
    expect(resourceTypesForScope('sites')).toBeUndefined();
  });

  it('restringe "infrastructure" ao vocabulário de infra civil (mesmo grupo de mapLayers)', () => {
    expect(resourceTypesForScope('infrastructure')).toEqual(
      expect.arrayContaining(['Pole', 'Manhole', 'Tower', 'Duct']),
    );
  });

  it('restringe "cto" e "cable" aos próprios tipos', () => {
    expect(resourceTypesForScope('cto')).toEqual(['CTO']);
    expect(resourceTypesForScope('cable')).toEqual(
      expect.arrayContaining(['Fiber', 'DistributionCable', 'BackboneCable', 'DropCable']),
    );
  });

  it('"sites" busca só Site; "all" busca os dois; os demais só Recurso', () => {
    expect(scopeKinds('sites')).toEqual(['site']);
    expect(scopeKinds('all')).toEqual(['site', 'resource']);
    expect(scopeKinds('cto')).toEqual(['resource']);
    expect(scopeKinds('cable')).toEqual(['resource']);
    expect(scopeKinds('infrastructure')).toEqual(['resource']);
  });
});

describe('scopeSearchesInventory / scopeSearchesAddresses', () => {
  it('só "address" desliga o inventário', () => {
    expect(scopeSearchesInventory('address')).toBe(false);
    expect(scopeSearchesInventory('all')).toBe(true);
    expect(scopeSearchesInventory('cto')).toBe(true);
  });

  it('só "all" e "address" consultam o Google', () => {
    expect(scopeSearchesAddresses('all')).toBe(true);
    expect(scopeSearchesAddresses('address')).toBe(true);
    expect(scopeSearchesAddresses('sites')).toBe(false);
    expect(scopeSearchesAddresses('cable')).toBe(false);
  });
});

describe('nodeMatchesScope', () => {
  it('"all" aceita qualquer nó', () => {
    expect(nodeMatchesScope(siteNode, 'all')).toBe(true);
    expect(nodeMatchesScope(cableNode, 'all')).toBe(true);
  });

  it('"address" nunca casa com um GeoTreeNode (é histórico de endereço, não de nó)', () => {
    expect(nodeMatchesScope(siteNode, 'address')).toBe(false);
  });

  it('"sites" só casa com Site', () => {
    expect(nodeMatchesScope(siteNode, 'sites')).toBe(true);
    expect(nodeMatchesScope(cableNode, 'sites')).toBe(false);
  });

  it('"cto" só casa com recurso de tipo CTO', () => {
    expect(nodeMatchesScope(ctoNode, 'cto')).toBe(true);
    expect(nodeMatchesScope(poleNode, 'cto')).toBe(false);
    expect(nodeMatchesScope(siteNode, 'cto')).toBe(false);
  });

  it('"infrastructure" casa com Poste mas não com CTO nem Cabo', () => {
    expect(nodeMatchesScope(poleNode, 'infrastructure')).toBe(true);
    expect(nodeMatchesScope(ctoNode, 'infrastructure')).toBe(false);
    expect(nodeMatchesScope(cableNode, 'infrastructure')).toBe(false);
  });

  it('"cable" casa com Cabo Backbone mas não com Poste', () => {
    expect(nodeMatchesScope(cableNode, 'cable')).toBe(true);
    expect(nodeMatchesScope(poleNode, 'cable')).toBe(false);
  });
});

describe('readStoredSearchScope / writeStoredSearchScope', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sem valor salvo, default é "all"', () => {
    expect(readStoredSearchScope()).toBe('all');
  });

  it('grava e lê de volta um modo válido', () => {
    writeStoredSearchScope('cable');
    expect(readStoredSearchScope()).toBe('cable');
  });

  it('valor desconhecido no storage cai no default "all"', () => {
    window.localStorage.setItem('nexus.geo.searchScope', 'not-a-scope');
    expect(readStoredSearchScope()).toBe('all');
  });

  it('todo id do catálogo é um valor round-trip válido', () => {
    for (const scope of GEO_SEARCH_SCOPES) {
      writeStoredSearchScope(scope.id);
      expect(readStoredSearchScope()).toBe(scope.id);
    }
  });
});
