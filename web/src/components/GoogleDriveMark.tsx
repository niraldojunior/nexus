interface GoogleDriveMarkProps {
  className?: string
}

export default function GoogleDriveMark({ className = '' }: GoogleDriveMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 3H16L21 12H13L8 3Z" fill="#34A853" />
      <path d="M3 12L8 3L13 12L8 21L3 12Z" fill="#FBBC04" />
      <path d="M13 12H21L16 21H8L13 12Z" fill="#4285F4" />
    </svg>
  )
}
