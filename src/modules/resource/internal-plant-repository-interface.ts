import type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
  InternalPlantResourceQuery,
  InternalPlantSiteContext,
  InternalPlantSitePage,
  InternalPlantSiteQuery,
} from './internal-plant-domain.js';

export interface IInternalPlantRepository {
  roots(tenantId: string): Promise<InternalPlantLocationRootNode[]>;

  children(
    nodeId: string,
    options: { tenantId: string; limit: number; offset: number },
  ): Promise<InternalPlantLocationChildrenPage>;

  getSiteContext(siteId: string, tenantId: string): Promise<InternalPlantSiteContext | undefined>;

  listSites(query: InternalPlantSiteQuery): Promise<InternalPlantSitePage>;

  listResources(query: InternalPlantResourceQuery): Promise<InternalPlantResourcePage>;
}
