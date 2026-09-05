import { useState, useEffect } from 'react';
import {
  Box,
  Folder,
  FileCode,
  AlertTriangle,
} from 'lucide-react';
import type {
  ResourceCatalogNode,
  ResourceCatalogPath,
  ResourceCatalogNodeImpact,
  ResourceTypeCatalogContext,
} from '../../../services/resourceCatalogApi';
import {
  getResourceCatalogNodePath,
  getResourceCatalogNodeImpact,
  getResourceTypeCatalogContext,
  listResourceSpecifications,
} from '../../../services/resourceCatalogApi';
import type { ResourceSpecification } from '../../../services/resourceApi';
import { Button, Badge } from '../../../components/ui';

export type ResourceNodeDetailProps = {
  catalogId: string;
  node: ResourceCatalogNode;
  canEdit: boolean;
  /** Existe um draft de governança aberto — controla a visibilidade dos botões de mutação. */
  isEditing: boolean;
  onEdit: () => void;
  onMove: () => void;
  onImpact: () => void;
};

type DetailTab = 'overview' | 'specifications' | 'context' | 'impact';

export function ResourceNodeDetail({
  catalogId,
  node,
  canEdit,
  isEditing,
  onEdit,
  onMove,
  onImpact,
}: ResourceNodeDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [path, setPath] = useState<ResourceCatalogPath | null>(null);
  const [specifications, setSpecifications] = useState<ResourceSpecification[]>([]);
  const [context, setContext] = useState<ResourceTypeCatalogContext | null>(null);
  const [impact, setImpact] = useState<ResourceCatalogNodeImpact | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDetails() {
      try {
        const [pathRes, impactRes] = await Promise.all([
          getResourceCatalogNodePath(catalogId, node.id).catch(() => null),
          getResourceCatalogNodeImpact(catalogId, node.id).catch(() => null),
        ]);

        if (isMounted) {
          setPath(pathRes);
          setImpact(impactRes);
        }

        if (node.kind === 'RESOURCE_TYPE' && node.resourceTypeId) {
          const [specsRes, contextRes] = await Promise.all([
            listResourceSpecifications({ resourceTypeId: node.resourceTypeId }).catch(() => []),
            getResourceTypeCatalogContext(node.resourceTypeId).catch(() => null),
          ]);
          if (isMounted) {
            setSpecifications(specsRes);
            setContext(contextRes);
          }
        } else {
          if (isMounted) {
            setSpecifications([]);
            setContext(null);
          }
        }
      } catch {
        // Ignora erros individuais de detalhamento para manter UI responsiva
      }
    }

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [catalogId, node]);

  const isGroup = node.kind === 'GROUP';

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="p-6 border-b border-app-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border ${
                isGroup
                  ? 'border-amber-200 bg-amber-50 text-amber-600'
                  : 'border-sky-200 bg-sky-50 text-sky-600'
              }`}
            >
              {isGroup ? <Folder className="h-6 w-6" /> : <Box className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  {isGroup ? 'Grupo de catálogo' : 'Tipo de recurso'}
                </span>
                <Badge tone={node.status === 'active' ? 'green' : 'red'} dot>
                  {node.status === 'active' ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <h2 className="mt-0.5">{node.name}</h2>
              <p className="text-[0.82rem] font-mono text-app-muted mt-0.5">{node.code}</p>
            </div>
          </div>

          {canEdit && isEditing && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onMove}>
                Mover
              </Button>
              <Button variant="secondary" size="sm" onClick={onEdit}>
                Editar
              </Button>
              <Button variant="danger" size="sm" onClick={onImpact}>
                Inativar
              </Button>
            </div>
          )}
        </div>

        {/* Caminho / Breadcrumb */}
        {path && path.nodes.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 text-[0.78rem] text-app-muted overflow-x-auto py-1">
            <span className="font-semibold text-app-text">{path.catalog.name}</span>
            {path.nodes.map((step) => (
              <span key={step.id} className="flex items-center gap-1.5 shrink-0">
                <span className="text-app-border">/</span>
                <span className={step.id === node.id ? 'font-semibold text-app-accent' : ''}>
                  {step.name}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-app-border -mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-[0.85rem] font-medium transition border-b-2 -mb-px ${
              activeTab === 'overview'
                ? 'border-app-accent text-app-accent font-semibold'
                : 'border-transparent text-app-muted hover:text-app-text'
            }`}
          >
            Visão Geral
          </button>
          {!isGroup && (
            <button
              type="button"
              onClick={() => setActiveTab('specifications')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[0.85rem] font-medium transition border-b-2 -mb-px ${
                activeTab === 'specifications'
                  ? 'border-app-accent text-app-accent font-semibold'
                  : 'border-transparent text-app-muted hover:text-app-text'
              }`}
            >
              Especificações
              <span className="rounded-full bg-black/[0.06] px-1.5 py-0.2 text-[0.72rem]">
                {specifications.length}
              </span>
            </button>
          )}
          {!isGroup && (
            <button
              type="button"
              onClick={() => setActiveTab('context')}
              className={`px-4 py-2.5 text-[0.85rem] font-medium transition border-b-2 -mb-px ${
                activeTab === 'context'
                  ? 'border-app-accent text-app-accent font-semibold'
                  : 'border-transparent text-app-muted hover:text-app-text'
              }`}
            >
              Ocorrências na Árvore
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('impact')}
            className={`px-4 py-2.5 text-[0.85rem] font-medium transition border-b-2 -mb-px ${
              activeTab === 'impact'
                ? 'border-app-accent text-app-accent font-semibold'
                : 'border-transparent text-app-muted hover:text-app-text'
            }`}
          >
            Impacto no Inventário
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6 overflow-y-auto flex-1">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                Descrição
              </h3>
              <p className="text-[0.92rem] text-app-text leading-relaxed">
                {node.description || 'Nenhuma descrição fornecida.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Tipo de nó</span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1">{node.kind}</p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Ordem (sort)</span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1">{node.sortOrder}</p>
              </div>
              {node.resourceType && (
                <div className="rounded-[10px] border border-app-border p-4">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                    Tipo referenciado
                  </span>
                  <p className="text-[0.95rem] font-medium text-app-text mt-1">
                    {node.resourceType.name}
                  </p>
                </div>
              )}
            </div>

            {node.metadata && Object.keys(node.metadata).length > 0 && (
              <div>
                <h3 className="mb-3" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  Metadados adicionais
                </h3>
                <pre className="rounded-[16px] border border-app-border bg-black/[0.02] p-4 text-[0.82rem] font-mono overflow-x-auto text-app-text">
                  {JSON.stringify(node.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'specifications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[0.88rem] font-semibold text-app-text">
                Especificações vinculadas ({specifications.length})
              </h3>
            </div>

            {specifications.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-app-border p-8 text-center text-app-muted">
                <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-[0.88rem] font-medium">Nenhuma especificação cadastrada.</p>
                <p className="text-[0.78rem]">
                  Especificações técnicas vinculadas a este tipo de recurso aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-app-border rounded-[18px] border border-app-border overflow-hidden">
                {specifications.map((spec) => (
                  <div key={spec.id} className="p-4 hover:bg-black/[0.01] transition flex items-center justify-between">
                    <div>
                      <h4 className="text-[0.9rem] font-semibold text-app-text">{spec.name}</h4>
                      <p className="text-[0.78rem] text-app-muted mt-0.5">
                        {spec.description || 'Sem descrição'} • {spec.resourceSpecificationCharacteristic?.length ?? 0} características
                      </p>
                    </div>
                    <span className="text-[0.75rem] font-mono text-app-muted">
                      {spec.id.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="space-y-4">
            <h3 className="text-[0.88rem] font-semibold text-app-text">
              Ocorrências em Catálogos
            </h3>
            {context && context.catalogPaths.length > 0 ? (
              <div className="space-y-2">
                {context.catalogPaths.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded-[16px] border border-app-border p-3.5 bg-black/[0.01] flex items-center gap-2 text-[0.85rem]"
                  >
                    <span className="font-semibold text-app-text">{p.catalog.name}</span>
                    <span className="text-app-border">/</span>
                    <div className="flex items-center gap-1.5 text-app-muted">
                      {p.nodes.map((n, nIdx) => (
                        <span key={n.id} className="flex items-center gap-1.5">
                          {nIdx > 0 && <span className="text-app-border">/</span>}
                          <span className={n.id === node.id ? 'font-bold text-app-accent' : ''}>
                            {n.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[0.85rem] text-app-muted">Nenhum outro caminho catalogado.</p>
            )}
          </div>
        )}

        {activeTab === 'impact' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Descendentes</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.descendantCount ?? 0}
                </p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Tipos afetados</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.resourceTypeIds.length ?? 0}
                </p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Recursos físicos</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.activePhysicalResourceCount ?? 0}
                </p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Recursos lógicos</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.activeLogicalResourceCount ?? 0}
                </p>
              </div>
            </div>

            <div className="rounded-[18px] border border-amber-200 bg-amber-50/60 p-4 text-amber-900 text-[0.84rem] leading-relaxed flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong className="font-semibold">Regra de Soft-Delete & Governança (C6):</strong>
                <p className="mt-1 text-amber-800">
                  A inativação de um nó de catálogo preserva todo o histórico e não remove instâncias
                  de recursos já criadas. Grupos que possuem nós filhos diretos ativos requerem a
                  desativação ou movimentação prévia de seus nós subordinados.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
