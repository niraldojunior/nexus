import { describe, expect, it } from 'vitest';
import {
  deterministicUuid,
  netwinCableId,
  netwinEquipmentId,
  netwinLocationId,
  netwinPartyId,
  netwinRouteId,
  NEXUS_NETWIN_NAMESPACE,
} from '../src/scripts/netwin-migration/identity.js';
import { parseAddressString } from '../src/scripts/netwin-migration/phase2-locations.js';
import { CANONICAL_SITE_SPECS } from '../src/scripts/netwin-migration/phase1-site-specs.js';
import { CANONICAL_RESOURCE_TYPES } from '../src/scripts/netwin-migration/phase1-resource-specs.js';

describe('netwin-migration: identity & deterministic UUIDs', () => {
  const UUID_V5_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('gera UUIDs v5 válidos no padrão RFC 4122', () => {
    const id = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'TEST:123');
    expect(id).toMatch(UUID_V5_REGEX);
  });

  it('é 100% determinístico para o mesmo input', () => {
    const id1 = netwinLocationId(475412);
    const id2 = netwinLocationId(475412);
    expect(id1).toBe(id2);
  });

  it('garante isolamento por namespace mesmo quando o ID numérico é idêntico', () => {
    const locId = netwinLocationId(100);
    const eqId = netwinEquipmentId(100);
    const cableId = netwinCableId(100);
    const routeId = netwinRouteId(100);
    const partyId = netwinPartyId(100);

    const ids = new Set([locId, eqId, cableId, routeId, partyId]);
    expect(ids.size).toBe(5);
  });
});

describe('netwin-migration: address parsing', () => {
  it('faz o parse correto de endereço padrão Netwin', () => {
    const raw = 'RUA ATAULPHO COUTINHO, 80, BLOCO 1, BARRA DA TIJUCA, RIO DE JANEIRO - RJ 22793520';
    const parsed = parseAddressString(raw);
    expect(parsed).toEqual({
      street: 'RUA ATAULPHO COUTINHO',
      streetNr: '80',
      locality: 'BARRA DA TIJUCA',
      city: 'RIO DE JANEIRO',
      stateOrProvince: 'RJ',
      postcode: '22793520',
    });
  });

  it('retorna null para endereço vazio', () => {
    expect(parseAddressString('')).toBeNull();
    expect(parseAddressString(null)).toBeNull();
  });
});

describe('netwin-migration: phase 1 canonical catalogs', () => {
  it('contém as especificações canônicas de site com categoria e papel funcional (C11)', () => {
    const co = CANONICAL_SITE_SPECS.find((s) => s.code === 'CENTRAL_OFFICE');
    expect(co).toBeDefined();
    expect(co?.category).toBe('Site');
    expect(co?.siteRole).toBe('network');

    const room = CANONICAL_SITE_SPECS.find((s) => s.code === 'ROOM');
    expect(room?.category).toBe('SubSite');
    expect(room?.siteRole).toBe('network');
  });

  it('contém os tipos canônicos de recursos para equipamentos, cabos e civil', () => {
    const codes = new Set(CANONICAL_RESOURCE_TYPES.map((r) => r.code));
    expect(codes.has('category:CDOE')).toBe(true);
    expect(codes.has('SpliceClosure')).toBe(true);
    expect(codes.has('BackboneCable')).toBe(true);
    expect(codes.has('Pole')).toBe(true);
    expect(codes.has('Manhole')).toBe(true);
  });
});
