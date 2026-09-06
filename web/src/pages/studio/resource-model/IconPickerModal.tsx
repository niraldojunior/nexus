import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Modal, Button } from '../../../components/ui';
import {
  getIconsForNodeType,
  type CatalogNodeIconEntry,
} from './catalogNodeIcons';

export type IconPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
  currentIcon?: string;
  nodeKind: 'GROUP' | 'RESOURCE_TYPE';
  isLogical: boolean;
};

export function IconPickerModal({
  isOpen,
  onClose,
  onSelect,
  currentIcon,
  nodeKind,
  isLogical,
}: IconPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIconName, setSelectedIconName] = useState<string>(
    currentIcon || (nodeKind === 'GROUP' ? 'Folder' : isLogical ? 'Cpu' : 'Box'),
  );

  const icons = useMemo(
    () => getIconsForNodeType(nodeKind, isLogical),
    [nodeKind, isLogical],
  );

  const filteredIcons = useMemo(() => {
    if (!searchTerm.trim()) return icons;
    const term = searchTerm.toLowerCase().trim();
    return icons.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        entry.label.toLowerCase().includes(term),
    );
  }, [icons, searchTerm]);

  if (!isOpen) return null;

  const isGroup = nodeKind === 'GROUP';

  // Cores por tipo — largura da borda é sempre `border` (1px) em toda célula; a seleção usa um
  // `ring` (box-shadow, não soma ao layout) com offset para ficar bem perceptível sem duplicar
  // largura de borda no mesmo elemento nem exigir compensação de recorte no scroll.
  const activeBorderClass = isGroup
    ? 'border-amber-500 bg-amber-50 text-amber-600 ring-2 ring-amber-400 ring-offset-1 ring-offset-white'
    : isLogical
      ? 'border-purple-500 bg-purple-50 text-purple-600 ring-2 ring-purple-400 ring-offset-1 ring-offset-white'
      : 'border-sky-500 bg-sky-50 text-sky-600 ring-2 ring-sky-400 ring-offset-1 ring-offset-white';

  const defaultIconColorClass = isGroup
    ? 'text-amber-600 hover:bg-amber-50/60 hover:border-amber-300'
    : isLogical
      ? 'text-purple-600 hover:bg-purple-50/60 hover:border-purple-300'
      : 'text-sky-600 hover:bg-sky-50/60 hover:border-sky-300';

  const handleConfirm = () => {
    onSelect(selectedIconName);
    onClose();
  };

  const handleSelectAndConfirm = (name: string) => {
    setSelectedIconName(name);
    onSelect(name);
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      width={760}
      title={<h3>Escolher ícone do nó</h3>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Barra de busca de ícones */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
          <input
            type="text"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar ícone por nome, indústria ou finalidade..."
            className="w-full rounded-[12px] border border-app-border bg-white pl-8 pr-3 py-1.5 text-[0.84rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
          />
        </div>

        {/* Grid de ícones — limitado a ~5 linhas visíveis; o restante rola dentro do próprio
            componente, para que o modal inteiro (incluindo o rodapé) caiba sem scroll externo. */}
        <div className="max-h-[284px] overflow-y-auto p-1.5 -m-1.5">
          {filteredIcons.length === 0 ? (
            <div className="py-8 text-center text-app-muted text-[0.84rem]">
              Nenhum ícone encontrado para &ldquo;{searchTerm}&rdquo;.
            </div>
          ) : (
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-2">
              {filteredIcons.map((entry: CatalogNodeIconEntry) => {
                const IconComponent = entry.icon;
                const isSelected = selectedIconName === entry.name;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    title={`${entry.label} (${entry.name})`}
                    onClick={() => setSelectedIconName(entry.name)}
                    onDoubleClick={() => handleSelectAndConfirm(entry.name)}
                    className={`flex flex-col items-center justify-center h-12 rounded-[10px] border transition cursor-pointer p-1.5 ${
                      isSelected
                        ? activeBorderClass
                        : `border-app-border bg-white ${defaultIconColorClass}`
                    }`}
                  >
                    <IconComponent className="h-5 w-5 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
