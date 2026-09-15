import { useState } from 'react';
import type { ResourceSpecification, ResourceType } from '../../services/resourceApi';
import {
  buildModelSpecificationOptions,
  buildModelTypeOptions,
  readSpecificationModel,
} from '../../utils/resourceSpecificationForm';

export type ResourceModelCascadeFieldsProps = {
  types: ResourceType[];
  specifications: ResourceSpecification[];
  currentSpecification: ResourceSpecification;
  // Path (posição do Tipo de Recurso na árvore dinâmica de catálogo, ex. "Telecom \ Rede de
  // Acesso \ GPON \ Distribuição") do Tipo de Recurso já selecionado — mostrado como cabeçalho
  // somente-leitura da cascata. `null` enquanto carrega ou se o Tipo não estiver em nenhuma árvore.
  modelPath: string | null;
  onCommit: (specificationId: string) => void;
  onCancel: () => void;
};

// Combo em cascata (issue #186 — extensão; reduzida de 4 para 2 níveis na issue #247, já que
// ResourceLayer/"Topologia" foi removido fisicamente do backend na Fase B do cutover da issue
// #188) para reapontar `resourceSpecificationId` de um recurso já cadastrado: Tipo de Recurso →
// Especificação. Pré-carregada com os 2 níveis da spec atual, então o usuário só corrige o que
// estiver errado — não recomeça do zero. Só o `<select>` de Especificação (nível 2) chama
// `onCommit`; o de Tipo de Recurso é filtro puro e, ao mudar, reseta o nível seguinte para a
// primeira opção disponível dentro do novo filtro (mesmo princípio de "escolha superior redefine
// escolha inferior" de qualquer combo em cascata).
export function ResourceModelCascadeFields({
  types,
  specifications,
  currentSpecification,
  modelPath,
  onCommit,
  onCancel,
}: ResourceModelCascadeFieldsProps) {
  const [typeId, setTypeId] = useState(currentSpecification.resourceTypeId ?? '');
  const [specDraft, setSpecDraft] = useState(currentSpecification.id);

  // O recurso pode ter sido salvo com uma spec que não vem na página carregada por
  // `startEditModel` (catálogo grande — Netwin/legado — passa de 500 linhas) ou que já foi
  // encerrada (`includeEnded:false` a exclui por padrão). Sem isto, os 2 níveis da cascata do
  // recurso atual não aparecem em nenhuma lista de opções: nenhum valor é exibido, o `<select>`
  // fica com `value` órfão (não bate com nenhum `<option>`) e escolher algo não muda nada porque
  // não há nada de fato selecionável. Garantir que a spec atual sempre esteja no conjunto de
  // trabalho resolve os 2 níveis de uma vez, sem tocar no fetch nem no backend.
  const effectiveSpecifications = specifications.some((spec) => spec.id === currentSpecification.id)
    ? specifications
    : [...specifications, currentSpecification];

  const typeOptions = buildModelTypeOptions(effectiveSpecifications, types);
  const specificationOptions = buildModelSpecificationOptions(effectiveSpecifications, typeId);

  const changeType = (nextTypeId: string) => {
    setTypeId(nextTypeId);
    const nextSpecOptions = buildModelSpecificationOptions(effectiveSpecifications, nextTypeId);
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
        <div className="px-1.5 py-1 text-[0.78rem] text-app-muted" aria-label="Path">
          {modelPath ?? '—'}
        </div>
        <select
          autoFocus
          value={typeId}
          onChange={(event) => changeType(event.target.value)}
          aria-label="Tipo de Recurso"
          className="geo-input"
        >
          {typeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={specDraft}
          onChange={(event) => changeSpecification(event.target.value)}
          aria-label="Especificação"
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
