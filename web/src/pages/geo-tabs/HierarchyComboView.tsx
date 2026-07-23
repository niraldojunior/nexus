import { useEffect, useState } from 'react';
import type { GeoTreeNode } from '../../services/geoTreeApi';

export type HierarchyComboViewProps = {
  // Filhos já carregados de um nó (vazio enquanto a busca não voltou).
  childrenOf: (nodeId: string) => GeoTreeNode[];
  // Pede ao servidor os filhos de um nó, se ainda não vieram.
  ensureChildren: (nodeId: string) => void;
  rootNodes: GeoTreeNode[];
  onSelect: (node: GeoTreeNode) => void;
};

// Rótulo do select por posição no caminho. Depois da estação a profundidade é
// variável (a planta encadeia cabo → splitter → cabo → caixa…), então o nível
// passa a se chamar pelo que ele é: um passo abaixo do anterior.
const LEVEL_LABELS = ['UF', 'Município', 'Grupo', 'Estação'];
const levelLabel = (level: number, parent?: GeoTreeNode): string =>
  LEVEL_LABELS[level] ?? (parent ? `Abaixo de ${parent.label}` : 'Nível');

/**
 * Modo "combos" — cascata no espírito da busca do Netwin, agora com a mesma carga
 * sob demanda da árvore: escolher um nível dispara a busca do seguinte, e a
 * cascata cresce enquanto houver filho. Escolher uma folha seleciona o item.
 */
export function HierarchyComboView({ childrenOf, ensureChildren, rootNodes, onSelect }: HierarchyComboViewProps) {
  // path[i] = nó escolhido no nível i.
  const [path, setPath] = useState<GeoTreeNode[]>([]);

  // Pedir os filhos do último escolhido é o que abre o próximo select.
  useEffect(() => {
    const last = path[path.length - 1];
    if (last?.hasChildren) ensureChildren(last.id);
  }, [ensureChildren, path]);

  const handleChange = (level: number, nodeId: string) => {
    const options = level === 0 ? rootNodes : childrenOf(path[level - 1]?.id ?? '');
    const chosen = options.find((option) => option.id === nodeId);
    const nextPath = chosen ? [...path.slice(0, level), chosen] : path.slice(0, level);
    setPath(nextPath);
    if (chosen) onSelect(chosen);
  };

  if (!rootNodes.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Nenhum local ou recurso encontrado.
      </div>
    );
  }

  // Um select por nível já escolhido, mais um para o próximo — que só existe se o
  // último escolhido tiver filhos.
  const lastChosen = path[path.length - 1];
  const levels = path.length + (path.length === 0 || lastChosen?.hasChildren ? 1 : 0);

  return (
    <div className="grid gap-2">
      {Array.from({ length: levels }, (_, level) => {
        const parent = level === 0 ? undefined : path[level - 1];
        const options = level === 0 ? rootNodes : childrenOf(parent?.id ?? '');
        const value = path[level]?.id ?? '';
        return (
          <label key={level} className="grid gap-0.5">
            <span className="text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
              {levelLabel(level, parent)}
            </span>
            <select
              className="geo-input h-8 rounded-[10px] text-[0.8rem]"
              value={value}
              disabled={options.length === 0}
              onChange={(event) => handleChange(level, event.target.value)}
            >
              <option value="">{options.length === 0 ? 'Carregando…' : 'Selecionar'}</option>
              {options.map((option) => {
                const count = option.childCount;
                return (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {count !== undefined ? ` (${count.toLocaleString('pt-BR')})` : ''}
                  </option>
                );
              })}
            </select>
          </label>
        );
      })}
    </div>
  );
}
