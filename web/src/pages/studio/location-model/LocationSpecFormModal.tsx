import { useState, useEffect } from 'react';
import { X, MapPin, AlertCircle } from 'lucide-react';
import type {
  GeoSpec,
  GeoSpecCategory,
  GeoSiteRole,
  CreateGeoSpecInput,
  UpdateGeoSpecInput,
} from '../../../services/geoApi';

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
  { value: 'network', label: 'Rede' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-[24px] border border-app-border bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-app-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-app-text text-[1.1rem]">
                {isEditing ? 'Editar Especificação de Local' : 'Nova Especificação de Local'}
              </h3>
              <p className="text-[0.78rem] text-app-muted">
                {isEditing ? editingSpec?.code : 'TMF674 · GeographicSiteSpecification'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-app-muted hover:bg-black/[0.04] hover:text-app-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-red-200 bg-red-50 p-3 text-[0.84rem] text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
              placeholder="Ex.: Central Office, Pavimento..."
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
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
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:opacity-60"
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
                Papel Funcional (C11) *
              </label>
              <select
                value={siteRole}
                onChange={(e) => setSiteRole(e.target.value as GeoSiteRole)}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
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
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Pais Permitidos
              </label>
              <div className="max-h-32 overflow-y-auto rounded-[14px] border border-app-border p-2 space-y-1">
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
              <div className="max-h-32 overflow-y-auto rounded-[14px] border border-app-border p-2 space-y-1">
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

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[14px] border border-app-border px-4 py-2 text-[0.84rem] font-medium text-app-muted hover:bg-black/[0.02]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-[14px] bg-app-accent px-5 py-2 text-[0.84rem] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition shadow-soft"
            >
              {submitting ? 'Salvando...' : isEditing ? 'Atualizar Especificação' : 'Criar Especificação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
