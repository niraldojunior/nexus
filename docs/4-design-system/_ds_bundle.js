/* @ds-bundle: {"format":4,"namespace":"VTalNexusDesignSystem_63587b","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"IconTabs","sourcePath":"components/core/IconTabs.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"MapMarker","sourcePath":"components/core/MapMarker.jsx"},{"name":"MetricCard","sourcePath":"components/core/MetricCard.jsx"},{"name":"StatusPill","sourcePath":"components/core/StatusPill.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"}],"sourceHashes":{"animations.jsx":"a8d2a696abaa","components/core/Badge.jsx":"c01773c847b7","components/core/Button.jsx":"a9edce7964f5","components/core/Card.jsx":"84cb18093e2e","components/core/IconTabs.jsx":"53fb1db5a6ab","components/core/Input.jsx":"b3711b455681","components/core/MapMarker.jsx":"07a92ae0351f","components/core/MetricCard.jsx":"95001c4f540d","components/core/StatusPill.jsx":"fd11726058f4","components/core/Switch.jsx":"62cfef487bf1","nexus-anim-scene.jsx":"19160559a688","ui_kits/nexus/Assistant.jsx":"8e4fa54ece86","ui_kits/nexus/Dashboard.jsx":"724e2b40a820","ui_kits/nexus/Inventory.jsx":"0a8ab6e4a29e","ui_kits/nexus/Locais.jsx":"f19466b59204","ui_kits/nexus/Login.jsx":"b646cc4f6baa","ui_kits/nexus/Shell.jsx":"61687fb9d65a","ui_kits/nexus/Topology.jsx":"e024da81b20d","ui_kits/nexus/Viability.jsx":"06bdd2638470","ui_kits/nexus/data.js":"3d778e7107f6","ui_kits/nexus/shared.jsx":"983454607d2c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.VTalNexusDesignSystem_63587b = window.VTalNexusDesignSystem_63587b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// animations.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// animations.jsx — timeline engine. Exports (on window): Stage, Sprite,
//   TextSprite, ImageSprite, RectSprite, VideoSprite, PlaybackBar,
//   useTime, useTimeline, useSprite, Easing, interpolate, animate, clamp.
//
//   <Stage width={1280} height={720} duration={10} background="#f6f4ef">
//     <Sprite start={0} end={3}>
//       <TextSprite text="Hello" x={100} y={300} size={72} color="#111" />
//     </Sprite>
//     <Sprite start={2} end={8}>
//       <ImageSprite src="hero.png" x={200} y={120} width={640} height={360} kenBurns />
//     </Sprite>
//   </Stage>
//
// Stage({width,height,duration,background,fps,loop,autoplay}) — auto-scales to
//   viewport; scrubber + play/pause + ←/→ seek + space + 0-reset; persists
//   playhead. The canvas is an <svg><foreignObject>, export-ready: Share →
//   Export → Video (or the PlaybackBar's download button) renders it to .mp4.
//   Screenshot tools DOM-rerender (not pixel-capture) and unwrap this wrapper
//   so captures should work — but if one comes back black, that's a capture
//   artifact, not a render bug; trust the live preview.
// Sprite({start,end,keepMounted}) — mounts children only while playhead is in
//   [start,end]. Children read {localTime, progress, duration} via useSprite().
// useTime() → seconds; useTimeline() → {time,duration,playing,setTime,setPlaying}.
// TextSprite({text,x,y,size,color,font,weight,align,entryDur,exitDur}) — fades/scales in+out.
// ImageSprite({src,x,y,width,height,fit,radius,kenBurns,placeholder}) — same, with optional ken-burns.
// RectSprite({x,y,width,height,color,radius}) — solid box with entry/exit.
// VideoSprite({src,start,end,speed,style}) — looped <video> clip synced to the
//   timeline; its audio is mixed into the exported video.
// Easing.{linear,easeIn/Out/InOut Quad/Cubic/Quart/Quint/Expo/Back, …}
// interpolate([t0,t1,…],[v0,v1,…],ease?) → (t)=>v  — piecewise tween.
// animate({from,to,start,end,ease}) → (t)=>v  — single tween.
//
// Build scenes by composing Sprites inside Stage. Absolutely-position elements.
//
// In a .dc.html project, put your scene in a sibling my-scene.jsx (reading
// {Stage, Sprite, useTime, Easing, …} from window is safe) and mount BOTH:
//   <x-import component-from-global-scope="MyScene"
//             from="./animations.jsx ./my-scene.jsx"></x-import>
// The two files in from= load in order, so my-scene.jsx can use the globals
// animations.jsx set.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

// ── Easing functions (hand-rolled, Popmotion-style) ─────────────────────────
// All easings take t ∈ [0,1] and return eased t ∈ [0,1] (may overshoot for back/elastic).
const Easing = {
  linear: t => t,
  // Quad
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  // Cubic
  easeInCubic: t => t * t * t,
  easeOutCubic: t => --t * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  // Quart
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - --t * t * t * t,
  easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  // Expo
  easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return 0.5 * Math.pow(2, 20 * t - 10);
    return 1 - 0.5 * Math.pow(2, -20 * t + 10);
  },
  // Sine
  easeInSine: t => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: t => Math.sin(t * Math.PI / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  // Back (overshoot)
  easeOutBack: t => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInBack: t => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeInOutBack: t => {
    const c1 = 1.70158,
      c2 = c1 * 1.525;
    return t < 0.5 ? Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  // Elastic
  easeOutElastic: t => {
    const c4 = 2 * Math.PI / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }
};

// ── Core interpolation helpers ──────────────────────────────────────────────

// Clamp a value to [min, max]
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// interpolate([0, 0.5, 1], [0, 100, 50], ease?) -> fn(t)
// Popmotion-style: linearly maps t across input keyframes to output values,
// with optional easing per segment (single fn or array of fns).
function interpolate(input, output, ease = Easing.linear) {
  return t => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const local = span === 0 ? 0 : (t - input[i]) / span;
        const easeFn = Array.isArray(ease) ? ease[i] || Easing.linear : ease;
        const eased = easeFn(local);
        return output[i] + (output[i + 1] - output[i]) * eased;
      }
    }
    return output[output.length - 1];
  };
}

// animate({from, to, start, end, ease})(t) — simpler single-segment tween.
// Returns `from` before `start`, `to` after `end`.
function animate({
  from = 0,
  to = 1,
  start = 0,
  end = 1,
  ease = Easing.easeInOutCubic
}) {
  return t => {
    if (t <= start) return from;
    if (t >= end) return to;
    const local = (t - start) / (end - start);
    return from + (to - from) * ease(local);
  };
}

// ── Timeline context ────────────────────────────────────────────────────────

const TimelineContext = React.createContext({
  time: 0,
  duration: 10,
  playing: false
});
const useTime = () => React.useContext(TimelineContext).time;
const useTimeline = () => React.useContext(TimelineContext);

// ── Sprite ──────────────────────────────────────────────────────────────────
// Renders children only when the playhead is inside [start, end]. Provides
// a sub-context with `localTime` (seconds since start) and `progress` (0..1).
//
//   <Sprite start={2} end={5}>
//     {({ localTime, progress }) => <Thing x={progress * 100} />}
//   </Sprite>
//
// Or as a plain wrapper — children can call useSprite() themselves.

const SpriteContext = React.createContext({
  localTime: 0,
  progress: 0,
  duration: 0
});
const useSprite = () => React.useContext(SpriteContext);
function Sprite({
  start = 0,
  end = Infinity,
  children,
  keepMounted = false
}) {
  const {
    time
  } = useTimeline();
  const visible = time >= start && time <= end;
  if (!visible && !keepMounted) return null;
  const duration = end - start;
  const localTime = Math.max(0, time - start);
  const progress = duration > 0 && isFinite(duration) ? clamp(localTime / duration, 0, 1) : 0;
  const value = {
    localTime,
    progress,
    duration,
    visible
  };
  return /*#__PURE__*/React.createElement(SpriteContext.Provider, {
    value: value
  }, typeof children === 'function' ? children(value) : children);
}

// ── Sample sprite components ────────────────────────────────────────────────

// TextSprite: fades/slides text in on entry, holds, then fades out on exit.
// Props: text, x, y, size, color, font, entryDur, exitDur, align
function TextSprite({
  text,
  x = 0,
  y = 0,
  size = 48,
  color = '#111',
  font = 'Inter, system-ui, sans-serif',
  weight = 600,
  entryDur = 0.45,
  exitDur = 0.35,
  entryEase = Easing.easeOutBack,
  exitEase = Easing.easeInCubic,
  align = 'left',
  letterSpacing = '-0.01em'
}) {
  const {
    localTime,
    duration
  } = useSprite();
  const exitStart = Math.max(0, duration - exitDur);
  let opacity = 1;
  let ty = 0;
  if (localTime < entryDur) {
    const t = entryEase(clamp(localTime / entryDur, 0, 1));
    opacity = t;
    ty = (1 - t) * 16;
  } else if (localTime > exitStart) {
    const t = exitEase(clamp((localTime - exitStart) / exitDur, 0, 1));
    opacity = 1 - t;
    ty = -t * 8;
  }
  const translateX = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(${translateX}, ${ty}px)`,
      opacity,
      fontFamily: font,
      fontSize: size,
      fontWeight: weight,
      color,
      letterSpacing,
      whiteSpace: 'pre',
      lineHeight: 1.1,
      willChange: 'transform, opacity'
    }
  }, text);
}

// ImageSprite: scales + fades in; optional Ken Burns drift during hold.
function ImageSprite({
  src,
  x = 0,
  y = 0,
  width = 400,
  height = 300,
  entryDur = 0.6,
  exitDur = 0.4,
  kenBurns = false,
  kenBurnsScale = 1.08,
  radius = 12,
  fit = 'cover',
  placeholder = null // {label: string} for striped placeholder
}) {
  const {
    localTime,
    duration
  } = useSprite();
  const exitStart = Math.max(0, duration - exitDur);
  let opacity = 1;
  let scale = 1;
  if (localTime < entryDur) {
    const t = Easing.easeOutCubic(clamp(localTime / entryDur, 0, 1));
    opacity = t;
    scale = 0.96 + 0.04 * t;
  } else if (localTime > exitStart) {
    const t = Easing.easeInCubic(clamp((localTime - exitStart) / exitDur, 0, 1));
    opacity = 1 - t;
    scale = (kenBurns ? kenBurnsScale : 1) + 0.02 * t;
  } else if (kenBurns) {
    const holdSpan = exitStart - entryDur;
    const holdT = holdSpan > 0 ? (localTime - entryDur) / holdSpan : 0;
    scale = 1 + (kenBurnsScale - 1) * holdT;
  }
  const content = placeholder ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'repeating-linear-gradient(135deg, #e9e6df 0 10px, #dcd8cf 10px 20px)',
      color: '#6b6458',
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 13,
      letterSpacing: '0.04em',
      textTransform: 'uppercase'
    }
  }, placeholder.label || 'image') : /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: fit,
      display: 'block'
    }
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: x,
      top: y,
      width,
      height,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: 'center',
      borderRadius: radius,
      overflow: 'hidden',
      willChange: 'transform, opacity'
    }
  }, content);
}

// RectSprite: simple rectangle that animates position/size/color via props.
// Useful demo primitive — takes a `render` fn for per-frame customization.
function RectSprite({
  x = 0,
  y = 0,
  width = 100,
  height = 100,
  color = '#111',
  radius = 8,
  entryDur = 0.4,
  exitDur = 0.3,
  render // optional: (ctx) => style overrides
}) {
  const spriteCtx = useSprite();
  const {
    localTime,
    duration
  } = spriteCtx;
  const exitStart = Math.max(0, duration - exitDur);
  let opacity = 1;
  let scale = 1;
  if (localTime < entryDur) {
    const t = Easing.easeOutBack(clamp(localTime / entryDur, 0, 1));
    opacity = clamp(localTime / entryDur, 0, 1);
    scale = 0.4 + 0.6 * t;
  } else if (localTime > exitStart) {
    const t = Easing.easeInQuad(clamp((localTime - exitStart) / exitDur, 0, 1));
    opacity = 1 - t;
    scale = 1 - 0.15 * t;
  }
  const overrides = render ? render(spriteCtx) : {};
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: x,
      top: y,
      width,
      height,
      background: color,
      borderRadius: radius,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: 'center',
      willChange: 'transform, opacity',
      ...overrides
    }
  });
}

// ── Font inlining ───────────────────────────────────────────────────────────
// Copy every @font-face rule from the page into a <style> inside the svg's
// foreignObject, with font URLs rewritten to data: URLs. Makes the svg
// self-describing so serializing it alone (video export fast path) still
// renders with the right fonts. Sets data-om-fonts-inlined on the svg when
// done so the exporter can wait for it.

function useInlineFontsInto(svgRef) {
  React.useEffect(() => {
    const svg = svgRef.current;
    const host = svg && svg.querySelector('foreignObject > div');
    if (!svg || !host) return;
    let cancelled = false;
    (async () => {
      const rules = [];
      for (const ss of document.styleSheets) {
        let cssRules;
        try {
          cssRules = ss.cssRules;
        } catch {
          // Cross-origin sheet without crossorigin attr (e.g. the standard
          // fonts.googleapis.com <link>) — fetch the CSS text directly and
          // regex-extract the @font-face blocks.
          if (ss.href) {
            try {
              const txt = await fetch(ss.href).then(r => {
                if (!r.ok) throw 0;
                return r.text();
              });
              for (const ff of txt.match(/@font-face\s*{[^}]*}/g) || []) rules.push({
                css: ff,
                base: ss.href
              });
            } catch {}
          }
          continue;
        }
        if (!cssRules) continue;
        for (const r of cssRules) {
          if (r.type === CSSRule.FONT_FACE_RULE) {
            rules.push({
              css: r.cssText,
              base: ss.href || location.href
            });
          }
        }
      }
      const toDataURL = url => fetch(url).then(r => {
        if (!r.ok) throw 0;
        return r.blob();
      }).then(b => new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => res(url);
        fr.readAsDataURL(b);
      })).catch(() => url);
      const parts = await Promise.all(rules.map(async ({
        css,
        base
      }) => {
        const re = /url\((['"]?)([^'")]+)\1\)/g;
        let out = css,
          m;
        while (m = re.exec(css)) {
          const u = m[2];
          if (u.startsWith('data:')) continue;
          let abs;
          try {
            abs = new URL(u, base).href;
          } catch {
            continue;
          }
          out = out.split(m[0]).join(`url("${await toDataURL(abs)}")`);
        }
        return out;
      }));
      if (cancelled || !parts.length) {
        svg.setAttribute('data-om-fonts-inlined', 'true');
        return;
      }
      const style = document.createElement('style');
      style.textContent = parts.join('\n');
      host.insertBefore(style, host.firstChild);
      svg.setAttribute('data-om-fonts-inlined', 'true');
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
function Stage({
  width = 1280,
  height = 720,
  duration = 10,
  background = '#f6f4ef',
  fps = 60,
  loop = true,
  autoplay = true,
  persistKey = 'animstage',
  children
}) {
  // Props arrive as strings when Stage is mounted via <x-import> (DC
  // projects) — coerce so style={{width}} gets a number React can px-ify.
  width = +width || 1280;
  height = +height || 720;
  duration = +duration || 10;
  fps = +fps || 60;
  if (typeof loop === 'string') loop = loop !== 'false';
  if (typeof autoplay === 'string') autoplay = autoplay !== 'false';
  const [time, setTime] = React.useState(() => {
    try {
      const v = parseFloat(localStorage.getItem(persistKey + ':t') || '0');
      return isFinite(v) ? clamp(v, 0, duration) : 0;
    } catch {
      return 0;
    }
  });
  const [playing, setPlaying] = React.useState(autoplay);
  const [hoverTime, setHoverTime] = React.useState(null);
  const [scale, setScale] = React.useState(1);
  const stageRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const lastTsRef = React.useRef(null);

  // Persist playhead
  React.useEffect(() => {
    try {
      localStorage.setItem(persistKey + ':t', String(time));
    } catch {}
  }, [time, persistKey]);

  // Auto-scale to fit viewport
  React.useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const measure = () => {
      const barH = 44; // playback bar height
      const s = Math.min(el.clientWidth / width, (el.clientHeight - barH) / height);
      setScale(Math.max(0.05, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [width, height]);

  // Animation loop
  React.useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    const step = ts => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setTime(t => {
        let next = t + dt;
        if (next >= duration) {
          if (loop) next = next % duration;else {
            next = duration;
            setPlaying(false);
          }
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [playing, duration, loop]);

  // Keyboard: space = play/pause, ← → = seek
  React.useEffect(() => {
    const onKey = e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(p => !p);
      } else if (e.code === 'ArrowLeft') {
        setTime(t => clamp(t - (e.shiftKey ? 1 : 0.1), 0, duration));
      } else if (e.code === 'ArrowRight') {
        setTime(t => clamp(t + (e.shiftKey ? 1 : 0.1), 0, duration));
      } else if (e.key === '0' || e.code === 'Home') {
        setTime(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration]);

  // Video-export protocol: the exporter dispatches this event per frame;
  // pause + sync the playhead so the capture sees exactly that timestamp.
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onSeek = e => {
      setPlaying(false);
      setTime(clamp(e.detail.time, 0, duration));
    };
    el.addEventListener('data-om-seek-to-time-frame', onSeek);
    return () => el.removeEventListener('data-om-seek-to-time-frame', onSeek);
  }, [duration]);

  // Inline @font-face rules into the svg's foreignObject so the svg is
  // self-describing — serializing it alone (for video export) then renders
  // with the right fonts. Sets data-om-fonts-inlined once done.
  useInlineFontsInto(canvasRef);
  const displayTime = hoverTime != null ? hoverTime : time;
  const ctxValue = React.useMemo(() => ({
    time: displayTime,
    duration,
    playing,
    setTime,
    setPlaying
  }), [displayTime, duration, playing]);
  return /*#__PURE__*/React.createElement("div", {
    ref: stageRef,
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: '#0a0a0a',
      fontFamily: 'Inter, system-ui, sans-serif'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    ref: canvasRef,
    width: width,
    height: height,
    "data-om-exportable-video-with-duration-secs": duration,
    style: {
      transform: `scale(${scale})`,
      transformOrigin: 'center',
      flexShrink: 0,
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("foreignObject", {
    x: "0",
    y: "0",
    width: "100%",
    height: "100%"
  }, /*#__PURE__*/React.createElement("div", {
    xmlns: "http://www.w3.org/1999/xhtml",
    style: {
      width,
      height,
      background,
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(TimelineContext.Provider, {
    value: ctxValue
  }, children))))), /*#__PURE__*/React.createElement(PlaybackBar, {
    time: displayTime,
    actualTime: time,
    duration: duration,
    playing: playing,
    onPlayPause: () => setPlaying(p => !p),
    onReset: () => {
      setTime(0);
    },
    onSeek: t => setTime(t),
    onHover: t => setHoverTime(t)
  }));
}

// ── Playback bar ────────────────────────────────────────────────────────────
// Play/pause, return-to-begin, scrub track, time display.
// Uses fixed-width time fields so layout doesn't thrash.

function PlaybackBar({
  time,
  duration,
  playing,
  onPlayPause,
  onReset,
  onSeek,
  onHover
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const timeFromEvent = React.useCallback(e => {
    const rect = trackRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    return x * duration;
  }, [duration]);
  const onTrackMove = e => {
    if (!trackRef.current) return;
    const t = timeFromEvent(e);
    if (dragging) {
      onSeek(t);
    } else {
      onHover(t);
    }
  };
  const onTrackLeave = () => {
    if (!dragging) onHover(null);
  };
  const onTrackDown = e => {
    setDragging(true);
    const t = timeFromEvent(e);
    onSeek(t);
    onHover(null);
  };
  React.useEffect(() => {
    if (!dragging) return;
    const onUp = () => setDragging(false);
    const onMove = e => {
      if (!trackRef.current) return;
      const t = timeFromEvent(e);
      onSeek(t);
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [dragging, timeFromEvent, onSeek]);
  const pct = duration > 0 ? time / duration * 100 : 0;
  const fmt = t => {
    const total = Math.max(0, t);
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const cs = Math.floor(total * 100 % 100);
    return `${String(m).padStart(1, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const mono = 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace';
  return /*#__PURE__*/React.createElement("div", {
    "data-omelette-chrome": true,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
      background: 'rgba(20,20,20,0.92)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',
      borderRadius: 8,
      color: '#f6f4ef',
      fontFamily: 'Inter, system-ui, sans-serif',
      userSelect: 'none',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    onClick: onReset,
    title: "Return to start (0)"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 2v10M12 2L5 7l7 5V2z",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement(IconButton, {
    onClick: onPlayPause,
    title: "Play/pause (space)"
  }, playing ? /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "2",
    width: "3",
    height: "10",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "2",
    width: "3",
    height: "10",
    fill: "currentColor"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 2l9 5-9 5V2z",
    fill: "currentColor"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: mono,
      fontSize: 12,
      fontVariantNumeric: 'tabular-nums',
      width: 64,
      textAlign: 'right',
      color: '#f6f4ef'
    }
  }, fmt(time)), /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    onMouseMove: onTrackMove,
    onMouseLeave: onTrackLeave,
    onMouseDown: onTrackDown,
    style: {
      flex: 1,
      height: 22,
      position: 'relative',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 4,
      background: 'rgba(255,255,255,0.12)',
      borderRadius: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      width: `${pct}%`,
      height: 4,
      background: 'oklch(72% 0.12 250)',
      borderRadius: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: `${pct}%`,
      top: '50%',
      width: 12,
      height: 12,
      marginLeft: -6,
      marginTop: -6,
      background: '#fff',
      borderRadius: 6,
      boxShadow: '0 2px 4px rgba(0,0,0,0.4)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: mono,
      fontSize: 12,
      fontVariantNumeric: 'tabular-nums',
      width: 64,
      textAlign: 'left',
      color: 'rgba(246,244,239,0.55)'
    }
  }, fmt(duration)), typeof VideoEncoder !== 'undefined' && /*#__PURE__*/React.createElement(IconButton, {
    title: "Export video",
    onClick: () => window.parent.postMessage({
      type: 'omelette:request-video-export'
    }, '*')
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 2v7m0 0L4 6m3 3l3-3M2 12h10",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))));
}
function IconButton({
  children,
  onClick,
  title
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    title: title,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 6,
      color: '#f6f4ef',
      cursor: 'pointer',
      padding: 0,
      transition: 'background 120ms'
    }
  }, children);
}

// ── VideoSprite ─────────────────────────────────────────────────────────────
// Renders a <video> that loops within [start,end] of its source at `speed`,
// kept in sync with the Stage's playhead. Carries the
// data-om-exportable-video-play-* attrs so video export can mix its audio.
//
//   <VideoSprite src="clip.mp4" start={2} end={5} speed={1}
//     style={{ width: 640, height: 360 }} />

function VideoSprite({
  src,
  start = 0,
  end,
  speed = 1,
  style,
  ...rest
}) {
  start = +start || 0;
  speed = +speed || 1;
  if (end != null) end = +end || undefined;
  const t = useTime();
  const ref = React.useRef(null);
  const span = Math.max(0.001, (end ?? start + 1) - start);
  React.useEffect(() => {
    const v = ref.current;
    if (!v || v.readyState < 1) return;
    const target = start + t * speed % span;
    if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
  }, [t, start, span, speed]);
  return /*#__PURE__*/React.createElement("video", _extends({
    ref: ref,
    src: src,
    muted: true,
    playsInline: true,
    preload: "auto",
    "data-om-exportable-video-play-start": start,
    "data-om-exportable-video-play-end": end ?? start + span,
    "data-om-exportable-video-play-speed": speed,
    style: {
      display: 'block',
      objectFit: 'cover',
      ...style
    }
  }, rest));
}
Object.assign(window, {
  Easing,
  interpolate,
  animate,
  clamp,
  TimelineContext,
  useTime,
  useTimeline,
  Sprite,
  SpriteContext,
  useSprite,
  TextSprite,
  ImageSprite,
  RectSprite,
  VideoSprite,
  Stage,
  PlaybackBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "animations.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Badge
 * Compact status / category label. Soft tinted fill + saturated text.
 * Sentence case, medium weight — no uppercase micro-caps.
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
      bg: 'var(--surface-muted)',
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
      bg: 'var(--surface-ink)',
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
      borderRadius: 'var(--radius-sm)',
      background: t.bg,
      color: t.fg,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-sm)',
      fontWeight: 500,
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
      padding: '0 12px',
      fontSize: 'var(--fs-body)',
      height: 32,
      gap: 6
    },
    md: {
      padding: '0 14px',
      fontSize: 'var(--fs-body-lg)',
      height: 36,
      gap: 8
    },
    lg: {
      padding: '0 18px',
      fontSize: 'var(--fs-body-relaxed)',
      height: 44,
      gap: 8
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
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)',
    whiteSpace: 'nowrap'
  };
  const variants = {
    primary: {
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      borderColor: 'var(--vt-yellow)'
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent'
    },
    dark: {
      background: 'var(--surface-ink)',
      color: 'var(--text-on-dark)',
      borderColor: 'var(--surface-ink)'
    },
    danger: {
      background: 'var(--status-red)',
      color: '#fff',
      borderColor: 'var(--status-red)'
    }
  };
  const [hover, setHover] = React.useState(false);
  const hovers = {
    primary: {
      background: 'var(--vt-yellow-light)',
      borderColor: 'var(--vt-yellow-light)'
    },
    secondary: {
      background: 'var(--surface-muted)'
    },
    ghost: {
      background: 'var(--surface-muted)',
      color: 'var(--text-primary)'
    },
    dark: {
      background: 'var(--neutral-700)',
      borderColor: 'var(--neutral-700)'
    },
    danger: {
      background: '#DC3F3F',
      borderColor: '#DC3F3F'
    }
  };
  const hoverStyle = !disabled && hover ? hovers[variant] || {} : {};
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
 * Flat, border-led surface. `interactive` shifts background and border
 * on hover; nothing lifts or glows. `elevation="float"` is reserved for
 * panels that genuinely sit above the map.
 */
function Card({
  children,
  interactive = false,
  elevation = 'flat',
  pad = 16,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const shadows = {
    flat: 'none',
    raised: 'var(--shadow-md)',
    float: 'var(--shadow-float)'
  };
  const hoverStyle = interactive && hover ? {
    background: 'var(--surface-card-hover)',
    borderColor: 'var(--border-strong)'
  } : {};
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => interactive && setHover(true),
    onMouseLeave: () => interactive && setHover(false),
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: elevation === 'float' ? 'var(--radius-2xl)' : 'var(--radius-lg)',
      boxShadow: shadows[elevation] || 'none',
      padding: pad,
      cursor: interactive ? 'pointer' : 'default',
      transition: 'background var(--transition-fast), border-color var(--transition-fast)',
      ...hoverStyle,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/IconTabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — IconTabs
 * Round icon + caption tab strip used for entity sub-navigation
 * (Visão geral · Portas · Cobertura · Esquemático · Histórico).
 * Active tab fills solid brand yellow; the rest are yellow-tinted rings.
 */
function IconTabs({
  items = [],
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 4,
      ...style
    }
  }, rest), items.map(it => {
    const active = it.id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      type: "button",
      role: "tab",
      "aria-selected": active,
      onClick: () => onChange && onChange(it.id),
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '4px 2px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 42,
        height: 42,
        borderRadius: '50%',
        background: active ? 'var(--vt-yellow)' : 'var(--vt-yellow-tint)',
        color: active ? 'var(--vt-ink)' : 'var(--text-secondary)',
        transition: 'background var(--transition-fast), color var(--transition-fast)'
      }
    }, it.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--fs-sm)/1.25 var(--font-ui)',
        fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-regular)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        textAlign: 'center'
      }
    }, it.label));
  }));
}
Object.assign(__ds_scope, { IconTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconTabs.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Input
 * Text field with optional leading icon and label. Resting border is the
 * hairline; focus swaps it for yellow plus a soft ring.
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
      height: 36,
      background: disabled ? 'var(--surface-muted)' : 'var(--surface-card)',
      border: `1px solid ${focus ? 'var(--vt-yellow)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
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
      fontSize: 'var(--fs-body-lg)',
      color: 'var(--text-primary)',
      minWidth: 0
    }
  }, rest))), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-label)',
      color: 'var(--text-tertiary)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/MapMarker.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  station: 'var(--map-station)'
};
function MapMarker({
  tone = 'available',
  size = 'sm',
  icon,
  selected = false,
  style,
  ...rest
}) {
  const d = {
    sm: 18,
    md: 26,
    lg: 34
  }[size] || 18;
  const fill = TONES[tone] || TONES.available;
  if (selected) {
    // Teardrop pin whose base is overlapped by the element badge — one unit,
    // not a stack. Built absolutely so the two shapes always overlap.
    const badge = d + 10;
    return /*#__PURE__*/React.createElement("span", _extends({
      style: {
        position: 'relative',
        display: 'inline-block',
        width: 34,
        height: 46,
        ...style
      }
    }, rest), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 2,
        top: 0,
        width: 30,
        height: 30,
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        background: 'var(--map-selected)',
        boxShadow: 'var(--shadow-md)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: badge,
        height: badge,
        borderRadius: '50%',
        background: fill,
        color: '#fff',
        border: '2px solid #fff',
        boxShadow: 'var(--shadow-md)'
      }
    }, icon));
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
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
      ...style
    }
  }, rest), icon);
}
Object.assign(__ds_scope, { MapMarker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/MapMarker.jsx", error: String((e && e.message) || e) }); }

// components/core/MetricCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — MetricCard
 * KPI surface: label, big display number (the one place Montserrat still
 * carries the voice), optional delta + icon.
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
      background: accent ? 'var(--surface-ink)' : 'var(--surface-card)',
      border: `1px solid ${accent ? 'var(--surface-ink)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
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
      font: 'var(--text-label)',
      color: accent ? 'rgba(255,255,255,0.6)' : 'var(--text-tertiary)'
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      background: accent ? 'rgba(255,217,25,0.16)' : 'var(--surface-muted)',
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
      fontWeight: 600,
      fontSize: 'var(--fs-sm)',
      color: deltaColor
    }
  }, deltaDir === 'down' ? '▾' : '▴', " ", delta), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: accent ? 'rgba(255,255,255,0.5)' : 'var(--text-tertiary)'
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

// components/core/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * V.tal Nexus — Switch
 * Layer / feature toggle. On = brand yellow with ink knob; off = neutral.
 * The default control for the map Layers panel.
 */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  size = 'md',
  label,
  style,
  ...rest
}) {
  const dims = size === 'sm' ? {
    w: 34,
    h: 20,
    k: 14
  } : {
    w: 44,
    h: 26,
    k: 20
  };
  const pad = (dims.h - dims.k) / 2;
  const toggle = /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      position: 'relative',
      flexShrink: 0,
      width: dims.w,
      height: dims.h,
      padding: 0,
      border: '1px solid ' + (checked ? 'var(--vt-yellow)' : 'var(--border-strong)'),
      borderRadius: 'var(--radius-full)',
      background: checked ? 'var(--vt-yellow)' : 'var(--neutral-200)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'background var(--transition-fast), border-color var(--transition-fast)',
      ...(label ? {} : style)
    }
  }, label ? {} : rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: pad,
      left: checked ? dims.w - dims.k - pad - 2 : pad,
      width: dims.k,
      height: dims.k,
      borderRadius: '50%',
      background: checked ? 'var(--vt-ink)' : 'var(--surface-card)',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--transition-fast), background var(--transition-fast)'
    }
  }));
  if (!label) return toggle;
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--fw-regular) var(--fs-body-relaxed)/1.3 var(--font-ui)',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)'
    }
  }, label), toggle);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// nexus-anim-scene.jsx
try { (() => {
// Nexus Logo Animation — Scene
// Reads Stage, Sprite, useTime, Easing from window (set by animations.jsx)

const DIAMOND_PERIM = 147.1;
const YELLOW = '#FFD919';
const INK = '#ffffff';
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function ph(t, s, e) {
  return clamp((t - s) / (e - s), 0, 1);
}

// ── Symbol ────────────────────────────────────────────────────────────────────
function NexusMark({
  lt
}) {
  const dP = Easing.easeOutCubic(ph(lt, 0, 0.5));
  const dashOff = DIAMOND_PERIM * (1 - dP);

  // node spring-in
  const ns = [[0.10, 0.27],
  // top (gold)
  [0.22, 0.38],
  // right
  [0.32, 0.46],
  // bottom
  [0.40, 0.54] // left
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
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 64 64",
    width: 160,
    height: 160,
    style: {
      flexShrink: 0,
      overflow: 'visible'
    }
  }, pulse[0] > 0 && /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "6",
    r: 3.6 + pulse[0] * 11,
    fill: YELLOW,
    opacity: pulse[0] * 0.45
  }), pulse[1] > 0 && /*#__PURE__*/React.createElement("circle", {
    cx: "58",
    cy: "32",
    r: 2.8 + pulse[1] * 9,
    fill: YELLOW,
    opacity: pulse[1] * 0.38
  }), pulse[2] > 0 && /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "58",
    r: 2.8 + pulse[2] * 9,
    fill: YELLOW,
    opacity: pulse[2] * 0.38
  }), pulse[3] > 0 && /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "32",
    r: 2.8 + pulse[3] * 9,
    fill: YELLOW,
    opacity: pulse[3] * 0.38
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "32,6 58,32 32,58 6,32",
    fill: "none",
    stroke: INK,
    strokeWidth: "3",
    strokeLinejoin: "round",
    strokeDasharray: DIAMOND_PERIM,
    strokeDashoffset: dashOff
  }), /*#__PURE__*/React.createElement("g", {
    transform: `translate(32,6) scale(${ns[0]})`
  }, /*#__PURE__*/React.createElement("circle", {
    r: "3.6",
    fill: YELLOW,
    stroke: INK,
    strokeWidth: "1.5"
  })), /*#__PURE__*/React.createElement("g", {
    transform: `translate(58,32) scale(${ns[1]})`
  }, /*#__PURE__*/React.createElement("circle", {
    r: "2.8",
    fill: INK
  })), /*#__PURE__*/React.createElement("g", {
    transform: `translate(32,58) scale(${ns[2]})`
  }, /*#__PURE__*/React.createElement("circle", {
    r: "2.8",
    fill: INK
  })), /*#__PURE__*/React.createElement("g", {
    transform: `translate(6,32) scale(${ns[3]})`
  }, /*#__PURE__*/React.createElement("circle", {
    r: "2.8",
    fill: INK
  })), cp > 0 && /*#__PURE__*/React.createElement("g", {
    transform: `translate(32,33) scale(${cp}) translate(-32,-33)`
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "32,18 45,25.5 32,33 19,25.5",
    fill: YELLOW
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "19,25.5 32,33 32,47 19,39.5",
    fill: INK,
    opacity: "0.88"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "45,25.5 32,33 32,47 45,39.5",
    fill: INK,
    opacity: "0.50"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "32,18 45,25.5 32,33 19,25.5",
    fill: "none",
    stroke: "rgba(0,0,0,0.18)",
    strokeWidth: "0.6"
  })));
}

// ── Lockup ────────────────────────────────────────────────────────────────────
function NexusLockup() {
  const t = useTime();
  const lt = t % 2.5;
  const vP = Easing.easeOutCubic(ph(lt, 0.72, 1.06));
  const dP = Easing.easeOutCubic(ph(lt, 0.92, 1.22));
  const nxP = Easing.easeOutCubic(ph(lt, 1.06, 1.42));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 0
    }
  }, /*#__PURE__*/React.createElement(NexusMark, {
    lt: lt
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "assets/vtal-logo-white.png",
    alt: "V.tal",
    style: {
      height: 52,
      flexShrink: 0,
      opacity: vP,
      transform: `translateX(${(1 - vP) * -18}px)`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: `${42 * dP}px`,
      background: 'rgba(255,255,255,0.22)',
      flexShrink: 0,
      alignSelf: 'center'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '"Montserrat", sans-serif',
      fontWeight: 600,
      fontSize: 48,
      color: '#ffffff',
      letterSpacing: '-0.015em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      opacity: nxP,
      transform: `translateX(${(1 - nxP) * 16}px)`
    }
  }, "Nexus")));
}

// ── App ───────────────────────────────────────────────────────────────────────
function NexusLogoAnim() {
  return /*#__PURE__*/React.createElement(Stage, {
    width: 900,
    height: 240,
    duration: 2.5,
    background: "transparent",
    loop: true,
    autoplay: true,
    "data-om-exportable-video-with-duration-secs": "2.5"
  }, /*#__PURE__*/React.createElement(Sprite, {
    start: 0,
    end: 2.5
  }, /*#__PURE__*/React.createElement(NexusLockup, null)));
}
Object.assign(window, {
  NexusLogoAnim
});
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(NexusLogoAnim));
})(); } catch (e) { __ds_ns.__errors.push({ path: "nexus-anim-scene.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nexus/Assistant.jsx
try { (() => {
// V.tal Nexus UI kit — Assistant module (Nova Conversa · Conversas · transcript)
// Adapted from components/core/chat.card.html into a routable screen.
const Diamond = () => /*#__PURE__*/React.createElement("span", {
  style: {
    width: 7,
    height: 7,
    background: 'var(--vt-yellow)',
    transform: 'rotate(45deg)',
    flexShrink: 0
  }
});
const SUGGESTIONS = [{
  label: 'Locais',
  icon: 'map-pin'
}, {
  label: 'Recursos',
  icon: 'layers'
}, {
  label: 'Serviços',
  icon: 'network'
}, {
  label: 'Ordens',
  icon: 'zap'
}, {
  label: 'Especificação TMF',
  icon: 'file-text'
}];
const TURNS = [{
  by: 'assistant',
  text: 'Olá! Como posso ajudar você hoje com o V.tal Nexus?',
  at: '19:39'
}, {
  by: 'user',
  text: 'tudo bem?',
  at: '09:55'
}, {
  by: 'assistant',
  text: 'Estou bem, obrigado! Como posso te auxiliar com algo relacionado ao V.tal Nexus, telecomunicações, inventário ou APIs?',
  at: '09:55'
}];
const HISTORY = [{
  title: 'oi',
  at: 'Modificado em 27 de agosto de 2026 às 19:39'
}];
function NewConversation({
  onSend
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 22,
      height: '100%',
      padding: 'var(--content-pad)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--text-greeting)',
      letterSpacing: 'var(--tracking-snug)'
    }
  }, "Bom dia"), /*#__PURE__*/React.createElement("div", {
    className: "vt-composer vt-composer-hero",
    style: {
      width: '100%',
      maxWidth: 'var(--thread-max)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "Pergunte sobre Locais, Recursos, Servi\xE7os, Ordens ou gere uma especifica\xE7\xE3o\u2026",
    onKeyDown: e => e.key === 'Enter' && onSend && onSend()
  }), /*#__PURE__*/React.createElement("button", {
    className: "vt-send",
    onClick: () => onSend && onSend()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("select", {
    style: {
      height: 32,
      padding: '0 8px',
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      font: 'var(--text-label)',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement("option", null, "Gemini 2.5 Flash")), /*#__PURE__*/React.createElement("span", {
    style: {
      height: 30,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      font: 'var(--text-label)',
      color: 'var(--text-secondary)'
    }
  }, "TMF-first")), /*#__PURE__*/React.createElement("div", {
    className: "vt-suggestions"
  }, SUGGESTIONS.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.label,
    className: "vt-suggestion",
    onClick: () => onSend && onSend()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    size: 17
  }), s.label))));
}
function ConversationThread({
  onDelete
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '18px 24px'
    }
  }, /*#__PURE__*/React.createElement(Diamond, null), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: 'var(--fw-medium) var(--fs-body-relaxed)/1.3 var(--font-ui)'
    }
  }, "oi"), /*#__PURE__*/React.createElement("div", {
    className: "vt-rail-item",
    style: {
      width: 34
    },
    onClick: onDelete
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash-2",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-thread"
  }, TURNS.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'vt-turn vt-turn-' + t.by
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-bubble"
  }, t.text), /*#__PURE__*/React.createElement("span", {
    className: "vt-turn-time"
  }, t.at))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      padding: '18px 24px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-composer",
    style: {
      maxWidth: 'var(--thread-max)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: "2",
    placeholder: "Digite sua pergunta\u2026"
  }), /*#__PURE__*/React.createElement("button", {
    className: "vt-send"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send",
    size: 18
  })))));
}
function ConversationHistory({
  onOpen
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      height: '100%',
      overflowY: 'auto',
      padding: 'var(--content-pad)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--text-title)',
      letterSpacing: 'var(--tracking-snug)'
    }
  }, "Conversas"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 6,
      fontSize: 'var(--fs-body-relaxed)',
      color: 'var(--text-tertiary)'
    }
  }, HISTORY.length, " conversa(s) encontrada(s)"), /*#__PURE__*/React.createElement("div", {
    className: "vt-searchbar vt-searchbar-flat",
    style: {
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 18
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar conversas por t\xEDtulo\u2026"
  })), HISTORY.map(h => /*#__PURE__*/React.createElement("div", {
    key: h.title,
    className: "vt-card-interactive",
    style: {
      marginTop: 18,
      padding: '16px 20px'
    },
    onClick: () => onOpen && onOpen(h.title)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, h.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 5,
      fontSize: 'var(--fs-body-lg)',
      color: 'var(--text-tertiary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 14
  }), h.at))));
}
Object.assign(window, {
  NewConversation,
  ConversationThread,
  ConversationHistory
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Assistant.jsx", error: String((e && e.message) || e) }); }

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

// ui_kits/nexus/Locais.jsx
try { (() => {
// V.tal Nexus UI kit — Locais module (map, layers, entity detail)
// Adapted from components/core/geo.card.html into a routable screen.
// The Google basemap can't be embedded meaningfully here — a low-chroma
// synthetic terrain stands in for it, per the design system's placeholder rule.
const LAYERS = [{
  group: 'Locais',
  icon: 'map-pin',
  items: ['Estações', 'Sites de Rede', 'Sites de Serviço', 'Torres']
}, {
  group: 'Infraestrutura Civil',
  icon: 'network',
  items: ['Postes', 'Dutos', 'Caixas Subterrâneas']
}];
// Coords keep clear of the floating panels.
const MARKERS = [{
  t: 'available',
  x: 40,
  y: 9
}, {
  t: 'suspended',
  x: 54,
  y: 15
}, {
  t: 'available',
  x: 47,
  y: 24
}, {
  t: 'partial',
  x: 41,
  y: 38
}, {
  t: 'available',
  x: 57,
  y: 33
}, {
  t: 'station',
  x: 52,
  y: 46,
  s: 'md'
}, {
  t: 'available',
  x: 13,
  y: 72
}, {
  t: 'suspended',
  x: 21,
  y: 80
}, {
  t: 'available',
  x: 78,
  y: 73
}, {
  t: 'partial',
  x: 87,
  y: 80
}];
function Locais({
  rail = false
}) {
  const {
    IconTabs,
    Switch,
    MapMarker,
    Badge
  } = window.VTalNexusDesignSystem_63587b;
  const [tab, setTab] = React.useState('cobertura');
  const [showDetail, setShowDetail] = React.useState(true);
  const [showLayers, setShowLayers] = React.useState(true);
  const [layers, setLayers] = React.useState({
    Postes: false,
    Estações: true,
    'Sites de Rede': true,
    'Sites de Serviço': true,
    Torres: true,
    Dutos: true,
    'Caixas Subterrâneas': true
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: '100%',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: '#F1F0EC',
      backgroundImage: 'linear-gradient(90deg, rgba(46,45,57,.05) 1px, transparent 1px), linear-gradient(rgba(46,45,57,.05) 1px, transparent 1px), radial-gradient(circle at 70% 30%, #DDECE0 0 22%, transparent 22%), radial-gradient(circle at 14% 80%, #BFE3EE 0 28%, transparent 28%)',
      backgroundSize: '46px 46px, 46px 46px, 100% 100%, 100% 100%'
    }
  }), MARKERS.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      position: 'absolute',
      left: m.x + '%',
      top: m.y + '%'
    }
  }, /*#__PURE__*/React.createElement(MapMarker, {
    tone: m.t,
    size: m.s || 'sm',
    icon: m.s ? /*#__PURE__*/React.createElement(Icon, {
      name: "building-2",
      size: 13
    }) : null
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '45%',
      top: '62%'
    }
  }, /*#__PURE__*/React.createElement(MapMarker, {
    tone: "available",
    size: "md",
    selected: true,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "building-2",
      size: 13
    })
  })), rail && showDetail ? /*#__PURE__*/React.createElement("div", {
    className: "vt-float-panel",
    style: {
      position: 'absolute',
      left: 'var(--float-gap)',
      top: 'var(--float-gap)',
      width: 320,
      maxHeight: 'calc(100% - 2 * var(--float-gap))',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-searchbar",
    style: {
      border: 'none',
      boxShadow: 'none',
      borderBottom: '1px solid var(--border)',
      borderRadius: 0,
      height: 46
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders-horizontal",
    size: 17
  }), /*#__PURE__*/React.createElement("input", {
    defaultValue: "CDOI-2924 (ICI)"
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 17
  })), /*#__PURE__*/React.createElement("div", {
    className: "vt-panel-head"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 17
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-panel-eyebrow"
  }, "CDOI"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-h3)'
    }
  }, "CDOI-2924 (ICI)")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setShowDetail(false),
    style: {
      cursor: 'pointer',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 17
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 12px 4px'
    }
  }, /*#__PURE__*/React.createElement(IconTabs, {
    value: tab,
    onChange: setTab,
    items: [{
      id: 'visao',
      label: 'Visão geral',
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "info",
        size: 18
      })
    }, {
      id: 'portas',
      label: 'Portas',
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "network",
        size: 18
      })
    }, {
      id: 'cobertura',
      label: 'Cobertura',
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "layers",
        size: 18
      })
    }, {
      id: 'historico',
      label: 'Histórico',
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "history",
        size: 18
      })
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 16px 16px'
    }
  }, /*#__PURE__*/React.createElement("dl", {
    className: "vt-kv"
  }, /*#__PURE__*/React.createElement("dt", null, "Endere\xE7o"), /*#__PURE__*/React.createElement("dd", null, "Sem endere\xE7o"), /*#__PURE__*/React.createElement("dt", null, "Status"), /*#__PURE__*/React.createElement("dd", null, /*#__PURE__*/React.createElement(Badge, {
    tone: "green",
    dot: true
  }, "Ativo")), /*#__PURE__*/React.createElement("dt", null, "Portas"), /*#__PURE__*/React.createElement("dd", null, "16 \xB7 11 ocupadas")))) : /*#__PURE__*/React.createElement("div", {
    className: "vt-searchbar",
    style: {
      position: 'absolute',
      left: 'var(--float-gap)',
      top: 'var(--float-gap)',
      width: rail ? 320 : 400
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders-horizontal",
    size: 18
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Pesquise no Nexus"
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "list-filter",
    size: 18
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 19
  })), showLayers ? /*#__PURE__*/React.createElement("div", {
    className: "vt-float-panel",
    style: {
      position: 'absolute',
      right: 'var(--float-gap)',
      top: 'var(--float-gap)',
      width: 250,
      padding: '4px 0',
      maxHeight: 'calc(100% - 2 * var(--float-gap))',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 16px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      font: 'var(--text-h3)'
    }
  }, "Camadas"), /*#__PURE__*/React.createElement("div", {
    onClick: () => setShowLayers(false),
    style: {
      cursor: 'pointer',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), LAYERS.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.group,
    style: {
      borderTop: '1px solid var(--border)',
      padding: '10px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: g.icon,
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: 'var(--fw-semibold) var(--fs-body-relaxed)/1.3 var(--font-ui)'
    }
  }, g.group), /*#__PURE__*/React.createElement(Switch, {
    size: "sm",
    checked: true,
    onChange: () => {}
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      paddingLeft: 25
    }
  }, g.items.map(name => /*#__PURE__*/React.createElement(Switch, {
    key: name,
    size: "sm",
    label: name,
    checked: layers[name],
    onChange: v => setLayers(s => ({
      ...s,
      [name]: v
    }))
  })))))) : /*#__PURE__*/React.createElement("div", {
    className: "vt-map-btn",
    style: {
      position: 'absolute',
      right: 'var(--float-gap)',
      top: 'var(--float-gap)'
    },
    onClick: () => setShowLayers(true)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "layers",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    className: "vt-float-panel",
    style: {
      position: 'absolute',
      left: 'var(--float-gap)',
      bottom: 'var(--float-gap)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '9px 16px',
      borderRadius: 'var(--radius-full)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-body-lg)',
      color: 'var(--text-secondary)'
    }
  }, "Suspenso"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 120,
      height: 8,
      borderRadius: 'var(--radius-full)',
      background: 'var(--map-ramp)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-body-lg)',
      color: 'var(--text-secondary)'
    }
  }, "Dispon\xEDvel")), /*#__PURE__*/React.createElement("div", {
    className: "vt-map-btn",
    style: {
      position: 'absolute',
      right: 'var(--float-gap)',
      bottom: 'var(--float-gap)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "locate",
    size: 18
  })));
}
Object.assign(window, {
  Locais
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nexus/Locais.jsx", error: String((e && e.message) || e) }); }

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
      background: 'var(--surface-ink)',
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
      height: 43,
      width: 43
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 34,
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
      fontSize: 30,
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
  }, "Invent\xE1rio Convergente \u2014 Infraestrutura Passiva, Rede de Acesso, Equipamentos, Recursos L\xF3gicos, sob arquitetura modular, API-first e padr\xE3o TM Forum."), /*#__PURE__*/React.createElement("div", {
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
  }, "Holding V.tal")), /*#__PURE__*/React.createElement("div", {
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
      font: 'var(--text-h1)',
      letterSpacing: 'var(--tracking-snug)',
      marginBottom: 4
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 'var(--fs-body-lg)',
      color: 'var(--text-tertiary)',
      marginBottom: 28
    }
  }), /*#__PURE__*/React.createElement("form", {
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
    label: "E-mail",
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
// V.tal Nexus UI kit — application shell
// Structural composition follows shadcn/ui's Sidebar pattern (header / content
// with labeled groups of menu buttons / footer / an edge rail that toggles
// icon-collapse) — only the color tokens are ours (V.tal yellow wash, hairline
// borders). No fixed top bar: each page owns its own heading (PageHead).
function Shell({
  active,
  onNavigate,
  onLogout,
  children,
  variant = 'sidebar',
  collapsible = true,
  pad = true
}) {
  const [rail, setRail] = React.useState(variant === 'rail');
  const primary = [{
    id: 'new',
    label: 'Nova Conversa',
    icon: 'plus'
  }, {
    id: 'chats',
    label: 'Conversas',
    icon: 'messages-square'
  }];
  const domains = [{
    id: 'locais',
    label: 'Locais',
    icon: 'map-pin'
  }, {
    id: 'inventory',
    label: 'Recursos',
    icon: 'boxes'
  }, {
    id: 'services',
    label: 'Serviços',
    icon: 'briefcase'
  }, {
    id: 'orders',
    label: 'Ordens',
    icon: 'network'
  }];
  const system = [{
    id: 'studio',
    label: 'Studio',
    icon: 'sliders-horizontal'
  }, {
    id: 'settings',
    label: 'Configurações',
    icon: 'settings-2'
  }];
  const recent = ['Viabilidade Icaraí', 'CDOI-2924 (ICI)', 'Cobertura Niterói'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100%',
      background: 'var(--surface-app)',
      borderTop: '3px solid var(--vt-yellow)'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'relative',
      width: rail ? 'var(--rail-width)' : 'var(--sidebar-width)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--sidebar-border)',
      transition: 'width var(--transition-normal)',
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-sb-btn vt-sb-btn-lg",
    style: {
      justifyContent: rail ? 'center' : 'flex-start',
      cursor: rail ? 'pointer' : 'default'
    },
    onClick: rail ? () => setRail(false) : undefined,
    title: rail ? 'Expandir' : undefined
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/nexus-mark.svg",
    alt: "Nexus",
    style: {
      height: 22,
      flexShrink: 0
    }
  }), !rail && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 17,
      letterSpacing: 'var(--tracking-snug)',
      color: 'var(--text-primary)',
      flex: 1
    }
  }, "Nexus"), !rail && collapsible && /*#__PURE__*/React.createElement("span", {
    onClick: () => setRail(true),
    title: "Recolher",
    style: {
      display: 'flex',
      color: 'var(--text-tertiary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "panel-left-close",
    size: 16
  })))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      alignItems: rail ? 'center' : 'stretch'
    }
  }, /*#__PURE__*/React.createElement(SBGroup, {
    rail: rail,
    items: primary,
    active: active,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(SBGroup, {
    rail: rail,
    items: domains,
    active: active,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(SBGroup, {
    rail: rail,
    items: system,
    active: active,
    onNavigate: onNavigate
  }), !rail && /*#__PURE__*/React.createElement(SBGroup, {
    rail: rail,
    label: "Conversas recentes",
    items: recent.map(r => ({
      id: r,
      label: r,
      icon: 'message-square',
      muted: true
    })),
    active: active,
    onNavigate: () => {},
    style: {
      marginTop: 14
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      borderTop: '1px solid var(--sidebar-border)',
      padding: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vt-sb-btn vt-sb-btn-lg",
    style: {
      justifyContent: rail ? 'center' : 'flex-start'
    },
    onClick: onLogout
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      fontSize: 12,
      flexShrink: 0
    }
  }, "A"), !rail && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-body-lg)',
      fontWeight: 500,
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, "Administrador"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-tertiary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, "admin@vtal.com.br")), /*#__PURE__*/React.createElement(Icon, {
    name: "chevrons-up-down",
    size: 15,
    color: "var(--text-tertiary)"
  })), rail && /*#__PURE__*/React.createElement("span", {
    className: "vt-sb-tip"
  }, "Administrador"))), collapsible && /*#__PURE__*/React.createElement("div", {
    className: "vt-sb-rail",
    onClick: () => setRail(r => !r),
    title: rail ? 'Expandir' : 'Recolher'
  })), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      overflowY: 'auto',
      padding: pad ? '8px var(--content-pad) var(--content-pad)' : 0,
      position: 'relative'
    }
  }, children));
}

// SidebarGroup: optional label + a SidebarMenu of SBItem buttons.
function SBGroup({
  rail,
  label,
  items,
  active,
  onNavigate,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      width: '100%',
      alignItems: rail ? 'center' : 'stretch',
      ...style
    }
  }, !rail && label && /*#__PURE__*/React.createElement("div", {
    className: "vt-sb-group-label"
  }, label), items.map(it => /*#__PURE__*/React.createElement(SBItem, _extends({
    key: it.id
  }, it, {
    rail: rail,
    active: active === it.id,
    onClick: () => onNavigate && onNavigate(it.id)
  }))));
}

// SidebarMenuButton equivalent.
function SBItem({
  label,
  icon,
  active,
  rail,
  muted,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    className: 'vt-sb-btn' + (rail ? ' vt-sb-btn-rail' : '') + (active ? ' is-active' : ''),
    style: muted ? {
      color: 'var(--text-secondary)',
      fontWeight: 'var(--fw-regular)'
    } : undefined
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18
  }), !rail && /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, label), rail && /*#__PURE__*/React.createElement("span", {
    className: "vt-sb-tip"
  }, label));
}

// Page heading. Lives inside the scrolling content, not in a fixed bar —
// it can be as tall as the page needs and disappears as the user reads.
function PageHead({
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 24,
      marginBottom: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 48,
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      letterSpacing: 'var(--tracking-snug)'
    }
  }, title)), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 4,
      fontSize: 'var(--fs-body-lg)',
      color: 'var(--text-tertiary)'
    }
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
      height: 48
    }
  }, actions));
}
Object.assign(window, {
  Shell,
  PageHead
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

__ds_ns.IconTabs = __ds_scope.IconTabs;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.MapMarker = __ds_scope.MapMarker;

__ds_ns.MetricCard = __ds_scope.MetricCard;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.Switch = __ds_scope.Switch;

})();
