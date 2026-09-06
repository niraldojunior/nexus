import { useState, useEffect } from 'react';
import { MapPin, AlertCircle } from 'lucide-react';
import type {
  GeoSpec,
  GeoSpecCategory,
  GeoSiteRole,
  CreateGeoSpecInput,
  UpdateGeoSpecInput,
} from '../../../services/geoApi';
import { Modal, Button } from '../../../components/ui';

export type LocationSpecFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateGeoSpecInput) => Promise<void>;
  onSubmitUpdate: (id: string, input: UpdateGeoSpecInput) => Promise<void>;
  editingSpec?: GeoSpec | null;
  allSpecs: GeoSpec[];
};

const CATEGORY_OPTIONS: Array<{ value: GeoSpecCategory; label: string }> = [
  { value: 'Region', label: 'Região' },
  { value: 'FunctionalGroup', label: 'Grupo Funcional' },
  { value: 'Site', label: 'Local (Site)' },
  { value: 'SubSite', label: 'Sub-Local (SubSite)' },
];

const ROLE_OPTIONS: Array<{ value: GeoSiteRole; label: string }> = [
  { value: 'grouping', label: 'Agrupamento' },
  { value: 'network', label: 'Recurso' },
  { value: 'property', label: 'Imobiliário' },
  { value: 'service', label: 'Serviço' },
];

export function LocationSpecFormModal({
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  editingSpec,
  allSpecs,
}: LocationSpecFormModalProps) {
  const isEditing = Boolean(editingSpec);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GeoSpecCategory>('Site');
  const [siteRole, setSiteRole] = useState<GeoSiteRole>('network');
  const [description, setDescription] = useState('');
  const [allowedParentSpecIds, setAllowedParentSpecIds] = useState<string[]>([]);
  const [allowedChildSpecIds, setAllowedChildSpecIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingSpec) {
        setCode(editingSpec.code);
        setName(editingSpec.name);
        setCategory(editingSpec.category);
        setSiteRole(editingSpec.siteRole);
        setDescription(editingSpec.description || '');
        setAllowedParentSpecIds(editingSpec.allowedParentSpecIds || []);
        setAllowedChildSpecIds(editingSpec.allowedChildSpecIds || []);
      } else {
        setCode('');
        setName('');
        setCategory('Site');
        setSiteRole('network');
        setDescription('');
        setAllowedParentSpecIds([]);
        setAllowedChildSpecIds([]);
      }
      setError(null);
    }
  }, [isOpen, editingSpec]);

  if (!isOpen) return null;

  const otherSpecs = allSpecs.filter((s) => !editingSpec || s.id !== editingSpec.id);

  const toggleParent = (id: string) => {
    setAllowedParentSpecIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const toggleChild = (id: string) => {
    setAllowedChildSpecIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

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

    try {
      setSubmitting(true);
      if (isEditing && editingSpec) {
        await onSubmitUpdate(editingSpec.id, {
          name: name.trim(),
          siteRole,
          description: description.trim() || undefined,
          allowedParentSpecIds,
          allowedChildSpecIds,
        });
      } else {
        await onSubmitCreate({
          code: code.trim(),
          name: name.trim(),
          category,
          siteRole,
          description: description.trim() || undefined,
          allowedParentSpecIds,
          allowedChildSpecIds,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar especificação de local.';
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
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h3>
              {isEditing ? 'Editar especificação de local' : 'Nova especificação de local'}
            </h3>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="location-spec-form" disabled={submitting}>
            {submitting ? 'Salvando…' : isEditing ? 'Atualizar especificação' : 'Criar especificação'}
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

        <form id="location-spec-form" onSubmit={handleSubmit} className="space-y-4">
          {!isEditing && (
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Código (Identificador único) *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: CO, FLOOR, ROOM..."
                className="w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.84rem] font-mono text-app-text outline-none focus:border-app-accent"
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
              placeholder="Ex.: Central Office, Pavimento..."
              className="w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Categoria (Hierarquia) *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GeoSpecCategory)}
                disabled={isEditing}
                className="w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:opacity-60"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Papel Funcional *
              </label>
              <select
                value={siteRole}
                onChange={(e) => setSiteRole(e.target.value as GeoSiteRole)}
                className="w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Descrição (Opcional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva a finalidade deste tipo de local..."
              className="w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Pais Permitidos
              </label>
              <div className="max-h-32 overflow-y-auto rounded-[10px] border border-app-border p-2 space-y-1">
                {otherSpecs.length === 0 ? (
                  <p className="text-[0.76rem] text-app-muted italic px-1">Nenhuma outra especificação.</p>
                ) : (
                  otherSpecs.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-1.5 px-1 py-0.5 text-[0.78rem] text-app-text cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={allowedParentSpecIds.includes(s.id)}
                        onChange={() => toggleParent(s.id)}
                        className="accent-app-accent"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Filhos Permitidos
              </label>
              <div className="max-h-32 overflow-y-auto rounded-[10px] border border-app-border p-2 space-y-1">
                {otherSpecs.length === 0 ? (
                  <p className="text-[0.76rem] text-app-muted italic px-1">Nenhuma outra especificação.</p>
                ) : (
                  otherSpecs.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-1.5 px-1 py-0.5 text-[0.78rem] text-app-text cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={allowedChildSpecIds.includes(s.id)}
                        onChange={() => toggleChild(s.id)}
                        className="accent-app-accent"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
