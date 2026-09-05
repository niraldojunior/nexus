import { useState, useEffect, useCallback } from 'react';
import { Box, Plus, AlertCircle, Search } from 'lucide-react';
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
import { Button } from '../../../components/ui';
import { ResourceCatalogTree } from './ResourceCatalogTree';
import { ResourceNodeDetail } from './ResourceNodeDetail';
import { ResourceNodeFormModal } from './ResourceNodeFormModal';
import { ResourceNodeMoveModal } from './ResourceNodeMoveModal';
import { ResourceNodeImpactModal } from './ResourceNodeImpactModal';

const findNodeById = (
  nodes: ResourceCatalogTreeNode[],
  id: string,
): ResourceCatalogNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const sub = findNodeById(n.children, id);
      if (sub) return sub;
    }
  }
  return null;
};

export type ResourceModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
  /** Existe um draft de governança aberto para o domínio "resource-model" (ver StudioPage). */
  isEditing: boolean;
  /**
   * Registra (ou desregistra, com `null`) a função que captura o estado atual do catálogo como
   * draft de governança. `StudioPage` guarda essa função e a repassa a `StudioGovernanceSummary`
   * como `beforePublish`, para que a hierarquia gravada seja sempre a mais recente no momento da
   * publicação — nunca um draft esquecido/desatualizado (ver issue #214).
   */
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
};

export function ResourceModelStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
}: ResourceModelStudioProps) {
  // Um catálogo por tenant — sem seletor. Assume-se sempre o catálogo padrão (ou o primeiro,
  // se nenhum estiver marcado como padrão).
  const [catalogs, setCatalogs] = useState<ResourceCatalog[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [tree, setTree] = useState<ResourceCatalogTreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ResourceCatalogNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Textbox de busca da hierarquia começa oculta; a lupa no cabeçalho alterna a exibição.
  const [showSearch, setShowSearch] = useState(false);

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

  // Botão "+" da Hierarquia: sem seleção, cria na raiz; com um GROUP selecionado, cria abaixo
  // dele; com um RESOURCE_TYPE selecionado (que nunca tem filhos — é sempre folha), cria como
  // irmão, usando o mesmo pai do nó selecionado.
  const handleAddNodeClick = () => {
    setFormEditingNode(null);
    if (!selectedNode) {
      setFormParentNode(null);
    } else if (selectedNode.kind === 'GROUP') {
      setFormParentNode(selectedNode);
    } else {
      const parentOfSelected = selectedNode.parentNodeId
        ? findNodeById(tree, selectedNode.parentNodeId)
        : null;
      setFormParentNode(parentOfSelected);
    }
    setFormModalOpen(true);
  };

  // Captura o estado atual do catálogo (que já reflete cada edição, gravada imediatamente via
  // API) como snapshot do draft de governança. Não é mais acionada por um botão manual — o
  // usuário podia editar a árvore, esquecer de "salvar como draft" e publicar um snapshot velho
  // por cima da hierarquia real, destruindo-a (issue #214). Em vez disso, `StudioPage` registra
  // esta função e a chama automaticamente logo antes de validar/publicar
  // (`StudioGovernanceSummary.beforePublish`), garantindo que o que é publicado é sempre o
  // estado vivo do catálogo. Erros propagam para quem chama, que já lida com eles.
  const handleCaptureAsDraft = useCallback(async () => {
    if (!selectedCatalogId) return;
    const currentCat = catalogs.find((c) => c.id === selectedCatalogId);
    if (!currentCat) return;

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
    await saveStudioDraft('resource-model', snapshot, status.draftVersion?.checksum);
  }, [selectedCatalogId, catalogs]);

  useEffect(() => {
    onRegisterCaptureDraft?.(handleCaptureAsDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [handleCaptureAsDraft, onRegisterCaptureDraft]);

  const canMutate = canEdit && isEditing;

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
          style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Master/Detail Layout */}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left: Árvore Hierárquica */}
        <div className="vt-card flex min-h-[560px] flex-col p-4">
          <div className="mb-3 flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="font-bold">Hierarquia</h3>
            <div className="flex items-center gap-2">
              <Button
                variant={showSearch ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setShowSearch((prev) => !prev)}
                title={showSearch ? 'Ocultar busca' : 'Buscar nós'}
                aria-label={showSearch ? 'Ocultar busca' : 'Buscar nós'}
                aria-pressed={showSearch}
              >
                <Search className="h-4 w-4" />
              </Button>
              {canMutate && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddNodeClick}
                  title="Incluir nó"
                  aria-label="Incluir nó"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1">
            <ResourceCatalogTree
              tree={tree}
              showSearch={showSearch}
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
              isEditing={isEditing}
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
              isEditing={isEditing}
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
            <div className="vt-card flex min-h-[560px] flex-col items-center justify-center p-12 text-center text-app-muted">
              <Box className="h-10 w-10 mb-3 opacity-30" />
              <h3 className="text-[1.1rem]">Nenhum nó selecionado</h3>
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
