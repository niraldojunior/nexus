import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Briefcase,
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
import EmptyState from '../components/EmptyState';
import { PageHead } from '../components/ui';
import type { StudioDomain } from '../services/studioApi';
import type { StudioSection } from '../utils/appRoute';

// Paleta que o quadro do ícone "Studio Control" (o `Presentation`, um quadro sobre cavalete)
// percorre — puramente decorativo, por isso os hex ficam aqui em vez de token de design system
// (§7 do AGENTS.md é para tokens semânticos de UI; isto é uma animação de vitrine, não um estado
// da interface). 35% de opacidade em todas as cores para não competir com o ícone por cima.
const STUDIO_EASEL_COLORS = [
  '#7C5CE0',
  '#12805C',
  '#E8615C',
  '#F0A32E',
  '#FFD919',
  '#3B82F6',
  '#C08A2A',
];
const STUDIO_EASEL_OPACITY = 0.35;
const STUDIO_EASEL_INTERVAL_MS = 5000;

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const studioDomainBySection: Partial<Record<StudioSection, StudioDomain>> = {
  'resource-model': 'resource-model',
  'location-model': 'location-model',
  spatial: 'spatial',
  'studio-geo': 'studio-geo',
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
        label: 'Recursos',
        description: 'Catálogos, tipos, características e especificações.',
        icon: Network,
      },
      {
        id: 'location-model',
        label: 'Locais',
        description: 'Tipos de local e relações de contenção.',
        icon: MapPinned,
      },
      {
        id: 'service-model',
        label: 'Serviços',
        description: 'Catálogos de serviço, CFS e RFS.',
        icon: Briefcase,
      },
    ],
  },
  {
    label: 'Experiência',
    items: [
      {
        id: 'studio-geo',
        label: 'Mapa',
        description: 'Camadas, estilos, escalas e informações de mapa.',
        icon: Layers3,
      },
      {
        id: 'copilot',
        label: 'Copilot',
        description: 'Configurações, agentes, prompts e contexto do assistente IA.',
        icon: Bot,
      },
    ],
  },
  {
    label: 'Dados mestres',
    items: [
      {
        id: 'spatial',
        label: 'Camadas',
        description: 'Tipos de cobertura e objetos geográficos.',
        icon: MapIcon,
      },
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
  const studioDomain = activeItem ? studioDomainBySection[section] : undefined;

  // "Modo de edição" = existe um draft de governança aberto para o domínio ativo — um único
  // conceito, elevado de `StudioGovernanceSummary` (que sabe quando o draft existe) até aqui,
  // para repassar aos Studios de cada domínio (ex.: `ResourceModelStudio`) sem inventar um
  // segundo toggle local.
  const [isEditing, setIsEditing] = useState(false);
  const handleEditingChange = useCallback((editing: boolean) => {
    setIsEditing(editing);
  }, []);

  // Função de captura de draft registrada pelo Studio do domínio ativo (hoje só
  // `ResourceModelStudio`; domínios sem captura própria simplesmente não registram nada, e o
  // `beforePublish` vira um no-op). Um ref, não estado — não precisa provocar re-render, só
  // precisa existir no momento em que `StudioGovernanceSummary` publica.
  const captureDraftRef = useRef<(() => Promise<void>) | null>(null);
  const handleRegisterCaptureDraft = useCallback((fn: (() => Promise<void>) | null) => {
    captureDraftRef.current = fn;
  }, []);
  const handleBeforePublish = useCallback(() => captureDraftRef.current?.(), []);

  // Função de captura do estado inicial ("baseline"), registrada pelo Studio do domínio ativo —
  // espelha `captureDraftRef` acima, mas para o instante do "Editar" em vez do "Publicar". Ver
  // doc de `onRegisterCaptureInitialSnapshot` em `ResourceModelStudio`.
  const captureInitialSnapshotRef = useRef<(() => Promise<Record<string, unknown>>) | null>(null);
  const handleRegisterCaptureInitialSnapshot = useCallback(
    (fn: (() => Promise<Record<string, unknown>>) | null) => {
      captureInitialSnapshotRef.current = fn;
    },
    [],
  );
  const handleCaptureInitialSnapshot = useCallback(
    () => captureInitialSnapshotRef.current?.() ?? Promise.resolve({}),
    [],
  );

  // Quadro do ícone "Studio Control" (aside): o fundo atrás do `Presentation` troca de cor a
  // cada 5s, percorrendo STUDIO_EASEL_COLORS em looping.
  const [easelColorIndex, setEaselColorIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setEaselColorIndex((prev) => (prev + 1) % STUDIO_EASEL_COLORS.length);
    }, STUDIO_EASEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (!activeItem) return null;

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
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[14px] text-app-accent transition-colors duration-1000 ease-in-out"
              style={{ backgroundColor: hexToRgba(STUDIO_EASEL_COLORS[easelColorIndex], STUDIO_EASEL_OPACITY) }}
            >
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
                  onEditingChange={handleEditingChange}
                  beforePublish={handleBeforePublish}
                  captureInitialSnapshot={handleCaptureInitialSnapshot}
                />
              ) : undefined
            }
          />

          {section === 'resource-model' ? (
            <div className="mt-5">
              <ResourceModelStudio
                canEdit={canEdit}
                canAdmin={canAdmin}
                isEditing={isEditing}
                onRegisterCaptureDraft={handleRegisterCaptureDraft}
                onRegisterCaptureInitialSnapshot={handleRegisterCaptureInitialSnapshot}
              />
            </div>
          ) : section === 'location-model' ? (
            <div className="mt-5">
              <LocationModelStudio
                canEdit={canEdit}
                canAdmin={canAdmin}
                isEditing={isEditing}
                onRegisterCaptureDraft={handleRegisterCaptureDraft}
                onRegisterCaptureInitialSnapshot={handleRegisterCaptureInitialSnapshot}
              />
            </div>
          ) : section === 'spatial' ? (
            <div className="mt-5">
              <SpatialStudio canEdit={canEdit} canAdmin={canAdmin} />
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                title="Módulo em construção"
                description={`A área de ${activeItem.label.toLowerCase()} ainda não foi implementada no Nexus.`}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
