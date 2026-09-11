import { AppError } from '../../../shared/errors/app-error.js';
import type { RequestContext } from '../../../shared/http/request-context.js';
import type { Characteristic } from '../../../shared/tmf/index.js';
import type { ResourceService } from '../../resource/service.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import {
  type StudioTemplateItem,
} from '../template-import-planner.js';

export const TEMPLATE_CHARACTERISTIC_GROUP = '_studioTemplate';

export type TemplatesStudioSnapshot = {
  templates: StudioTemplateItem[];
};

export const CANONICAL_TEMPLATES_SNAPSHOT: TemplatesStudioSnapshot = {
  templates: [
    {
      code: 'ftth-gpon-standard',
      name: 'FTTH GPON Standard',
      description: 'Template de referência para topologia FTTH GPON: Central Office, POP, CTOs, Cabos ópticos e splitters 1:8 e 1:16.',
      category: 'FTTH',
      version: '1.0.0',
      author: 'V.tal Nexus Engineering',
      fragments: [
        {
          domain: 'resource-model',
          payload: {
            catalog: {
              code: 'ftth-standard',
              name: 'Catálogo FTTH GPON',
            },
            nodes: [
              {
                code: 'GRP_PASSIVE_OPTICAL',
                name: 'Rede Óptica Passiva',
                kind: 'GROUP',
                sortOrder: 10,
              },
              {
                code: 'NODE_CTO_STANDARD',
                name: 'CTO Padrão',
                kind: 'RESOURCE_TYPE',
                resourceTypeCode: 'CTO',
                sortOrder: 20,
              },
              {
                code: 'NODE_SPLITTER_1_8',
                name: 'Splitter Óptico 1:8',
                kind: 'RESOURCE_TYPE',
                resourceTypeCode: 'Splitter',
                sortOrder: 30,
              },
            ],
          },
        },
        {
          domain: 'location-model',
          payload: {
            specifications: [
              {
                code: 'SPEC_CENTRAL_OFFICE',
                name: 'Estação Central (CO)',
                category: 'Site',
                siteRole: 'network',
                lifecycleStatus: 'Active',
              },
              {
                code: 'SPEC_POP_LOCAL',
                name: 'Ponto de Presença (POP)',
                category: 'Site',
                siteRole: 'network',
                lifecycleStatus: 'Active',
              },
            ],
          },
        },
      ],
    },
    {
      code: 'wholesale-interconnection',
      name: 'Interconexão Atacado (Wholesale)',
      description: 'Template para pontos de entrega e interconexão de tráfego de ISP / Tenants wholesale.',
      category: 'Wholesale',
      version: '1.0.0',
      author: 'V.tal Nexus Engineering',
      fragments: [
        {
          domain: 'location-model',
          payload: {
            specifications: [
              {
                code: 'SPEC_MEET_ME_ROOM',
                name: 'Meet-Me-Room (MMR)',
                category: 'Sub-Site',
                siteRole: 'service',
                lifecycleStatus: 'Active',
              },
            ],
          },
        },
      ],
    },
  ],
};

export class TemplatesStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'templates';

  constructor(private readonly resourceService: ResourceService) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typedSnapshot = snapshot as unknown as Partial<TemplatesStudioSnapshot>;

    const templates = typedSnapshot.templates;
    if (!templates || !Array.isArray(templates)) {
      issues.push({
        severity: 'error',
        code: 'TEMPLATES_ARRAY_REQUIRED',
        message: 'A lista de templates (templates) é obrigatória e deve ser um array.',
        path: 'templates',
      });
      return {
        valid: false,
        issues,
        validatedAt: new Date().toISOString(),
      };
    }

    const codeSet = new Set<string>();

    for (let i = 0; i < templates.length; i++) {
      const tpl = templates[i];
      if (!tpl) continue;
      const pathPrefix = `templates[${i}]`;

      if (!tpl.code?.trim()) {
        issues.push({
          severity: 'error',
          code: 'TEMPLATE_CODE_REQUIRED',
          message: 'O código do template é obrigatório.',
          path: `${pathPrefix}.code`,
        });
      } else {
        const normalizedCode = tpl.code.trim();
        if (codeSet.has(normalizedCode)) {
          issues.push({
            severity: 'error',
            code: 'TEMPLATE_CODE_DUPLICATE',
            message: `Código de template duplicado: ${normalizedCode}`,
            path: `${pathPrefix}.code`,
          });
        }
        codeSet.add(normalizedCode);
      }

      if (!tpl.name?.trim()) {
        issues.push({
          severity: 'error',
          code: 'TEMPLATE_NAME_REQUIRED',
          message: 'O nome do template é obrigatório.',
          path: `${pathPrefix}.name`,
        });
      }

      if (!tpl.category?.trim()) {
        issues.push({
          severity: 'error',
          code: 'TEMPLATE_CATEGORY_REQUIRED',
          message: 'A categoria do template é obrigatória.',
          path: `${pathPrefix}.category`,
        });
      }

      if (!Array.isArray(tpl.fragments) || tpl.fragments.length === 0) {
        issues.push({
          severity: 'error',
          code: 'TEMPLATE_FRAGMENTS_REQUIRED',
          message: 'O template deve conter pelo menos um fragmento declarativo.',
          path: `${pathPrefix}.fragments`,
        });
      } else {
        for (let j = 0; j < tpl.fragments.length; j++) {
          const frag = tpl.fragments[j];
          if (!frag || !frag.domain) {
            issues.push({
              severity: 'error',
              code: 'TEMPLATE_FRAGMENT_DOMAIN_REQUIRED',
              message: 'Domínio do fragmento de template é obrigatório.',
              path: `${pathPrefix}.fragments[${j}].domain`,
            });
          }
        }
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
    scope: { tenantId: string },
  ): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) {
      throw new AppError('cannot materialize invalid templates snapshot', {
        code: 'STUDIO_TEMPLATES_SNAPSHOT_INVALID',
        statusCode: 422,
      });
    }

    const typedSnapshot = snapshot as unknown as TemplatesStudioSnapshot;
    const context: RequestContext = {
      tenantId: scope.tenantId,
      actorSub: 'studio-adapter',
      roles: ['platform.admin', 'studio.admin'],
      traceId: 'studio-templates-materialize',
    };

    const existingSpecs = await this.resourceService.listResourceFunctionSpecifications(undefined, context);
    const existingTemplateSpecs = existingSpecs.filter((s) =>
      s.resourceFunctionSpecificationCharacteristic.some(
        (c) => c.group === TEMPLATE_CHARACTERISTIC_GROUP && c.name === 'code',
      ),
    );

    const existingByCode = new Map<string, typeof existingSpecs[0]>();
    for (const spec of existingTemplateSpecs) {
      const codeChar = spec.resourceFunctionSpecificationCharacteristic.find(
        (c) => c.group === TEMPLATE_CHARACTERISTIC_GROUP && c.name === 'code',
      );
      if (codeChar?.value) {
        existingByCode.set(String(codeChar.value), spec);
      }
    }

    const desiredCodes = new Set<string>();

    for (const tpl of typedSnapshot.templates) {
      desiredCodes.add(tpl.code);
      const characteristics: Characteristic[] = [
        { group: TEMPLATE_CHARACTERISTIC_GROUP, name: 'code', value: tpl.code, valueType: 'string' },
        { group: TEMPLATE_CHARACTERISTIC_GROUP, name: 'category', value: tpl.category, valueType: 'string' },
        { group: TEMPLATE_CHARACTERISTIC_GROUP, name: 'version', value: tpl.version || '1.0.0', valueType: 'string' },
        ...(tpl.author
          ? [{ group: TEMPLATE_CHARACTERISTIC_GROUP, name: 'author', value: tpl.author, valueType: 'string' as const }]
          : []),
        {
          group: TEMPLATE_CHARACTERISTIC_GROUP,
          name: 'fragments',
          value: JSON.stringify(tpl.fragments),
          valueType: 'json',
        },
        ...(tpl.metadata
          ? [{ group: TEMPLATE_CHARACTERISTIC_GROUP, name: 'metadata', value: JSON.stringify(tpl.metadata), valueType: 'json' as const }]
          : []),
      ];

      const relationships = (tpl.dependencies ?? []).map((depCode) => ({
        id: depCode,
        name: depCode,
        relationshipType: 'dependsOn',
        role: 'dependency',
        '@referredType': 'ResourceFunctionSpecification' as const,
      }));

      const existing = existingByCode.get(tpl.code);
      if (existing) {
        await this.resourceService.updateResourceFunctionSpecification(
          existing.id,
          {
            name: tpl.name,
            ...(tpl.description ? { description: tpl.description } : {}),
            resourceFunctionSpecificationCharacteristic: characteristics,
            resourceFunctionSpecificationRelationship: relationships,
          },
          context,
        );
      } else {
        await this.resourceService.createResourceFunctionSpecification(
          {
            name: tpl.name,
            ...(tpl.description ? { description: tpl.description } : {}),
            resourceFunctionSpecificationCharacteristic: characteristics,
            resourceFunctionSpecificationRelationship: relationships,
          },
          context,
        );
      }
    }

    // Soft-delete (endDateTime) das specs que não constam mais no snapshot
    const now = new Date().toISOString();
    for (const [code, spec] of existingByCode.entries()) {
      if (!desiredCodes.has(code)) {
        await this.resourceService.updateResourceFunctionSpecification(
          spec.id,
          {
            validFor: {
              ...(spec.validFor?.startDateTime ? { startDateTime: spec.validFor.startDateTime } : {}),
              endDateTime: now,
            },
          },
          context,
        );
      }
    }
  }
}
