import { PARTY_ROLE_TYPE_OPTIONS } from './partyRoleTypeOptions';

export type RoleTypeFilterChipsProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

const ALL_VALUE = '__all__';

/**
 * Chips de filtro rápido por tipo de papel, logo abaixo do título "Todos os Papéis". Lista todos os
 * tipos e quebra em múltiplas linhas o que não couber — sem scroll horizontal (rolagem de uma linha
 * só escondia tipos e não ficava claro que havia mais para ver).
 */
export function RoleTypeFilterChips({ value, onChange }: RoleTypeFilterChipsProps) {
  const activeTab = value ?? ALL_VALUE;

  return (
    <div className="flex flex-wrap gap-1 pb-1" aria-label="Filtrar papéis por tipo">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-2.5 py-1 text-[0.76rem] transition ${
          activeTab === ALL_VALUE
            ? 'vt-yellow-selected font-semibold text-app-text'
            : 'border-app-border text-app-muted vt-hover-muted'
        }`}
      >
        Todos
      </button>
      {PARTY_ROLE_TYPE_OPTIONS.map((option) => {
        const isActive = activeTab === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-2.5 py-1 text-[0.76rem] transition ${
              isActive
                ? 'vt-yellow-selected font-semibold text-app-text'
                : 'border-app-border text-app-muted vt-hover-muted'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
