interface DocumentTileProps {
  className?: string
}

export default function DocumentTile({ className = '' }: DocumentTileProps) {
  return (
    <svg
      viewBox="0 0 88 88"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="13" y="10" width="56" height="68" rx="12" transform="rotate(-6 13 10)" fill="#FBFAF7" stroke="#D7D0C6" strokeWidth="1.8" />
      <path d="M35.5 30.5H48.5L54 36V56C54 57.1 53.1 58 52 58H35.5C34.4 58 33.5 57.1 33.5 56V32.5C33.5 31.4 34.4 30.5 35.5 30.5Z" stroke="#9B9389" strokeWidth="2" strokeLinejoin="round" />
      <path d="M48 30.5V36H54" stroke="#9B9389" strokeWidth="2" strokeLinejoin="round" />
      <path d="M38 42.5H49.5" stroke="#9B9389" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 47.5H49.5" stroke="#9B9389" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
