import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  FolderTree,
  Globe,
  Layers,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import type { GeoSpec, GeoSpecCategory, GeoSiteRole, UpdateGeoSpecInput } from '../../../services/geoApi';
import { Button } from '../../../components/ui';
import GeoCharacteristicsEditor from '../../../components/GeoCharacteristicsEditor';
import {
  buildGeoCharacteristicPayload,
  geoCharacteristicRowsFrom,
  geoCharacteristicRowsValid,
  type GeoCharacteristicRow,
} from '../../../utils/geoCharacteristicsForm';

const CATEGORY_LABELS: Record<GeoSpecCategory, string> = {
  Region: 'Região',
  FunctionalGroup: 'Grupo Funcional',
  Site: 'Local',
  SubSite: 'Sub-Local',
};

const ROLE_LABELS: Record<GeoSiteRole, string> = {
  grouping: 'Agrupamento',
  network: 'Recurso',
  property: 'Imobiliário',
  service: 'Serviço',
};

// Ícone + paleta por categoria (mesmo padrão de cor-por-natureza do `ResourceNodeDetail`, mas o
// eixo aqui é `category` — onde o local cabe na hierarquia — não `siteRole`).
const CATEGORY_ICON: Record<GeoSpecCategory, typeof Building2> = {
  Region: Globe,
  FunctionalGroup: FolderTree,
  Site: Building2,
  SubSite: Layers,
};

const CATEGORY_ICON_TONE: Record<GeoSpecCategory, string> = {
  Region: 'border-amber-200 bg-amber-50 text-amber-600',
  FunctionalGroup: 'border-amber-200 bg-amber-50 text-amber-600',
  Site: 'border-sky-200 bg-sky-50 text-sky-600',
  SubSite: 'border-purple-200 bg-purple-50 text-purple-600',
};

type DetailTab = 'overview' | 'characteristics' | 'relations';

export type LocationSpecDetailProps = {
  spec: GeoSpec;
  allSpecs: GeoSpec[];
  canEdit: boolean;
  /** Existe um draft de governança aberto — controla a visibilidade dos botões de mutação. */
  isEditing: boolean;
  /**
   * A especificação já estava `Active` no instante em que a sessão de edição atual começou
   * (baseline capturada em `LocationModelStudio.buildSnapshot`). Diferencia "inativada agora,
   * pode reverter" de "já estava inativa antes desta sessão" — só a primeira ganha "Reativar".
   */
  wasActiveAtBaseline: boolean;
  onEdit: () => void;
  onInactivate: () => void;
  onReactivate: () => void;
  onUpdateCharacteristics: (id: string, input: UpdateGeoSpecInput) => Promise<void>;
};

export function LocationSpecDetail({
  spec,
  allSpecs,
  canEdit,
  isEditing,
  wasActiveAtBaseline,
  onEdit,
  onInactivate,
  onReactivate,
  onUpdateCharacteristics,
}: LocationSpecDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Linhas editáveis das características da especificação — espelha `typeCharacteristicRows` do
  // `ResourceNodeDetail`, mas por spec de local (o modelo de locais não tem um "tipo" separado da
  // especificação, ao contrário de Resource — ver C1/C11).
  const [rows, setRows] = useState<GeoCharacteristicRow[]>(() =>
    geoCharacteristicRowsFrom(spec.specCharacteristic),
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab('overview');
    setRows(geoCharacteristicRowsFrom(spec.specCharacteristic));
    setError(null);
    setSuccess(false);
  }, [spec.id, spec.specCharacteristic]);

  const canMutate = canEdit && isEditing;

  const initialPayloadJson = JSON.stringify(
    buildGeoCharacteristicPayload(geoCharacteristicRowsFrom(spec.specCharacteristic)),
  );
  const currentPayload = buildGeoCharacteristicPayload(rows);
  const hasCharacteristicChanges =
    JSON.stringify(currentPayload) !== initialPayloadJson ||
    rows.some((r) => !r.name.trim() && (r.valueText || r.description || r.group));

  const handleSaveCharacteristics = async () => {
    if (!geoCharacteristicRowsValid(rows)) {
      setError('Toda característica precisa de um nome.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdateCharacteristics(spec.id, { specCharacteristic: currentPayload });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar características.');
    } finally {
      setSaving(false);
    }
  };

  const CategoryIcon = CATEGORY_ICON[spec.category];
  const relationsCount = spec.allowedParentSpecIds.length + spec.allowedChildSpecIds.length;

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border ${CATEGORY_ICON_TONE[spec.category]}`}
            >
              <CategoryIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold leading-tight text-app-text truncate">{spec.name}</h3>
              {/* Papel funcional e status já aparecem na aba Geral logo abaixo — o título fica
                  só com a categoria, em texto simples, para não duplicar informação em pill. */}
              <span
                className="mt-0.5 block"
                style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}
              >
                {CATEGORY_LABELS[spec.category]}
              </span>
            </div>
          </div>

          {canMutate && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="sm" iconLeft={<Pencil className="h-4 w-4" />} onClick={onEdit}>
                Editar
              </Button>
              {!spec._bootstrapProtected && spec.lifecycleStatus === 'Active' && (
                <Button
                  variant="danger"
                  size="sm"
                  iconLeft={<Trash2 className="h-4 w-4" />}
                  onClick={onInactivate}
                >
                  Inativar
                </Button>
              )}
              {spec.lifecycleStatus !== 'Active' && wasActiveAtBaseline && (
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<RotateCcw className="h-4 w-4" />}
                  onClick={onReactivate}
                >
                  Reativar
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Tabs — segmented control pill */}
        <div className="mt-3.5 flex">
          <div className="inline-flex items-center rounded-xl bg-black/[0.04] p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'overview'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Geral
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('characteristics')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'characteristics'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Características
              <span className="rounded-full bg-black/[0.06] px-1.5 py-0.2 text-[0.7rem]">
                {spec.specCharacteristic?.length ?? 0}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relations')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'relations'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Relações
              <span className="rounded-full bg-black/[0.06] px-1.5 py-0.2 text-[0.7rem]">{relationsCount}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                Descrição
              </h3>
              <p className="text-[0.92rem] text-app-text leading-relaxed">
                {spec.description || 'Nenhuma descrição informada.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Categoria</span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1">
                  {CATEGORY_LABELS[spec.category]}
                </p>
              </div>

              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  Papel Funcional
                </span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1">
                  {ROLE_LABELS[spec.siteRole]}
                </p>
              </div>

              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Status</span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1">
                  {spec.lifecycleStatus === 'Active' ? 'Ativo' : 'Inativo'}
                </p>
              </div>

              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Código do Tipo</span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1 font-mono">{spec.code}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'characteristics' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[0.88rem] font-semibold text-app-text">
                  Características da especificação de local
                </h3>
                <p className="text-[0.78rem] text-app-muted mt-0.5">
                  Extensões V.tal via characteristic (C1) — nome, grupo, tipo e valor padrão.
                </p>
              </div>
              {canMutate && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  iconLeft={<Save className="h-3.5 w-3.5" />}
                  onClick={handleSaveCharacteristics}
                  disabled={!hasCharacteristicChanges || saving}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              )}
            </div>

            {error && (
              <div
                className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
                style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-[10px] bg-emerald-50 p-3 text-[0.84rem] text-emerald-800 border border-emerald-200">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Características salvas com sucesso.</span>
              </div>
            )}

            <GeoCharacteristicsEditor rows={rows} onChange={setRows} disabled={!canMutate} />
          </div>
        )}

        {activeTab === 'relations' && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Pais Permitidos */}
            <div className="rounded-[10px] border border-app-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderTree className="h-4 w-4 text-amber-600" />
                <h4 className="text-[0.85rem] font-semibold text-app-text">Pais permitidos</h4>
              </div>
              {spec.allowedParentSpecIds.length === 0 ? (
                <p className="text-[0.8rem] text-app-muted italic">Nenhum pai permitido (raiz do modelo).</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {spec.allowedParentSpecIds.map((pId) => {
                    const parentSpec = allSpecs.find((s) => s.id === pId);
                    return (
                      <span
                        key={pId}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-app-border bg-white px-2.5 py-1 text-[0.78rem] text-app-text font-medium"
                      >
                        {parentSpec ? parentSpec.name : pId}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filhos Permitidos */}
            <div className="rounded-[10px] border border-app-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-sky-600" />
                <h4 className="text-[0.85rem] font-semibold text-app-text">Filhos permitidos</h4>
              </div>
              {spec.allowedChildSpecIds.length === 0 ? (
                <p className="text-[0.8rem] text-app-muted italic">Nenhum filho permitido (folha do modelo).</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {spec.allowedChildSpecIds.map((cId) => {
                    const childSpec = allSpecs.find((s) => s.id === cId);
                    return (
                      <span
                        key={cId}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-app-border bg-white px-2.5 py-1 text-[0.78rem] text-app-text font-medium"
                      >
                        {childSpec ? childSpec.name : cId}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
