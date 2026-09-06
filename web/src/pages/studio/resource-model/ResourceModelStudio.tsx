import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Plus, AlertCircle, Search } from 'lucide-react';
import type {
  ResourceCatalog,
  ResourceCatalogTreeNode,
  ResourceCatalogNode,
  CreateResourceCatalogNodeInput,
  UpdateResourceCatalogNodeInput,
} from '../../../services/resourceCatalogApi';
import {
  listResourceCatalogs,
  getResourceCatalogTree,
  createResourceCatalogNode,
  updateResourceCatalogNode,
  deleteResourceCatalogNode,
  moveResourceCatalogNode,
  reorderResourceCatalogNodes,
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
  /**
   * Registra (ou desregistra, com `null`) a função que apenas monta — sem salvar — o snapshot do
   * estado vivo atual do catálogo. `StudioPage` guarda essa função e a repassa a
   * `StudioGovernanceSummary` como `captureInitialSnapshot`, chamada no clique de "Editar" para
   * que o draft nasça com uma fotografia ("baseline") do estado anterior à edição — é o que
   * permite "Cancelar" restaurar de verdade em vez de só descartar a versão de governança.
   */
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

export function ResourceModelStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
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

  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [impactingNode, setImpactingNode] = useState<ResourceCatalogNode | null>(null);

  // Nós que já estavam `active` no instante em que a sessão de edição atual começou (capturado
  // por `onRegisterCaptureInitialSnapshot`, chamado por `StudioGovernanceSummary` no clique de
  // "Editar", antes de qualquer mutação). `null` = nenhuma sessão em andamento. Sem essa baseline,
  // a árvore reexibiria também nós já inativados antes desta edição (ver `ResourceCatalogTree`).
  const [baselineActiveNodeIds, setBaselineActiveNodeIds] = useState<Set<string> | null>(null);

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

  const handleUpdateSelectedNode = async (input: UpdateResourceCatalogNodeInput) => {
    if (!selectedCatalogId || !selectedNode) return;
    const updated = await updateResourceCatalogNode(
      selectedCatalogId,
      selectedNode.id,
      input,
    );
    await reloadTree();
    setSelectedNode(updated);
  };

  const handleDirectMove = async (
    nodeId: string,
    parentNodeId: string | null,
    orderedSiblingIds?: string[],
  ) => {
    if (!selectedCatalogId) return;
    try {
      const currentNode = findNodeById(tree, nodeId);
      const isParentChange = !currentNode || (currentNode.parentNodeId ?? null) !== parentNodeId;

      let moved: ResourceCatalogNode | null = null;
      if (isParentChange) {
        // Se mudou de pai ou virou raiz, move o nó para o novo pai
        moved = await moveResourceCatalogNode(selectedCatalogId, nodeId, {
          parentNodeId,
          sortOrder: orderedSiblingIds ? orderedSiblingIds.indexOf(nodeId) : 0,
        });
      }

      // Se foi passada a nova ordem de irmãos, grava a ordem de todos
      if (orderedSiblingIds && orderedSiblingIds.length > 0) {
        const reordered = await reorderResourceCatalogNodes(selectedCatalogId, {
          parentNodeId,
          orderedNodeIds: orderedSiblingIds,
        });
        const found = reordered.find((n) => n.id === nodeId);
        if (found) moved = found;
      }

      await reloadTree();
      if (moved) setSelectedNode(moved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao mover/reordenar nó na hierarquia.');
    }
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
  const buildSnapshot = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!selectedCatalogId) return {};
    const currentCat = catalogs.find((c) => c.id === selectedCatalogId);
    if (!currentCat) return {};

    const allNodes = await listResourceCatalogNodes(selectedCatalogId, true);
    return {
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
  }, [selectedCatalogId, catalogs]);

  const handleCaptureAsDraft = useCallback(async () => {
    const snapshot = await buildSnapshot();
    const status = await getStudioStatus('resource-model');
    await saveStudioDraft('resource-model', snapshot, status.draftVersion?.checksum);
  }, [buildSnapshot]);

  useEffect(() => {
    onRegisterCaptureDraft?.(handleCaptureAsDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [handleCaptureAsDraft, onRegisterCaptureDraft]);

  // Igual a `buildSnapshot`, mas também grava a baseline de nós ativos — reaproveita o
  // `nodes[].status` que o snapshot já carrega, sem uma segunda chamada à API.
  const captureInitialSnapshot = useCallback(async () => {
    const snapshot = await buildSnapshot();
    const nodes = (snapshot.nodes as Array<{ id: string; status: string }> | undefined) ?? [];
    setBaselineActiveNodeIds(new Set(nodes.filter((n) => n.status === 'active').map((n) => n.id)));
    return snapshot;
  }, [buildSnapshot]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(captureInitialSnapshot);
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [captureInitialSnapshot, onRegisterCaptureInitialSnapshot]);

  // Ao encerrar a edição (draft publicado ou cancelado — em ambos os casos o backend acabou de
  // gravar um estado novo nas tabelas canônicas), recarrega a árvore para refletir o resultado e
  // limpa a baseline. Sem isto, depois de um "Cancelar" bem-sucedido a tela continuaria mostrando
  // o estado pré-restauração até alguma outra ação forçar reload.
  const wasEditingRef = useRef(isEditing);
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      reloadTree();
      setBaselineActiveNodeIds(null);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing]);

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
      <div className="grid gap-5 lg:grid-cols-[342px_minmax(0,1fr)]">
        {/* Left: Árvore Hierárquica */}
        <div className="vt-card flex min-h-[560px] flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
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
              onImpactNode={(n) => {
                setImpactingNode(n);
                setImpactModalOpen(true);
              }}
              onDirectMove={handleDirectMove}
              canEdit={canEdit}
              isEditing={isEditing}
              baselineActiveIds={baselineActiveNodeIds}
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
              wasActiveAtBaseline={baselineActiveNodeIds?.has(selectedNode.id) ?? false}
              onImpact={() => {
                setImpactingNode(selectedNode);
                setImpactModalOpen(true);
              }}
              onReactivate={() => handleUpdateSelectedNode({ status: 'active' })}
              onUpdateNode={handleUpdateSelectedNode}
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
