/* @ds-bundle: {"format":3,"namespace":"VTalNexusDesignSystem_63587b","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"MetricCard","sourcePath":"components/core/MetricCard.jsx"},{"name":"StatusPill","sourcePath":"components/core/StatusPill.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"5d16855eefcc","components/core/Button.jsx":"47935c969b4a","components/core/Card.jsx":"4d61e5daf5f8","components/core/Input.jsx":"84d42d077100","components/core/MetricCard.jsx":"9fb7338eaf80","components/core/StatusPill.jsx":"fd11726058f4","ui_kits/nexus/Dashboard.jsx":"724e2b40a820","ui_kits/nexus/Inventory.jsx":"0a8ab6e4a29e","ui_kits/nexus/Login.jsx":"3fbf9c8ad438","ui_kits/nexus/Shell.jsx":"65b4d217c351","ui_kits/nexus/Topology.jsx":"e024da81b20d","ui_kits/nexus/Viability.jsx":"06bdd2638470","ui_kits/nexus/data.js":"3d778e7107f6","ui_kits/nexus/shared.jsx":"983454607d2c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.VTalNexusDesignSystem_63587b = window.VTalNexusDesignSystem_63587b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Badge
 * Compact status / category label. Soft tinted fill + saturated text.
 */
function Badge({
  children,
  tone = 'neutral',
  dot = false,
  style,
  ...rest
}) {
  const tones = {
    neutral: {
      bg: 'var(--surface-inset)',
      fg: 'var(--text-secondary)'
    },
    green: {
      bg: 'var(--status-green-soft)',
      fg: 'var(--status-green)'
    },
    blue: {
      bg: 'var(--status-blue-soft)',
      fg: 'var(--status-blue)'
    },
    amber: {
      bg: 'var(--status-amber-soft)',
      fg: 'var(--status-amber)'
    },
    red: {
      bg: 'var(--status-red-soft)',
      fg: 'var(--status-red)'
    },
    purple: {
      bg: 'var(--status-purple-soft)',
      fg: 'var(--status-purple)'
    },
    brand: {
      bg: 'var(--vt-yellow-dim)',
      fg: '#9a7d00'
    },
    ink: {
      bg: 'var(--vt-ink)',
      fg: 'var(--vt-yellow)'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 9px',
      borderRadius: 'var(--radius-full)',
      background: t.bg,
      color: t.fg,
      fontFamily: 'var(--font-ui)',
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor'
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Button
 * Primary action carries the brand yellow with ink text; secondary is a
 * neutral outline; ghost is chrome-less; danger for destructive actions.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: '6px 12px',
      fontSize: '0.8rem',
      height: 32,
      gap: 6
    },
    md: {
      padding: '9px 16px',
      fontSize: '0.9rem',
      height: 40,
      gap: 8
    },
    lg: {
      padding: '12px 22px',
      fontSize: '1rem',
      height: 48,
      gap: 10
    }
  };
  const s = sizes[size] || sizes.md;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.height,
    padding: s.padding,
    fontFamily: 'var(--font-ui)',
    fontSize: s.fontSize,
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast), filter var(--transition-fast)',
    whiteSpace: 'nowrap'
  };
  const variants = {
    primary: {
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      borderColor: 'var(--vt-yellow-light)',
      boxShadow: 'var(--shadow-sm)'
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-strong)',
      boxShadow: 'var(--shadow-sm)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent'
    },
    dark: {
      background: 'var(--surface-sidebar)',
      color: 'var(--text-on-dark)',
      borderColor: 'var(--surface-sidebar)'
    },
    danger: {
      background: 'var(--status-red)',
      color: '#fff',
      borderColor: 'var(--status-red)'
    }
  };
  const [hover, setHover] = React.useState(false);
  const hoverStyle = !disabled && hover ? {
    transform: 'translateY(-1px)',
    boxShadow: variant === 'primary' ? 'var(--shadow-md)' : 'var(--shadow-sm)',
    filter: variant === 'ghost' ? 'none' : 'brightness(1.03)',
    background: variant === 'ghost' ? 'var(--surface-inset)' : undefined
  } : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...variants[variant],
      ...hoverStyle,
      ...style
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Card
 * Base surface. `interactive` adds the lift + golden glow on hover.
 */
function Card({
  children,
  interactive = false,
  pad = 16,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const lift = interactive && hover ? {
    transform: 'translateY(-2px)',
    borderColor: 'var(--border-strong)',
    boxShadow: 'var(--shadow-gold)'
  } : {};
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => interactive && setHover(true),
    onMouseLeave: () => interactive && setHover(false),
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      padding: pad,
      cursor: interactive ? 'pointer' : 'default',
      transition: 'transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal)',
      ...lift,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Input
 * Text field with optional leading icon and label. Focus draws the
 * signature golden ring.
 */
function Input({
  label,
  hint,
  iconLeft,
  type = 'text',
  value,
  placeholder,
  onChange,
  disabled = false,
  fullWidth = true,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      width: fullWidth ? '100%' : 'auto'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-label)',
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      height: 40,
      background: disabled ? 'var(--surface-inset)' : 'var(--surface-card)',
      border: `1px solid ${focus ? 'var(--vt-yellow)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-sm)',
      boxShadow: focus ? 'var(--focus-shadow)' : 'none',
      transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
      ...style
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: focus ? 'var(--vt-ink)' : 'var(--text-tertiary)'
    }
  }, iconLeft), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    placeholder: placeholder,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-ui)',
      fontSize: '0.9rem',
      color: 'var(--text-primary)',
      minWidth: 0
    }
  }, rest))), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-eyebrow)',
      color: 'var(--text-tertiary)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/MetricCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — MetricCard
 * KPI surface: eyebrow label, big Montserrat number, optional delta + icon.
 */
function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaDir = 'up',
  icon,
  accent = false,
  style,
  ...rest
}) {
  const deltaColor = deltaDir === 'down' ? 'var(--status-red)' : 'var(--status-green)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      background: accent ? 'var(--vt-ink)' : 'var(--surface-card)',
      border: `1px solid ${accent ? 'var(--vt-ink)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      padding: 16,
      overflow: 'hidden',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: accent ? 'rgba(255,255,255,0.55)' : 'var(--text-tertiary)'
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      background: accent ? 'rgba(255,217,25,0.16)' : 'var(--surface-inset)',
      color: accent ? 'var(--vt-yellow)' : 'var(--text-secondary)'
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: '1.75rem',
      lineHeight: 1,
      letterSpacing: '-0.02em',
      color: accent ? '#fff' : 'var(--text-primary)'
    }
  }, value), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: '0.9rem',
      color: accent ? 'rgba(255,255,255,0.6)' : 'var(--text-tertiary)'
    }
  }, unit)), delta && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 700,
      fontSize: '0.78rem',
      color: deltaColor
    }
  }, deltaDir === 'down' ? '▾' : '▴', " ", delta), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.75rem',
      color: accent ? 'rgba(255,255,255,0.45)' : 'var(--text-tertiary)'
    }
  }, "vs. m\xEAs anterior")));
}
Object.assign(__ds_scope, { MetricCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/MetricCard.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — StatusPill
 * Domain status indicator for network elements & viability results.
 * Maps a semantic status to color + dot; richer than a plain Badge.
 */
const STATUS = {
  online: {
    label: 'Online',
    color: 'var(--status-green)',
    bg: 'var(--status-green-soft)'
  },
  viavel: {
    label: 'Viável',
    color: 'var(--status-green)',
    bg: 'var(--status-green-soft)'
  },
  ativo: {
    label: 'Ativo',
    color: 'var(--status-green)',
    bg: 'var(--status-green-soft)'
  },
  curso: {
    label: 'Em curso',
    color: 'var(--status-blue)',
    bg: 'var(--status-blue-soft)'
  },
  sincronizando: {
    label: 'Sincronizando',
    color: 'var(--status-blue)',
    bg: 'var(--status-blue-soft)'
  },
  parcial: {
    label: 'Parcial',
    color: 'var(--status-amber)',
    bg: 'var(--status-amber-soft)'
  },
  degradado: {
    label: 'Degradado',
    color: 'var(--status-amber)',
    bg: 'var(--status-amber-soft)'
  },
  inviavel: {
    label: 'Inviável',
    color: 'var(--status-red)',
    bg: 'var(--status-red-soft)'
  },
  offline: {
    label: 'Offline',
    color: 'var(--status-red)',
    bg: 'var(--status-red-soft)'
  },
  planejado: {
    label: 'Planejado',
    color: 'var(--status-purple)',
    bg: 'var(--status-purple-soft)'
  },
  reservado: {
    label: 'Reservado',
    color: 'var(--status-purple)',
    bg: 'var(--status-purple-soft)'
  }
};
function StatusPill({
  status = 'online',
  label,
  pulse = false,
  style,
  ...rest
}) {
  const s = STATUS[status] || STATUS.online;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '4px 11px 4px 9px',
      borderRadius: 'var(--radius-full)',
      background: s.bg,
      color: s.color,
      fontFamily: 'var(--font-ui)',
      fontSize: '0.78rem',
      fontWeight: 600,
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 8,
      height: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: 'currentColor'
    }
  }), pulse && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: 'currentColor',
      animation: 'vtPulse 1.6s ease-out infinite'
    }
  })), label || s.label, /*#__PURE__*/React.createElement("style", null, `@keyframes vtPulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.6);opacity:0}}`));
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusPill.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Dashboard.jsx
try { (() => {
// V.tal Nexus UI kit — Visão Geral (network overview dashboard)
function Dashboard({
  onNavigate
}) {
  const {
    MetricCard,
    Badge,
    StatusPill,
    Card
  } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--gap-section)',
      maxWidth: 'var(--content-max)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'var(--gap-card)'
    }
  }, /*#__PURE__*/React.createElement(MetricCard, {
    label: "Homes Passed",
    value: "1.28M",
    delta: "2.4%",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "house",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(MetricCard, {
    label: "OLTs ativas",
    value: "412",
    delta: "1.1%",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "server",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(MetricCard, {
    label: "Portas ocupadas",
    value: "68.2",
    unit: "%",
    deltaDir: "down",
    delta: "0.6%",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "plug",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(MetricCard, {
    label: "Taxa de viabilidade",
    value: "98.4",
    unit: "%",
    accent: true,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "zap",
      size: 16
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.55fr 1fr',
      gap: 'var(--gap-card)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, "Dom\xEDnios consolidados"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, "Solu\xE7\xF5es unificadas no invent\xE1rio Nexus")), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, "TM Forum SID")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 0
    }
  }, D.modules.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: m.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
      borderBottom: i < 2 ? '1px solid var(--border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-inset)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--slate)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: m.icon,
    size: 17
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, m.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, m.desc)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16,
      color: 'var(--text-primary)'
    }
  }, m.count))))), /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, "Atividade da rede"), /*#__PURE__*/React.createElement(Icon, {
    name: "activity",
    size: 16,
    color: "var(--text-tertiary)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, D.activity.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.who,
    style: {
      display: 'flex',
      gap: 10,
      padding: '10px 16px',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      marginTop: 6,
      flexShrink: 0,
      background: `var(--status-${a.tone})`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, a.who), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-secondary)',
      marginTop: 1
    }
  }, a.what), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-tertiary)',
      marginTop: 2
    }
  }, a.when))))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, "Satura\xE7\xE3o de portas por OLT"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, "Top elementos por ocupa\xE7\xE3o \u2014 clique para inspecionar")), /*#__PURE__*/React.createElement(StatusPill, {
    status: "sincronizando",
    pulse: true,
    label: "Sincronizando"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, D.elements.filter(e => e.used > 0).slice(0, 6).map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id,
    onClick: () => onNavigate('topology'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 150,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 2,
      background: ELEMENT_META[e.type]?.color,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      color: 'var(--text-primary)',
      fontWeight: 500
    }
  }, e.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 8,
      background: 'var(--surface-inset)',
      borderRadius: 'var(--radius-full)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${e.used}%`,
      height: '100%',
      borderRadius: 'var(--radius-full)',
      background: e.used >= 90 ? 'var(--status-red)' : e.used >= 70 ? 'var(--status-amber)' : 'var(--status-green)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      textAlign: 'right',
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, e.used, "%"))))));
}
Object.assign(window, {
  Dashboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Inventory.jsx
try { (() => {
// V.tal Nexus UI kit — Inventário (network elements table)
function Inventory({
  onNavigate
}) {
  const {
    Badge,
    StatusPill,
    Button
  } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData;
  const [filter, setFilter] = React.useState('Todos');
  const types = ['Todos', 'OLT', 'CTO', 'Splitter', 'Poste', 'Cabo'];
  const rows = filter === 'Todos' ? D.elements : D.elements.filter(e => e.type === filter);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      maxWidth: 'var(--content-max)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      background: 'var(--surface-card)',
      padding: 4,
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)'
    }
  }, types.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setFilter(t),
    style: {
      padding: '6px 13px',
      borderRadius: 5,
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      fontWeight: 600,
      background: filter === t ? 'var(--vt-ink)' : 'transparent',
      color: filter === t ? '#fff' : 'var(--text-secondary)',
      transition: 'all .15s var(--ease)'
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "sliders-horizontal",
      size: 15
    })
  }, "Filtros"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 15
    })
  }, "Novo elemento"))), /*#__PURE__*/React.createElement("div", {
    className: "vt-card",
    style: {
      overflow: 'hidden',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "vt-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      paddingLeft: 20
    }
  }, "Elemento"), /*#__PURE__*/React.createElement("th", null, "Classe"), /*#__PURE__*/React.createElement("th", null, "Localiza\xE7\xE3o"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Ocupa\xE7\xE3o"), /*#__PURE__*/React.createElement("th", null, "Fornecedor"), /*#__PURE__*/React.createElement("th", null, "Sync"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(e => /*#__PURE__*/React.createElement("tr", {
    key: e.id,
    onClick: () => onNavigate('topology'),
    style: {
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      paddingLeft: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 7,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      background: ELEMENT_META[e.type]?.color
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ELEMENT_META[e.type]?.icon,
    size: 14
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, e.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-tertiary)'
    }
  }, e.site)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, e.tipo)), /*#__PURE__*/React.createElement("td", {
    style: {
      maxWidth: 240
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-secondary)'
    }
  }, e.addr)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusPill, {
    status: e.status,
    pulse: e.status === 'online'
  })), /*#__PURE__*/React.createElement("td", null, e.ports === '—' ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-tertiary)'
    }
  }, "\u2014") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 110
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 6,
      background: 'var(--surface-inset)',
      borderRadius: 'var(--radius-full)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${e.used}%`,
      height: '100%',
      background: e.used >= 90 ? 'var(--status-red)' : e.used >= 70 ? 'var(--status-amber)' : 'var(--status-green)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-secondary)',
      width: 60
    }
  }, e.used, "% \xB7 ", e.ports))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-secondary)'
    }
  }, e.vendor)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, e.sync)), /*#__PURE__*/React.createElement("td", {
    style: {
      paddingRight: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-tertiary)"
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      borderTop: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-tertiary)'
    }
  }, rows.length, " de 38,1M recursos \xB7 TMF639 Resource Inventory"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-left",
      size: 14
    })
  }, "Anterior"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 14
    })
  }, "Pr\xF3ximo")))));
}
Object.assign(window, {
  Inventory
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Inventory.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Login.jsx
try { (() => {
// V.tal Nexus UI kit — Login
function Login({
  onLogin
}) {
  const {
    Button,
    Input
  } = window.VTalNexusDesignSystem_63587b;
  const [email, setEmail] = React.useState('niraldo@vtal.com.br');
  const [pwd, setPwd] = React.useState('••••••••');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-sidebar)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 48,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      opacity: 0.07,
      backgroundImage: 'radial-gradient(circle, var(--vt-yellow) 1.2px, transparent 1.2px)',
      backgroundSize: '26px 26px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/nexus-mark-white.svg",
    alt: "Nexus",
    style: {
      height: 34
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 22,
      letterSpacing: '-0.01em',
      color: '#fff'
    }
  }, "Nexus")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 32,
      lineHeight: 1.15,
      letterSpacing: '-0.02em',
      maxWidth: 420
    }
  }, "Intelig\xEAncia de rede de ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--vt-yellow)'
    }
  }, "nova gera\xE7\xE3o"), "."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.55)',
      marginTop: 16,
      maxWidth: 400,
      lineHeight: 1.6
    }
  }, "Invent\xE1rio de Redes da V.tal \u2014 Geosite, Logradouros, Geonet e Viabilidade Fuzzy unificados sob arquitetura modular, API-first e padr\xE3o TM Forum."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 24
    }
  }, ['TM Forum', 'API-first', 'Escala nacional'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      padding: '5px 11px',
      borderRadius: 'var(--radius-full)',
      background: 'rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.8)'
    }
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      fontSize: 12,
      color: 'rgba(255,255,255,0.35)'
    }
  }, "Holding V.tal \xB7 Tecto \xB7 nio internet")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      background: 'var(--surface-card)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 360
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h2)',
      letterSpacing: '-0.02em',
      marginBottom: 4
    }
  }, "Acessar a plataforma"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-tertiary)',
      marginBottom: 28
    }
  }, "Use suas credenciais funcionais V.tal."), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onLogin();
    },
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "E-mail funcional",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "mail",
      size: 16
    }),
    value: email,
    onChange: e => setEmail(e.target.value)
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Senha",
    type: "password",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "lock",
      size: 16
    }),
    value: pwd,
    onChange: e => setPwd(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--text-secondary)',
      cursor: 'pointer'
    }
  }, "Esqueci minha senha")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    type: "submit",
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 17
    })
  }, "Entrar")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      paddingTop: 20,
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 14,
    color: "var(--status-green)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, "Conex\xE3o segura \xB7 SSO corporativo V.tal")))));
}
Object.assign(window, {
  Login
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Login.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Shell.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// V.tal Nexus UI kit — application shell (sidebar + topbar)
function Shell({
  active,
  onNavigate,
  onLogout,
  children,
  title,
  subtitle,
  headerRight
}) {
  const nav = [{
    id: 'dashboard',
    label: 'Visão Geral',
    icon: 'layout-dashboard'
  }, {
    id: 'inventory',
    label: 'Inventário',
    icon: 'database'
  }, {
    id: 'viability',
    label: 'Viabilidade',
    icon: 'zap'
  }, {
    id: 'topology',
    label: 'Topologia',
    icon: 'share-2'
  }];
  const secondary = [{
    id: 'sites',
    label: 'Sites & POPs',
    icon: 'building-2'
  }, {
    id: 'logradouros',
    label: 'Logradouros',
    icon: 'map-pin'
  }, {
    id: 'api',
    label: 'API & Integrações',
    icon: 'plug'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100%',
      background: 'var(--surface-app)'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 'var(--sidebar-width)',
      flexShrink: 0,
      background: 'var(--surface-sidebar)',
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--text-on-dark)',
      boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--header-height)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 18px',
      borderBottom: '1px solid rgba(255,255,255,0.06)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/nexus-mark-white.svg",
    alt: "Nexus",
    style: {
      height: 26,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 17,
      letterSpacing: '-0.01em',
      color: '#fff'
    }
  }, "Nexus")), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      padding: '14px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      overflowY: 'auto'
    }
  }, nav.map(it => /*#__PURE__*/React.createElement(NavItem, _extends({
    key: it.id
  }, it, {
    active: active === it.id,
    onClick: () => onNavigate(it.id)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'rgba(255,255,255,0.07)',
      margin: '12px 8px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      color: 'rgba(255,255,255,0.3)',
      padding: '4px 12px 8px'
    }
  }, "Dom\xEDnios"), secondary.map(it => /*#__PURE__*/React.createElement(NavItem, _extends({
    key: it.id
  }, it, {
    active: active === it.id,
    onClick: () => onNavigate(it.id)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      borderTop: '1px solid rgba(255,255,255,0.07)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer'
    },
    onClick: onLogout,
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: 12,
      flexShrink: 0
    }
  }, "NR"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#fff',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, "Niraldo R."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.4)'
    }
  }, "Eng. de Rede")), /*#__PURE__*/React.createElement(Icon, {
    name: "log-out",
    size: 15,
    color: "rgba(255,255,255,0.4)"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 'var(--header-height)',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)',
      color: 'var(--text-primary)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, headerRight)), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--content-pad)'
    }
  }, children)));
}
function NavItem({
  label,
  icon,
  active,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      height: 32,
      padding: '0 10px',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer',
      color: active ? '#fff' : hover ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
      background: active ? 'rgba(255,255,255,0.08)' : hover ? 'rgba(255,255,255,0.04)' : 'transparent',
      fontSize: 12.5,
      fontWeight: active ? 600 : 500,
      fontFamily: 'var(--font-display)'
    }
  }, active && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 0,
      top: 6,
      bottom: 6,
      width: 2,
      borderRadius: 1,
      background: 'var(--vt-yellow)'
    }
  }), /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 17
  }), /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(window, {
  Shell
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Topology.jsx
try { (() => {
// V.tal Nexus UI kit — Topologia (network path + element detail)
function Topology() {
  const {
    Card,
    Badge,
    StatusPill,
    Button
  } = window.VTalNexusDesignSystem_63587b;
  const path = [{
    type: 'OLT',
    id: 'OLT-SP-CAS-014',
    label: 'Head-end',
    sub: 'POP Casa Verde'
  }, {
    type: 'Cabo',
    id: 'CABO-FO-SP-0912',
    label: 'Feeder 144FO',
    sub: '4,2 km'
  }, {
    type: 'Splitter',
    id: 'SPL-1x32-7745',
    label: '1:32',
    sub: 'CEO Vila Maria'
  }, {
    type: 'CTO',
    id: 'CTO-4821',
    label: '16 portas',
    sub: '12 livres'
  }, {
    type: 'Site',
    id: 'ONT-cliente',
    label: 'Cliente',
    sub: 'Drop ativo'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 'var(--gap-card)',
      maxWidth: 'var(--content-max)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--gap-card)'
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, "Caminho \xF3ptico"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, "OLT \u2192 Cliente \xB7 5 elementos \xB7 4,2 km")), /*#__PURE__*/React.createElement(Badge, {
    tone: "green",
    dot: true
  }, "Fim a fim \xEDntegro")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch'
    }
  }, path.map((n, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: n.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      background: ELEMENT_META[n.type]?.color,
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ELEMENT_META[n.type]?.icon,
    size: 24
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, n.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      color: 'var(--text-secondary)',
      marginTop: 2
    }
  }, n.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-tertiary)'
    }
  }, n.sub))), i < path.length - 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 38
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: 2,
      background: 'linear-gradient(90deg, var(--border-strong), var(--vt-yellow), var(--border-strong))'
    }
  })))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)',
      marginBottom: 16
    }
  }, "M\xE9tricas \xF3pticas"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(OptMetric, {
    label: "Pot\xEAncia RX",
    value: "-21.4",
    unit: "dBm",
    tone: "green"
  }), /*#__PURE__*/React.createElement(OptMetric, {
    label: "Atenua\xE7\xE3o",
    value: "0.28",
    unit: "dB/km",
    tone: "green"
  }), /*#__PURE__*/React.createElement(OptMetric, {
    label: "ORL",
    value: "32.1",
    unit: "dB",
    tone: "amber"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--gap-card)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 11,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      background: ELEMENT_META.CTO.color
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "box",
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "CTO-4821"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-tertiary)'
    }
  }, "Caixa de Termina\xE7\xE3o \xD3ptica")), /*#__PURE__*/React.createElement(StatusPill, {
    status: "online",
    pulse: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 20px'
    }
  }, [['Endereço', 'Rua das Palmeiras, 320'], ['Município', 'São Paulo / SP'], ['Coordenadas', '-23.5614, -46.6558'], ['Fornecedor', 'Furukawa'], ['Portas', '16 (4 ocupadas · 12 livres)'], ['Recurso TMF', 'TMF639-RI-0x9F2A']].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      padding: '11px 0',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-tertiary)'
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--text-primary)',
      textAlign: 'right',
      fontFamily: k === 'Coordenadas' || k === 'Recurso TMF' ? 'var(--font-mono)' : 'inherit'
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    fullWidth: true,
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "pencil",
      size: 14
    })
  }, "Editar"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    fullWidth: true,
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "code",
      size: 14
    })
  }, "API"))), /*#__PURE__*/React.createElement(Card, {
    style: {
      background: 'var(--vt-ink)',
      border: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plug-zap",
    size: 16,
    color: "var(--vt-yellow)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#fff'
    }
  }, "Padr\xE3o TM Forum")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'rgba(255,255,255,0.6)',
      lineHeight: 1.5
    }
  }, "Este recurso \xE9 exposto via Open API TMF639 (Resource Inventory) e reconciliado a cada 15 min."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontFamily: 'var(--font-mono)',
      fontSize: 11.5,
      color: 'var(--vt-yellow)',
      background: 'rgba(255,255,255,0.06)',
      padding: '8px 11px',
      borderRadius: 6
    }
  }, "GET /resourceInventory/v4/resource/0x9F2A"))));
}
function OptMetric({
  label,
  value,
  unit,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-inset)',
      borderRadius: 'var(--radius-sm)',
      padding: 14,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      color: 'var(--text-tertiary)',
      marginBottom: 6
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 22,
      color: `var(--status-${tone})`
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-tertiary)'
    }
  }, unit));
}
Object.assign(window, {
  Topology
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Topology.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Viability.jsx
try { (() => {
// V.tal Nexus UI kit — Viabilidade (address feasibility check, "Viabilidade Fuzzy")
function Viability() {
  const {
    Input,
    Button,
    Card,
    Badge,
    StatusPill
  } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData;
  const [query, setQuery] = React.useState('Rua das Palmeiras, 320');
  const [result, setResult] = React.useState(D.viabilities[0]);
  const [loading, setLoading] = React.useState(false);
  const run = v => {
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      setResult(v);
      setLoading(false);
    }, 550);
  };
  const tone = {
    viavel: 'green',
    parcial: 'amber',
    inviavel: 'red'
  };
  const head = {
    viavel: {
      t: 'Endereço viável',
      d: 'Atendimento imediato pela rede existente',
      ic: 'circle-check-big'
    },
    parcial: {
      t: 'Viabilidade parcial',
      d: 'Requer expansão de rede de curto prazo',
      ic: 'circle-alert'
    },
    inviavel: {
      t: 'Endereço inviável',
      d: 'Sem infraestrutura de rede no raio de atendimento',
      ic: 'circle-x'
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.3fr',
      gap: 'var(--gap-card)',
      maxWidth: 1200
    }
  }, /*#__PURE__*/React.createElement(Card, {
    pad: 24,
    style: {
      height: 'fit-content'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 9,
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "zap",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, "Motor de viabilidade")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--text-tertiary)',
      marginBottom: 20
    }
  }, "Consulta fuzzy por endere\xE7o, coordenada ou CEP \u2014 evolu\xEDdo do Viabilidade Fuzzy."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Endere\xE7o ou coordenada",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 16
    }),
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "Rua, n\xFAmero, CEP\u2026"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "radar",
      size: 16
    }),
    onClick: () => run(D.viabilities[0])
  }, "Verificar viabilidade")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      borderTop: '1px solid var(--border)',
      paddingTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-eyebrow",
    style: {
      marginBottom: 10
    }
  }, "Consultas recentes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, D.viabilities.map(v => /*#__PURE__*/React.createElement("div", {
    key: v.addr,
    onClick: () => {
      setQuery(v.addr);
      run(v);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 11px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-inset)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: `var(--status-${tone[v.status]})`,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 12.5,
      color: 'var(--text-secondary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, v.addr), /*#__PURE__*/React.createElement(Icon, {
    name: "corner-down-right",
    size: 13,
    color: "var(--text-tertiary)"
  })))))), /*#__PURE__*/React.createElement("div", null, loading && /*#__PURE__*/React.createElement(Card, {
    pad: 48,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      minHeight: 320
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      border: '4px solid var(--surface-inset)',
      borderTopColor: 'var(--vt-yellow)',
      borderRadius: '50%',
      animation: 'vtspin 0.9s linear infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-tertiary)'
    }
  }, "Avaliando rede no raio de atendimento\u2026"), /*#__PURE__*/React.createElement("style", null, `@keyframes vtspin{to{transform:rotate(360deg)}}`)), result && !loading && /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: 24,
      background: `var(--status-${tone[result.status]}-soft)`,
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 12,
      background: `var(--status-${tone[result.status]})`,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: head[result.status].ic,
    size: 24
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 19,
      color: 'var(--text-primary)'
    }
  }, head[result.status].t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-secondary)'
    }
  }, head[result.status].d)), /*#__PURE__*/React.createElement(StatusPill, {
    status: result.status
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 15,
    color: "var(--text-tertiary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, result.addr), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-tertiary)'
    }
  }, "\xB7 ", result.city)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Fact, {
    icon: "ruler",
    label: "Dist\xE2ncia ao CTO mais pr\xF3ximo",
    value: result.dist > 800 ? '> 800 m' : `${result.dist} m`
  }), /*#__PURE__*/React.createElement(Fact, {
    icon: "box",
    label: "Caixa terminal",
    value: result.cto
  }), /*#__PURE__*/React.createElement(Fact, {
    icon: "plug",
    label: "Portas livres",
    value: result.ports > 0 ? `${result.ports} disponíveis` : 'Nenhuma',
    tone: result.ports > 0 ? 'green' : 'red'
  }), /*#__PURE__*/React.createElement(Fact, {
    icon: "clock",
    label: "Prazo estimado",
    value: result.eta
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "file-plus-2",
      size: 15
    }),
    disabled: result.status === 'inviavel'
  }, "Gerar ordem de servi\xE7o"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "share-2",
      size: 15
    })
  }, "Ver na topologia"))))));
}
function Fact({
  icon,
  label,
  value,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-inset)',
      borderRadius: 'var(--radius-sm)',
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 13,
    color: "var(--text-tertiary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      color: 'var(--text-tertiary)'
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: tone ? `var(--status-${tone})` : 'var(--text-primary)'
    }
  }, value));
}
Object.assign(window, {
  Viability
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Viability.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/data.js
try { (() => {
// V.tal Nexus — mock network inventory data (UI kit only, not production)
window.NexusData = function () {
  const elements = [{
    id: 'OLT-SP-CAS-014',
    type: 'OLT',
    tipo: 'OLT',
    site: 'POP Casa Verde',
    addr: 'Av. Casa Verde, 1820 — São Paulo/SP',
    status: 'online',
    ports: '8.192',
    used: 78,
    vendor: 'Huawei MA5800',
    sync: 'há 2 min'
  }, {
    id: 'CTO-4821',
    type: 'CTO',
    tipo: 'CTO',
    site: 'Caixa Terminal',
    addr: 'Rua das Palmeiras, 320 — São Paulo/SP',
    status: 'online',
    ports: '16',
    used: 25,
    vendor: 'Furukawa',
    sync: 'há 11 min'
  }, {
    id: 'SPL-1x32-7745',
    type: 'Splitter',
    tipo: 'Splitter',
    site: 'CEO Vila Maria',
    addr: 'Rua Guilherme, 77 — São Paulo/SP',
    status: 'ativo',
    ports: '32',
    used: 91,
    vendor: 'Fiberhome',
    sync: 'há 4 min'
  }, {
    id: 'CTO-9930',
    type: 'CTO',
    tipo: 'CTO',
    site: 'Caixa Terminal',
    addr: 'Al. dos Anapurus, 145 — São Paulo/SP',
    status: 'degradado',
    ports: '16',
    used: 100,
    vendor: 'Furukawa',
    sync: 'há 1 h'
  }, {
    id: 'OLT-RJ-TIJ-002',
    type: 'OLT',
    tipo: 'OLT',
    site: 'POP Tijuca',
    addr: 'Rua Conde de Bonfim, 455 — Rio de Janeiro/RJ',
    status: 'online',
    ports: '4.096',
    used: 64,
    vendor: 'Nokia ISAM',
    sync: 'há 3 min'
  }, {
    id: 'POSTE-SP-22841',
    type: 'Poste',
    tipo: 'Poste',
    site: 'Infra aérea',
    addr: 'Rua Voluntários, 12 — São Paulo/SP',
    status: 'ativo',
    ports: '—',
    used: 40,
    vendor: 'Enel',
    sync: 'há 2 d'
  }, {
    id: 'CTO-4477',
    type: 'CTO',
    tipo: 'CTO',
    site: 'Caixa Terminal',
    addr: 'Rua Cardeal, 88 — Guarulhos/SP',
    status: 'planejado',
    ports: '16',
    used: 0,
    vendor: 'Furukawa',
    sync: '—'
  }, {
    id: 'CABO-FO-SP-0912',
    type: 'Cabo',
    tipo: 'Cabo',
    site: 'Backbone',
    addr: 'Eixo Marginal Tietê — 12 km',
    status: 'online',
    ports: '144 FO',
    used: 55,
    vendor: 'Prysmian',
    sync: 'há 6 min'
  }, {
    id: 'SPL-1x8-3320',
    type: 'Splitter',
    tipo: 'Splitter',
    site: 'CEO Santana',
    addr: 'Rua Alfredo Pujol, 500 — São Paulo/SP',
    status: 'offline',
    ports: '8',
    used: 0,
    vendor: 'Fiberhome',
    sync: 'há 5 h'
  }, {
    id: 'CTO-1188',
    type: 'CTO',
    tipo: 'CTO',
    site: 'Caixa Terminal',
    addr: 'Rua das Acácias, 9 — Osasco/SP',
    status: 'online',
    ports: '16',
    used: 50,
    vendor: 'Furukawa',
    sync: 'há 22 min'
  }];
  const viabilities = [{
    addr: 'Rua das Palmeiras, 320',
    city: 'São Paulo/SP',
    status: 'viavel',
    dist: 42,
    cto: 'CTO-4821',
    ports: 12,
    eta: 'Imediata'
  }, {
    addr: 'Al. dos Anapurus, 145',
    city: 'São Paulo/SP',
    status: 'parcial',
    dist: 180,
    cto: 'CTO-9930',
    ports: 0,
    eta: '15 dias (expansão)'
  }, {
    addr: 'Rua Voluntários, 12',
    city: 'São Paulo/SP',
    status: 'inviavel',
    dist: 920,
    cto: '—',
    ports: 0,
    eta: 'Sem rede'
  }];
  const modules = [{
    name: 'Geosite',
    desc: 'Sites, POPs e estações',
    icon: 'building-2',
    count: '1.842'
  }, {
    name: 'Logradouros',
    desc: 'Endereçamento e CEPs',
    icon: 'map-pin',
    count: '4,7M'
  }, {
    name: 'Geonet',
    desc: 'Topologia física da rede',
    icon: 'share-2',
    count: '38,1M'
  }, {
    name: 'Viabilidade Fuzzy',
    desc: 'Motor de viabilidade',
    icon: 'zap',
    count: '98,4%'
  }];
  const activity = [{
    who: 'Sync TM Forum',
    what: 'Reconciliação de 1.204 recursos (TMF639)',
    when: 'há 2 min',
    tone: 'blue'
  }, {
    who: 'CTO-9930',
    what: 'Saturação de portas atingiu 100%',
    when: 'há 1 h',
    tone: 'amber'
  }, {
    who: 'SPL-1x8-3320',
    what: 'Elemento sem resposta — marcado offline',
    when: 'há 5 h',
    tone: 'red'
  }, {
    who: 'OLT-SP-CAS-014',
    what: 'Provisionamento de 320 novos ONTs',
    when: 'há 6 h',
    tone: 'green'
  }];
  return {
    elements,
    viabilities,
    modules,
    activity
  };
}();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/data.js", error: String((e && e.message) || e) }); }

// ui_kits/nexus/shared.jsx
try { (() => {
// V.tal Nexus UI kit — shared helpers (Lucide icon bridge + element accent)
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
function Icon({
  name,
  size = 18,
  color,
  strokeWidth = 2,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = `<i data-lucide="${kebab(name)}"></i>`;
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          'stroke-width': strokeWidth
        },
        nameAttr: 'data-lucide',
        root: ref.current
      });
    }
  }, [name, size, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: 'inline-flex',
      color: color || 'currentColor',
      ...style
    }
  });
}

// element type -> taxonomy color + icon
const ELEMENT_META = {
  OLT: {
    color: 'var(--net-olt)',
    icon: 'server'
  },
  Splitter: {
    color: 'var(--net-splitter)',
    icon: 'split'
  },
  CTO: {
    color: 'var(--net-cto)',
    icon: 'box'
  },
  Poste: {
    color: 'var(--net-poste)',
    icon: 'utility-pole'
  },
  Cabo: {
    color: 'var(--net-cabo)',
    icon: 'cable'
  },
  Site: {
    color: 'var(--net-site)',
    icon: 'radio-tower'
  }
};
Object.assign(window, {
  Icon,
  ELEMENT_META,
  kebab
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/shared.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.MetricCard = __ds_scope.MetricCard;

__ds_ns.StatusPill = __ds_scope.StatusPill;

})();
