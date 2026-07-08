import NexusLoadingMark from './NexusLoadingMark';

type CopilotPendingResponseProps = {
  className?: string;
};

export default function CopilotPendingResponse({ className = '' }: CopilotPendingResponseProps) {
  return (
    <div className={`flex w-full justify-start pt-4 ${className}`}>
      <div className="flex items-start gap-3 pl-1">
        <NexusLoadingMark size={28} className="h-7 w-7 shrink-0" />
      </div>
    </div>
  );
}
