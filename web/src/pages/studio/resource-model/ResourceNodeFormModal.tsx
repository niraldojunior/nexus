import { useState, useEffect } from 'react';
import { Folder, Box, AlertCircle } from 'lucide-react';
import type {
  ResourceCatalogNode,
  ResourceCatalogTreeNode,
  ResourceCatalogNodeKind,
  CreateResourceCatalogNodeInput,
  UpdateResourceCatalogNodeInput,
} from '../../../services/resourceCatalogApi';
import type { ResourceType } from '../../../services/resourceApi';
import { listResourceTypes } from '../../../services/resourceCatalogApi';
import { Modal, Button } from '../../../components/ui';

export type ResourceNodeFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate?: (input: CreateResourceCatalogNodeInput) => Promise<void>;
  onSubmitUpdate?: (input: UpdateResourceCatalogNodeInput) => Promise<void>;
  parentNode?: ResourceCatalogNode | null;
  editingNode?: ResourceCatalogNode | null;
  tree: ResourceCatalogTreeNode[];
};

export function ResourceNodeFormModal({
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  parentNode,
  editingNode,
  tree,
}: ResourceNodeFormModalProps) {
  const isEditing = Boolean(editingNode);
  const [kind, setKind] = useState<ResourceCatalogNodeKind>('GROUP');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [resourceTypeId, setResourceTypeId] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      listResourceTypes().then(setResourceTypes).catch(() => []);
      if (editingNode) {
        setKind(editingNode.kind);
        setCode(editingNode.code);
        setName(editingNode.name);
        setDescription(editingNode.description || '');
        setResourceTypeId(editingNode.resourceTypeId || '');
        setSelectedParentId(editingNode.parentNodeId || '');
      } else {
        setKind('GROUP');
        setCode('');
        setName('');
        setDescription('');
        setResourceTypeId('');
        setSelectedParentId(parentNode?.id || '');
      }
      setError(null);
    }
  }, [isOpen, editingNode, parentNode]);

  if (!isOpen) return null;

  // Flatten GROUP nodes from tree for parent picker
  const groupOptions: Array<{ id: string; name: string; code: string; level: number }> = [];
  const collectGroups = (nodes: ResourceCatalogTreeNode[], level = 0) => {
    for (const node of nodes) {
      if (node.kind === 'GROUP') {
        if (!editingNode || node.id !== editingNode.id) {
          groupOptions.push({ id: node.id, name: node.name, code: node.code, level });
          if (node.children) collectGroups(node.children, level + 1);
        }
      }
    }
  };
  collectGroups(tree);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('O nome é obrigatório.');
      return;
    }

    if (!isEditing && !code.trim()) {
      setError('O código é obrigatório.');
      return;
    }

    if (kind === 'RESOURCE_TYPE' && !resourceTypeId) {
      setError('Selecione um Tipo de Recurso para nós do tipo RESOURCE_TYPE.');
      return;
    }

    try {
      setSubmitting(true);
      if (isEditing && onSubmitUpdate) {
        await onSubmitUpdate({
          name: name.trim(),
          description: description.trim() || undefined,
        });
      } else if (!isEditing && onSubmitCreate) {
        await onSubmitCreate({
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          kind,
          resourceTypeId: kind === 'RESOURCE_TYPE' ? resourceTypeId : undefined,
          parentNodeId: selectedParentId || undefined,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar nó do catálogo.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      width={560}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
            {kind === 'GROUP' ? <Folder className="h-5 w-5" /> : <Box className="h-5 w-5" />}
          </div>
          <div>
            <h3>{isEditing ? 'Editar nó do catálogo' : 'Novo nó do catálogo'}</h3>
            <p className="text-[0.78rem] text-app-muted">
              {isEditing ? editingNode?.code : 'Adicionar nó na hierarquia'}
            </p>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="resource-node-form" disabled={submitting}>
            {submitting ? 'Salvando…' : isEditing ? 'Atualizar nó' : 'Criar nó'}
          </Button>
        </>
      }
    >
      <div>
        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form id="resource-node-form" onSubmit={handleSubmit} className="space-y-4">
          {!isEditing && (
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Tipo do Nó
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKind('GROUP')}
                  className={`flex items-center justify-center gap-2 rounded-[14px] border p-2.5 text-[0.84rem] font-medium transition ${
                    kind === 'GROUP'
                      ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                      : 'border-app-border hover:bg-black/[0.02] text-app-muted'
                  }`}
                >
                  <Folder className="h-4 w-4" />
                  Grupo (Ramo)
                </button>
                <button
                  type="button"
                  onClick={() => setKind('RESOURCE_TYPE')}
                  className={`flex items-center justify-center gap-2 rounded-[14px] border p-2.5 text-[0.84rem] font-medium transition ${
                    kind === 'RESOURCE_TYPE'
                      ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                      : 'border-app-border hover:bg-black/[0.02] text-app-muted'
                  }`}
                >
                  <Box className="h-4 w-4" />
                  Tipo de Recurso (Folha)
                </button>
              </div>
            </div>
          )}

          {!isEditing && (
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Nó Pai (Opcional)
              </label>
              <select
                value={selectedParentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              >
                <option value="">Raiz do Catálogo</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {'- '.repeat(g.level)}
                    {g.name} ({g.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isEditing && (
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Código (Identificador único no catálogo) *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: gpon_access, cto_distribution..."
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] font-mono text-app-text outline-none focus:border-app-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Nome de Exibição *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Acesso GPON, Caixa de Emenda..."
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            />
          </div>

          {!isEditing && kind === 'RESOURCE_TYPE' && (
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Tipo de Recurso Vinculado *
              </label>
              <select
                value={resourceTypeId}
                onChange={(e) => setResourceTypeId(e.target.value)}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              >
                <option value="">Selecione um tipo de recurso...</option>
                {resourceTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} ({rt.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Descrição (Opcional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva a finalidade deste nó ou grupo..."
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            />
          </div>

        </form>
      </div>
    </Modal>
  );
}
