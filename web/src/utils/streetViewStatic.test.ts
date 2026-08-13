import { afterEach, describe, expect, it, vi } from 'vitest';

// A chave real do .env é injetada em `import.meta.env` durante os testes, mas o valor
// não é garantido em todo ambiente (ex.: CI sem `.env`) — fixar aqui deixa o teste
// determinístico, no mesmo padrão usado em GeoPage.test.tsx.
vi.mock('./googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleMaps')>();
  return { ...actual, GOOGLE_MAPS_KEY: 'test-key' };
});

const { fetchStreetViewAvailability, streetViewStaticUrl } = await import('./streetViewStatic');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchStreetViewAvailability', () => {
  it('mapeia status OK para disponível, com a posição real do panorama', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          status: 'OK',
          pano_id: 'panoABC',
          location: { lat: -22.8986, lng: -43.108 },
        }),
      }),
    );

    const result = await fetchStreetViewAvailability([-43.1079841, -22.8985597]);

    expect(result).toEqual({
      status: 'ok',
      panoramaPoint: [-43.108, -22.8986],
      panoId: 'panoABC',
    });
  });

  it('mapeia ZERO_RESULTS para indisponível', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ status: 'ZERO_RESULTS' }) }),
    );

    const result = await fetchStreetViewAvailability([-43.1079841, -22.8985597]);

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('mapeia REQUEST_DENIED (API desabilitada) para erro, preservando o código', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ status: 'REQUEST_DENIED' }) }),
    );

    const result = await fetchStreetViewAvailability([-43.1079841, -22.8985597]);

    expect(result).toEqual({ status: 'error', code: 'REQUEST_DENIED' });
  });

  it('mapeia falha de rede para erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await fetchStreetViewAvailability([-43.1079841, -22.8985597]);

    expect(result).toEqual({ status: 'error', code: 'NETWORK_ERROR' });
  });
});

describe('streetViewStaticUrl', () => {
  it('prefere pano ao location quando o panoId está disponível', () => {
    const url = streetViewStaticUrl(
      [-43.1079841, -22.8985597],
      { panoramaPoint: [-43.108, -22.8986], panoId: 'panoABC' },
      { width: 640, height: 320 },
    );

    expect(url).toContain('pano=panoABC');
    expect(url).not.toContain('location=');
    expect(url).toContain('size=640x320');
    expect(url).toContain('pitch=0');
    expect(url).toContain('fov=80');
  });

  it('cai para location quando não há panoId', () => {
    const url = streetViewStaticUrl(
      [-43.1079841, -22.8985597],
      { panoramaPoint: [-43.108, -22.8986] },
      { width: 640, height: 320 },
    );

    expect(url).toContain('location=-22.8986%2C-43.108');
    expect(url).not.toContain('pano=');
  });
});
