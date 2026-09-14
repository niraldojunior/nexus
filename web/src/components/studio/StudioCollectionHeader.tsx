import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui';

export type StudioCollectionHeaderProps = {
  title: string;
  showSearch: boolean;
  onToggleSearch: () => void;
  searchLabel: string;
  children?: ReactNode;
};

/** Cabeçalho comum para painéis master/detail do Studio. */
export function StudioCollectionHeader({
  title,
  showSearch,
  onToggleSearch,
  searchLabel,
  children,
}: StudioCollectionHeaderProps) {
  const toggleLabel = showSearch ? 'Ocultar busca' : searchLabel;

  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-bold">{title}</h3>
      <div className="flex items-center gap-2">
        <Button
          variant={showSearch ? 'secondary' : 'primary'}
          size="sm"
          onClick={onToggleSearch}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-pressed={showSearch}
        >
          <Search className="h-4 w-4" />
        </Button>
        {children}
      </div>
    </div>
  );
}
