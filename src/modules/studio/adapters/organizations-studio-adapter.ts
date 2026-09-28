// Adapter de Governance para o domínio 'organizations' (Studio → Organizações, issue #275).
//
// Snapshot-local e upsert-only:
// `materialize()` é upsert-only e NUNCA desativa por ausência. Organização ausente do snapshot
// é ignorada, não inativada. Diferente dos demais adapters porque `tmf_party` é escrita também por
// MCP (`party.create_party`), seeds de bootstrap e chamadas server-to-server — desativar por
// ausência apagaria registros criados fora do Studio enquanto o draft estava aberto. Inativação é
// sempre explícita (`status: 'terminated'` ou `status: 'inactive'` no snapshot).
//
// Como é snapshot-local (editor em memória), `restoreBaselineOnDiscard = false` evita reverter
// estado canônico no descarte de rascunho.

import { AppError } from '../../../shared/errors/app-error.js';
import type {
  StudioDomainAdapter,
  StudioValidationIssue,
  StudioValidationResult,
} from '../domain.js';
import type { PartyService } from '../../party/service.js';
import type { PartyStatus, PartyType } from '../../party/domain.js';
import type { Characteristic } from '../../../shared/tmf/types.js';

// Recusa um logotipo (`_profile.logo`) maior que ORGANIZATION_LOGO_MAX_CHARS antes de publicar —
// a validação do cliente (ImageCharacteristicInput, 5 MB) não pode ser a única barreira contra um
// upload não processado indo parar na CLOB `tmf_party.characteristics`.
const ORGANIZATION_LOGO_MAX_CHARS = 200_000;

export type OrganizationSnapshotItem = {
  id?: string;
  name: string;
  partyType?: PartyType;
  status?: PartyStatus;
  partyCharacteristic?: Characteristic[];
};

export type OrganizationsStudioSnapshot = {
  organizations: OrganizationSnapshotItem[];
};

export class OrganizationsStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'organizations';
  public readonly restoreBaselineOnDiscard = false;

  constructor(private readonly partyService: PartyService) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typed = snapshot as unknown as Partial<OrganizationsStudioSnapshot>;
    const orgs = typed.organizations;

    if (!Array.isArray(orgs)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'ORGANIZATIONS_ARRAY_REQUIRED',
            message: 'A lista de organizações (organizations) é obrigatória.',
            path: 'organizations',
          },
        ],
        validatedAt: new Date().toISOString(),
      };
    }

    for (let index = 0; index < orgs.length; index += 1) {
      const org = orgs[index];
      const path = `organizations[${index}]`;
      const name = org?.name?.trim();
      if (!name) {
        issues.push({
          severity: 'error',
          code: 'ORGANIZATION_NAME_REQUIRED',
          message: 'O nome da organização é obrigatório.',
          path: `${path}.name`,
        });
      }

      const logo = org?.partyCharacteristic?.find((c) => c.name === '_profile.logo');
      if (typeof logo?.value === 'string' && logo.value.length > ORGANIZATION_LOGO_MAX_CHARS) {
        issues.push({
          severity: 'error',
          code: 'ORGANIZATION_LOGO_TOO_LARGE',
          message: 'O logotipo da organização excede o tamanho máximo permitido.',
          path: `${path}.partyCharacteristic._profile.logo`,
        });
      }
    }

    return { valid: issues.length === 0, issues, validatedAt: new Date().toISOString() };
  }

  public async materialize(
    snapshot: Record<string, unknown>,
    context: { tenantId: string },
  ): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) {
      throw new AppError(validation.issues.map((issue) => issue.message).join('; '), {
        code: 'STUDIO_MATERIALIZE_INVALID',
        statusCode: 422,
      });
    }

    const typed = snapshot as unknown as OrganizationsStudioSnapshot;
    const requestContext = {
      actorSub: 'studio-publish',
      tenantId: context.tenantId,
      roles: ['studio.admin'],
      traceId: 'studio-org-materialize',
    };

    for (const org of typed.organizations) {
      const name = org.name.trim();
      if (org.id) {
        const existing = await this.partyService.getParty(org.id);
        if (existing) {
          await this.partyService.updateParty(
            org.id,
            {
              name,
              partyType: org.partyType ?? existing.partyType,
              status: org.status ?? existing.status,
              partyCharacteristic: org.partyCharacteristic ?? existing.partyCharacteristic,
            },
            requestContext,
          );
          continue;
        }
      }

      await this.partyService.createParty(
        {
          name,
          partyType: org.partyType ?? 'Organization',
          status: org.status ?? 'active',
          partyCharacteristic: org.partyCharacteristic ?? [],
        },
        requestContext,
      );
    }
  }
}
