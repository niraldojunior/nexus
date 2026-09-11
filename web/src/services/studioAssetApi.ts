import { bearerToken } from './session';

export type StudioAsset = {
  '@type': 'StudioAsset';
  id: string;
  name: string;
  mimeType: 'image/svg+xml';
  checksum: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
};

let assetListRequest: Promise<StudioAsset[]> | null = null;

const headers = (): HeadersInit => ({ Authorization: `Bearer ${bearerToken()}` });

export async function listStudioAssets(): Promise<StudioAsset[]> {
  if (!assetListRequest) {
    assetListRequest = fetch('/v1/studio/assets', { headers: headers() })
      .then(async (response) => {
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as StudioAsset[]) : [];
        if (!response.ok) throw new Error(`Falha ao carregar assets (${response.status})`);
        return payload;
      })
      .finally(() => {
        assetListRequest = null;
      });
  }
  return await assetListRequest;
}

const assetDataUrls = new Map<string, Promise<string | undefined>>();

/** Obtém um SVG autenticado para pré-visualizações no Studio e no canvas do mapa. */
export function getStudioSvgAssetDataUrl(id: string): Promise<string | undefined> {
  const cached = assetDataUrls.get(id);
  if (cached) return cached;
  const request = fetch(`/v1/studio/assets/${encodeURIComponent(id)}`, { headers: headers() })
    .then(async (response) => {
      if (!response.ok) return undefined;
      const content = await response.text();
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(content)}`;
    })
    .catch(() => undefined);
  assetDataUrls.set(id, request);
  return request;
}

export async function createStudioSvgAsset(input: {
  name: string;
  content: string;
}): Promise<StudioAsset> {
  const response = await fetch('/v1/studio/assets', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, mimeType: 'image/svg+xml' }),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as StudioAsset) : undefined;
  if (!response.ok || !payload) throw new Error(`Falha ao enviar asset (${response.status})`);
  return payload;
}

export async function retireStudioAsset(id: string): Promise<void> {
  const response = await fetch(`/v1/studio/assets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!response.ok) throw new Error(`Falha ao inativar asset (${response.status})`);
}
