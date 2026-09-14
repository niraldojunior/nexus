// Controles compartilhados entre as abas "Ícone & Cor" e "Tamanho" do nó selecionado no Studio
// GEO. Cada um edita uma fatia do contrato canônico (`StudioGeoColorRule`, opacidade, estilo de
// traço) e devolve o valor já normalizado — quem chama só faz o merge no `visualConfig`.

import type {
  StudioGeoColorRule,
  StudioGeoEntityCategory,
  StudioGeoStrokeStyle,
} from '../../../services/studioGeoApi';
import {
  DEFAULT_STATUS_COLORS,
  STUDIO_GEO_COLOR_PALETTE,
  studioGeoStatusOptions,
} from '../../../utils/studioGeoDefaults';

export const STROKE_STYLE_OPTIONS: ReadonlyArray<{
  value: StudioGeoStrokeStyle;
  label: string;
  dashArray: string;
}> = [
  { value: 'solid', label: 'Sólida', dashArray: 'none' },
  { value: 'dashed', label: 'Tracejada', dashArray: '9 6' },
  { value: 'dotted', label: 'Pontilhada', dashArray: '2 5' },
  { value: 'animated-dotted', label: 'Pontilhada animada', dashArray: '2 5' },
];

function Swatch({
  color,
  selected,
  disabled,
  onSelect,
}: {
  color: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Cor ${color}`}
      aria-pressed={selected}
      onClick={onSelect}
      style={{ backgroundColor: color }}
      className={`h-7 w-7 rounded-[8px] border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
        selected ? 'border-app-text scale-110' : 'border-white shadow-sm hover:scale-105'
      }`}
    />
  );
}

/** Paleta + entrada hexadecimal livre. Uma cor só; quem compõe decide o rótulo. */
export function ColorField({
  label,
  value,
  canEdit,
  onChange,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[0.78rem] font-semibold text-app-text">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {STUDIO_GEO_COLOR_PALETTE.map((color) => (
          <Swatch
            key={color}
            color={color}
            selected={value.toLowerCase() === color.toLowerCase()}
            disabled={!canEdit}
            onSelect={() => onChange(color)}
          />
        ))}
        <input
          type="color"
          aria-label={`${label} personalizada`}
          disabled={!canEdit}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded-[8px] border border-app-border p-0.5"
        />
        <span className="font-mono text-[0.76rem] text-app-muted">{value}</span>
      </div>
    </div>
  );
}

/**
 * Editor completo de uma regra de cor: modo fixo ou por status, cor padrão e — no modo por
 * status — uma cor por status canônico da categoria. Status sem cor própria cai no padrão,
 * então o mapa nunca fica sem cor definida.
 */
export function ColorRuleEditor({
  title,
  description,
  rule,
  category,
  canEdit,
  onChange,
}: {
  title: string;
  description?: string;
  rule: StudioGeoColorRule;
  category: StudioGeoEntityCategory;
  canEdit: boolean;
  onChange: (rule: StudioGeoColorRule) => void;
}) {
  const statusOptions = studioGeoStatusOptions(category);
  const defaults = DEFAULT_STATUS_COLORS[category];

  return (
    <div className="space-y-3 rounded-[12px] border border-app-border bg-white p-3.5 shadow-sm">
      <div>
        <h5 className="text-[0.84rem] font-semibold text-app-text">{title}</h5>
        {description && <p className="text-[0.76rem] text-app-muted">{description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Modo de cor — ${title}`}>
        {(
          [
            { value: 'fixed', label: 'Cor fixa' },
            { value: 'status', label: 'Cores por status' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!canEdit}
            aria-pressed={rule.mode === option.value}
            onClick={() => onChange({ ...rule, mode: option.value })}
            className={`rounded-[8px] border px-3 py-1.5 text-[0.8rem] font-medium transition ${
              rule.mode === option.value
                ? 'border-app-accent bg-app-accent-soft font-semibold text-app-text'
                : 'border-app-border bg-white text-app-muted hover:text-app-text'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ColorField
        label={rule.mode === 'status' ? 'Cor padrão (status sem cor própria)' : 'Cor'}
        value={rule.defaultColor}
        canEdit={canEdit}
        onChange={(defaultColor) => onChange({ ...rule, defaultColor })}
      />

      {rule.mode === 'status' && (
        <div className="space-y-2 border-t border-app-border/60 pt-3">
          {statusOptions.map((status) => {
            const color = rule.statusColors[status.value] ?? rule.defaultColor;
            const isDefault =
              !defaults[status.value] ||
              color.toLowerCase() === defaults[status.value]!.toLowerCase();
            return (
              <div key={status.value} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-[0.78rem] text-app-text">{status.label}</span>
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {STUDIO_GEO_COLOR_PALETTE.map((option) => (
                    <Swatch
                      key={option}
                      color={option}
                      selected={color.toLowerCase() === option.toLowerCase()}
                      disabled={!canEdit}
                      onSelect={() =>
                        onChange({
                          ...rule,
                          statusColors: { ...rule.statusColors, [status.value]: option },
                        })
                      }
                    />
                  ))}
                  <input
                    type="color"
                    aria-label={`Cor de ${status.label}`}
                    disabled={!canEdit}
                    value={color}
                    onChange={(event) =>
                      onChange({
                        ...rule,
                        statusColors: { ...rule.statusColors, [status.value]: event.target.value },
                      })
                    }
                    className="h-7 w-9 cursor-pointer rounded-[8px] border border-app-border p-0.5"
                  />
                  {canEdit && !isDefault && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...rule,
                          statusColors: {
                            ...rule.statusColors,
                            [status.value]: defaults[status.value]!,
                          },
                        })
                      }
                      className="text-[0.72rem] font-semibold text-app-muted underline transition hover:text-app-text"
                    >
                      Restaurar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OpacityField({
  label,
  value,
  canEdit,
  onChange,
}: {
  label: string;
  value: number;
  canEdit: boolean;
  onChange: (opacity: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[0.78rem] font-semibold text-app-text">{label}</label>
        <span className="font-mono text-[0.78rem] font-semibold text-app-text">
          {Math.round(value * 100)} %
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={1}
        step={0.05}
        disabled={!canEdit}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full cursor-pointer accent-app-accent"
      />
    </div>
  );
}

export function StrokeStyleField({
  label,
  value,
  color,
  canEdit,
  onChange,
}: {
  label: string;
  value: StudioGeoStrokeStyle;
  color: string;
  canEdit: boolean;
  onChange: (style: StudioGeoStrokeStyle) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[0.78rem] font-semibold text-app-text">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {STROKE_STYLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!canEdit}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`flex flex-col items-center gap-1.5 rounded-[8px] border px-3 py-2 text-[0.78rem] font-medium transition ${
              value === option.value
                ? 'border-app-accent bg-app-accent-soft font-semibold text-app-text'
                : 'border-app-border text-app-muted hover:bg-black/[0.02]'
            }`}
          >
            <svg width="110" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="110"
                y2="4"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={option.dashArray}
              />
            </svg>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
