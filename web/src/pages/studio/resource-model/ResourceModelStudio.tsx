import { useState, useEffect } from 'react';
import {
  Box,
  Plus,
  RefreshCw,
  Network,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type {
  ResourceCatalog,
  ResourceCatalogTreeNode,
  ResourceCatalogNode,
  CreateResourceCatalogNodeInput,
  UpdateResourceCatalogNodeInput,
  MoveResourceCatalogNodeInput,
} from '../../../services/resourceCatalogApi';
import {
  listResourceCatalogs,
  getResourceCatalogTree,
  createResourceCatalogNode,
  updateResourceCatalogNode,
  deleteResourceCatalogNode,
  moveResourceCatalogNode,
  listResourceCatalogNodes,
} from '../../../services/resourceCatalogApi';
import {
  getStudioStatus,
  saveStudioDraft,
} from '../../../services/studioApi';
import { ResourceCatalogTree } from './ResourceCatalogTree';
import { ResourceNodeDetail } from './ResourceNodeDetail';
import { ResourceNodeFormModal } from './ResourceNodeFormModal';
import { ResourceNodeMoveModal } from './ResourceNodeMoveModal';
import { ResourceNodeImpactModal } from './ResourceNodeImpactModal';

export type ResourceModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
};

export function ResourceModelStudio({ canEdit }: ResourceModelStudioProps) {
  const [catalogs, setCatalogs] = useState<ResourceCatalog[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [tree, setTree] = useState<ResourceCatalogTreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ResourceCatalogNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturingDraft, setCapturingDraft] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formParentNode, setFormParentNode] = useState<ResourceCatalogNode | null>(null);
  const [formEditingNode, setFormEditingNode] = useState<ResourceCatalogNode | null>(null);

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [movingNode, setMovingNode] = useState<ResourceCatalogNode | null>(null);

  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [impactingNode, setImpactingNode] = useState<ResourceCatalogNode | null>(null);

  // Load catalogs on mount
  useEffect(() => {
    async function init() {
      try {
        const list = await listResourceCatalogs();
        setCatalogs(list);
        if (list.length > 0) {
          const defaultCat = list.find((c) => c.isDefault) ?? list[0];
          setSelectedCatalogId(defaultCat.id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar catálogos.');
      }
    }
    init();
  }, []);

  // Load tree when selectedCatalogId changes
  const reloadTree = async () => {
    if (!selectedCatalogId) return;
    try {
      const treeData = await getResourceCatalogTree(selectedCatalogId, true);
      setTree(treeData);
      if (selectedNode) {
        // Refresh selected node reference
        const findNode = (nodes: ResourceCatalogTreeNode[]): ResourceCatalogNode | null => {
          for (const n of nodes) {
            if (n.id === selectedNode.id) return n;
            if (n.children) {
              const sub = findNode(n.children);
              if (sub) return sub;
            }
          }
          return null;
        };
        const refreshed = findNode(treeData);
        setSelectedNode(refreshed);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar árvore do catálogo.');
    }
  };

  useEffect(() => {
    if (selectedCatalogId) {
      reloadTree();
    }
  }, [selectedCatalogId]);

  const handleCreateNode = async (input: CreateResourceCatalogNodeInput) => {
    if (!selectedCatalogId) return;
    const created = await createResourceCatalogNode(selectedCatalogId, input);
    await reloadTree();
    setSelectedNode(created);
  };

  const handleUpdateNode = async (input: UpdateResourceCatalogNodeInput) => {
    if (!selectedCatalogId || !formEditingNode) return;
    const updated = await updateResourceCatalogNode(
      selectedCatalogId,
      formEditingNode.id,
      input,
    );
    await reloadTree();
    setSelectedNode(updated);
  };

  const handleMoveNode = async (input: MoveResourceCatalogNodeInput) => {
    if (!selectedCatalogId || !movingNode) return;
    const moved = await moveResourceCatalogNode(selectedCatalogId, movingNode.id, input);
    await reloadTree();
    setSelectedNode(moved);
  };

  const handleInactivateNode = async () => {
    if (!selectedCatalogId || !impactingNode) return;
    await deleteResourceCatalogNode(selectedCatalogId, impactingNode.id);
    await reloadTree();
  };

  // Capturar estado atual como draft do Studio
  const handleCaptureAsDraft = async () => {
    if (!selectedCatalogId) return;
    const currentCat = catalogs.find((c) => c.id === selectedCatalogId);
    if (!currentCat) return;

    try {
      setCapturingDraft(true);
      setError(null);
      setDraftSuccess(null);

      const allNodes = await listResourceCatalogNodes(selectedCatalogId, true);
      const snapshot = {
        catalog: {
          id: currentCat.id,
          code: currentCat.code,
          name: currentCat.name,
          description: currentCat.description,
        },
        nodes: allNodes.map((n) => ({
          id: n.id,
          code: n.code,
          name: n.name,
          description: n.description,
          kind: n.kind,
          resourceTypeId: n.resourceTypeId,
          resourceTypeCode: n.resourceType?.code,
          parentNodeId: n.parentNodeId ?? null,
          sortOrder: n.sortOrder,
          status: n.status,
          metadata: n.metadata,
        })),
      };

      const status = await getStudioStatus('resource-model');
      await saveStudioDraft(
        'resource-model',
        snapshot,
        status.draftVersion?.checksum,
      );
      setDraftSuccess('Snapshot do catálogo salvo como draft de governança!');
      setTimeout(() => setDraftSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar draft no Studio.');
    } finally {
      setCapturingDraft(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Bar / Catalog Picker & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[22px] border border-app-border bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-app-accent-soft text-app-text">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <label htmlFor="catalog-select" className="text-[0.72rem] font-bold uppercase tracking-wider text-app-muted block">
              Catálogo de Recursos Ativo
            </label>
            <select
              id="catalog-select"
              value={selectedCatalogId}
              onChange={(e) => {
                setSelectedCatalogId(e.target.value);
                setSelectedNode(null);
              }}
              className="mt-0.5 rounded-[10px] border border-app-border bg-white px-2.5 py-1 text-[0.88rem] font-semibold text-app-text outline-none focus:border-app-accent"
            >
              {catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) {c.isDefault ? '— Padrão' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFormEditingNode(null);
                  setFormParentNode(null);
                  setFormModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-[12px] bg-app-accent px-3.5 py-2 text-[0.82rem] font-semibold text-white hover:opacity-90 transition shadow-soft"
              >
                <Plus className="h-4 w-4" />
                Novo Nó na Raiz
              </button>

              <button
                type="button"
                onClick={handleCaptureAsDraft}
                disabled={capturingDraft}
                className="flex items-center gap-1.5 rounded-[12px] border border-app-border bg-white px-3.5 py-2 text-[0.82rem] font-medium text-app-text hover:bg-app-accent-soft transition"
              >
                <Save className="h-4 w-4 text-app-muted" />
                {capturingDraft ? 'Salvando...' : 'Salvar como Draft'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={reloadTree}
            title="Recarregar Árvore"
            className="rounded-[12px] border border-app-border bg-white p-2 text-app-muted hover:text-app-text hover:bg-black/[0.02] transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {draftSuccess && (
        <div className="flex items-center gap-2 rounded-[16px] border border-emerald-200 bg-emerald-50 p-3 text-[0.84rem] text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{draftSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-[16px] border border-red-200 bg-red-50 p-3 text-[0.84rem] text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Master/Detail Layout */}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left: Árvore Hierárquica */}
        <div className="rounded-[22px] border border-app-border bg-white p-4 shadow-soft min-h-[560px] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-app-border mb-3">
            <span className="text-[0.78rem] font-semibold uppercase tracking-wider text-app-muted">
              Hierarquia do Catálogo
            </span>
            <span className="text-[0.75rem] text-app-muted font-mono">
              {tree.length} nós raiz
            </span>
          </div>

          <div className="flex-1">
            <ResourceCatalogTree
              tree={tree}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNode}
              onAddChild={(parent) => {
                setFormEditingNode(null);
                setFormParentNode(parent);
                setFormModalOpen(true);
              }}
              onEditNode={(n) => {
                setFormEditingNode(n);
                setFormParentNode(null);
                setFormModalOpen(true);
              }}
              onMoveNode={(n) => {
                setMovingNode(n);
                setMoveModalOpen(true);
              }}
              onImpactNode={(n) => {
                setImpactingNode(n);
                setImpactModalOpen(true);
              }}
              canEdit={canEdit}
            />
          </div>
        </div>

        {/* Right: Painel de Detalhes */}
        <div className="min-w-0">
          {selectedNode && selectedCatalogId ? (
            <ResourceNodeDetail
              catalogId={selectedCatalogId}
              node={selectedNode}
              canEdit={canEdit}
              onEdit={() => {
                setFormEditingNode(selectedNode);
                setFormParentNode(null);
                setFormModalOpen(true);
              }}
              onMove={() => {
                setMovingNode(selectedNode);
                setMoveModalOpen(true);
              }}
              onImpact={() => {
                setImpactingNode(selectedNode);
                setImpactModalOpen(true);
              }}
            />
          ) : (
            <div className="rounded-[22px] border border-dashed border-app-border bg-white p-12 text-center text-app-muted flex flex-col items-center justify-center min-h-[560px]">
              <Box className="h-10 w-10 mb-3 opacity-30" />
              <h3 className="text-[1.1rem] font-semibold text-app-text">Nenhum nó selecionado</h3>
              <p className="text-[0.85rem] mt-1 max-w-sm">
                Selecione um grupo ou tipo de recurso na árvore à esquerda para visualizar seus
                detalhes, especificações e dependências.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modais */}
      <ResourceNodeFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmitCreate={handleCreateNode}
        onSubmitUpdate={handleUpdateNode}
        parentNode={formParentNode}
        editingNode={formEditingNode}
        tree={tree}
      />

      {movingNode && (
        <ResourceNodeMoveModal
          isOpen={moveModalOpen}
          onClose={() => {
            setMoveModalOpen(false);
            setMovingNode(null);
          }}
          onMove={handleMoveNode}
          node={movingNode}
          tree={tree}
        />
      )}

      {impactingNode && selectedCatalogId && (
        <ResourceNodeImpactModal
          isOpen={impactModalOpen}
          onClose={() => {
            setImpactModalOpen(false);
            setImpactingNode(null);
          }}
          onConfirmInactivate={handleInactivateNode}
          catalogId={selectedCatalogId}
          node={impactingNode}
        />
      )}
    </div>
  );
}
