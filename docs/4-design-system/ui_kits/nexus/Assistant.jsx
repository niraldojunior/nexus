// V.tal Nexus UI kit — Assistant module (Nova Conversa · Conversas · transcript)
// Adapted from components/core/chat.card.html into a routable screen.
const Diamond = () => <span style={{ width: 7, height: 7, background: 'var(--vt-yellow)', transform: 'rotate(45deg)', flexShrink: 0 }} />;

const SUGGESTIONS = [
  { label: 'Locais', icon: 'map-pin' }, { label: 'Recursos', icon: 'layers' },
  { label: 'Serviços', icon: 'network' }, { label: 'Ordens', icon: 'zap' },
  { label: 'Especificação TMF', icon: 'file-text' },
];
const TURNS = [
  { by: 'assistant', text: 'Olá! Como posso ajudar você hoje com o V.tal Nexus?', at: '19:39' },
  { by: 'user', text: 'tudo bem?', at: '09:55' },
  { by: 'assistant', text: 'Estou bem, obrigado! Como posso te auxiliar com algo relacionado ao V.tal Nexus, telecomunicações, inventário ou APIs?', at: '09:55' },
];
const HISTORY = [
  { title: 'oi', at: 'Modificado em 27 de agosto de 2026 às 19:39' },
];

function NewConversation({ onSend }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, height: '100%', padding: 'var(--content-pad)' }}>
      <h1 style={{ font: 'var(--text-greeting)', letterSpacing: 'var(--tracking-snug)' }}>Bom dia</h1>
      <div className="vt-composer vt-composer-hero" style={{ width: '100%', maxWidth: 'var(--thread-max)' }}>
        <input placeholder="Pergunte sobre Locais, Recursos, Serviços, Ordens ou gere uma especificação…" onKeyDown={(e) => e.key === 'Enter' && onSend && onSend()} />
        <button className="vt-send" onClick={() => onSend && onSend()}><Icon name="send" size={18} /></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <select style={{ height: 32, padding: '0 8px', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', font: 'var(--text-label)', color: 'var(--text-primary)' }}>
          <option>Gemini 2.5 Flash</option>
        </select>
        <span style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', font: 'var(--text-label)', color: 'var(--text-secondary)' }}>TMF-first</span>
      </div>
      <div className="vt-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s.label} className="vt-suggestion" onClick={() => onSend && onSend()}><Icon name={s.icon} size={17} />{s.label}</button>
        ))}
      </div>
    </div>
  );
}

function ConversationThread({ onDelete }) {
  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px' }}>
        <Diamond />
        <span style={{ flex: 1, font: 'var(--fw-medium) var(--fs-body-relaxed)/1.3 var(--font-ui)' }}>oi</span>
        <div className="vt-rail-item" style={{ width: 34 }} onClick={onDelete}><Icon name="trash-2" size={18} /></div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px' }}>
        <div className="vt-thread">
          {TURNS.map((t, i) => (
            <div key={i} className={'vt-turn vt-turn-' + t.by}>
              <div className="vt-bubble">{t.text}</div>
              <span className="vt-turn-time">{t.at}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: '18px 24px 22px' }}>
        <div className="vt-composer" style={{ maxWidth: 'var(--thread-max)', margin: '0 auto' }}>
          <textarea rows="2" placeholder="Digite sua pergunta…"></textarea>
          <button className="vt-send"><Icon name="send" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

function ConversationHistory({ onOpen }) {
  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', overflowY: 'auto', padding: 'var(--content-pad)' }}>
      <h1 style={{ font: 'var(--text-title)', letterSpacing: 'var(--tracking-snug)' }}>Conversas</h1>
      <p style={{ marginTop: 6, fontSize: 'var(--fs-body-relaxed)', color: 'var(--text-tertiary)' }}>{HISTORY.length} conversa(s) encontrada(s)</p>
      <div className="vt-searchbar vt-searchbar-flat" style={{ marginTop: 22 }}>
        <Icon name="search" size={18} />
        <input placeholder="Buscar conversas por título…" />
      </div>
      {HISTORY.map((h) => (
        <div key={h.title} className="vt-card-interactive" style={{ marginTop: 18, padding: '16px 20px' }} onClick={() => onOpen && onOpen(h.title)}>
          <div style={{ font: 'var(--text-h3)' }}>{h.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 'var(--fs-body-lg)', color: 'var(--text-tertiary)' }}>
            <Icon name="clock" size={14} />{h.at}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { NewConversation, ConversationThread, ConversationHistory });
