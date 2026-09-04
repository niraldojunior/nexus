// Nexus Logo Animation — Scene
// Reads Stage, Sprite, useTime, Easing from window (set by animations.jsx)

const DIAMOND_PERIM = 147.1;
const YELLOW = '#FFD919';
const INK = '#ffffff';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function ph(t, s, e) { return clamp((t - s) / (e - s), 0, 1); }

// ── Symbol ────────────────────────────────────────────────────────────────────
function NexusMark({ lt }) {
  const dP  = Easing.easeOutCubic(ph(lt, 0, 0.5));
  const dashOff = DIAMOND_PERIM * (1 - dP);

  // node spring-in
  const ns = [
    [0.10, 0.27], // top (gold)
    [0.22, 0.38], // right
    [0.32, 0.46], // bottom
    [0.40, 0.54], // left
  ].map(([s, e]) => {
    const r = ph(lt, s, e);
    return r > 0 ? Easing.easeOutBack(r) : 0;
  });

  const cp = Easing.easeOutCubic(ph(lt, 0.45, 0.82));

  // pulse: top=1.50, right=1.70, bottom=1.90, left=2.10 (0.22s each)
  const pulse = [1.50, 1.70, 1.90, 2.10].map(s => {
    const r = ph(lt, s, s + 0.22);
    return r > 0 ? Math.sin(r * Math.PI) : 0;
  });

  return (
    <svg viewBox="0 0 64 64" width={160} height={160}
         style={{ flexShrink: 0, overflow: 'visible' }}>

      {/* pulse halos */}
      {pulse[0] > 0 && <circle cx="32" cy="6"  r={3.6 + pulse[0]*11} fill={YELLOW} opacity={pulse[0] * 0.45} />}
      {pulse[1] > 0 && <circle cx="58" cy="32" r={2.8 + pulse[1]*9}  fill={YELLOW} opacity={pulse[1] * 0.38} />}
      {pulse[2] > 0 && <circle cx="32" cy="58" r={2.8 + pulse[2]*9}  fill={YELLOW} opacity={pulse[2] * 0.38} />}
      {pulse[3] > 0 && <circle cx="6"  cy="32" r={2.8 + pulse[3]*9}  fill={YELLOW} opacity={pulse[3] * 0.38} />}

      {/* diamond stroke */}
      <polygon
        points="32,6 58,32 32,58 6,32"
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeDasharray={DIAMOND_PERIM}
        strokeDashoffset={dashOff}
      />

      {/* nodes */}
      <g transform={`translate(32,6) scale(${ns[0]})`}>
        <circle r="3.6" fill={YELLOW} stroke={INK} strokeWidth="1.5" />
      </g>
      <g transform={`translate(58,32) scale(${ns[1]})`}>
        <circle r="2.8" fill={INK} />
      </g>
      <g transform={`translate(32,58) scale(${ns[2]})`}>
        <circle r="2.8" fill={INK} />
      </g>
      <g transform={`translate(6,32) scale(${ns[3]})`}>
        <circle r="2.8" fill={INK} />
      </g>

      {/* cube */}
      {cp > 0 && (
        <g transform={`translate(32,33) scale(${cp}) translate(-32,-33)`}>
          <polygon points="32,18 45,25.5 32,33 19,25.5" fill={YELLOW} />
          <polygon points="19,25.5 32,33 32,47 19,39.5" fill={INK} opacity="0.88" />
          <polygon points="45,25.5 32,33 32,47 45,39.5" fill={INK} opacity="0.50" />
          <polygon points="32,18 45,25.5 32,33 19,25.5" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        </g>
      )}
    </svg>
  );
}

// ── Lockup ────────────────────────────────────────────────────────────────────
function NexusLockup() {
  const t  = useTime();
  const lt = t % 2.5;

  const vP  = Easing.easeOutCubic(ph(lt, 0.72, 1.06));
  const dP  = Easing.easeOutCubic(ph(lt, 0.92, 1.22));
  const nxP = Easing.easeOutCubic(ph(lt, 1.06, 1.42));

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>

        <NexusMark lt={lt} />

        {/* gap */}
        <div style={{ width: 26 }} />

        {/* V.tal wordmark */}
        <img
          src="assets/vtal-logo-white.png"
          alt="V.tal"
          style={{
            height: 52,
            flexShrink: 0,
            opacity: vP,
            transform: `translateX(${(1 - vP) * -18}px)`,
          }}
        />

        {/* gap before divider */}
        <div style={{ width: 26 }} />

        {/* divider */}
        <div style={{
          width: 1,
          height: `${42 * dP}px`,
          background: 'rgba(255,255,255,0.22)',
          flexShrink: 0,
          alignSelf: 'center',
        }} />

        {/* gap after divider */}
        <div style={{ width: 26 }} />

        {/* Nexus wordmark */}
        <div style={{
          fontFamily: '"Montserrat", sans-serif',
          fontWeight: 600,
          fontSize: 48,
          color: '#ffffff',
          letterSpacing: '-0.015em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          opacity: nxP,
          transform: `translateX(${(1 - nxP) * 16}px)`,
        }}>Nexus</div>

      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function NexusLogoAnim() {
  return (
    <Stage
      width={900}
      height={240}
      duration={2.5}
      background="transparent"
      loop={true}
      autoplay={true}
      data-om-exportable-video-with-duration-secs="2.5"
    >
      <Sprite start={0} end={2.5}>
        <NexusLockup />
      </Sprite>
    </Stage>
  );
}

Object.assign(window, { NexusLogoAnim });

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(NexusLogoAnim)
);
