import { useEffect, useState } from 'react';
import { Building2, Layers, AlertCircle, Loader2 } from 'lucide-react';
import type { RoleDraftItem } from './roleDraft';
import { getPartyRoleTypeUsage, type PartyRoleTypeUsage } from '../../../services/partyRoleTypeApi';

export type RoleUsageTabProps = {
  item: RoleDraftItem;
};

export function RoleUsageTab({ item }: RoleUsageTabProps) {
  const [usage, setUsage] = useState<PartyRoleTypeUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.roleName) {
      setUsage({ organizationCount: 0, organizations: [], resourceSpecificationCount: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getPartyRoleTypeUsage(item.roleName)
      .then((data) => setUsage(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Falha ao carregar uso do papel.'),
      )
      .finally(() => setLoading(false));
  }, [item.roleName]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[0.84rem]">Calculando impacto e uso do papel...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const organizationCount = usage?.organizationCount ?? 0;
  const specCount = usage?.resourceSpecificationCount ?? 0;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h4 className="text-[0.88rem] font-bold text-app-text">Uso e Dependências do Papel</h4>
        <p className="text-[0.78rem] text-app-muted">
          Organizações e especificações que dependem da definição deste papel no sistema.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-app-border bg-app-panel p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sky-50 text-sky-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-2xl font-extrabold text-app-text">{organizationCount}</span>
              <p className="text-[0.78rem] text-app-muted">Organizações atribuídas</p>
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-app-border bg-app-panel p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-600">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-2xl font-extrabold text-app-text">{specCount}</span>
              <p className="text-[0.78rem] text-app-muted">Especificações de recurso</p>
            </div>
          </div>
        </div>
      </div>

      {organizationCount > 0 && (
        <div className="rounded-[14px] border border-app-border bg-app-panel p-4">
          <h5 className="text-[0.82rem] font-semibold text-app-text">
            Organizações ativas com este papel
          </h5>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {usage?.organizations.map((org) => (
              <span
                key={org.id}
                className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-[0.78rem] font-medium text-app-text"
              >
                {org.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {organizationCount === 0 && specCount === 0 && (
        <div className="rounded-[12px] border border-dashed border-app-border p-6 text-center text-[0.82rem] text-app-muted">
          Este papel não está atribuído a nenhuma organização nem referenciado em especificações.
        </div>
      )}
    </div>
  );
}
