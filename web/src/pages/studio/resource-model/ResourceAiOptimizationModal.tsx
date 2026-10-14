import { AlertCircle, Folder, Layers, Sparkles } from 'lucide-react';
import type {
  ResourceCatalogAiChangeKind,
  ResourceCatalogAiPreview,
  ResourceCatalogAiProjectedNode,
} from '../../../services/resourceCatalogApi';
import { Modal, Button } from '../../../components/ui';

export type ResourceAiOptimizationModalProps = {
  preview: ResourceCatalogAiPreview;
  applying: boolean;
  error: string | null;
  onApply: () => void;
  onClose: () => void;
};

const CHANGE_LABEL: Record<ResourceCatalogAiChangeKind, string> = {
  new: 'Novo',
  renamed: 'Renomeado',
  moved: 'Movido',
  reordered: 'Reordenado',
  inactivated: 'Inativado',
};

const COUNTER_LABEL = [
  ['created', 'Novos'],
  ['renamed', 'Renomeados'],
  ['moved', 'Movidos'],
  ['reordered', 'Reordenados'],
  ['inactivated', 'Inativados'],
] as const;

function ProjectedNodeRow({
  node,
  depth,
}: {
  node: ResourceCatalogAiProjectedNode;
  depth: number;
}) {
  const Icon = node.kind === 'GROUP' ? Folder : Layers;
  const inactive = node.status === 'inactive';
  return (
    <li>
      <div
        className={`flex items-center gap-2 py-1 text-[0.84rem] ${inactive ? 'text-app-muted line-through' : 'text-app-text'}`}
        style={{ paddingLeft: `${depth * 1.25}rem` }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
        {node.changes.map((change) => (
          <span
            key={change}
            className="rounded-full bg-app-accent-soft px-2 text-[0.7rem] font-semibold text-app-text no-underline"
          >
            {CHANGE_LABEL[change]}
          </span>
        ))}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <ProjectedNodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ResourceAiOptimizationModal({
  preview,
  applying,
  error,
  onApply,
  onClose,
}: ResourceAiOptimizationModalProps) {
  const { proposal, counters, projectedTree } = preview;
  const total = Object.values(counters).reduce((sum, value) => sum + value, 0);
  return (
    <Modal
      onClose={onClose}
      width={760}
      closeOnClickOutside={false}
      title={
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5" />
          <h3>Otimizar com IA</h3>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={onApply} disabled={applying || total === 0}>
            {applying ? 'Aplicando…' : 'Aplicar alterações'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <p className="text-[0.84rem] text-app-muted">
          Somente a estrutura da hierarquia será alterada. Nada é aplicado até a confirmação.
        </p>
        <div className="flex flex-wrap gap-2">
          {COUNTER_LABEL.map(([key, label]) => (
            <span
              key={key}
              className="rounded-[10px] border border-app-border px-3 py-1 text-[0.8rem] text-app-text"
            >
              {label}: <strong>{counters[key]}</strong>
            </span>
          ))}
        </div>
        <section>
          <h4 className="text-[0.88rem] font-semibold text-app-text">{proposal.summary}</h4>
          <p className="mt-1 text-[0.84rem] leading-relaxed text-app-muted">{proposal.rationale}</p>
        </section>
        <section>
          <h4 className="mb-1 text-[0.84rem] font-semibold text-app-text">Hierarquia proposta</h4>
          <ul
            aria-label="Hierarquia proposta"
            className="max-h-[320px] overflow-auto rounded-[12px] border border-app-border p-2"
          >
            {projectedTree.map((node) => (
              <ProjectedNodeRow key={node.id} node={node} depth={0} />
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
