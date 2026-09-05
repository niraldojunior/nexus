import {
  Database,
  FileStack,
  Layers3,
  Map as MapIcon,
  MapPinned,
  Network,
  Presentation,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { StudioGovernanceSummary } from '../components/StudioGovernanceSummary';
import { ResourceModelStudio } from './studio/resource-model/ResourceModelStudio';
import { LocationModelStudio } from './studio/location-model/LocationModelStudio';
import { SpatialStudio } from './studio/spatial/SpatialStudio';
import { PageHead } from '../components/ui';
import type { StudioDomain } from '../services/studioApi';
import type { StudioSection } from '../utils/appRoute';

const studioDomainBySection: Partial<Record<StudioSection, StudioDomain>> = {
  'resource-model': 'resource-model',
  'location-model': 'location-model',
  spatial: 'spatial',
  'geo-experience': 'geo-experience',
  parties: 'parties',
  'reference-data': 'reference-data',
  'rules-workflows': 'rules-workflows',
  templates: 'templates',
};

type StudioNavItem = {
  id: StudioSection;
  label: string;
  description: string;
  icon: LucideIcon;
};

type StudioNavGroup = {
  label: string;
  items: StudioNavItem[];
};

const studioNavigation: StudioNavGroup[] = [
  {
    label: 'Modelagem',
    items: [
      {
        id: 'resource-model',
        label: 'Modelo de recursos',
        description: 'Catálogos, tipos, características e especificações.',
        icon: Network,
      },
      {
        id: 'location-model',
        label: 'Modelo de locais',
        description: 'Tipos de local e relações de contenção.',
        icon: MapPinned,
      },
      {
        id: 'spatial',
        label: 'Espacial',
        description: 'Tipos de cobertura e objetos geográficos.',
        icon: MapIcon,
      },
    ],
  },
  {
    label: 'Experiência',
    items: [
      {
        id: 'geo-experience',
        label: 'Experiência GEO',
        description: 'Camadas, estilos, escalas e informações de mapa.',
        icon: Layers3,
      },
    ],
  },
  {
    label: 'Dados mestres',
    items: [
      {
        id: 'parties',
        label: 'Partes',
        description: 'Organizações, indivíduos, papéis e contatos.',
        icon: Users,
      },
      {
        id: 'reference-data',
        label: 'Dados de referência',
        description: 'Conjuntos reutilizáveis de valores controlados.',
        icon: Database,
      },
    ],
  },
  {
    label: 'Automação',
    items: [
      {
        id: 'rules-workflows',
        label: 'Regras e workflows',
        description: 'Estados, transições, permissões e ações.',
        icon: Workflow,
      },
      {
        id: 'templates',
        label: 'Templates',
        description: 'Pacotes clonáveis para iniciar uma modelagem.',
        icon: FileStack,
      },
    ],
  },
  {
    label: 'Governança',
    items: [
      {
        id: 'governance',
        label: 'Publicações e auditoria',
        description: 'Versões, validações e trilha de alterações.',
        icon: ShieldCheck,
      },
    ],
  },
];

const itemBySection = new Map(
  studioNavigation.flatMap((group) => group.items).map((item) => [item.id, item]),
);

export function StudioPage({
  section,
  canEdit,
  canAdmin,
  onSectionChange,
}: {
  section: StudioSection;
  canEdit: boolean;
  canAdmin: boolean;
  onSectionChange: (section: StudioSection) => void;
}) {
  const activeItem = itemBySection.get(section) ?? itemBySection.get('resource-model');
  if (!activeItem) return null;
  const studioDomain = studioDomainBySection[section];

  return (
    <div
      className="h-full overflow-y-auto bg-white px-[11px] py-4 sm:px-[17px] sm:py-6 lg:px-[22px]"
      style={{
        /* Glow radial verde ambiente atrás da janela Studio Control — pintado direto no
           container mais externo (não num wrapper extra ao redor da `aside`) para não haver
           nenhuma borda de caixa aninhada cortando o degradê pela metade. Ancorado no canto
           onde a `aside` nasce (0% 0%) e com raio grande (1400px) para se espalhar por toda a
           altura útil da página — como a `aside` é `sticky` e mais baixa que o conteúdo, um
           glow do tamanho da própria `aside` parava seco onde ela termina; este cobre a coluna
           inteira e esmaece suavemente antes de alcançar o conteúdo da direita. */
        backgroundImage:
          'radial-gradient(1400px circle at 0% 0%, rgba(18, 128, 92, 0.14) 0%, rgba(18, 128, 92, 0.05) 35%, rgba(18, 128, 92, 0) 62%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="relative mx-auto grid gap-5 lg:grid-cols-[202px_minmax(0,1fr)]"
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <aside className="relative h-fit rounded-[10px] bg-app-ink p-3 text-app-on-ink shadow-soft lg:sticky lg:top-0">
          <div className="flex items-center gap-3 px-3 pb-4 pt-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/[0.08] text-app-accent">
              <Presentation className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <span className="block" style={{ font: 'var(--text-h3)' }}>
                Studio
              </span>
              <p className="text-[0.78rem] text-app-on-ink-muted">Control</p>
            </div>
          </div>

          <nav aria-label="Áreas do Studio" className="vt-studio-nav vt-studio-nav-ink space-y-4">
            {studioNavigation.map((group) => (
              <div key={group.label}>
                <p className="vt-sb-group-label">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.id === section;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSectionChange(item.id)}
                        className={`vt-sb-btn w-full${active ? ' is-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" strokeWidth={1.8} />
                        <span className="flex-1 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 vt-studio-scope">
          <PageHead
            title={activeItem.label}
            subtitle={activeItem.description}
            actions={
              studioDomain ? (
                <StudioGovernanceSummary
                  domain={studioDomain}
                  canEdit={canEdit}
                  canAdmin={canAdmin}
                />
              ) : undefined
            }
          />

          {section === 'resource-model' ? (
            <div className="mt-5">
              <ResourceModelStudio canEdit={canEdit} canAdmin={canAdmin} />
            </div>
          ) : section === 'location-model' ? (
            <div className="mt-5">
              <LocationModelStudio canEdit={canEdit} canAdmin={canAdmin} />
            </div>
          ) : section === 'spatial' ? (
            <div className="mt-5">
              <SpatialStudio canEdit={canEdit} canAdmin={canAdmin} />
            </div>
          ) : (
            <div className="mt-5">
              <article className="vt-card p-5 sm:p-6">
                <p style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  Em preparação
                </p>
                <h3 className="mt-2">A área será habilitada por contrato publicado</h3>
                <p className="mt-3 max-w-2xl text-[0.95rem] leading-7 text-app-muted">
                  Esta fundação estabelece a navegação, o acesso e a superfície comum do Studio. Os
                  editores passam a ser disponibilizados quando os contratos, validações e versões
                  publicadas de cada domínio estiverem prontos.
                </p>
              </article>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
