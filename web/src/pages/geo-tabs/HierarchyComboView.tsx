import { useState } from 'react';
import { childrenAt, nodeAt, type HierNode, type HierInstance } from '../../utils/geoHierarchy';

export type HierarchyComboViewProps = {
  roots: HierNode[];
  onSelectInstance: (instance: HierInstance) => void;
};

const LEVEL_LABELS = ['UF', 'Município', 'Localidade', 'Entidade', 'Tipo', 'Instância'];

/**
 * Modo "combos" — cascata de 6 selects (UF → Município → Localidade → Entidade
 * → Tipo → Instância), espelhando a busca do Netwin. Cada nível filtra o
 * próximo; ao escolher a instância, seleciona e abre o detalhe.
 */
export function HierarchyComboView({ roots, onSelectInstance }: HierarchyComboViewProps) {
  // path[i] = key selecionada no nível i.
  const [path, setPath] = useState<string[]>([]);

  const handleChange = (level: number, key: string) => {
    const nextPath = key ? [...path.slice(0, level), key] : path.slice(0, level);
    setPath(nextPath);
    if (!key) return;
    const node = nodeAt(roots, nextPath);
    if (node?.level === 'instancia' && node.instance) {
      onSelectInstance(node.instance);
    }
  };

  if (!roots.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Nenhum local ou recurso encontrado.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {LEVEL_LABELS.map((label, level) => {
        const options: HierNode[] = childrenAt(roots, path.slice(0, level));
        const value = path[level] ?? '';
        const disabled = level > 0 && !path[level - 1];
        return (
          <label key={label} className="grid gap-0.5">
            <span className="text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-app-muted">{label}</span>
            <select
              className="geo-input h-8 rounded-[10px] text-[0.8rem]"
              value={value}
              disabled={disabled || options.length === 0}
              onChange={(event) => handleChange(level, event.target.value)}
            >
              <option value="">{disabled ? '—' : 'Selecionar'}</option>
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                  {option.level !== 'instancia' ? ` (${option.count})` : ''}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
