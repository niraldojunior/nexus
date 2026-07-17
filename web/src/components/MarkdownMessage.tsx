import { isValidElement, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { normalizeMarkdownResponse } from '../utils/markdown';

type MarkdownMessageProps = {
  content: string;
};

/** Flattens a React children tree (including rehype-highlight's token spans) back to plain text. */
const extractText = (node: ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return '';
};

export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const normalizedContent = normalizeMarkdownResponse(content);

  const handleCopy = async (code: string) => {
    if (!navigator.clipboard?.writeText) return;

    await navigator.clipboard.writeText(code.trimEnd());
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 1400);
  };

  return (
    <div className="copilot-message markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          pre: ({ children }) => {
            const rawCode = extractText(children);

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
                  {copiedCode === rawCode ? 'Copiado' : 'Copiar'}
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
