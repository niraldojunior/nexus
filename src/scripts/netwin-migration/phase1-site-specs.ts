import type { MigrationContext } from './context.js';
import { merge } from '../netwin-migration-kit.js';
import { deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import type { PhaseStats } from './types.js';

export type SiteSpecDef = {
  code: string;
  name: string;
  category: 'Site' | 'SubSite' | 'Region';
  siteRole: 'network' | 'property' | 'service' | 'grouping';
  description?: string;
};

export const CANONICAL_SITE_SPECS: SiteSpecDef[] = [
  {
    code: 'CENTRAL_OFFICE',
    name: 'Central Office',
    category: 'Site',
    siteRole: 'network',
    description: 'Estação central de telecomunicações (CO) / POP de rede.',
  },
  {
    code: 'BUILDING',
    name: 'Building',
    category: 'Site',
    siteRole: 'property',
    description: 'Edifício ou condomínio com infraestrutura de rede.',
  },
  {
    code: 'ROOM',
    name: 'Room',
    category: 'SubSite',
    siteRole: 'network',
    description: 'Sala de equipamentos ou transmissão dentro de uma estação/prédio.',
  },
  {
    code: 'FLOOR',
    name: 'Floor',
    category: 'SubSite',
    siteRole: 'property',
    description: 'Andar ou pavimento de uma edificação.',
  },
  {
    code: 'TECHNICAL_ROOM',
    name: 'Technical Room',
    category: 'SubSite',
    siteRole: 'network',
    description: 'Sala técnica especializada para abrigar bastidores e climatização.',
  },
  {
    code: 'CABINET',
    name: 'Cabinet',
    category: 'Site',
    siteRole: 'network',
    description: 'Armário de rua ou gabinete outdoor de telecomunicações.',
  },
  {
    code: 'CUSTOMER_SITE',
    name: 'Customer Site',
    category: 'Site',
    siteRole: 'service',
    description: 'Ponto de atendimento comercial ou residencial de cliente.',
  },
  {
    code: 'REMOTE_UNIT',
    name: 'Remote Unit',
    category: 'Site',
    siteRole: 'network',
    description: 'Unidade remota de rede (UR).',
  },
  {
    code: 'ADVANCED_REMOTE_UNIT',
    name: 'Advanced Remote Unit',
    category: 'Site',
    siteRole: 'network',
    description: 'Unidade remota avançada de rede (URA).',
  },
  {
    code: 'TECHNICAL_CONTAINER',
    name: 'Technical Container',
    category: 'Site',
    siteRole: 'network',
    description: 'Contêiner técnico modular abrigando equipamentos ópticos.',
  },
  {
    code: 'POLE',
    name: 'Pole',
    category: 'Site',
    siteRole: 'network',
    description: 'Poste da rede externa aérea.',
  },
  {
    code: 'MANHOLE',
    name: 'Manhole',
    category: 'Site',
    siteRole: 'network',
    description: 'Caixa de passagem ou subterrânea da rede externa.',
  },
];

export async function runPhase1SiteSpecs(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 1.C: Tipos de Locais (Studio / GeographicSiteSpecification) ===');

  const target = await ctx.getTargetConnection();

  try {
    for (const spec of CANONICAL_SITE_SPECS) {
      const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `SITE_SPEC:${spec.code}`);

      if (target) {
        await merge(target, ctx.t, 'tmf_geographic_site_specification', ['code'], {
          id: specId,
          name: spec.name,
          code: spec.code,
          category: spec.category,
          site_role: spec.siteRole,
          lifecycle_status: 'Active',
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            ...(spec.description ? [{ name: 'description', value: spec.description, valueType: 'string' }] : []),
          ]),
          is_bootstrap: 1,
        });
      }
      stats.loaded++;
    }

    if (target) {
      await target.execute('COMMIT');
    }

    console.log(`Fase 1.C concluída: ${stats.loaded} especificações de locais cadastradas.`);
    return stats;
  } finally {
    if (target) await target.close();
  }
}
