interface DiamondProps {
  /** Side length in pixels (the square before rotation). */
  size?: number;
  /** CSS color of the fill. Defaults to the V.tal accent yellow. */
  color?: string;
  /** Extra classes (e.g. animation, margin). */
  className?: string;
}

/**
 * V.tal signature mark: a small yellow rhombus (a square rotated 45°).
 * Used as the brand accent on the wordmark, active nav markers, badges,
 * and — animated — as the loading indicator.
 */
export default function Diamond({ size = 8, color = '#ffd200', className = '' }: DiamondProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rotate-45 rounded-[1px] ${className}`}
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

/**
 * Animated loading mark — a pulsing V.tal diamond.
 * Drop-in replacement for spinner/GIF loaders.
 */
export function DiamondLoader({ size = 10, color = '#ffd200', className = '' }: DiamondProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="Carregando">
      <Diamond size={size} color={color} className="animate-vt-pulse" />
      <Diamond size={size} color={color} className="animate-vt-pulse [animation-delay:180ms]" />
      <Diamond size={size} color={color} className="animate-vt-pulse [animation-delay:360ms]" />
    </span>
  );
}
