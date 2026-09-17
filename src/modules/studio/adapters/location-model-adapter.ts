import { AppError } from '../../../shared/errors/app-error.js';
import { createCanonicalId } from '../../../shared/utils/canonical-id.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import type { GeoService } from '../../geo/service.js';
import type {
  GeographicSiteSpecificationCategory,
  GeographicSiteRole,
  GeographicSiteSpecificationLifecycleStatus,
  GeographicSiteSpecificationCharacteristic,
} from '../../geo/domain.js';
import { GEO_SITE_ROLES } from '../../geo/domain.js';

export type LocationModelSnapshotSpec = {
  id?: string;
  code: string;
  name: string;
  category: GeographicSiteSpecificationCategory;
  siteRole?: GeographicSiteRole;
  lifecycleStatus?: GeographicSiteSpecificationLifecycleStatus;
  description?: string;
  allowedParentCodes?: string[];
  allowedChildCodes?: string[];
  specCharacteristic?: GeographicSiteSpecificationCharacteristic[];
};

export type LocationModelSnapshot = {
  specifications: LocationModelSnapshotSpec[];
};

const LEGACY_FUNCTIONAL_GROUP_CODE = 'FUNCTIONAL_GROUP';

/**
 * Baselines antigos podem conter a specification aposentada no bootstrap antes de ela deixar de
 * ser uma categoria válida. Esta compatibilidade remove somente esse artefato e suas relações;
 * qualquer outra categoria ou referência inválida segue bloqueando publicação/materialização.
 */
function normalizeLegacyFunctionalGroup(snapshot: Record<string, unknown>): Record<string, unknown> {
  const candidate = snapshot as Partial<LocationModelSnapshot>;
  if (!Array.isArray(candidate.specifications)) return snapshot;

  const specifications = candidate.specifications.filter((spec) => {
    // O snapshot é dado histórico não confiável; lê a categoria como unknown sem ampliar o tipo
    // canônico GeographicSiteSpecificationCategory para comportar o legado removido.
    const category: unknown = spec.category;
    return !(
      spec.code?.trim().toUpperCase() === LEGACY_FUNCTIONAL_GROUP_CODE &&
      (spec.lifecycleStatus === 'Retired' || category === 'FunctionalGroup')
    );
  });
  if (specifications.length === candidate.specifications.length) return snapshot;

  return {
    ...snapshot,
    specifications: specifications.map((spec) => ({
      ...spec,
      allowedParentCodes: spec.allowedParentCodes?.filter(
        (code) => code.trim().toUpperCase() !== LEGACY_FUNCTIONAL_GROUP_CODE,
      ),
      allowedChildCodes: spec.allowedChildCodes?.filter(
        (code) => code.trim().toUpperCase() !== LEGACY_FUNCTIONAL_GROUP_CODE,
      ),
    })),
  };
}

const sameStringSet = (left: string[] = [], right: string[] = []): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export class LocationModelStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'location-model';
  /** Locais mantém alterações apenas no snapshot até a publicação. */
  public readonly restoreBaselineOnDiscard = false;

  constructor(private readonly geoService: GeoService) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typedSnapshot = normalizeLegacyFunctionalGroup(snapshot) as unknown as Partial<LocationModelSnapshot>;

    const specs = typedSnapshot.specifications;
    if (!specs || !Array.isArray(specs)) {
      issues.push({
        severity: 'error',
        code: 'SPECS_ARRAY_REQUIRED',
        message: 'A lista de especificações de locais (specifications) é obrigatória e deve ser um array.',
        path: 'specifications',
      });
      return {
        valid: false,
        issues,
        validatedAt: new Date().toISOString(),
      };
    }

    const codeSet = new Set<string>();
    const validCategories = new Set<GeographicSiteSpecificationCategory>(['Region', 'Site', 'SubSite']);
    const validRoles = new Set<GeographicSiteRole>(GEO_SITE_ROLES);

    // 1ª passada: validação individual de campos e unicidade
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      if (!s) continue;
      const pathPrefix = `specifications[${i}]`;

      if (!s.code?.trim()) {
        issues.push({
          severity: 'error',
          code: 'SPEC_CODE_REQUIRED',
          message: 'O código da especificação de local é obrigatório.',
          path: `${pathPrefix}.code`,
        });
      } else {
        const normalizedCode = s.code.trim().toUpperCase();
        if (codeSet.has(normalizedCode)) {
          issues.push({
            severity: 'error',
            code: 'SPEC_CODE_DUPLICATE',
            message: `Código de especificação duplicado no snapshot: ${s.code}.`,
            path: `${pathPrefix}.code`,
          });
        }
        codeSet.add(normalizedCode);
      }

      if (!s.name?.trim()) {
        issues.push({
          severity: 'error',
          code: 'SPEC_NAME_REQUIRED',
          message: 'O nome da especificação de local é obrigatório.',
          path: `${pathPrefix}.name`,
        });
      }

      if (!s.category || !validCategories.has(s.category)) {
        issues.push({
          severity: 'error',
          code: 'SPEC_CATEGORY_INVALID',
          message: `Categoria '${s.category}' inválida. Esperado: Region, Site ou SubSite.`,
          path: `${pathPrefix}.category`,
        });
      }

      if (s.siteRole && !validRoles.has(s.siteRole)) {
        issues.push({
          severity: 'error',
          code: 'SPEC_ROLE_INVALID',
          message: `Papel funcional (siteRole) '${s.siteRole}' inválido. Esperado: grouping, network, property ou service.`,
          path: `${pathPrefix}.siteRole`,
        });
      }
    }

    // 2ª passada: validação referencial de regras de contenção (allowedParentCodes / allowedChildCodes)
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      if (!s) continue;
      const pathPrefix = `specifications[${i}]`;

      if (s.allowedParentCodes && Array.isArray(s.allowedParentCodes)) {
        for (const pCode of s.allowedParentCodes) {
          const normParent = pCode.trim().toUpperCase();
          if (!codeSet.has(normParent)) {
            issues.push({
              severity: 'error',
              code: 'CONTAINMENT_PARENT_NOT_FOUND',
              message: `Especificação pai '${pCode}' referenciada por '${s.code}' não existe no snapshot.`,
              path: `${pathPrefix}.allowedParentCodes`,
            });
          }
        }
      }

      if (s.allowedChildCodes && Array.isArray(s.allowedChildCodes)) {
        for (const cCode of s.allowedChildCodes) {
          const normChild = cCode.trim().toUpperCase();
          if (!codeSet.has(normChild)) {
            issues.push({
              severity: 'error',
              code: 'CONTAINMENT_CHILD_NOT_FOUND',
              message: `Especificação filha '${cCode}' referenciada por '${s.code}' não existe no snapshot.`,
              path: `${pathPrefix}.allowedChildCodes`,
            });
          }
        }
      }
    }

    // Auto-referência direta não é rejeitada: uma hierarquia pode modelar níveis recursivos
    // da mesma specification quando o catálogo publicado assim o permitir.

    return {
      valid: issues.length === 0,
      issues,
      validatedAt: new Date().toISOString(),
    };
  }

  public async materialize(
    snapshot: Record<string, unknown>,
    context: { tenantId: string },
  ): Promise<void> {
    const normalizedSnapshot = normalizeLegacyFunctionalGroup(snapshot);
    const validation = await this.validate(normalizedSnapshot);
    if (!validation.valid) {
      const errMsgs = validation.issues.map((i) => i.message).join('; ');
      throw new AppError(`Snapshot de location-model inválido para publicação: ${errMsgs}`, {
        code: 'STUDIO_MATERIALIZE_INVALID',
        statusCode: 422,
      });
    }

    const typedSnapshot = normalizedSnapshot as unknown as LocationModelSnapshot;
    const specs = typedSnapshot.specifications;

    // Buscar especificações existentes no banco
    const existingSpecs = await this.geoService.listSpecs();
    const existingByCode = new Map(existingSpecs.map((s) => [s.code.toUpperCase(), s]));

    const reqContext = {
      tenantId: context.tenantId,
      actorSub: 'studio-adapter',
      roles: ['catalog.admin', 'geo.admin', 'platform.admin'],
      // traceId vira correlationId em tmf_event (correlation_id) — coluna dimensionada para UUID
      // (VARCHAR2(36) no Oracle, ver oracle-schema.ts), não string legível com prefixo.
      traceId: createCanonicalId(),
    };

    // Primeiro cria apenas códigos novos para que todas as relações do snapshot possam ser
    // resolvidas. Specs existentes só serão atualizadas na etapa seguinte se houver diferença.
    const codeToIdMap = new Map(existingSpecs.map((spec) => [spec.code.toUpperCase(), spec.id]));
    const createdCodes = new Set<string>();
    for (const specInput of specs) {
      const normalizedCode = specInput.code.trim().toUpperCase();
      if (codeToIdMap.has(normalizedCode)) continue;
      const created = await this.geoService.createSpec(
        {
          code: normalizedCode,
          name: specInput.name,
          category: specInput.category,
          ...(specInput.siteRole !== undefined ? { siteRole: specInput.siteRole } : {}),
          ...(specInput.description !== undefined ? { description: specInput.description } : {}),
          lifecycleStatus: specInput.lifecycleStatus ?? 'Active',
          specCharacteristic: specInput.specCharacteristic ?? [],
        },
        reqContext,
      );
      codeToIdMap.set(normalizedCode, created.id);
      createdCodes.add(normalizedCode);
      existingByCode.set(normalizedCode, created);
    }

    // Uma atualização por spec alterada, incluindo metadados e containment. Evita duas passagens
    // completas (e as validações/auditorias associadas) quando não há diferença publicada.
    for (const specInput of specs) {
      const normalizedCode = specInput.code.trim().toUpperCase();
      const specId = codeToIdMap.get(normalizedCode);
      const existing = existingByCode.get(normalizedCode);
      if (!specId || !existing) continue;

      const allowedParentSpecIds = (specInput.allowedParentCodes || [])
        .map((code) => codeToIdMap.get(code.trim().toUpperCase()))
        .filter((id): id is string => Boolean(id));
      const allowedChildSpecIds = (specInput.allowedChildCodes || [])
        .map((code) => codeToIdMap.get(code.trim().toUpperCase()))
        .filter((id): id is string => Boolean(id));
      const nextDescription = specInput.description;
      const nextRole = specInput.siteRole ?? existing.siteRole;
      const nextLifecycleStatus = specInput.lifecycleStatus ?? existing.lifecycleStatus;
      const nextCharacteristics = specInput.specCharacteristic ?? existing.specCharacteristic;
      const metadataChanged =
        existing.name !== specInput.name ||
        existing.category !== specInput.category ||
        existing.description !== nextDescription ||
        existing.siteRole !== nextRole ||
        existing.lifecycleStatus !== nextLifecycleStatus ||
        !sameJson(existing.specCharacteristic, nextCharacteristics);
      const containmentChanged =
        !sameStringSet(existing.allowedParentSpecIds, allowedParentSpecIds) ||
        !sameStringSet(existing.allowedChildSpecIds, allowedChildSpecIds);
      if (!metadataChanged && !containmentChanged) continue;

      // createSpec já persistiu os metadados; uma segunda chamada só é necessária para as
      // relações, que dependem de todos os códigos terem sido resolvidos.
      if (createdCodes.has(normalizedCode) && !containmentChanged) continue;

      await this.geoService.updateSpec(
        specId,
        {
          ...(!createdCodes.has(normalizedCode) && metadataChanged
            ? {
                name: specInput.name,
                category: specInput.category,
                // Snapshot sem descrição representa remoção da descrição canônica.
                description: nextDescription ?? '',
                siteRole: nextRole,
                lifecycleStatus: nextLifecycleStatus,
                specCharacteristic: nextCharacteristics,
              }
            : {}),
          ...(containmentChanged ? { allowedParentSpecIds, allowedChildSpecIds } : {}),
        },
        reqContext,
      );
    }
  }
}
