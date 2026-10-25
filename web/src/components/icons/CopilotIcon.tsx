// Marca de assistente para o Copilot: estrela-direcional em traço fino, com um único
// ponto de acento. Mantém a mesma densidade visual dos ícones Lucide da interface.
export function CopilotIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`text-app-muted ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m11.7 2.55 1.68 5.77 5.77 1.68-5.77 1.68-1.68 5.77-1.68-5.77-5.77-1.68 5.77-1.68 1.68-5.77Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m18.15 14.35.56 1.94 1.94.56-1.94.56-.56 1.94-.56-1.94-1.94-.56 1.94-.56.56-1.94Z"
        fill="currentColor"
        opacity="0.62"
      />
      <circle cx="18.4" cy="5.35" r="1.12" fill="var(--vt-yellow)" />
    </svg>
  );
}
