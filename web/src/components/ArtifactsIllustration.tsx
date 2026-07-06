interface ArtifactsIllustrationProps {
  className?: string
}

export default function ArtifactsIllustration({ className = '' }: ArtifactsIllustrationProps) {
  return (
    <svg
      viewBox="0 0 160 140"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M41 48H79V104H36L37.8 67.5C38.1 61.8 42.8 57.3 48.5 57.2H58.8" />
        <path d="M87 83C87 71.95 95.95 63 107 63C118.05 63 127 71.95 127 83C127 94.05 118.05 103 107 103C95.95 103 87 94.05 87 83Z" />
        <path d="M98 40L122 40L110 18L98 40Z" />
        <path d="M59.8 84.8L66.8 60.2C67.9 56.3 73.4 56.4 74.4 60.4L78.9 78.2" />
        <path d="M55 58.7L52.3 75.2C51.5 80.2 44.3 79.6 44.3 74.5V63.8C44.3 59.1 48.1 55.3 52.8 55.3H59.2" />
        <path d="M80 52.5V77.3C80 81.1 85.2 82 86.5 78.4L92 63.1" />
      </g>
    </svg>
  )
}
