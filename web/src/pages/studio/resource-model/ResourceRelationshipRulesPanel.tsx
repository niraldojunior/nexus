import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  ensureBootstrapResourceRelationshipTypes,
  listResourceRelationshipTypes,
  listResourceTypeRelationshipRules,
  createResourceTypeRelationshipRule,
  updateResourceTypeRelationshipRule,
  type ResourceRelationshipType,
  type ResourceRelationshipTargetKind,
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
};

const targetKindLabel: Record<ResourceRelationshipTargetKind, string> = {
  RESOURCE_TYPE: 'Tipo de Recurso',
  GEOGRAPHIC_SITE_SPECIFICATION: 'Tipo de Local',
};

export function ResourceRelationshipRulesPanel({
  resourceTypeId,
  canEdit,
  isEditing,
}: ResourceRelationshipRulesPanelProps) {
  const canMutate = canEdit && isEditing;
  const [relationshipTypes, setRelationshipTypes] = useState<ResourceRelationshipType[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [geoSpecs, setGeoSpecs] = useState<GeoSpec[]>([]);
  const [rules, setRules] = useState<ResourceTypeRelationshipRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [formRelationshipCode, setFormRelationshipCode] = useState('');
  const [formTargetKind, setFormTargetKind] = useState<ResourceRelationshipTargetKind>('RESOURCE_TYPE');
  const [formTargetId, setFormTargetId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureBootstrapResourceRelationshipTypes().catch(() => undefined);
      const [typesRes, resourceTypesRes, geoSpecsRes, rulesRes] = await Promise.all([
        listResourceRelationshipTypes(),
        listCatalogResourceTypes(),
        listGeoSiteSpecifications(),
        listResourceTypeRelationshipRules(resourceTypeId),
      ]);
      setRelationshipTypes(typesRes.filter((t) => t.lifecycleStatus === 'Active'));
      setResourceTypes(resourceTypesRes);
      setGeoSpecs(geoSpecsRes);
      setRules(rulesRes);
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
      ? resourceTypes.filter((rt) => rt.id !== resourceTypeId).map((rt) => ({ id: rt.id, name: rt.name }))
      : geoSpecs.map((s) => ({ id: s.id, name: s.name }));

  const handleOpenCreate = () => {
    setFormRelationshipCode(relationshipTypes[0]?.code ?? '');
    setFormTargetKind(relationshipTypes[0]?.allowedTargetKinds[0] ?? 'RESOURCE_TYPE');
    setFormTargetId('');
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
    setFormSaving(true);
    setFormError(null);
    try {
      const created = await createResourceTypeRelationshipRule(resourceTypeId, {
        relationshipTypeCode: formRelationshipCode,
        targetKind: formTargetKind,
        targetId: formTargetId,
      });
      setRules((prev) => [...prev, created]);
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar relação.');
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
            return (
              <div
                key={rule.id}
                className="group px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <h4 className="text-[0.88rem] font-semibold text-app-text truncate">
                    {relType?.name ?? rule.relationshipTypeCode}
                  </h4>
                  <p className="text-[0.78rem] text-app-muted truncate">
                    {targetKindLabel[rule.targetKind]} · {targetName(rule)}
                  </p>
                </div>
                {canMutate && (
                  <button
                    type="button"
                    title="Inativar relação"
                    onClick={() => handleRetire(rule)}
                    disabled={retiringId === rule.id}
                    className="hidden group-hover:flex rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
          title="Adicionar relação"
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
                {formSaving ? 'Salvando…' : 'Adicionar'}
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
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Tipo de relação
              </label>
              <select
                value={formRelationshipCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setFormRelationshipCode(code);
                  const kinds = relationshipTypeByCode.get(code)?.allowedTargetKinds ?? [];
                  setFormTargetKind(kinds[0] ?? 'RESOURCE_TYPE');
                  setFormTargetId('');
                }}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
              >
                {relationshipTypes.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
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
                      className={`rounded-lg px-3.5 py-1.5 text-[0.84rem] font-medium transition ${
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
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                {targetKindLabel[formTargetKind]}
              </label>
              <select
                value={formTargetId}
                onChange={(e) => setFormTargetId(e.target.value)}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
              >
                <option value="">Selecione…</option>
                {targetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
