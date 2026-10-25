import type { KeyboardEvent, ReactNode } from 'react';

export type UnderlineTab<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
};

type UnderlineTabsProps<T extends string> = {
  tabs: ReadonlyArray<UnderlineTab<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Prefixo dos ids: `${idPrefix}-tab-${id}` e o painel `${idPrefix}-tabpanel`. */
  idPrefix: string;
  ariaLabel: string;
  className?: string;
};

// Aba ativa no estilo Google Maps: sem fundo, com barra amarela sob o texto do nome.
const tabClass = (active: boolean) =>
  `flex flex-1 items-center justify-center px-3 pt-1 text-[0.8125rem] font-medium transition ${
    active ? 'text-app-text' : 'text-app-muted hover:text-app-text'
  }`;
const tabLabelClass = (active: boolean) =>
  `flex items-center gap-1.5 border-b-[2px] pb-1.5 ${
    active ? 'border-app-accent' : 'border-transparent'
  }`;

/** Seletor de abas compartilhado por Planta Interna e Planta Externa. */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  ariaLabel,
  className = '',
}: UnderlineTabsProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    const index = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === value),
    );
    const last = tabs.length - 1;
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight'
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
    const target = tabs[nextIndex]!.id;
    onChange(target);
    document.getElementById(`${idPrefix}-tab-${target}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex shrink-0 border-b border-[var(--border-input-strong)] ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-controls={`${idPrefix}-tabpanel`}
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            className={tabClass(active)}
            onClick={() => onChange(tab.id)}
          >
            <span className={tabLabelClass(active)}>
              {tab.icon}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
