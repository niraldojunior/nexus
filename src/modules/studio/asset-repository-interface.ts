import type { StudioAsset } from './asset-service.js';

type Awaitable<T> = T | Promise<T>;

export interface IStudioAssetRepository {
  insert(asset: StudioAsset): Awaitable<StudioAsset>;
  get(tenantId: string, id: string): Awaitable<StudioAsset | undefined>;
  list(tenantId: string, options?: { active?: boolean }): Awaitable<StudioAsset[]>;
  retire(tenantId: string, id: string, retiredAt: string, retiredBy: string): Awaitable<StudioAsset | undefined>;
}
