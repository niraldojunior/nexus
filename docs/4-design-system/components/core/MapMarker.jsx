import React from 'react';

/**
 * V.tal Nexus — MapMarker
 * The map's visual vocabulary: a small circular badge holding a white
 * glyph, one hue per semantic state. `selected` promotes it to a
 * teardrop pin in brand yellow.
 */
const TONES = {
  available: 'var(--map-available)',
  suspended: 'var(--map-suspended)',
  partial: 'var(--map-partial)',
  station: 'var(--map-station)',
};

export function MapMarker({ tone = 'available', size = 'sm', icon, selected = false, style, ...rest }) {
  const d = { sm: 18, md: 26, lg: 34 }[size] || 18;
  const fill = TONES[tone] || TONES.available;
  if (selected) {
    // Teardrop pin whose base is overlapped by the element badge — one unit,
    // not a stack. Built absolutely so the two shapes always overlap.
    const badge = d + 10;
    return (
      <span style={{ position: 'relative', display: 'inline-block', width: 34, height: 46, ...style }} {...rest}>
        <span style={{
          position: 'absolute', left: 2, top: 0, width: 30, height: 30,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          background: 'var(--map-selected)',
          boxShadow: 'var(--shadow-md)',
        }} />
        <span style={{
          position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: badge, height: badge, borderRadius: '50%',
          background: fill, color: '#fff',
          border: '2px solid #fff', boxShadow: 'var(--shadow-md)',
        }}>{icon}</span>
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: d,
        height: d,
        borderRadius: '50%',
        background: fill,
        color: '#fff',
        border: '1.5px solid rgba(255,255,255,0.9)',
        boxShadow: '0 1px 2px rgba(46,45,57,0.25)',
        ...style,
      }}
      {...rest}
    >
      {icon}
    </span>
  );
}
