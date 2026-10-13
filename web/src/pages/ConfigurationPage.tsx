import { Activity, ServerCog, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { UsersTab } from './config-tabs/UsersTab';
import { EnvironmentTab } from './config-tabs/EnvironmentTab';
import { EventsTab } from './config-tabs/EventsTab';

type ConfigTab = 'users' | 'environment' | 'events';

const tabs: Array<{ id: ConfigTab; label: string; icon: LucideIcon }> = [
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'environment', label: 'Ambiente', icon: ServerCog },
  { id: 'events', label: 'Eventos', icon: Activity },
];

export function ConfigurationPage() {
  const [tab, setTab] = useState<ConfigTab>('users');

  return (
    <div className="flex h-full w-full items-stretch overflow-hidden max-md:flex-col">
      <aside className="w-[185px] shrink-0 overflow-y-auto border-r border-app-border bg-app-sidebar px-[11px] pb-[22px] pt-[42px] max-md:w-full max-md:border-b max-md:border-r-0 max-md:px-5">
        <nav aria-label="Áreas de configuração" className="vt-studio-nav vt-studio-nav-ink">
          <p className="vt-sb-group-label">Configurações</p>
          <div className="space-y-1">
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = id === tab;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`vt-sb-btn w-full${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    className="h-[1.05rem] w-[1.05rem] shrink-0"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-left">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-app-bg px-8 py-8 max-md:px-5 max-md:py-6">
        {tab === 'users' ? (
          <UsersTab />
        ) : tab === 'environment' ? (
          <EnvironmentTab />
        ) : (
          <EventsTab />
        )}
      </section>
    </div>
  );
}
