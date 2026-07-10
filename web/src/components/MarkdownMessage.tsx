import { Children, isValidElement, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeMarkdownResponse } from '../utils/markdown';

type MarkdownMessageProps = {
  content: string;
};

export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  const [copied, setCopied] = useState(false);
  const normalizedContent = normalizeMarkdownResponse(content);

  const handleCopy = async (code: string) => {
    if (!navigator.clipboard?.writeText) return;

    await navigator.clipboard.writeText(code.trimEnd());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="copilot-message markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          pre: ({ children }) => {
            const firstChild = Children.toArray(children)[0];
            const rawCode =
              isValidElement<{ children?: unknown }>(firstChild) && typeof firstChild.props.children === 'string'
                ? firstChild.props.children
                : String(firstChild ?? '');

            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy(rawCode);
                  }}
                  className="absolute right-2 top-2 rounded-lg border border-app-border bg-white px-2.5 py-1 text-xs font-semibold text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
                  aria-label="Copiar codigo"
                >
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
                <pre>{children}</pre>
              </div>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
