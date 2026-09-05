import {
  Braces,
  Database,
  FileStack,
  Layers3,
  Map as MapIcon,
  MapPinned,
  Network,
  Settings2,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { StudioGovernanceBar } from '../components/StudioGovernanceBar';
import { ResourceModelStudio } from './studio/resource-model/ResourceModelStudio';
import { LocationModelStudio } from './studio/location-model/LocationModelStudio';
import { SpatialStudio } from './studio/spatial/SpatialStudio';
import { Badge, PageHead } from '../components/ui';
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
    <div className="h-full overflow-y-auto bg-white px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div
        className="mx-auto grid gap-5 lg:grid-cols-[252px_minmax(0,1fr)]"
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <aside className="vt-card h-fit p-3 lg:sticky lg:top-0">
          <div className="flex items-center gap-3 px-3 pb-4 pt-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-app-accent-border bg-app-accent-soft text-app-text">
              <Settings2 className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <span
                className="block"
                style={{ font: 'var(--fw-semibold) var(--fs-body-lg)/1.2 var(--font-ui)', color: 'var(--text-primary)' }}
              >
                Studio
              </span>
              <p className="text-[0.78rem] text-app-muted">Control plane</p>
            </div>
          </div>

          <nav aria-label="Áreas do Studio" className="vt-studio-nav space-y-4">
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
            actions={<StudioAccessBadge canEdit={canEdit} canAdmin={canAdmin} />}
          />

          {studioDomain ? (
            <div className="mt-5">
              <StudioGovernanceBar domain={studioDomain} canEdit={canEdit} canAdmin={canAdmin} />
            </div>
          ) : null}

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
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <article className="vt-card p-5 sm:p-6">
                <p style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Em preparação</p>
                <h3 className="mt-2">A área será habilitada por contrato publicado</h3>
                <p className="mt-3 max-w-2xl text-[0.95rem] leading-7 text-app-muted">
                  Esta fundação estabelece a navegação, o acesso e a superfície comum do Studio. Os
                  editores passam a ser disponibilizados quando os contratos, validações e versões
                  publicadas de cada domínio estiverem prontos.
                </p>
              </article>

              <aside className="vt-card p-5">
                <h3>Governança</h3>
                <dl className="mt-4 space-y-3 text-[0.88rem]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-app-muted">Edição de draft</dt>
                    <dd className="font-semibold text-app-text">{canEdit ? 'Permitida' : 'Somente leitura'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-app-muted">Publicação</dt>
                    <dd className="font-semibold text-app-text">{canAdmin ? 'Permitida' : 'Não permitida'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-app-muted">Fonte operacional</dt>
                    <dd className="font-semibold text-app-text">Published</dd>
                  </div>
                </dl>
              </aside>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StudioAccessBadge({ canEdit, canAdmin }: { canEdit: boolean; canAdmin: boolean }) {
  const label = canAdmin ? 'Administrador' : canEdit ? 'Editor' : 'Leitura';
  return (
    <Badge tone={canAdmin ? 'brand' : canEdit ? 'blue' : 'neutral'}>
      <Braces className="h-3.5 w-3.5" strokeWidth={1.8} />
      {label}
    </Badge>
  );
}
