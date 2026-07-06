import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { ChatMessage as ChatMessageType } from '../types'

interface ChatMessageProps {
  message: ChatMessageType
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-xl gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'border border-app-border bg-white text-app-text'
            : 'bg-app-accent text-app-text shadow-soft'
        }`}>
          <span className="text-xs font-bold">
            {isUser ? 'V' : 'N'}
          </span>
        </div>

        <div className={`rounded-[18px] px-4 py-3 shadow-soft ${
          isUser
            ? 'border border-app-border bg-white'
            : 'border border-app-accent-border bg-app-accent-soft'
        }`}>
          <p className={`leading-relaxed whitespace-pre-wrap break-words ${
            isUser ? 'text-app-text' : 'text-app-text'
          }`}>
            {message.content}
          </p>
          
          {!isUser && (
            <div className="mt-3 flex items-center gap-2 border-t border-app-accent-border/60 pt-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-app-muted transition-colors hover:bg-white/70 hover:text-app-text"
              >
                {copied ? (
                  <>
                    <Check size={16} />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
