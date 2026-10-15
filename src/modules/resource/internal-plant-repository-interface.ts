import type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
  InternalPlantResourceQuery,
  InternalPlantSiteContext,
} from './internal-plant-domain.js';

export interface IInternalPlantRepository {
  roots(tenantId: string): Promise<InternalPlantLocationRootNode[]>;

  children(
    nodeId: string,
    options: { tenantId: string; limit: number; offset: number },
  ): Promise<InternalPlantLocationChildrenPage>;

  getSiteContext(siteId: string, tenantId: string): Promise<InternalPlantSiteContext | undefined>;

  listResources(query: InternalPlantResourceQuery): Promise<InternalPlantResourcePage>;
}
