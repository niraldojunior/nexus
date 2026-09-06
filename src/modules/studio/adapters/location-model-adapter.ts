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

    // Nota: auto-referência direta (uma spec listada como pai/filho de si mesma) NÃO é
    // rejeitada aqui — é o modelo canônico documentado em RF-004 para Region (Continente > País >
    // Estado > Cidade > Regional V.tal > Bairro são todos category=Region, aninhados recursivamente
    // via Region→Region). O bootstrap protege exatamente esse containment (ver
    // BOOTSTRAP_SPECIFICATIONS em geo/service.ts), então rejeitar auto-referência aqui bloquearia
    // toda publicação/descarte do modelo de locais.

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
      // traceId vira correlationId em tmf_event (correlation_id) — coluna dimensionada para UUID
      // (VARCHAR2(36) no Oracle, ver oracle-schema.ts), não string legível com prefixo.
      traceId: createCanonicalId(),
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
            lifecycleStatus: specInput.lifecycleStatus ?? existing.lifecycleStatus ?? 'Active',
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

      // As regras de contenção protegidas (bootstrap, C11) nunca podem ser removidas — mas o
      // snapshot capturado no frontend resolve pai/filho só pelos códigos presentes nele. Se o
      // snapshot estiver incompleto ou desatualizado em relação ao que já está protegido no banco
      // (ex.: normalização de código, spec ausente do snapshot), a lista resolvida acima pode ficar
      // menor que o conjunto protegido vigente, e `updateSpec` rejeitaria com
      // GEO_SPEC_CONTAINMENT_PROTECTED. Mesclamos aqui os IDs já protegidos para nunca dropá-los —
      // materialize() (publish e "Cancelar"/discard) precisa ser sempre idempotente sobre proteções.
      const existing = existingByCode.get(normalizedCode);
      const protectedParentIds = existing?._protectedAllowedParentSpecIds ?? [];
      const protectedChildIds = existing?._protectedAllowedChildSpecIds ?? [];
      const mergedAllowedParentSpecIds = Array.from(
        new Set([...allowedParentSpecIds, ...protectedParentIds]),
      );
      const mergedAllowedChildSpecIds = Array.from(
        new Set([...allowedChildSpecIds, ...protectedChildIds]),
      );

      await this.geoService.updateSpec(
        specId,
        {
          allowedParentSpecIds: mergedAllowedParentSpecIds,
          allowedChildSpecIds: mergedAllowedChildSpecIds,
        },
        reqContext,
      );
    }
  }
}
