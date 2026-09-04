import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import type { ResourceService } from '../../resource/service.js';
import type {
  ResourceCatalogNodeKind,
  ResourceCatalogStatus,
  ResourceModelSnapshot,
  CreateResourceCatalogNodeInput,
  UpdateResourceCatalogNodeInput,
} from '../../resource/domain.js';

export class ResourceModelStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'resource-model';

  constructor(private readonly resourceService: ResourceService) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typedSnapshot = snapshot as unknown as Partial<ResourceModelSnapshot>;

    if (!typedSnapshot.catalog) {
      issues.push({
        severity: 'error',
        code: 'CATALOG_REQUIRED',
        message: 'O catálogo de recursos é obrigatório no snapshot.',
        path: 'catalog',
      });
    } else {
      if (!typedSnapshot.catalog.code?.trim()) {
        issues.push({
          severity: 'error',
          code: 'CATALOG_CODE_REQUIRED',
          message: 'O código do catálogo é obrigatório.',
          path: 'catalog.code',
        });
      }
      if (!typedSnapshot.catalog.name?.trim()) {
        issues.push({
          severity: 'error',
          code: 'CATALOG_NAME_REQUIRED',
          message: 'O nome do catálogo é obrigatório.',
          path: 'catalog.name',
        });
      }
    }

    const nodes = typedSnapshot.nodes ?? [];
    if (!Array.isArray(nodes)) {
      issues.push({
        severity: 'error',
        code: 'NODES_ARRAY_REQUIRED',
        message: 'A lista de nós (nodes) deve ser um array.',
        path: 'nodes',
      });
      return {
        valid: false,
        issues,
        validatedAt: new Date().toISOString(),
      };
    }

    const codeSet = new Set<string>();
    const nodeIdentifierMap = new Map<string, { code: string; index: number; kind?: ResourceCatalogNodeKind }>();

    // 1ª passada: valida campos individuais e unicidade de código
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const pathPrefix = `nodes[${i}]`;

      if (!node.code?.trim()) {
        issues.push({
          severity: 'error',
          code: 'NODE_CODE_REQUIRED',
          message: `O código do nó é obrigatório.`,
          path: `${pathPrefix}.code`,
        });
      } else {
        const normalizedCode = node.code.trim();
        if (codeSet.has(normalizedCode)) {
          issues.push({
            severity: 'error',
            code: 'NODE_CODE_DUPLICATE',
            message: `Código duplicado na árvore: ${normalizedCode}.`,
            path: `${pathPrefix}.code`,
          });
        }
        codeSet.add(normalizedCode);
        nodeIdentifierMap.set(normalizedCode, { code: normalizedCode, index: i, kind: node.kind });
        if (node.id) {
          nodeIdentifierMap.set(node.id, { code: normalizedCode, index: i, kind: node.kind });
        }
      }

      if (!node.name?.trim()) {
        issues.push({
          severity: 'error',
          code: 'NODE_NAME_REQUIRED',
          message: `O nome do nó é obrigatório.`,
          path: `${pathPrefix}.name`,
        });
      }

      if (node.kind !== 'GROUP' && node.kind !== 'RESOURCE_TYPE') {
        issues.push({
          severity: 'error',
          code: 'NODE_KIND_INVALID',
          message: `Tipo de nó inválido: ${String(node.kind)}. Deve ser GROUP ou RESOURCE_TYPE.`,
          path: `${pathPrefix}.kind`,
        });
      }

      if (node.kind === 'RESOURCE_TYPE') {
        if (!node.resourceTypeId && !node.resourceTypeCode) {
          issues.push({
            severity: 'error',
            code: 'NODE_RESOURCE_TYPE_REQUIRED',
            message: `Nó do tipo RESOURCE_TYPE deve referenciar um tipo de recurso.`,
            path: `${pathPrefix}.resourceTypeCode`,
          });
        }
      }
    }

    // 2ª passada: valida integridade de pais e ciclos
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const parentRef = node.parentNodeId ?? node.parentCode;
      if (!parentRef) continue;

      const parent = nodeIdentifierMap.get(parentRef);
      if (!parent) {
        issues.push({
          severity: 'error',
          code: 'NODE_PARENT_NOT_FOUND',
          message: `Nó pai '${parentRef}' não foi encontrado no snapshot.`,
          path: `nodes[${i}].parentCode`,
        });
        continue;
      }

      if (parent.kind !== 'GROUP') {
        issues.push({
          severity: 'error',
          code: 'NODE_PARENT_MUST_BE_GROUP',
          message: `O pai '${parentRef}' deve ser do tipo GROUP (nós RESOURCE_TYPE são sempre folhas).`,
          path: `nodes[${i}].parentCode`,
        });
      }

      // Detecção de ciclos
      const visited = new Set<string>();
      let cursor: string | undefined = node.code?.trim();
      while (cursor) {
        if (visited.has(cursor)) {
          issues.push({
            severity: 'error',
            code: 'NODE_CYCLE_DETECTED',
            message: `Ciclo detectado na hierarquia a partir do nó '${node.code}'.`,
            path: `nodes[${i}]`,
          });
          break;
        }
        visited.add(cursor);
        const currentTarget = nodes.find((n) => n?.code?.trim() === cursor || (n?.id && n.id === cursor));
        const nextParentRef = currentTarget?.parentNodeId ?? currentTarget?.parentCode;
        if (!nextParentRef) break;
        const nextParent = nodeIdentifierMap.get(nextParentRef);
        cursor = nextParent?.code;
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      validatedAt: new Date().toISOString(),
    };
  }

  public async materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> {
    const typedSnapshot = snapshot as unknown as ResourceModelSnapshot;
    if (!typedSnapshot?.catalog?.code) return;

    const reqContext = {
      tenantId: context.tenantId,
      actorSub: 'nexus-studio',
      roles: ['studio.admin', 'inventory.admin'],
      traceId: `studio-mat-${Date.now()}`,
    };

    // 1. Obter ou criar catálogo
    let catalog = await this.resourceService.getResourceCatalogByCode(typedSnapshot.catalog.code, reqContext);
    if (!catalog) {
      catalog = await this.resourceService.createResourceCatalog(
        {
          code: typedSnapshot.catalog.code,
          name: typedSnapshot.catalog.name,
          ...(typedSnapshot.catalog.description ? { description: typedSnapshot.catalog.description } : {}),
          isDefault: true,
          sortOrder: 0,
        },
        reqContext,
      );
    } else {
      catalog = await this.resourceService.updateResourceCatalog(
        catalog.id,
        {
          name: typedSnapshot.catalog.name,
          ...(typedSnapshot.catalog.description !== undefined
            ? { description: typedSnapshot.catalog.description }
            : {}),
          status: 'active',
        },
        reqContext,
      );
    }

    // 2. Carregar nós existentes do catálogo
    const existingNodes = await this.resourceService.listResourceCatalogNodes(catalog.id, reqContext, true);
    const existingByCode = new Map(existingNodes.map((n) => [n.code, n]));

    // 3. Obter tipos de recursos para mapear códigos se necessário
    const allResourceTypes = await this.resourceService.listResourceTypes(reqContext);
    const typeByCode = new Map(allResourceTypes.map((t) => [t.code, t]));
    const typeById = new Map(allResourceTypes.map((t) => [t.id, t]));

    const snapshotNodes = typedSnapshot.nodes ?? [];
    const codeToIdMap = new Map<string, string>();

    // 4. Criação / atualização básica dos nós (sem parentNodeId definitivo inicialmente para garantir existência)
    for (let i = 0; i < snapshotNodes.length; i++) {
      const snapNode = snapshotNodes[i];
      if (!snapNode) continue;
      let resolvedTypeId: string | undefined = undefined;

      if (snapNode.kind === 'RESOURCE_TYPE') {
        if (snapNode.resourceTypeId && typeById.has(snapNode.resourceTypeId)) {
          resolvedTypeId = snapNode.resourceTypeId;
        } else if (snapNode.resourceTypeCode && typeByCode.has(snapNode.resourceTypeCode)) {
          resolvedTypeId = typeByCode.get(snapNode.resourceTypeCode)?.id;
        }
      }

      const existing = existingByCode.get(snapNode.code);
      if (existing) {
        const updateInput: UpdateResourceCatalogNodeInput = {
          name: snapNode.name,
          ...(snapNode.description !== undefined ? { description: snapNode.description } : {}),
          status: (snapNode.status as ResourceCatalogStatus) ?? 'active',
          ...(snapNode.metadata !== undefined ? { metadata: snapNode.metadata } : {}),
        };
        const updated = await this.resourceService.updateResourceCatalogNode(
          catalog.id,
          existing.id,
          updateInput,
          reqContext,
        );
        codeToIdMap.set(snapNode.code, updated.id);
      } else {
        const nodePayload: CreateResourceCatalogNodeInput =
          snapNode.kind === 'RESOURCE_TYPE'
            ? {
                code: snapNode.code,
                name: snapNode.name,
                kind: 'RESOURCE_TYPE',
                resourceTypeId: resolvedTypeId ?? '',
                ...(snapNode.description ? { description: snapNode.description } : {}),
                sortOrder: snapNode.sortOrder ?? i,
                ...(snapNode.metadata ? { metadata: snapNode.metadata } : {}),
              }
            : {
                code: snapNode.code,
                name: snapNode.name,
                kind: 'GROUP',
                ...(snapNode.description ? { description: snapNode.description } : {}),
                sortOrder: snapNode.sortOrder ?? i,
                ...(snapNode.metadata ? { metadata: snapNode.metadata } : {}),
              };

        const created = await this.resourceService.createResourceCatalogNode(
          catalog.id,
          nodePayload,
          reqContext,
        );
        codeToIdMap.set(snapNode.code, created.id);
      }
    }

    // 5. Ajustar hierarquia (pais e ordenação)
    for (let i = 0; i < snapshotNodes.length; i++) {
      const snapNode = snapshotNodes[i];
      if (!snapNode) continue;
      const nodeId = codeToIdMap.get(snapNode.code);
      if (!nodeId) continue;

      let targetParentId: string | null = null;
      if (snapNode.parentNodeId && codeToIdMap.has(snapNode.parentNodeId)) {
        targetParentId = snapNode.parentNodeId;
      } else if (snapNode.parentCode && codeToIdMap.has(snapNode.parentCode)) {
        targetParentId = codeToIdMap.get(snapNode.parentCode)!;
      }

      await this.resourceService.moveResourceCatalogNode(
        catalog.id,
        nodeId,
        {
          parentNodeId: targetParentId,
          sortOrder: snapNode.sortOrder ?? i,
        },
        reqContext,
      );
    }
  }
}
