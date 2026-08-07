import { afterEach, describe, expect, it, vi } from 'vitest';

// A chave real do .env é injetada em `import.meta.env` durante os testes, mas o valor
// não é garantido em todo ambiente (ex.: CI sem `.env`) — e sem chave os clientes REST
// curto-circuitam. Mesmo padrão de streetViewStatic.test.ts.
vi.mock('./googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleMaps')>();
  return { ...actual, GOOGLE_MAPS_KEY: 'test-key' };
});

const { bboxAround, computeWalkRoute, computeWalkRouteMatrix, decodePolyline, haversineMeters } =
  await import('./googleRoutes');

afterEach(() => {
  vi.unstubAllGlobals();
});

const mockFetch = (payload: unknown, ok = true) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => payload });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('decodePolyline', () => {
  it('decodifica o exemplo canônico do Google em [lng, lat]', () => {
    // Exemplo da documentação da Google: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453).
    const path = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(path).toHaveLength(3);
    expect(path[0][1]).toBeCloseTo(38.5, 5);
    expect(path[0][0]).toBeCloseTo(-120.2, 5);
    expect(path[1][1]).toBeCloseTo(40.7, 5);
    expect(path[2][0]).toBeCloseTo(-126.453, 5);
  });

  it('devolve lista vazia para string vazia', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('haversineMeters', () => {
  it('mede uma distância curta conhecida', () => {
    // Um grau de latitude vale ~111,2 km; 0,001° ≈ 111 m.
    const meters = haversineMeters([-43.1, -22.9], [-43.1, -22.901]);
    expect(meters).toBeGreaterThan(105);
    expect(meters).toBeLessThan(118);
  });

  it('é zero para o mesmo ponto', () => {
    expect(haversineMeters([-43.1, -22.9], [-43.1, -22.9])).toBe(0);
  });
});

describe('bboxAround', () => {
  it('circunscreve o raio pedido', () => {
    const bounds = bboxAround([-43.1, -22.9], 300);
    // 300 m ≈ 0,0027° de latitude.
    expect(bounds.maxLat - bounds.minLat).toBeCloseTo(0.0054, 3);
    // Perto do equador a caixa é quase quadrada em graus, mas a longitude é sempre
    // mais larga (dividida pelo cosseno da latitude).
    expect(bounds.maxLng - bounds.minLng).toBeGreaterThan(bounds.maxLat - bounds.minLat);
    // O canto do bbox fica fora do círculo, mas nenhum ponto a 300 m escapa dele.
    expect(haversineMeters([-43.1, -22.9], [-43.1, bounds.maxLat])).toBeCloseTo(300, 0);
  });
});

describe('computeWalkRouteMatrix', () => {
  it('reindexa a resposta por destinationIndex (a API não devolve em ordem)', async () => {
    mockFetch([
      { originIndex: 0, destinationIndex: 2, distanceMeters: 453, duration: '365s', condition: 'ROUTE_EXISTS' },
      { originIndex: 0, destinationIndex: 0, distanceMeters: 329, duration: '276s', condition: 'ROUTE_EXISTS' },
      { originIndex: 0, destinationIndex: 1, distanceMeters: 443, duration: '357s', condition: 'ROUTE_EXISTS' },
    ]);

    const legs = await computeWalkRouteMatrix(
      [-43.1, -22.9],
      [
        [-43.101, -22.901],
        [-43.0995, -22.9015],
        [-43.1022, -22.8988],
      ],
    );

    expect(legs.map((leg) => leg?.distanceMeters)).toEqual([329, 443, 453]);
    expect(legs[0]?.durationSeconds).toBe(276);
  });

  it('devolve null onde não existe rota', async () => {
    mockFetch([
      { originIndex: 0, destinationIndex: 0, condition: 'ROUTE_NOT_FOUND' },
      { originIndex: 0, destinationIndex: 1, distanceMeters: 120, duration: '90s', condition: 'ROUTE_EXISTS' },
    ]);

    const legs = await computeWalkRouteMatrix(
      [-43.1, -22.9],
      [
        [-43.101, -22.901],
        [-43.0995, -22.9015],
      ],
    );

    expect(legs[0]).toBeNull();
    expect(legs[1]?.distanceMeters).toBe(120);
  });

  it('cai para uma lista de null quando a chamada falha', async () => {
    mockFetch({ error: 'PERMISSION_DENIED' }, false);
    const legs = await computeWalkRouteMatrix([-43.1, -22.9], [[-43.101, -22.901]]);
    expect(legs).toEqual([null]);
  });

  it('não chama a API sem destinos', async () => {
    const fetchMock = mockFetch([]);
    await expect(computeWalkRouteMatrix([-43.1, -22.9], [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('computeWalkRoute', () => {
  it('devolve distância, duração e traçado decodificado', async () => {
    mockFetch({
      routes: [
        {
          distanceMeters: 329,
          duration: '276s',
          polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
        },
      ],
    });

    const route = await computeWalkRoute([-43.1, -22.9], [-43.101, -22.901]);
    expect(route?.distanceMeters).toBe(329);
    expect(route?.durationSeconds).toBe(276);
    expect(route?.path).toHaveLength(2);
  });

  it('devolve null quando a resposta vem sem rota', async () => {
    mockFetch({ routes: [] });
    await expect(computeWalkRoute([-43.1, -22.9], [-43.101, -22.901])).resolves.toBeNull();
  });
});
