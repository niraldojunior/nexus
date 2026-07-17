type CopilotPendingResponseProps = {
  className?: string;
};

export default function CopilotPendingResponse({ className = '' }: CopilotPendingResponseProps) {
  return (
    <div className={`flex w-full justify-start pt-4 ${className}`}>
      <div className="flex items-center pl-1" role="status" aria-label="Processando resposta do Copilot">
        <img
          src="/copilot-llm-processing.gif"
          alt=""
          className="h-9 w-9 shrink-0 rounded-md object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
