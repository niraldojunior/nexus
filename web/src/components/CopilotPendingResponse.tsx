import { DiamondLoader } from './Diamond';

type CopilotPendingResponseProps = {
  className?: string;
};

export default function CopilotPendingResponse({ className = '' }: CopilotPendingResponseProps) {
  return (
    <div className={`flex w-full justify-start pt-4 ${className}`}>
      <div className="flex items-center gap-3 pl-1">
        <DiamondLoader size={8} />
      </div>
    </div>
  );
}
