import { useId, useState } from 'react';
import { ResourceConnectionsTab } from './ResourceConnectionsTab';
import { SchematicTab } from './SchematicTab';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { ResourceConnection } from '../../services/resourceApi';
import type { DropSimulation } from './ViabilityTab';

export type ResourceConnectionsViewProps = {
  nodeId: string;
  /** @deprecated Relações não navegam mais para o painel do recurso relacionado. */
  onOpenResource?: (id: string) => void;
  onSimulate: (simulation: DropSimulation | null) => void;
  onPreview: (node: GeoTreeNode | null) => void;
  // Carregadas em `ResourcePanel` (mesmo dado do contador da aba "Conexões") — ver
  // ResourceConnectionsTab.tsx para o motivo de não buscar de novo aqui.
  connections: ResourceConnection[];
  connectionsLoading: boolean;
  connectionsError: string | null;
  onReloadConnections: () => void;
};

export function ResourceConnectionsView({
  nodeId,
  onSimulate,
  onPreview,
  connections,
  connectionsLoading,
  connectionsError,
  onReloadConnections,
}: ResourceConnectionsViewProps) {
  const [tab, setTab] = useState<'relationships' | 'schematic'>('relationships');
  const idPrefix = useId();
  const relationshipsTabId = `${idPrefix}-relationships-tab`;
  const schematicTabId = `${idPrefix}-schematic-tab`;
  const relationshipsPanelId = `${idPrefix}-relationships-panel`;
  const schematicPanelId = `${idPrefix}-schematic-panel`;

  return (
    <div className="grid gap-3">
      <div className="flex">
        <div
          role="tablist"
          aria-label="Conexões do recurso"
          className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1"
        >
          <button
            type="button"
            role="tab"
            id={relationshipsTabId}
            aria-controls={relationshipsPanelId}
            aria-selected={tab === 'relationships'}
            tabIndex={tab === 'relationships' ? 0 : -1}
            onClick={() => setTab('relationships')}
            className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
              tab === 'relationships'
                ? 'bg-app-panel text-app-text font-semibold shadow-sm'
                : 'text-app-muted hover:text-app-text'
            }`}
          >
            Relações
          </button>
          <button
            type="button"
            role="tab"
            id={schematicTabId}
            aria-controls={schematicPanelId}
            aria-selected={tab === 'schematic'}
            tabIndex={tab === 'schematic' ? 0 : -1}
            onClick={() => setTab('schematic')}
            className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
              tab === 'schematic'
                ? 'bg-app-panel text-app-text font-semibold shadow-sm'
                : 'text-app-muted hover:text-app-text'
            }`}
          >
            Esquemático
          </button>
        </div>
      </div>

      {tab === 'relationships' ? (
        <div id={relationshipsPanelId} role="tabpanel" aria-labelledby={relationshipsTabId}>
          <ResourceConnectionsTab
            connections={connections}
            loading={connectionsLoading}
            error={connectionsError}
            reload={onReloadConnections}
          />
        </div>
      ) : (
        <div id={schematicPanelId} role="tabpanel" aria-labelledby={schematicTabId}>
          <SchematicTab nodeId={nodeId} onSimulate={onSimulate} onPreview={onPreview} />
        </div>
      )}
    </div>
  );
}
