// V.tal Nexus UI kit — shared helpers (Lucide icon bridge + element accent)
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function Icon({ name, size = 18, color, strokeWidth = 2, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = `<i data-lucide="${kebab(name)}"></i>`;
      window.lucide.createIcons({
        attrs: { width: size, height: size, 'stroke-width': strokeWidth },
        nameAttr: 'data-lucide',
        root: ref.current,
      });
    }
  }, [name, size, strokeWidth]);
  return <span ref={ref} style={{ display: 'inline-flex', color: color || 'currentColor', ...style }} />;
}

// element type -> taxonomy color + icon
const ELEMENT_META = {
  OLT:      { color: 'var(--net-olt)',      icon: 'server' },
  Splitter: { color: 'var(--net-splitter)', icon: 'split' },
  CTO:      { color: 'var(--net-cto)',      icon: 'box' },
  Poste:    { color: 'var(--net-poste)',    icon: 'utility-pole' },
  Cabo:     { color: 'var(--net-cabo)',     icon: 'cable' },
  Site:     { color: 'var(--net-site)',     icon: 'radio-tower' },
};

Object.assign(window, { Icon, ELEMENT_META, kebab });
