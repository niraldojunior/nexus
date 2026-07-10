import Diamond from './Diamond';

type NexusLoadingMarkProps = {
  className?: string;
  size?: number;
};

export default function NexusLoadingMark({ className = '', size = 24 }: NexusLoadingMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <Diamond size={Math.round(size * 0.5)} className="animate-vt-pulse" />
    </span>
  );
}
