import React from 'react';
import { ConversationList } from '../components/copilot/ConversationList';

export const ConversasPage: React.FC<{
  onSelectSession: (sessionId: string) => void;
}> = ({ onSelectSession }) => (
  <div className="min-h-full bg-app-bg px-6 pb-8">
    <div className="mx-auto" style={{ maxWidth: 'var(--thread-max)' }}>
      {/* Header — o centro vertical do título "Conversas" alinha com o centro do
          item "Nova Conversa" da sidebar. Geometria: header da sidebar (pt 6px +
          item 48px + pb 2px = 56px) + metade do primeiro item do nav (34px/2 = 17px)
          ⇒ centro a 73px do topo. A página vive no wrapper scale-[0.93], então o
          padding-top compensa a escala: (73 − 12.8)/0.93 ≈ 65px. */}
      <div className="mb-6" style={{ paddingTop: 55 }}>
        <h1
          className="text-app-text"
          style={{
            font: 'var(--text-h1)',
            letterSpacing: 'var(--tracking-snug)',
            lineHeight: 'var(--lh-tight)',
          }}
        >
          Conversas
        </h1>
      </div>
      <ConversationList onSelectSession={onSelectSession} />
    </div>
  </div>
);
