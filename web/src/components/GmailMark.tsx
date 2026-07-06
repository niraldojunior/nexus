interface GmailMarkProps {
  className?: string
}

export default function GmailMark({ className = '' }: GmailMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.5 7.2L12 12.8L19.5 7.2V17.5C19.5 18.1 19.1 18.5 18.5 18.5H5.5C4.9 18.5 4.5 18.1 4.5 17.5V7.2Z" fill="#EA4335" />
      <path d="M4.5 7.2L7.6 9.55V18.5H5.5C4.9 18.5 4.5 18.1 4.5 17.5V7.2Z" fill="#4285F4" />
      <path d="M19.5 7.2L16.4 9.55V18.5H18.5C19.1 18.5 19.5 18.1 19.5 17.5V7.2Z" fill="#34A853" />
      <path d="M4.5 7.2L11.2 12.1C11.67 12.44 12.33 12.44 12.8 12.1L19.5 7.2L18.55 5.8C18.27 5.39 17.8 5.14 17.3 5.14H6.7C6.2 5.14 5.73 5.39 5.45 5.8L4.5 7.2Z" fill="#FBBC04" />
      <path d="M7.6 18.5V9.55L12 12.8L16.4 9.55V18.5H7.6Z" fill="white" fillOpacity="0.96" />
    </svg>
  )
}
