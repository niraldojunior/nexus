import { useEffect, useState } from 'react';
import { FileText, RotateCcw, Tag, Trash2, Users } from 'lucide-react';
import type { RoleDraftItem } from './roleDraft';
import { partyRoleTypeIcon } from './partyRoleTypeOptions';
import { Button } from '../../../components/ui';
import { RoleGeneralTab } from './RoleGeneralTab';
import { RoleCharacteristicsTab } from './RoleCharacteristicsTab';
import { RoleUsageTab } from './RoleUsageTab';

export type RoleDetailProps = {
  item: RoleDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<RoleDraftItem>) => void;
  onInactivate: () => void;
  onReactivate: () => void;
  onRemoveNew?: () => void;
};

type RoleTab = 'general' | 'characteristics' | 'usage';

export function RoleDetail({
  item,
  canMutate,
  onChange,
  onInactivate,
  onReactivate,
  onRemoveNew,
}: RoleDetailProps) {
  const [activeTab, setActiveTab] = useState<RoleTab>('general');

  useEffect(() => {
    setActiveTab('general');
  }, [item.localId]);

  const RoleIcon = partyRoleTypeIcon(item.roleName);

  return (
    <div className="vt-card flex h-full min-h-[580px] flex-col overflow-hidden p-0">
      {/* Header do detalhe */}
      <div className="border-b border-app-border px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-accent">
              <RoleIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-bold leading-tight text-app-text">
                {item.label || 'Novo papel'}
              </h3>
              <p className="mt-0.5 truncate text-[0.78rem] text-app-muted">
                Código: <code className="font-mono text-app-text">{item.roleName || '—'}</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canMutate && !item.persistedId && onRemoveNew && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Trash2 className="h-4 w-4" />}
                onClick={onRemoveNew}
              >
                Descartar
              </Button>
            )}
            {canMutate && item.persistedId && item.active && (
              <Button
                variant="danger"
                size="sm"
                iconLeft={<Trash2 className="h-4 w-4" />}
                onClick={onInactivate}
              >
                Inativar
              </Button>
            )}
            {canMutate && item.persistedId && !item.active && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<RotateCcw className="h-4 w-4" />}
                onClick={onReactivate}
              >
                Reativar
              </Button>
            )}
          </div>
        </div>

        {/* Tab pills */}
        <div className="mt-4 flex">
          <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'general'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Geral</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('characteristics')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'characteristics'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Características ({item.characteristics.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('usage')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'usage'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Uso</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo da aba */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && (
          <RoleGeneralTab item={item} canMutate={canMutate} onChange={onChange} />
        )}
        {activeTab === 'characteristics' && (
          <RoleCharacteristicsTab item={item} canMutate={canMutate} onChange={onChange} />
        )}
        {activeTab === 'usage' && <RoleUsageTab item={item} />}
      </div>
    </div>
  );
}
