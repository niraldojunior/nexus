import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Plus, AlertCircle, Search, Folder, Layers } from 'lucide-react';
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
  getResourceModelSnapshotSource,
} from '../../../services/resourceCatalogApi';
import {
  getStudioStatus,
  saveStudioDraft,
} from '../../../services/studioApi';
import { Button } from '../../../components/ui';
import { ResourceCatalogTree } from './ResourceCatalogTree';
import { ResourceNodeDetail, type AutosaveState } from './ResourceNodeDetail';
import { ResourceNodeImpactModal } from './ResourceNodeImpactModal';

const AUTOSAVE_BLOCK_REASON: Partial<Record<AutosaveState, string>> = {
  dirty: 'Há uma alteração ainda não salva no painel de detalhe.',
  saving: 'Aguarde a gravação da alteração em andamento.',
  error: 'Uma alteração falhou ao salvar — corrija antes de publicar.',
};

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
  /**
   * Notifica `StudioPage` sempre que o painel de detalhe entra ou sai de um estado que deveria
   * bloquear "Publicar" em `StudioGovernanceSummary` — edição pendente/em voo/com erro (plano
   * §5.8). Domínios sem este conceito simplesmente não recebem chamadas, e a publicação nunca
   * fica bloqueada por causa deles.
   */
  onPublishBlockChange?: (blocked: boolean, reason?: string) => void;
};

export function ResourceModelStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
  onPublishBlockChange,
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

  // Menu flutuante de criação (Grupo / Tipo de Recurso) — substitui o modal manual (issue #230).
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuParent, setCreateMenuParent] = useState<ResourceCatalogNode | null>(null);

  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [impactingNode, setImpactingNode] = useState<ResourceCatalogNode | null>(null);

  // Função `flush()` registrada pelo painel de detalhe atualmente montado — força a gravação de
  // qualquer edição em debounce antes de capturar snapshot/draft/publicação (plano §5.5).
  const flushDetailRef = useRef<(() => Promise<void>) | null>(null);
  const registerDetailFlush = useCallback((fn: (() => Promise<void>) | null) => {
    flushDetailRef.current = fn;
  }, []);

  // Repassa a `StudioPage` o bloqueio de "Publicar" enquanto o painel de detalhe tiver edição
  // pendente/em voo/com erro (plano §5.8) — ver doc de `onPublishBlockChange`.
  const handleAutosaveStateChange = useCallback(
    (state: AutosaveState) => {
      const reason = AUTOSAVE_BLOCK_REASON[state];
      onPublishBlockChange?.(Boolean(reason), reason);
    },
    [onPublishBlockChange],
  );

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

  // Resolve o pai para uma nova criação: sem seleção, cria na raiz; com um GROUP selecionado,
  // cria abaixo dele; com um RESOURCE_TYPE selecionado (que nunca tem filhos — é sempre folha),
  // cria como irmão, usando o mesmo pai do nó selecionado.
  const resolveNewNodeParent = (explicitParent?: ResourceCatalogNode): ResourceCatalogNode | null => {
    if (explicitParent) return explicitParent;
    if (!selectedNode) return null;
    if (selectedNode.kind === 'GROUP') return selectedNode;
    return selectedNode.parentNodeId ? findNodeById(tree, selectedNode.parentNodeId) : null;
  };

  // Botão "+" da Hierarquia (cabeçalho ou hover de grupo): abre o menu flutuante Grupo/Tipo de
  // Recurso com o pai já resolvido — sem modal, sem digitação prévia (issue #230).
  const handleAddNodeClick = (explicitParent?: ResourceCatalogNode) => {
    setCreateMenuParent(resolveNewNodeParent(explicitParent));
    setCreateMenuOpen(true);
  };

  // Cria imediatamente "Novo Grupo" ou "Novo Tipo de Recurso" (+ seu ResourceType 1:1, no caso de
  // RESOURCE_TYPE) sob o pai resolvido, seleciona o nó recém-criado, expande o pai e fecha o menu
  // — a edição do nome acontece depois, via autosave na aba Geral.
  const handleCreateFromMenu = async (kind: CreateResourceCatalogNodeInput['kind']) => {
    if (!selectedCatalogId) return;
    setCreateMenuOpen(false);
    try {
      const created = await createResourceCatalogNode(selectedCatalogId, {
        kind,
        parentNodeId: createMenuParent?.id,
      });
      await reloadTree();
      setSelectedNode(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar nó no catálogo.');
    }
  };

  // Captura o estado atual do catálogo (que já reflete cada edição, gravada imediatamente via
  // API) como snapshot do draft de governança. Não é mais acionada por um botão manual — o
  // usuário podia editar a árvore, esquecer de "salvar como draft" e publicar um snapshot velho
  // por cima da hierarquia real, destruindo-a (issue #214). Em vez disso, `StudioPage` registra
  // esta função e a chama automaticamente logo antes de validar/publicar
  // (`StudioGovernanceSummary.beforePublish`), garantindo que o que é publicado é sempre o
  // estado vivo do catálogo. Erros propagam para quem chama, que já lida com eles.
  const buildSnapshot = useCallback(async (): Promise<Record<string, unknown>> => {
    // Garante que uma edição ainda em debounce no painel de detalhe seja gravada antes de
    // fotografar o estado do catálogo — senão captura/publicação podem ler um valor desatualizado.
    await flushDetailRef.current?.();
    if (!selectedCatalogId) return {};
    const currentCat = catalogs.find((c) => c.id === selectedCatalogId);
    if (!currentCat) return {};

    // Uma única projeção tenant-scoped traz nós, tipos e regras. Isso substitui a antiga chamada
    // por folha, que fazia o clique "Editar" crescer linearmente em round trips HTTP/Oracle.
    const source = await getResourceModelSnapshotSource(selectedCatalogId, true);
    const typeById = new Map(source.resourceTypes.map((type) => [type.id, type]));
    const rulesByTypeId = new Map<string, typeof source.relationshipRules>();
    for (const rule of source.relationshipRules) {
      const rules = rulesByTypeId.get(rule.sourceResourceTypeId) ?? [];
      rules.push(rule);
      rulesByTypeId.set(rule.sourceResourceTypeId, rules);
    }

    return {
      catalog: {
        id: source.catalog.id,
        code: source.catalog.code,
        name: source.catalog.name,
        description: source.catalog.description,
      },
      nodes: source.nodes.map((n) => {
        const type = n.resourceTypeId ? typeById.get(n.resourceTypeId) : undefined;
        const rules = n.resourceTypeId ? rulesByTypeId.get(n.resourceTypeId) : undefined;
        return {
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
          ...(type
            ? {
                resourceType: {
                  name: type.name,
                  description: type.description,
                  status: type.status,
                  nature: type.nature,
                  mapPresence: type.mapPresence,
                  resourceTypeCharacteristic: type.resourceTypeCharacteristic,
                },
              }
            : {}),
          ...(rules
            ? {
                relationshipRules: rules
                  .filter((r) => r.lifecycleStatus === 'Active')
                  .map((r) => ({
                    relationshipTypeCode: r.relationshipTypeCode,
                    targetKind: r.targetKind,
                    targetId: r.targetId,
                    cardinality: r.cardinality,
                    validFor: r.validFor,
                  })),
              }
            : {}),
        };
      }),
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
      onPublishBlockChange?.(false);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, onPublishBlockChange]);

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
                <div className="relative">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAddNodeClick()}
                    title="Incluir nó"
                    aria-label="Incluir nó"
                    aria-haspopup="menu"
                    aria-expanded={createMenuOpen}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  {createMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setCreateMenuOpen(false)}
                      />
                      <div
                        role="menu"
                        aria-label="Tipo de nó a incluir"
                        className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-[12px] border border-app-border bg-white py-1 shadow-soft"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleCreateFromMenu('GROUP')}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.84rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                        >
                          <Folder className="h-3.5 w-3.5" />
                          Grupo
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleCreateFromMenu('RESOURCE_TYPE')}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.84rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Tipo de Recurso
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <ResourceCatalogTree
              tree={tree}
              showSearch={showSearch}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNode}
              onAddChild={(parent) => handleAddNodeClick(parent)}
              onImpactNode={(n) => {
                setImpactingNode(n);
                setImpactModalOpen(true);
              }}
              onDirectMove={handleDirectMove}
              canEdit={canEdit}
              isEditing={isEditing}
              baselineActiveIds={baselineActiveNodeIds}
              expandNodeId={selectedNode?.parentNodeId ?? null}
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
              onRegisterFlush={registerDetailFlush}
              onAutosaveStateChange={handleAutosaveStateChange}
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
