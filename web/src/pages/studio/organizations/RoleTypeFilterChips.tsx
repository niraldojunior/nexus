import { PARTY_ROLE_TYPE_OPTIONS } from '../party-roles/partyRoleTypeOptions';

export type RoleTypeFilterChipsProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  /** roleName dos papéis que ao menos uma organização possui; os demais não viram chip. */
  availableRoleNames: ReadonlySet<string>;
};

const ALL_VALUE = '__all__';

/**
 * Chips de filtro rápido de organizações por papel, logo abaixo do título "Todas as Organizações". Lista todos os
 * tipos e quebra em múltiplas linhas o que não couber — sem scroll horizontal (rolagem de uma linha
 * só escondia tipos e não ficava claro que havia mais para ver).
 */
export function RoleTypeFilterChips({
  value,
  onChange,
  availableRoleNames,
}: RoleTypeFilterChipsProps) {
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
      {PARTY_ROLE_TYPE_OPTIONS.filter((option) => availableRoleNames.has(option.value)).map(
        (option) => {
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
        },
      )}
    </div>
  );
}
