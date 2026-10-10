import type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
  InternalPlantResourceQuery,
} from './internal-plant-domain.js';

export interface IInternalPlantRepository {
  roots(tenantId: string): Promise<InternalPlantLocationRootNode[]>;

  children(
    nodeId: string,
    options: { tenantId: string; limit: number; offset: number },
  ): Promise<InternalPlantLocationChildrenPage>;

  listResources(query: InternalPlantResourceQuery): Promise<InternalPlantResourcePage>;
}
