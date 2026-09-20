import { useEffect, useState } from 'react';
import {
  getResourceTypeCatalogContext,
  type PhysicalResourceDetail,
  type PhysicalResourcePayload,
  type ResourceCharacteristic,
} from '../../services/resourceApi';
import { Info } from './InfoRow';
import { ImageCharacteristicInput } from '../studio/resource-model/ImageCharacteristicInput';
import { ResourceInstanceCharacteristics } from './ResourceInstanceCharacteristics';

export type ResourceAboutTabProps = {
  detail: PhysicalResourceDetail;
  canEdit: boolean;
  onPatch: (patch: PhysicalResourcePayload) => Promise<void>;
};

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Aba "Sobre" do painel de recurso (módulo Geo) — concentra toda característica do Recurso, nos
 * dois níveis introduzidos pela issue #273: as de nível especificação (herdadas do modelo,
 * `resourceSpecificationCharacteristic`; somente leitura aqui — quem edita é o Studio) e as de
 * nível instância (preenchidas por exemplar via `ResourceInstanceCharacteristics`, editáveis
 * quando `canEdit`). Extraída de `ResourceOverviewTab`, que mantém só o modelPath/definição do
 * recurso — a aba Geral não exibe mais nenhuma característica.
 */
export function ResourceAboutTab({ detail, canEdit, onPatch }: ResourceAboutTabProps) {
  const { specification, resource } = detail;

  // Definições de nível instância (issue #273) — o backend já devolve o `ResourceType` completo
  // neste endpoint; buscamos aqui (e não em ResourceOverviewTab) porque só esta aba precisa delas
  // agora. Mesmo padrão de guarda `cancelled` do efeito que existia em ResourceOverviewTab.
  const [instanceCharacteristicDefs, setInstanceCharacteristicDefs] = useState<ResourceCharacteristic[]>([]);
  useEffect(() => {
    const resourceTypeId = specification.resourceTypeId;
    if (!resourceTypeId) {
      setInstanceCharacteristicDefs([]);
      return;
    }
    let cancelled = false;
    void getResourceTypeCatalogContext(resourceTypeId)
      .then((context) => {
        if (cancelled) return;
        setInstanceCharacteristicDefs(
          (context.resourceType.resourceTypeCharacteristic ?? []).filter(
            (characteristic) => characteristic.characteristicLevel === 'instance',
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setInstanceCharacteristicDefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [specification.resourceTypeId]);

  const specCharacteristics = specification.resourceSpecificationCharacteristic ?? [];
  const hasSpecCharacteristics = specCharacteristics.length > 0;
  const hasInstanceCharacteristics = instanceCharacteristicDefs.length > 0;

  if (!hasSpecCharacteristics && !hasInstanceCharacteristics) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Este recurso não possui características cadastradas.
      </div>
    );
  }

  return (
    <div className="grid gap-3 pr-2">
      {hasSpecCharacteristics ? (
        <div className="grid gap-1">
          <h4 className="mb-1 w-fit border-b border-app-border pb-0.5 text-[0.76rem] font-semibold uppercase tracking-wide text-app-muted">
            {specification.name}
          </h4>
          {specCharacteristics.map((characteristic) =>
            characteristic.valueType === 'image' ? (
              <Info
                key={characteristic.name}
                label={characteristic.name}
                value={
                  <ImageCharacteristicInput
                    value={valueToText(characteristic.value)}
                    onChange={() => {}}
                    readOnly
                    align="left"
                    name={characteristic.name}
                  />
                }
              />
            ) : (
              <Info
                key={characteristic.name}
                label={characteristic.name}
                value={valueToText(characteristic.value) || '—'}
              />
            ),
          )}
        </div>
      ) : null}

      {hasInstanceCharacteristics ? (
        <div className="grid gap-1">
          <h4 className="mb-1 w-fit border-b border-app-border pb-0.5 text-[0.76rem] font-semibold uppercase tracking-wide text-app-muted">
            Deste recurso
          </h4>
          <ResourceInstanceCharacteristics
            definitions={instanceCharacteristicDefs}
            characteristic={resource.characteristic}
            canEdit={canEdit}
            onPatch={onPatch}
          />
        </div>
      ) : null}
    </div>
  );
}
