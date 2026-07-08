type NexusLoadingMarkProps = {
  className?: string;
  size?: number;
};

export default function NexusLoadingMark({ className = '', size = 24 }: NexusLoadingMarkProps) {
  return (
    <img
      src="/nexus-mark-transparent.gif"
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
