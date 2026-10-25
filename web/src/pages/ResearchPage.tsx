import React from 'react';
import { Trash2 } from 'lucide-react';
import NexusLoadingMark from '../components/NexusLoadingMark';
import Diamond from '../components/Diamond';
import { CopilotChat } from '../components/copilot/CopilotChat';
import { useCopilotConversation } from '../components/copilot/useCopilotConversation';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { archiveResearchSession, type ResearchSession } from '../services/researchApi';

export const ResearchPage: React.FC<{
  sessionId: string;
  onBack?: () => void;
  onSessionUpdated?: (session: ResearchSession) => void;
}> = ({ sessionId, onBack, onSessionUpdated }) => {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const conversation = useCopilotConversation({
    sessionId,
    ...(onSessionUpdated ? { onSessionUpdated } : {}),
  });
  const { session, loadingSession, setError } = conversation;

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Arquivar esta conversa?',
      confirmLabel: 'Arquivar',
      destructive: true,
    });
    if (!ok) return;

    try {
      await archiveResearchSession(sessionId);
      onBack?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao arquivar');
    }
  };

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-full bg-app-bg">
        <div className="text-center">
          <NexusLoadingMark size={40} className="mx-auto mb-4 h-10 w-10" />
          <p role="status" className="text-app-muted">
            Carregando conversa...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full bg-app-bg">
        <div className="text-center text-app-muted">
          <p>Conversa não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-app-bg">
      {confirmDialog}
      <div className="flex-shrink-0 border-b border-app-border bg-app-bg px-6 py-4">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Diamond size={7} />
            <h1 className="truncate text-[0.98rem] font-semibold text-app-text">{session.title}</h1>
          </div>
          <button
            onClick={handleDelete}
            className="p-2 text-app-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition flex-shrink-0"
            title="Arquivar conversa"
            aria-label="Arquivar conversa"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CopilotChat conversation={conversation} variant="page" />
      </div>
    </div>
  );
};
