import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Link2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  ensureBootstrapResourceRelationshipTypes,
  listResourceRelationshipTypes,
  listResourceTypeRelationshipRules,
  createResourceTypeRelationshipRule,
  updateResourceTypeRelationshipRule,
  type ResourceRelationshipType,
  type ResourceRelationshipTargetKind,
  type ResourceRelationshipCardinality,
  type ResourceTypeRelationshipRule,
} from '../../../services/resourceApi';
import { listResourceTypes as listCatalogResourceTypes } from '../../../services/resourceCatalogApi';
import type { ResourceType } from '../../../services/resourceApi';
import { listGeoSiteSpecifications, type GeoSpec } from '../../../services/geoApi';
import { Button, Modal } from '../../../components/ui';

export type ResourceRelationshipRulesPanelProps = {
  resourceTypeId: string;
  canEdit: boolean;
  isEditing: boolean;
  onActiveRulesCountChange?: (count: number) => void;
};

const targetKindLabel: Record<ResourceRelationshipTargetKind, string> = {
  RESOURCE_TYPE: 'Tipo de Recurso',
  GEOGRAPHIC_SITE_SPECIFICATION: 'Tipo de Local',
};

const relationshipTypePresentation = [
  ['containsAsChild', 'Contém', 'Contém (ex. CDO → Splitter)'],
  ['supports', 'Suporta', 'Suporta (ex. Poste → CDO)'],
  ['connectedTo', 'Conectado à', 'Conectado à (ex. Fibra → Fibra)'],
  ['mountedOn', 'Montado em', 'Montado em (ex. CDO → Poste)'],
  ['containedBy', 'É contido por', 'É contido por (ex. Splitter → CDO)'],
  ['fedBy', 'Alimenta', 'Alimenta (ex. CDO → Fibra)'],
  ['feeds', 'É Alimentado por', 'É Alimentado por (ex. Fibra → CDO)'],
  ['serves', 'Atende', 'Atende (ex. CDO → CDO downstream)'],
  ['servedBy', 'Atendido por', 'Atendido por (ex. CDO → CDO upstream)'],
  ['terminatesOn', 'Termina', 'Termina (ex. Fibra → porta/splitter)'],
] as const;

const relationshipPresentationByCode = new Map<string, {
  order: number;
  shortLabel: string;
  selectLabel: string;
}>(
  relationshipTypePresentation.map(([code, shortLabel, selectLabel], order) => [
    code,
    { order, shortLabel, selectLabel },
  ]),
);

function cardinalityLabel(rule: ResourceTypeRelationshipRule): string {
  const max = rule.cardinality?.maxTargetPerSource;
  if (max === 1) return 'exatamente 1';
  if (typeof max === 'number' && max > 1) return `máx ${max}`;
  return 'sem restrição';
}

// Rede de segurança: `tmf_resource_type` pode conter linhas legadas com o mesmo `code` de um
// tipo canônico (cutover de ID, ver `oracle-repository.ts#seedResourceCatalog`). Mantém apenas a
// primeira ocorrência de cada código para não duplicar a opção na combo.
function dedupeByCode(types: ResourceType[]): ResourceType[] {
  const seen = new Set<string>();
  const result: ResourceType[] = [];
  for (const rt of types) {
    const key = rt.code || rt.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(rt);
  }
  return result;
}

export function ResourceRelationshipRulesPanel({
  resourceTypeId,
  canEdit,
  isEditing,
  onActiveRulesCountChange,
}: ResourceRelationshipRulesPanelProps) {
  const canMutate = canEdit && isEditing;
  const [relationshipTypes, setRelationshipTypes] = useState<ResourceRelationshipType[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [geoSpecs, setGeoSpecs] = useState<GeoSpec[]>([]);
  const [rules, setRules] = useState<ResourceTypeRelationshipRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formRelationshipCode, setFormRelationshipCode] = useState('');
  const [formTargetKind, setFormTargetKind] = useState<ResourceRelationshipTargetKind>('RESOURCE_TYPE');
  const [formTargetId, setFormTargetId] = useState('');
  const [formCardinalityMode, setFormCardinalityMode] = useState<'none' | 'max' | 'one'>('none');
  const [formCardinalityMax, setFormCardinalityMax] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const typesPromise = listResourceRelationshipTypes();
      const [typesRes, resourceTypesRes, geoSpecsRes, rulesRes] = await Promise.all([
        typesPromise,
        listCatalogResourceTypes(),
        listGeoSiteSpecifications(),
        listResourceTypeRelationshipRules(resourceTypeId),
      ]);
      setRelationshipTypes(typesRes.filter((t) => t.lifecycleStatus === 'Active'));
      setResourceTypes(resourceTypesRes);
      setGeoSpecs(geoSpecsRes);
      setRules(rulesRes);
      void ensureBootstrapResourceRelationshipTypes()
        .then(async () => {
          const refreshedTypes = await listResourceRelationshipTypes();
          setRelationshipTypes(refreshedTypes.filter((t) => t.lifecycleStatus === 'Active'));
        })
        .catch(() => undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar relações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Recarrega apenas quando o tipo de recurso selecionado muda — `load` é recriada a cada
    // render mas não precisa disparar uma nova busca por isso.
  }, [resourceTypeId]);

  const resourceTypeById = useMemo(
    () => new Map(resourceTypes.map((rt) => [rt.id, rt])),
    [resourceTypes],
  );
  const geoSpecById = useMemo(() => new Map(geoSpecs.map((s) => [s.id, s])), [geoSpecs]);
  const relationshipTypeByCode = useMemo(
    () => new Map(relationshipTypes.map((t) => [t.code, t])),
    [relationshipTypes],
  );
  const selectRelationshipTypes = useMemo(
    () =>
      relationshipTypes
        .filter((type) => type.code !== 'terminates')
        .sort((a, b) => {
          const aPresentation = relationshipPresentationByCode.get(a.code);
          const bPresentation = relationshipPresentationByCode.get(b.code);
          if (aPresentation && bPresentation) return aPresentation.order - bPresentation.order;
          if (aPresentation) return -1;
          if (bPresentation) return 1;
          return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
        }),
    [relationshipTypes],
  );

  const targetName = (rule: ResourceTypeRelationshipRule): string => {
    if (rule.targetKind === 'RESOURCE_TYPE') {
      return resourceTypeById.get(rule.targetId)?.name ?? 'Tipo de recurso removido';
    }
    return geoSpecById.get(rule.targetId)?.name ?? 'Tipo de local removido';
  };

  const selectedRelationshipType = relationshipTypeByCode.get(formRelationshipCode);
  const allowedTargetKinds = selectedRelationshipType?.allowedTargetKinds ?? [];
  const targetOptions =
    formTargetKind === 'RESOURCE_TYPE'
      ? dedupeByCode(
          resourceTypes.filter((rt) => rt.id !== resourceTypeId && rt.status === 'active'),
        )
          .map((rt) => ({ id: rt.id, name: rt.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
      : geoSpecs
          .map((s) => ({ id: s.id, name: s.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  const handleOpenCreate = () => {
    setEditingRuleId(null);
    setFormRelationshipCode(selectRelationshipTypes[0]?.code ?? '');
    setFormTargetKind(selectRelationshipTypes[0]?.allowedTargetKinds[0] ?? 'RESOURCE_TYPE');
    setFormTargetId('');
    setFormCardinalityMode('none');
    setFormCardinalityMax('');
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (rule: ResourceTypeRelationshipRule) => {
    setEditingRuleId(rule.id);
    setFormRelationshipCode(rule.relationshipTypeCode);
    setFormTargetKind(rule.targetKind);
    setFormTargetId(rule.targetId);
    const max = rule.cardinality?.maxTargetPerSource;
    if (max === 1) {
      setFormCardinalityMode('one');
      setFormCardinalityMax('');
    } else if (typeof max === 'number' && max > 1) {
      setFormCardinalityMode('max');
      setFormCardinalityMax(String(max));
    } else {
      setFormCardinalityMode('none');
      setFormCardinalityMax('');
    }
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRelationshipCode) {
      setFormError('Selecione um tipo de relação.');
      return;
    }
    if (!formTargetId) {
      setFormError('Selecione um alvo para a relação.');
      return;
    }

    let cardinality: ResourceRelationshipCardinality | undefined;
    if (formCardinalityMode === 'one') {
      cardinality = { maxTargetPerSource: 1 };
    } else if (formCardinalityMode === 'max') {
      const parsed = parseInt(formCardinalityMax.trim(), 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setFormError('Informe uma quantidade máxima válida (número inteiro >= 1).');
        return;
      }
      cardinality = { maxTargetPerSource: parsed };
    }

    setFormSaving(true);
    setFormError(null);
    try {
      if (editingRuleId) {
        const updated = await updateResourceTypeRelationshipRule(resourceTypeId, editingRuleId, {
          relationshipTypeCode: formRelationshipCode,
          targetKind: formTargetKind,
          targetId: formTargetId,
          cardinality: cardinality ?? null,
        });
        setRules((prev) => prev.map((r) => (r.id === editingRuleId ? updated : r)));
      } else {
        const created = await createResourceTypeRelationshipRule(resourceTypeId, {
          relationshipTypeCode: formRelationshipCode,
          targetKind: formTargetKind,
          targetId: formTargetId,
          cardinality,
        });
        setRules((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error
          ? err.message
          : editingRuleId
            ? 'Falha ao atualizar relação.'
            : 'Falha ao criar relação.',
      );
    } finally {
      setFormSaving(false);
    }
  };

  const handleRetire = async (rule: ResourceTypeRelationshipRule) => {
    setRetiringId(rule.id);
    setError(null);
    try {
      const updated = await updateResourceTypeRelationshipRule(resourceTypeId, rule.id, {
        lifecycleStatus: 'Retired',
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao inativar relação.');
    } finally {
      setRetiringId(null);
    }
  };

  const activeRules = rules.filter((r) => r.lifecycleStatus === 'Active');

  useEffect(() => {
    if (!loading) {
      onActiveRulesCountChange?.(activeRules.length);
    }
  }, [activeRules.length, loading, onActiveRulesCountChange]);

  if (loading) {
    return <p className="text-[0.85rem] text-app-muted">Carregando relações…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[0.88rem] font-semibold text-app-text">
            Relações permitidas ({activeRules.length})
          </h3>
          <p className="text-[0.78rem] text-app-muted mt-0.5">
            Declara com quais outros tipos de recurso ou tipos de local este tipo pode se
            relacionar.
          </p>
        </div>
        {canMutate && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-3.5 w-3.5" />}
            onClick={handleOpenCreate}
            disabled={relationshipTypes.length === 0}
          >
            Adicionar relação
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

      {activeRules.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-app-border p-8 text-center text-app-muted">
          <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-[0.88rem] font-medium">Nenhuma relação configurada.</p>
          <p className="text-[0.78rem]">
            Relações permitidas com outros tipos de recurso ou de local aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-app-border rounded-[18px] border border-app-border overflow-hidden">
          {activeRules.map((rule) => {
            const relType = relationshipTypeByCode.get(rule.relationshipTypeCode);
            const presentation = relationshipPresentationByCode.get(rule.relationshipTypeCode);
            const relationAndTarget = `${presentation?.shortLabel ?? relType?.name ?? rule.relationshipTypeCode} ${targetName(rule)}`;
            return (
              <div
                key={rule.id}
                role={canMutate ? 'button' : undefined}
                tabIndex={canMutate ? 0 : undefined}
                onClick={canMutate ? () => handleOpenEdit(rule) : undefined}
                onKeyDown={
                  canMutate
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleOpenEdit(rule);
                        }
                      }
                    : undefined
                }
                className={`group min-h-12 px-3.5 py-2.5 transition flex items-center justify-between gap-3 ${
                  canMutate ? 'cursor-pointer hover:bg-black/[0.02] focus:outline-none' : ''
                }`}
              >
                <p className="min-w-0 truncate whitespace-nowrap text-[0.88rem] text-app-text">
                  <strong className="font-semibold">{relationAndTarget}</strong>{' '}
                  <span className="font-normal">({cardinalityLabel(rule)})</span>
                </p>
                {canMutate && (
                  <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Editar relação"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenEdit(rule);
                      }}
                      className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft hover:text-app-text"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Inativar relação"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRetire(rule);
                      }}
                      disabled={retiringId === rule.id}
                      className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rules.some((r) => r.lifecycleStatus === 'Retired') && (
        <details className="text-[0.78rem] text-app-muted">
          <summary className="cursor-pointer select-none">
            Relações inativadas ({rules.filter((r) => r.lifecycleStatus === 'Retired').length})
          </summary>
          <ul className="mt-2 space-y-1">
            {rules
              .filter((r) => r.lifecycleStatus === 'Retired')
              .map((r) => (
                <li key={r.id} className="flex items-center gap-1.5">
                  <RotateCcw className="h-3 w-3" />
                  {relationshipTypeByCode.get(r.relationshipTypeCode)?.name ?? r.relationshipTypeCode} ·{' '}
                  {targetName(r)}
                </li>
              ))}
          </ul>
        </details>
      )}

      {modalOpen && (
        <Modal
          title={editingRuleId ? 'Editar relação' : 'Adicionar relação'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                form="resource-relationship-rule-form"
                variant="primary"
                size="sm"
                disabled={formSaving}
              >
                {formSaving ? 'Salvando…' : editingRuleId ? 'Salvar' : 'Adicionar'}
              </Button>
            </>
          }
        >
          <form id="resource-relationship-rule-form" onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
                style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label htmlFor="form-rule-relationship-type" className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Tipo de relação
              </label>
              <select
                id="form-rule-relationship-type"
                value={formRelationshipCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setFormRelationshipCode(code);
                  const kinds = relationshipTypeByCode.get(code)?.allowedTargetKinds ?? [];
                  setFormTargetKind(kinds[0] ?? 'RESOURCE_TYPE');
                  setFormTargetId('');
                }}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent disabled:bg-black/[0.03] disabled:text-app-muted"
              >
                {selectRelationshipTypes.map((t) => (
                  <option key={t.code} value={t.code}>
                    {relationshipPresentationByCode.get(t.code)?.selectLabel ?? t.name}
                  </option>
                ))}
              </select>
            </div>

            {allowedTargetKinds.length > 1 && (
              <div>
                <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                  Tipo de alvo
                </label>
                <div className="inline-flex rounded-xl bg-black/[0.04] p-1 gap-1">
                  {allowedTargetKinds.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setFormTargetKind(kind);
                        setFormTargetId('');
                      }}
                      className={`rounded-lg px-3.5 py-1.5 text-[0.84rem] font-medium transition disabled:opacity-60 ${
                        formTargetKind === kind
                          ? 'bg-white text-app-text font-semibold shadow-sm'
                          : 'text-app-muted hover:text-app-text'
                      }`}
                    >
                      {targetKindLabel[kind]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="form-rule-target-id" className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                {targetKindLabel[formTargetKind]}
              </label>
              <select
                id="form-rule-target-id"
                value={formTargetId}
                onChange={(e) => setFormTargetId(e.target.value)}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent disabled:bg-black/[0.03] disabled:text-app-muted"
              >
                <option value="">Selecione…</option>
                {targetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Quantidade permitida
              </label>
              <div className="inline-flex rounded-xl bg-black/[0.04] p-1 gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => setFormCardinalityMode('none')}
                  className={`rounded-lg px-3 py-1.5 text-[0.82rem] font-medium transition ${
                    formCardinalityMode === 'none'
                      ? 'bg-white text-app-text font-semibold shadow-sm'
                      : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  Sem restrição
                </button>
                <button
                  type="button"
                  onClick={() => setFormCardinalityMode('one')}
                  className={`rounded-lg px-3 py-1.5 text-[0.82rem] font-medium transition ${
                    formCardinalityMode === 'one'
                      ? 'bg-white text-app-text font-semibold shadow-sm'
                      : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  Exatamente 1
                </button>
                <button
                  type="button"
                  onClick={() => setFormCardinalityMode('max')}
                  className={`rounded-lg px-3 py-1.5 text-[0.82rem] font-medium transition ${
                    formCardinalityMode === 'max'
                      ? 'bg-white text-app-text font-semibold shadow-sm'
                      : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  No máximo N
                </button>
              </div>

              {formCardinalityMode === 'max' && (
                <div className="mt-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    autoFocus
                    placeholder="Ex.: 8"
                    value={formCardinalityMax}
                    onChange={(e) => setFormCardinalityMax(e.target.value)}
                    aria-label="Quantidade máxima"
                    className="w-32 rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent font-mono"
                  />
                  <p className="text-[0.76rem] text-app-muted mt-1">
                    Número máximo de instâncias deste alvo que um recurso de origem pode conter ou ligar.
                  </p>
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
