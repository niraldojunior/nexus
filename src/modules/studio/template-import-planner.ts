import { createHash } from 'node:crypto';
import type { StudioDomain } from './domain.js';

export type ConflictStrategy = 'reject' | 'reuse' | 'rename';

export type TemplateFragmentPayload = Record<string, unknown>;

export type StudioTemplateFragment = {
  domain: StudioDomain;
  payload: TemplateFragmentPayload;
};

export type StudioTemplateItem = {
  id?: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  version: string;
  author?: string;
  dependencies?: string[];
  fragments: StudioTemplateFragment[];
  metadata?: Record<string, unknown>;
};

export type TemplateImportConflict = {
  id: string;
  domain: StudioDomain;
  kind: string;
  code: string;
  name: string;
  existingName?: string;
  resolution: ConflictStrategy;
  suggestedName?: string;
  suggestedCode?: string;
};

export type TemplateImportOperation = {
  domain: StudioDomain;
  action: 'create' | 'reuse' | 'rename' | 'skip';
  entityType: string;
  code: string;
  originalCode: string;
  name: string;
  details?: string;
};

export type StudioTemplateImportPlan = {
  templateCode: string;
  templateVersion: string;
  planChecksum: string;
  conflicts: TemplateImportConflict[];
  operations: TemplateImportOperation[];
  resultSnapshots: Record<StudioDomain, Record<string, unknown>>;
  canApply: boolean;
};

export type ComputePlanInput = {
  template: StudioTemplateItem;
  targets: StudioDomain[];
  baseSnapshots: Partial<Record<StudioDomain, Record<string, unknown>>>;
  conflictResolutions?: Record<string, ConflictStrategy>;
  renameOverrides?: Record<string, { code?: string; name?: string }>;
};

const hashString = (input: string): string => {
  return createHash('sha256').update(input).digest('hex').substring(0, 6);
};

export class StudioTemplateImportPlanner {
  public static computePlan(input: ComputePlanInput): StudioTemplateImportPlan {
    const { template, targets, baseSnapshots, conflictResolutions = {}, renameOverrides = {} } = input;
    const conflicts: TemplateImportConflict[] = [];
    const operations: TemplateImportOperation[] = [];
    const resultSnapshots: Partial<Record<StudioDomain, Record<string, unknown>>> = {};

    const targetSet = new Set(targets);

    for (const fragment of template.fragments) {
      if (!targetSet.has(fragment.domain)) continue;

      const baseSnapshot = baseSnapshots[fragment.domain] ?? {};
      const domain = fragment.domain;

      if (domain === 'resource-model') {
        const baseCatalog = (baseSnapshot.catalog as Record<string, unknown> | undefined) ?? {
          code: 'default-catalog',
          name: 'Catálogo de Recursos Padrão',
        };
        const baseNodes = Array.isArray(baseSnapshot.nodes)
          ? [...(baseSnapshot.nodes as Array<Record<string, unknown>>)]
          : [];
        const fragNodes = Array.isArray(fragment.payload.nodes)
          ? (fragment.payload.nodes as Array<Record<string, unknown>>)
          : [];

        const nextNodes = [...baseNodes];
        const existingCodes = new Map<string, Record<string, unknown>>(
          baseNodes.map((n) => [String(n.code ?? ''), n]),
        );

        for (const fNode of fragNodes) {
          const rawCode = String(fNode.code ?? '');
          const rawName = String(fNode.name ?? rawCode);
          const conflictKey = `resource-model:${rawCode}`;
          const existing = existingCodes.get(rawCode);

          if (existing) {
            const resolution = conflictResolutions[conflictKey] ?? 'reject';
            const suggestedCode = `${rawCode}_tpl_${hashString(template.code)}`;
            const suggestedName = `${rawName} (Template)`;

            conflicts.push({
              id: conflictKey,
              domain: 'resource-model',
              kind: 'ResourceCatalogNode',
              code: rawCode,
              name: rawName,
              existingName: String(existing.name ?? rawCode),
              resolution,
              suggestedCode,
              suggestedName,
            });

            if (resolution === 'reuse') {
              operations.push({
                domain: 'resource-model',
                action: 'reuse',
                entityType: 'ResourceCatalogNode',
                code: rawCode,
                originalCode: rawCode,
                name: String(existing.name ?? rawName),
                details: 'Reutilizando nó existente no catálogo',
              });
            } else if (resolution === 'rename') {
              const finalCode = renameOverrides[conflictKey]?.code ?? suggestedCode;
              const finalName = renameOverrides[conflictKey]?.name ?? suggestedName;
              const clonedNode = {
                ...fNode,
                code: finalCode,
                name: finalName,
              };
              delete (clonedNode as { id?: string }).id;
              nextNodes.push(clonedNode);
              operations.push({
                domain: 'resource-model',
                action: 'rename',
                entityType: 'ResourceCatalogNode',
                code: finalCode,
                originalCode: rawCode,
                name: finalName,
                details: `Renomeado para evitar colisão com ${rawCode}`,
              });
            } else {
              operations.push({
                domain: 'resource-model',
                action: 'skip',
                entityType: 'ResourceCatalogNode',
                code: rawCode,
                originalCode: rawCode,
                name: rawName,
                details: 'Conflito não resolvido (rejeitado)',
              });
            }
          } else {
            const clonedNode = { ...fNode };
            delete (clonedNode as { id?: string }).id;
            nextNodes.push(clonedNode);
            operations.push({
              domain: 'resource-model',
              action: 'create',
              entityType: 'ResourceCatalogNode',
              code: rawCode,
              originalCode: rawCode,
              name: rawName,
              details: 'Criando novo nó no catálogo',
            });
          }
        }

        resultSnapshots['resource-model'] = {
          catalog: baseCatalog,
          nodes: nextNodes,
        };
      } else if (domain === 'location-model') {
        const baseSpecs = Array.isArray(baseSnapshot.specifications)
          ? [...(baseSnapshot.specifications as Array<Record<string, unknown>>)]
          : [];
        const fragSpecs = Array.isArray(fragment.payload.specifications)
          ? (fragment.payload.specifications as Array<Record<string, unknown>>)
          : [];

        const nextSpecs = [...baseSpecs];
        const existingCodes = new Map<string, Record<string, unknown>>(
          baseSpecs.map((s) => [String(s.code ?? ''), s]),
        );

        for (const fSpec of fragSpecs) {
          const rawCode = String(fSpec.code ?? '');
          const rawName = String(fSpec.name ?? rawCode);
          const conflictKey = `location-model:${rawCode}`;
          const existing = existingCodes.get(rawCode);

          if (existing) {
            const resolution = conflictResolutions[conflictKey] ?? 'reject';
            const suggestedCode = `${rawCode}_tpl_${hashString(template.code)}`;
            const suggestedName = `${rawName} (Template)`;

            conflicts.push({
              id: conflictKey,
              domain: 'location-model',
              kind: 'GeographicSiteSpecification',
              code: rawCode,
              name: rawName,
              existingName: String(existing.name ?? rawCode),
              resolution,
              suggestedCode,
              suggestedName,
            });

            if (resolution === 'reuse') {
              operations.push({
                domain: 'location-model',
                action: 'reuse',
                entityType: 'GeographicSiteSpecification',
                code: rawCode,
                originalCode: rawCode,
                name: String(existing.name ?? rawName),
                details: 'Reutilizando especificação de local existente',
              });
            } else if (resolution === 'rename') {
              const finalCode = renameOverrides[conflictKey]?.code ?? suggestedCode;
              const finalName = renameOverrides[conflictKey]?.name ?? suggestedName;
              const clonedSpec = {
                ...fSpec,
                code: finalCode,
                name: finalName,
              };
              delete (clonedSpec as { id?: string }).id;
              nextSpecs.push(clonedSpec);
              operations.push({
                domain: 'location-model',
                action: 'rename',
                entityType: 'GeographicSiteSpecification',
                code: finalCode,
                originalCode: rawCode,
                name: finalName,
                details: `Renomeado para evitar colisão com ${rawCode}`,
              });
            } else {
              operations.push({
                domain: 'location-model',
                action: 'skip',
                entityType: 'GeographicSiteSpecification',
                code: rawCode,
                originalCode: rawCode,
                name: rawName,
                details: 'Conflito não resolvido (rejeitado)',
              });
            }
          } else {
            const clonedSpec = { ...fSpec };
            delete (clonedSpec as { id?: string }).id;
            nextSpecs.push(clonedSpec);
            operations.push({
              domain: 'location-model',
              action: 'create',
              entityType: 'GeographicSiteSpecification',
              code: rawCode,
              originalCode: rawCode,
              name: rawName,
              details: 'Criando nova especificação de local',
            });
          }
        }

        resultSnapshots['location-model'] = {
          specifications: nextSpecs,
        };
      } else if (domain === 'spatial') {
        const baseCoverages = Array.isArray(baseSnapshot.coverages)
          ? [...(baseSnapshot.coverages as Array<Record<string, unknown>>)]
          : [];
        const fragCoverages = Array.isArray(fragment.payload.coverages)
          ? (fragment.payload.coverages as Array<Record<string, unknown>>)
          : [];

        const nextCoverages = [...baseCoverages];
        const existingKeys = new Map<string, Record<string, unknown>>(
          baseCoverages.map((c) => [String(c.key ?? ''), c]),
        );

        for (const fCov of fragCoverages) {
          const rawKey = String(fCov.key ?? '');
          const rawName = String(fCov.name ?? rawKey);
          const conflictKey = `spatial:${rawKey}`;
          const existing = existingKeys.get(rawKey);

          if (existing) {
            const resolution = conflictResolutions[conflictKey] ?? 'reject';
            const suggestedKey = `${rawKey}_tpl_${hashString(template.code)}`;
            const suggestedName = `${rawName} (Template)`;

            conflicts.push({
              id: conflictKey,
              domain: 'spatial',
              kind: 'SpatialCoverage',
              code: rawKey,
              name: rawName,
              existingName: String(existing.name ?? rawKey),
              resolution,
              suggestedCode: suggestedKey,
              suggestedName,
            });

            if (resolution === 'reuse') {
              operations.push({
                domain: 'spatial',
                action: 'reuse',
                entityType: 'SpatialCoverage',
                code: rawKey,
                originalCode: rawKey,
                name: String(existing.name ?? rawName),
                details: 'Reutilizando cobertura espacial existente',
              });
            } else if (resolution === 'rename') {
              const finalKey = renameOverrides[conflictKey]?.code ?? suggestedKey;
              const finalName = renameOverrides[conflictKey]?.name ?? suggestedName;
              const clonedCov = {
                ...fCov,
                key: finalKey,
                name: finalName,
              };
              delete (clonedCov as { id?: string }).id;
              nextCoverages.push(clonedCov);
              operations.push({
                domain: 'spatial',
                action: 'rename',
                entityType: 'SpatialCoverage',
                code: finalKey,
                originalCode: rawKey,
                name: finalName,
                details: `Renomeado para evitar colisão com ${rawKey}`,
              });
            } else {
              operations.push({
                domain: 'spatial',
                action: 'skip',
                entityType: 'SpatialCoverage',
                code: rawKey,
                originalCode: rawKey,
                name: rawName,
                details: 'Conflito não resolvido (rejeitado)',
              });
            }
          } else {
            const clonedCov = { ...fCov };
            delete (clonedCov as { id?: string }).id;
            nextCoverages.push(clonedCov);
            operations.push({
              domain: 'spatial',
              action: 'create',
              entityType: 'SpatialCoverage',
              code: rawKey,
              originalCode: rawKey,
              name: rawName,
              details: 'Criando nova cobertura espacial',
            });
          }
        }

        resultSnapshots['spatial'] = {
          coverages: nextCoverages,
        };
      } else if (domain === 'studio-geo') {
        const baseGroups = Array.isArray(baseSnapshot.groups)
          ? [...(baseSnapshot.groups as Array<Record<string, unknown>>)]
          : [];
        const baseLayers = Array.isArray(baseSnapshot.layers)
          ? [...(baseSnapshot.layers as Array<Record<string, unknown>>)]
          : [];

        const fragGroups = Array.isArray(fragment.payload.groups)
          ? (fragment.payload.groups as Array<Record<string, unknown>>)
          : [];
        const fragLayers = Array.isArray(fragment.payload.layers)
          ? (fragment.payload.layers as Array<Record<string, unknown>>)
          : [];

        const existingGroupIds = new Set(baseGroups.map((g) => String(g.id ?? '')));
        const existingLayerIds = new Set(baseLayers.map((l) => String(l.id ?? '')));

        const nextGroups = [...baseGroups];
        const nextLayers = [...baseLayers];

        for (const g of fragGroups) {
          const gId = String(g.id ?? '');
          if (!existingGroupIds.has(gId)) {
            nextGroups.push(g);
            operations.push({
              domain: 'studio-geo',
              action: 'create',
              entityType: 'StudioGeoGroup',
              code: gId,
              originalCode: gId,
              name: String(g.label ?? gId),
              details: 'Adicionando grupo de layers GEO',
            });
          }
        }

        for (const l of fragLayers) {
          const lId = String(l.id ?? '');
          if (!existingLayerIds.has(lId)) {
            nextLayers.push(l);
            operations.push({
              domain: 'studio-geo',
              action: 'create',
              entityType: 'StudioGeoLayer',
              code: lId,
              originalCode: lId,
              name: String(l.label ?? lId),
              details: 'Adicionando layer ao catálogo GEO',
            });
          }
        }

        resultSnapshots['studio-geo'] = {
          groups: nextGroups,
          layers: nextLayers,
        };
      } else if (domain === 'rules-workflows') {
        const baseStates = Array.isArray(baseSnapshot.states)
          ? [...(baseSnapshot.states as Array<Record<string, unknown>>)]
          : [];
        const baseTransitions = Array.isArray(baseSnapshot.transitions)
          ? [...(baseSnapshot.transitions as Array<Record<string, unknown>>)]
          : [];

        const fragStates = Array.isArray(fragment.payload.states)
          ? (fragment.payload.states as Array<Record<string, unknown>>)
          : [];
        const fragTransitions = Array.isArray(fragment.payload.transitions)
          ? (fragment.payload.transitions as Array<Record<string, unknown>>)
          : [];

        const existingStateCodes = new Set(baseStates.map((s) => String(s.code ?? '')));
        const existingTransIds = new Set(baseTransitions.map((t) => String(t.id ?? '')));

        const nextStates = [...baseStates];
        const nextTransitions = [...baseTransitions];

        for (const st of fragStates) {
          const stCode = String(st.code ?? '');
          if (!existingStateCodes.has(stCode)) {
            nextStates.push(st);
            operations.push({
              domain: 'rules-workflows',
              action: 'create',
              entityType: 'WorkflowState',
              code: stCode,
              originalCode: stCode,
              name: String(st.name ?? stCode),
              details: 'Adicionando estado ao workflow',
            });
          }
        }

        for (const tr of fragTransitions) {
          const trId = String(tr.id ?? '');
          if (!existingTransIds.has(trId)) {
            nextTransitions.push(tr);
            operations.push({
              domain: 'rules-workflows',
              action: 'create',
              entityType: 'WorkflowTransition',
              code: trId,
              originalCode: trId,
              name: trId,
              details: 'Adicionando transição ao workflow',
            });
          }
        }

        resultSnapshots['rules-workflows'] = {
          schemaVersion: 1,
          workflowId: 'geo-project',
          initialStateCode: String(baseSnapshot.initialStateCode ?? '1'),
          states: nextStates,
          transitions: nextTransitions,
        };
      }
    }

    const hasRejectConflict = conflicts.some((c) => c.resolution === 'reject');
    const canApply = !hasRejectConflict;

    const deterministicPayload = {
      templateCode: template.code,
      templateVersion: template.version,
      targets: [...targets].sort(),
      operations: operations.map((o) => ({
        domain: o.domain,
        action: o.action,
        code: o.code,
        entityType: o.entityType,
      })),
      conflictResolutions,
    };

    const planChecksum = createHash('sha256')
      .update(JSON.stringify(deterministicPayload))
      .digest('hex');

    return {
      templateCode: template.code,
      templateVersion: template.version,
      planChecksum,
      conflicts,
      operations,
      resultSnapshots: resultSnapshots as Record<StudioDomain, Record<string, unknown>>,
      canApply,
    };
  }
}
