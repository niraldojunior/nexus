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
        <p className="px-2 pb-2.5 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
          Configurações
        </p>
        <div className="space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex w-full items-center gap-[9px] rounded-[11px] border px-[11px] py-[7px] text-left transition ${
                  active
                    ? 'vt-yellow-selected text-app-text'
                    : 'border-transparent text-app-text hover:border-app-border hover:bg-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className="text-[0.76rem] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-white px-8 py-8 max-md:px-5 max-md:py-6">
        {tab === 'users' ? <UsersTab /> : tab === 'environment' ? <EnvironmentTab /> : <EventsTab />}
      </section>
    </div>
  );
}
