import { useEffect, useRef, type KeyboardEvent } from 'react';
import { MapPin, Send, Square } from 'lucide-react';
import MarkdownMessage, { type InternalLink } from '../MarkdownMessage';
import CopilotPendingResponse from '../CopilotPendingResponse';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';
import { scrollChatAnchorIntoView, scrollChatToBottom } from '../../utils/chatScroll';
import type { CopilotMapAction } from '../../services/researchApi';
import { PendingConfirmationCards } from './PendingConfirmationCards';
import type { CopilotMessage, useCopilotConversation } from './useCopilotConversation';

export type CopilotConversation = ReturnType<typeof useCopilotConversation>;

const SUGGESTIONS = [
  'Mostre no mapa a estação mais próxima do centro atual',
  'Marque os CDOs perto daqui',
  'O que eu posso fazer aqui?',
];

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

/** Reconstrói as ações `map_*` executadas na resposta (metadata.toolExecutions) para o chip "Ver no mapa". */
export const readMapActions = (message: CopilotMessage): CopilotMapAction[] => {
  const executions = message.metadata?.toolExecutions;
  if (!Array.isArray(executions)) return [];
  const actions: CopilotMapAction[] = [];
  for (const raw of executions) {
    if (!raw || typeof raw !== 'object') continue;
    const execution = raw as { toolName?: unknown; arguments?: unknown };
    const args = (execution.arguments ?? {}) as Record<string, unknown>;
    switch (execution.toolName) {
      case 'map_focus_place': {
        const siteId = asString(args.siteId);
        const resourceId = asString(args.resourceId);
        if (siteId) actions.push({ type: 'focus_place', siteId });
        else if (resourceId) actions.push({ type: 'focus_place', resourceId });
        break;
      }
      case 'map_fly_to': {
        const lat = asNumber(args.lat);
        const lng = asNumber(args.lng);
        const spanMeters = asNumber(args.spanMeters);
        if (lat !== undefined && lng !== undefined) {
          actions.push({ type: 'fly_to', lat, lng, ...(spanMeters ? { spanMeters } : {}) });
        }
        break;
      }
      case 'map_show_points': {
        if (!Array.isArray(args.points)) break;
        const points = args.points.flatMap((p) => {
          const point = p as Record<string, unknown>;
          const lat = asNumber(point?.lat);
          const lng = asNumber(point?.lng);
          if (lat === undefined || lng === undefined) return [];
          const label = asString(point.label);
          const siteId = asString(point.siteId);
          const resourceId = asString(point.resourceId);
          return [
            {
              lat,
              lng,
              ...(label ? { label } : {}),
              ...(siteId ? { siteId } : {}),
              ...(resourceId ? { resourceId } : {}),
            },
          ];
        });
        if (points.length > 0)
          actions.push({ type: 'show_points', points, fit: args.fit !== false });
        break;
      }
      case 'map_set_base_layer': {
        const layerId = asString(args.layerId);
        if (layerId) actions.push({ type: 'set_base_layer', layerId });
        break;
      }
      case 'map_set_layers': {
        const mode = args.mode;
        if (mode !== 'show' && mode !== 'hide' && mode !== 'only') break;
        const strings = (value: unknown): string[] =>
          Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        actions.push({
          type: 'set_layers',
          mode,
          layerIds: strings(args.layerIds),
          groupIds: strings(args.groupIds),
          all: args.all === true,
        });
        break;
      }
      default:
        break;
    }
  }
  return actions;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

type CopilotChatProps = {
  conversation: CopilotConversation;
  /** `page` = página de conversa; `panel` = doca do mapa (mais compacto). */
  variant?: 'page' | 'panel';
  /** Quando presente, respostas com ações de mapa ganham o chip "Ver no mapa". */
  onClientAction?: (action: CopilotMapAction) => void;
  onInternalLink?: (link: InternalLink) => void;
  placeholder?: string;
};

export function CopilotChat({
  conversation,
  variant = 'page',
  onClientAction,
  onInternalLink,
  placeholder = 'Digite sua pergunta...',
}: CopilotChatProps) {
  const {
    messages,
    input,
    setInput,
    error,
    sending,
    pendingMessageId,
    confirmingToken,
    resolvedTokens,
    send,
    stop,
    confirmPending,
  } = conversation;
  const panel = variant === 'panel';
  const activeTurnAnchorRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea(input, panel ? 140 : 220);

  useEffect(() => {
    if (sending && pendingMessageId) {
      requestAnimationFrame(() =>
        scrollChatAnchorIntoView(messagesScrollRef.current, activeTurnAnchorRef.current),
      );
      return;
    }
    requestAnimationFrame(() => scrollChatToBottom(messagesScrollRef.current));
  }, [messages.length, sending, pendingMessageId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const gutter = panel ? 'px-3' : 'px-6';

  return (
    <div className={`flex h-full min-h-0 flex-col bg-app-bg ${panel ? 'vt-chat-compact' : ''}`}>
      {error ? (
        <div
          role="alert"
          className={`flex-shrink-0 ${gutter} py-3`}
          style={{
            background: 'var(--status-red-soft)',
            borderBottom: '1px solid var(--status-red-border)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--status-red)' }}>
            {error}
          </p>
        </div>
      ) : null}

      <div ref={messagesScrollRef} className={`min-h-0 flex-1 overflow-y-auto ${gutter} py-2`}>
        <div className={`vt-thread ${panel ? 'pb-4 pt-3' : 'pb-10 pt-8'}`}>
          {messages.length === 0 ? (
            panel ? (
              <div className="flex flex-col gap-3 py-4">
                <p className="text-sm text-app-muted">
                  Pergunte sobre o inventário ou peça para o Copilot mostrar algo no mapa.
                </p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="vt-suggestion text-left"
                    >
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center text-center">
                <p className="text-app-muted">Inicie uma conversa...</p>
              </div>
            )
          ) : (
            messages.map((msg) => {
              const mapActions =
                onClientAction && msg.role === 'assistant' ? readMapActions(msg) : [];
              return (
                <div
                  key={msg.id}
                  className={`vt-turn ${msg.role === 'user' ? 'vt-turn-user' : 'vt-turn-assistant'}`}
                >
                  {msg.role === 'user' ? (
                    <>
                      {pendingMessageId === msg.id ? (
                        <div ref={activeTurnAnchorRef} className="h-1 w-full" />
                      ) : null}
                      <div className="vt-bubble">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <span className="vt-turn-time">{formatTime(msg.createdAt)}</span>
                      {sending && pendingMessageId === msg.id ? (
                        <div className="w-full">
                          <CopilotPendingResponse />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="w-full">
                      <div className="vt-bubble">
                        <MarkdownMessage
                          content={msg.content}
                          {...(onInternalLink ? { onInternalLink } : {})}
                        />
                      </div>
                      {mapActions.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => mapActions.forEach((action) => onClientAction?.(action))}
                          className="vt-hover-muted mt-2 inline-flex items-center gap-1.5 rounded-md border border-app-border bg-app-panel px-2.5 py-1 text-[0.8rem] text-app-text transition"
                        >
                          <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />
                          Ver no mapa
                        </button>
                      ) : null}
                      <PendingConfirmationCards
                        message={msg}
                        resolvedTokens={resolvedTokens}
                        confirmingToken={confirmingToken}
                        onConfirm={(message, pending) => {
                          void confirmPending(message, pending);
                        }}
                      />
                      <span className="vt-turn-time mt-2 block">{formatTime(msg.createdAt)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={`flex-shrink-0 ${gutter} ${panel ? 'py-2' : 'py-4'} bg-app-bg`}>
        <div
          className="mx-auto w-full"
          style={panel ? undefined : { maxWidth: 'var(--thread-max)' }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (sending) stop();
              else void send();
            }}
            className="vt-composer"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              className={`overflow-y-auto ${panel ? 'max-h-[140px]' : 'min-h-[26px] max-h-[220px]'}`}
            />
            <button
              type="submit"
              disabled={!sending && !input.trim()}
              className="vt-send"
              title={sending ? 'Parar geração' : 'Enviar mensagem'}
              aria-label={sending ? 'Parar geração' : 'Enviar mensagem'}
            >
              {sending ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Send className="h-[18px] w-[18px]" strokeWidth={1.8} />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
