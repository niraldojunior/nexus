import type { IStudioAssetRepository } from './asset-repository-interface.js';
import type { StudioAsset } from './asset-service.js';

/** In-memory asset store used by Studio unit tests. */
export class StudioAssetRepository implements IStudioAssetRepository {
  private readonly assets = new Map<string, StudioAsset>();

  public insert(asset: StudioAsset): StudioAsset {
    const stored = { ...asset };
    this.assets.set(stored.id, stored);
    return { ...stored };
  }

  public get(tenantId: string, id: string): StudioAsset | undefined {
    const asset = this.assets.get(id);
    return asset?.tenantId === tenantId ? { ...asset } : undefined;
  }

  public list(tenantId: string, options: { active?: boolean } = {}): StudioAsset[] {
    return [...this.assets.values()]
      .filter((asset) => asset.tenantId === tenantId)
      .filter((asset) => options.active === undefined || asset.active === options.active)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((asset) => ({ ...asset }));
  }

  public retire(
    tenantId: string,
    id: string,
    retiredAt: string,
    retiredBy: string,
  ): StudioAsset | undefined {
    const asset = this.assets.get(id);
    if (!asset || asset.tenantId !== tenantId) return undefined;
    const retired: StudioAsset = { ...asset, active: false, retiredAt, retiredBy };
    this.assets.set(id, retired);
    return { ...retired };
  }
}
