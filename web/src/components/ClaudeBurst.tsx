interface ClaudeBurstProps {
  className?: string
}

export default function ClaudeBurst({ className = '' }: ClaudeBurstProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
        <path d="M32 6V22" />
        <path d="M32 42V58" />
        <path d="M6 32H22" />
        <path d="M42 32H58" />
        <path d="M13.6 13.6L24.9 24.9" />
        <path d="M39.1 39.1L50.4 50.4" />
        <path d="M13.6 50.4L24.9 39.1" />
        <path d="M39.1 24.9L50.4 13.6" />
        <path d="M9.8 22.4L24.7 28.6" />
        <path d="M39.3 35.4L54.2 41.6" />
        <path d="M9.8 41.6L24.7 35.4" />
        <path d="M39.3 28.6L54.2 22.4" />
        <path d="M22.4 9.8L28.6 24.7" />
        <path d="M35.4 39.3L41.6 54.2" />
        <path d="M22.4 54.2L28.6 39.3" />
        <path d="M35.4 24.7L41.6 9.8" />
      </g>
    </svg>
  )
}
