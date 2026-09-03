import { useState } from 'react';
import type { ResourceLayer, ResourceSpecification, ResourceType } from '../../services/resourceApi';
import {
  NO_MANUFACTURER_OPTION,
  NO_RESOURCE_LAYER_OPTION,
  buildModelLayerOptions,
  buildModelManufacturerOptions,
  buildModelSpecificationOptions,
  buildModelTypeOptions,
  readSpecificationModel,
} from '../../utils/resourceSpecificationForm';

export type ResourceModelCascadeFieldsProps = {
  layers: ResourceLayer[];
  types: ResourceType[];
  specifications: ResourceSpecification[];
  currentSpecification: ResourceSpecification;
  onCommit: (specificationId: string) => void;
  onCancel: () => void;
};

// Combo em cascata (issue #186 — extensão) para reapontar `resourceSpecificationId` de um recurso
// já cadastrado: Topologia → Tipo de equipamento → Fornecedor → Modelo. Pré-carregada com os 4
// níveis da spec atual, então o usuário só corrige o que estiver errado — não recomeça do zero.
// Só o `<select>` de Modelo (nível 4) chama `onCommit`; os 3 primeiros são filtro puro e, ao
// mudar, resetam os níveis seguintes para a primeira opção disponível dentro do novo filtro
// (mesmo princípio de "escolha superior redefine escolha inferior" de qualquer combo em cascata).
export function ResourceModelCascadeFields({
  layers,
  types,
  specifications,
  currentSpecification,
  onCommit,
  onCancel,
}: ResourceModelCascadeFieldsProps) {
  const [layerBucket, setLayerBucket] = useState(
    currentSpecification.resourceLayerId || NO_RESOURCE_LAYER_OPTION.id,
  );
  const [typeCode, setTypeCode] = useState(currentSpecification.resourceType);
  const [manufacturerBucket, setManufacturerBucket] = useState(() => {
    const manufacturerParty = currentSpecification.relatedParty?.find(
      (party) => party.role === 'manufacturer',
    );
    return manufacturerParty?.id || NO_MANUFACTURER_OPTION.id;
  });
  const [specDraft, setSpecDraft] = useState(currentSpecification.id);

  // O recurso pode ter sido salvo com uma spec que não vem na página carregada por
  // `startEditModel` (catálogo grande — Netwin/legado — passa de 500 linhas) ou que já foi
  // encerrada (`includeEnded:false` a exclui por padrão). Sem isto, os 4 níveis da cascata do
  // recurso atual não aparecem em nenhuma lista de opções: nenhum valor é exibido, o `<select>`
  // fica com `value` órfão (não bate com nenhum `<option>`) e escolher algo não muda nada porque
  // não há nada de fato selecionável. Garantir que a spec atual sempre esteja no conjunto de
  // trabalho resolve os 4 níveis de uma vez, sem tocar no fetch nem no backend.
  const effectiveSpecifications = specifications.some((spec) => spec.id === currentSpecification.id)
    ? specifications
    : [...specifications, currentSpecification];

  const layerOptions = buildModelLayerOptions(layers, effectiveSpecifications);
  const typeOptions = buildModelTypeOptions(effectiveSpecifications, types, layerBucket);
  const manufacturerOptions = buildModelManufacturerOptions(
    effectiveSpecifications,
    layerBucket,
    typeCode,
  );
  const specificationOptions = buildModelSpecificationOptions(
    effectiveSpecifications,
    layerBucket,
    typeCode,
    manufacturerBucket,
  );

  const changeLayer = (nextLayerBucket: string) => {
    setLayerBucket(nextLayerBucket);
    const nextTypeOptions = buildModelTypeOptions(effectiveSpecifications, types, nextLayerBucket);
    const nextTypeCode = nextTypeOptions[0]?.id ?? '';
    setTypeCode(nextTypeCode);
    const nextManufacturerOptions = buildModelManufacturerOptions(
      effectiveSpecifications,
      nextLayerBucket,
      nextTypeCode,
    );
    const nextManufacturerBucket = nextManufacturerOptions[0]?.id ?? '';
    setManufacturerBucket(nextManufacturerBucket);
    const nextSpecOptions = buildModelSpecificationOptions(
      effectiveSpecifications,
      nextLayerBucket,
      nextTypeCode,
      nextManufacturerBucket,
    );
    setSpecDraft(nextSpecOptions[0]?.id ?? '');
  };

  const changeType = (nextTypeCode: string) => {
    setTypeCode(nextTypeCode);
    const nextManufacturerOptions = buildModelManufacturerOptions(
      effectiveSpecifications,
      layerBucket,
      nextTypeCode,
    );
    const nextManufacturerBucket = nextManufacturerOptions[0]?.id ?? '';
    setManufacturerBucket(nextManufacturerBucket);
    const nextSpecOptions = buildModelSpecificationOptions(
      effectiveSpecifications,
      layerBucket,
      nextTypeCode,
      nextManufacturerBucket,
    );
    setSpecDraft(nextSpecOptions[0]?.id ?? '');
  };

  const changeManufacturer = (nextManufacturerBucket: string) => {
    setManufacturerBucket(nextManufacturerBucket);
    const nextSpecOptions = buildModelSpecificationOptions(
      effectiveSpecifications,
      layerBucket,
      typeCode,
      nextManufacturerBucket,
    );
    setSpecDraft(nextSpecOptions[0]?.id ?? '');
  };

  const changeSpecification = (nextSpecificationId: string) => {
    setSpecDraft(nextSpecificationId);
    onCommit(nextSpecificationId);
  };

  return (
    <div className="relative">
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div className="relative z-50 grid gap-1 rounded-[10px] border border-app-border bg-white p-1.5 shadow-soft">
        <select
          autoFocus
          value={layerBucket}
          onChange={(event) => changeLayer(event.target.value)}
          aria-label="Topologia"
          className="geo-input"
        >
          {layerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={typeCode}
          onChange={(event) => changeType(event.target.value)}
          aria-label="Tipo de equipamento"
          className="geo-input"
        >
          {typeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={manufacturerBucket}
          onChange={(event) => changeManufacturer(event.target.value)}
          aria-label="Fornecedor"
          className="geo-input"
        >
          {manufacturerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={specDraft}
          onChange={(event) => changeSpecification(event.target.value)}
          aria-label="Modelo"
          className="geo-input"
        >
          {specificationOptions.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {readSpecificationModel(spec)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
