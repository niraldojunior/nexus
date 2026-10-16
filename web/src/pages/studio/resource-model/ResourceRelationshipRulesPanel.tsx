import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  ensureBootstrapResourceRelationshipTypes,
  listResourceTypeRelationshipRules,
  createResourceTypeRelationshipRule,
  updateResourceTypeRelationshipRule,
  type ResourceRelationshipType,
  type ResourceRelationshipTargetKind,
  type ResourceRelationshipDefinitionConfiguration,
  type ResourceType,
  type ResourceTypeRelationshipRule,
} from '../../../services/resourceApi';
import type { GeoSpec } from '../../../services/geoApi';
import { Badge, Button, DataTable, type DataTableColumn } from '../../../components/ui';
import {
  ResourceRelationshipRuleModal,
  type RelationshipRuleModalMode,
  type ResourceRelationshipRuleFormValue,
} from './ResourceRelationshipRuleModal';
import { ResourceRelationshipRuleRetireModal } from './ResourceRelationshipRuleRetireModal';
import {
  invalidateRelationshipTypesCache,
  loadRelationshipTypesCached,
  loadResourceTypesCached,
  loadSiteSpecificationsCached,
} from '../../../services/internalPlantCatalogCache';

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
  ['fedBy', 'É alimentado por', 'É alimentado por (ex. CDO → Fibra ou Estação)'],
  ['feeds', 'Alimenta', 'Alimenta (ex. Fibra → CDO)'],
  ['serves', 'Atende', 'Atende (ex. CDO → CDO downstream)'],
  ['servedBy', 'Atendido por', 'Atendido por (ex. CDO → CDO upstream)'],
  ['terminatesOn', 'Termina', 'Termina (ex. Fibra → porta/splitter)'],
] as const;

const relationshipPresentationByCode = new Map<
  string,
  {
    order: number;
    shortLabel: string;
    selectLabel: string;
  }
>(
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

function configurationPresentation(
  configuration: ResourceRelationshipDefinitionConfiguration | undefined,
): { title: string; detail: string } {
  if (!configuration || configuration.placementPolicy === 'NONE') {
    return { title: 'Padrão', detail: 'Lista simples' };
  }
  if (configuration.placementPolicy === 'LINEAR') {
    return {
      title: `Linear (${configuration.axis === 'vertical' ? 'Vertical' : 'Horizontal'})`,
      detail: `${configuration.unitLabel} · ${configuration.capacity} posições`,
    };
  }
  return {
    title: 'Grade',
    detail: `${configuration.rows} × ${configuration.columns} posições`,
  };
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
  const [modalMode, setModalMode] = useState<RelationshipRuleModalMode>('create');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [retiringRuleId, setRetiringRuleId] = useState<string | null>(null);
  const [retireError, setRetireError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [typesRes, resourceTypesRes, geoSpecsRes, rulesRes] = await Promise.all([
        loadRelationshipTypesCached(),
        loadResourceTypesCached(),
        loadSiteSpecificationsCached(),
        listResourceTypeRelationshipRules(resourceTypeId),
      ]);
      setRelationshipTypes(typesRes.filter((t) => t.lifecycleStatus === 'Active'));
      setResourceTypes(resourceTypesRes);
      setGeoSpecs(geoSpecsRes);
      setRules(rulesRes);
      void ensureBootstrapResourceRelationshipTypes()
        .then(async ({ created }) => {
          if (created === 0) return;
          invalidateRelationshipTypesCache();
          const refreshedTypes = await loadRelationshipTypesCached();
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
        // `fedBySite` é um tipo legado, absorvido por `fedBy` (que aceita recurso ou local).
        .filter((type) => type.code !== 'terminates' && type.code !== 'fedBySite')
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

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingRuleId(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenRule = (rule: ResourceTypeRelationshipRule, mode: 'edit' | 'view') => {
    setModalMode(mode);
    setEditingRuleId(rule.id);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (value: ResourceRelationshipRuleFormValue) => {
    if (modalMode === 'view') return;
    setFormSaving(true);
    setFormError(null);
    try {
      if (editingRuleId) {
        const updated = await updateResourceTypeRelationshipRule(resourceTypeId, editingRuleId, {
          ...value,
          cardinality: value.cardinality ?? null,
        });
        setRules((prev) => prev.map((rule) => (rule.id === editingRuleId ? updated : rule)));
      } else {
        const created = await createResourceTypeRelationshipRule(resourceTypeId, value);
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
    setRetireError(null);
    try {
      const updated = await updateResourceTypeRelationshipRule(resourceTypeId, rule.id, {
        lifecycleStatus: 'Retired',
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      setRetiringRuleId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao inativar relação.';
      setRetireError(message);
      throw err;
    } finally {
      setRetiringId(null);
    }
  };

  const activeRules = rules.filter((r) => r.lifecycleStatus === 'Active');
  const retiringRule = retiringRuleId ? rules.find((rule) => rule.id === retiringRuleId) : undefined;
  const sourceName = resourceTypeById.get(resourceTypeId)?.name ?? 'Tipo de recurso atual';
  const tableColumns: DataTableColumn<ResourceTypeRelationshipRule>[] = [
    {
      key: 'relationshipType',
      header: 'Tipo',
      render: (rule) => {
        const relType = relationshipTypeByCode.get(rule.relationshipTypeCode);
        const presentation = relationshipPresentationByCode.get(rule.relationshipTypeCode);
        return (
          <Badge tone="purple">
            {presentation?.shortLabel ?? relType?.name ?? rule.relationshipTypeCode}
          </Badge>
        );
      },
    },
    {
      key: 'target',
      header: 'Recurso relacionado',
      render: (rule) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-app-text">{targetName(rule)}</p>
          <p className="mt-0.5 text-[0.75rem] text-app-muted">{targetKindLabel[rule.targetKind]}</p>
        </div>
      ),
    },
    {
      key: 'cardinality',
      header: 'Cardinalidade',
      render: (rule) => (
        <span className="text-[0.85rem] text-app-text">{cardinalityLabel(rule)}</span>
      ),
    },
    {
      key: 'configuration',
      header: 'Configuração',
      render: (rule) => {
        const configuration = configurationPresentation(rule.configuration);
        return (
          <div>
            <p className="font-medium text-app-text">{configuration.title}</p>
            <p className="mt-0.5 text-[0.75rem] text-app-muted">{configuration.detail}</p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Ações</span>,
      headerClassName: 'w-10',
      cellClassName: 'w-10 text-right',
      render: (rule) =>
        canMutate ? (
          <button
            type="button"
            title="Inativar relação"
            aria-label="Inativar relação"
            onClick={(event) => {
              event.stopPropagation();
              setRetireError(null);
              setRetiringRuleId(rule.id);
            }}
            disabled={retiringId === rule.id}
            className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft focus-visible:border-status-red focus-visible:bg-status-red-soft disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

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
        <DataTable
          columns={tableColumns}
          rows={activeRules}
          rowKey={(rule) => rule.id}
          onRowClick={(rule) => handleOpenRule(rule, canMutate ? 'edit' : 'view')}
          horizontalScroll
        />
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
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => handleOpenRule(r, 'view')}
                    className="flex items-center gap-1.5 rounded text-left hover:text-app-text focus-visible:text-app-text"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    {relationshipTypeByCode.get(r.relationshipTypeCode)?.name ??
                      r.relationshipTypeCode}{' '}
                    · {targetName(r)}
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}

      {modalOpen && (
        <ResourceRelationshipRuleModal
          mode={modalMode}
          rule={editingRuleId ? rules.find((rule) => rule.id === editingRuleId) : undefined}
          relationshipTypes={selectRelationshipTypes}
          resourceTypes={resourceTypes}
          geoSpecs={geoSpecs}
          sourceResourceTypeId={resourceTypeId}
          sourceResourceTypeName={sourceName}
          saving={formSaving}
          error={formError}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      {retiringRule && (
        <ResourceRelationshipRuleRetireModal
          sourceName={sourceName}
          relationshipName={
            relationshipPresentationByCode.get(retiringRule.relationshipTypeCode)?.shortLabel ??
            relationshipTypeByCode.get(retiringRule.relationshipTypeCode)?.name ??
            retiringRule.relationshipTypeCode
          }
          targetName={targetName(retiringRule)}
          retiring={retiringId === retiringRule.id}
          error={retireError}
          onClose={() => {
            if (retiringId) return;
            setRetiringRuleId(null);
            setRetireError(null);
          }}
          onConfirm={() => handleRetire(retiringRule)}
        />
      )}
    </div>
  );
}
