import { isValidElement, useState, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { normalizeMarkdownResponse } from '../utils/markdown';

export type InternalLink = { kind: 'site' | 'resource'; id: string };

type MarkdownMessageProps = {
  content: string;
  /** Chamado ao clicar em `nexus://site/<id>` ou `nexus://resource/<id>`. */
  onInternalLink?: (link: InternalLink) => void;
};

const INTERNAL_LINK = /^nexus:\/\/(site|resource)\/([A-Za-z0-9:_.-]{1,80})$/;

/** Interpreta um link interno do Nexus; `null` quando não for `nexus://site|resource/<id>`. */
export const parseInternalLink = (href: string | undefined): InternalLink | null => {
  const match = href ? INTERNAL_LINK.exec(href) : null;
  return match ? { kind: match[1] as InternalLink['kind'], id: match[2]! } : null;
};

/** O react-markdown apaga esquemas fora da lista segura; libera só os links internos válidos. */
export const markdownUrlTransform = (url: string): string =>
  INTERNAL_LINK.test(url) ? url : defaultUrlTransform(url);

/** Flattens a React children tree (including rehype-highlight's token spans) back to plain text. */
const extractText = (node: ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return '';
};

export default function MarkdownMessage({ content, onInternalLink }: MarkdownMessageProps) {
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
        urlTransform={markdownUrlTransform}
        components={{
          a: ({ node: _node, ...props }) => {
            const internal = onInternalLink ? parseInternalLink(props.href) : null;
            if (internal) {
              return (
                <a
                  {...props}
                  onClick={(event) => {
                    event.preventDefault();
                    onInternalLink?.(internal);
                  }}
                />
              );
            }
            // Sem handler, um nexus:// não tem destino: renderiza só o texto.
            if (props.href?.startsWith('nexus://')) return <span>{props.children}</span>;
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          },
          pre: ({ children }) => {
            const rawCode = extractText(children);

            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy(rawCode);
                  }}
                  className="absolute right-2 top-2 rounded-lg border border-app-border bg-app-panel px-2.5 py-1 text-xs font-semibold text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
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
