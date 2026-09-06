import { AppError } from '../../../shared/errors/app-error.js';
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

export class LocationModelStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'location-model';

  constructor(private readonly geoService: GeoService) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typedSnapshot = snapshot as unknown as Partial<LocationModelSnapshot>;

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

    if (specs.length === 0) {
      issues.push({
        severity: 'error',
        code: 'SPECS_EMPTY',
        message: 'O modelo de locais deve conter pelo menos uma especificação de local.',
        path: 'specifications',
      });
    }

    const codeSet = new Set<string>();
    const validCategories = new Set<GeographicSiteSpecificationCategory>([
      'Region',
      'FunctionalGroup',
      'Site',
      'SubSite',
    ]);
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
          message: `Categoria '${s.category}' inválida. Esperado: Region, FunctionalGroup, Site ou SubSite.`,
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

    // 3ª passada: Detecção de auto-referência em contenção direta
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      if (!s || !s.code) continue;
      const normalizedCode = s.code.trim().toUpperCase();
      const parents = (s.allowedParentCodes || []).map((c) => c.trim().toUpperCase());
      const children = (s.allowedChildCodes || []).map((c) => c.trim().toUpperCase());

      if (parents.includes(normalizedCode) || children.includes(normalizedCode)) {
        issues.push({
          severity: 'error',
          code: 'CONTAINMENT_SELF_REFERENCE',
          message: `A especificação '${s.code}' não pode conter a si mesma como pai ou filho direto.`,
          path: `specifications[${i}]`,
        });
      }
    }

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
    const validation = await this.validate(snapshot);
    if (!validation.valid) {
      const errMsgs = validation.issues.map((i) => i.message).join('; ');
      throw new AppError(`Snapshot de location-model inválido para publicação: ${errMsgs}`, {
        code: 'STUDIO_MATERIALIZE_INVALID',
        statusCode: 422,
      });
    }

    const typedSnapshot = snapshot as unknown as LocationModelSnapshot;
    const specs = typedSnapshot.specifications;

    // Buscar especificações existentes no banco
    const existingSpecs = await this.geoService.listSpecs();
    const existingByCode = new Map(existingSpecs.map((s) => [s.code.toUpperCase(), s]));

    const reqContext = {
      tenantId: context.tenantId,
      actorSub: 'studio-adapter',
      roles: ['catalog.admin', 'geo.admin', 'platform.admin'],
      traceId: `studio-materialize-location-model-${Date.now()}`,
    };

    // Criar ou atualizar especificações (fase 1: metadados básicos)
    const codeToIdMap = new Map<string, string>();

    for (const specInput of specs) {
      const normalizedCode = specInput.code.trim().toUpperCase();
      const existing = existingByCode.get(normalizedCode);

      if (existing) {
        codeToIdMap.set(normalizedCode, existing.id);
        await this.geoService.updateSpec(
          existing.id,
          {
            name: specInput.name,
            ...(specInput.description !== undefined ? { description: specInput.description } : {}),
            ...(specInput.siteRole !== undefined ? { siteRole: specInput.siteRole } : {}),
            lifecycleStatus: specInput.lifecycleStatus ?? 'Active',
            specCharacteristic: specInput.specCharacteristic ?? existing.specCharacteristic,
          },
          reqContext,
        );
      } else {
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
      }
    }

    // Sincronizar regras de contenção (fase 2: IDs resolvidos)
    for (const specInput of specs) {
      const normalizedCode = specInput.code.trim().toUpperCase();
      const specId = codeToIdMap.get(normalizedCode);
      if (!specId) continue;

      const allowedParentSpecIds = (specInput.allowedParentCodes || [])
        .map((c) => codeToIdMap.get(c.trim().toUpperCase()))
        .filter((id): id is string => Boolean(id));

      const allowedChildSpecIds = (specInput.allowedChildCodes || [])
        .map((c) => codeToIdMap.get(c.trim().toUpperCase()))
        .filter((id): id is string => Boolean(id));

      await this.geoService.updateSpec(
        specId,
        {
          allowedParentSpecIds,
          allowedChildSpecIds,
        },
        reqContext,
      );
    }
  }
}
